# 积分红包：清理同 dedup_key 重复记录（浏览器控制台）

先上传部署云函数 **`ops-points-admin`**（含 `opsIncomeClaimedDedupDuplicatesScan` 分批扫描 + `opsIncomeDedupDuplicatesCleanup`）。

打开 **管理后台 H5**（已登录），F12 控制台执行。

## 规则

- 扫描未删除且有 `dedup_key` 的红包（含 pending / claimed / expired）
- 同 `dedup_key` ≥2 条：保留 **create_time 最早** 的一条，其余软删除
- **不回扣**商户账号积分 / 待提现
- 软删除时改写 `dedup_key` → `cleared_dup_{id}`，原键写入 `dedup_key_cleared_from`

---

## 1. 预览（不写库）

```javascript
(async function previewDedupCleanup({ pageSize = 300 } = {}) {
  const byKey = new Map();
  let cursorId = '';
  let scanned = 0;
  for (;;) {
    const res = await uniCloud.callFunction({
      name: 'ops-points-admin',
      data: {
        action: 'opsIncomeClaimedDedupDuplicatesScan',
        params: { pageSize, cursorId, includeAllStatus: true }
      }
    });
    const r = res.result || res;
    if (r.code !== 0) return console.error(r);
    const d = r.data || {};
    const rows = d.rows || [];
    scanned += rows.length;
    for (const row of rows) {
      const dk = String(row.dedup_key || '').trim();
      if (!dk) continue;
      if (!byKey.has(dk)) byKey.set(dk, []);
      byKey.get(dk).push(row);
    }
    console.log('已扫描', scanned);
    if (d.done || !rows.length) break;
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }

  const extraIds = [];
  const groups = [];
  for (const [dk, rows] of byKey.entries()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => {
      const ca = Number(a.create_time || 0);
      const cb = Number(b.create_time || 0);
      if (ca !== cb) return ca - cb;
      return String(a._id).localeCompare(String(b._id));
    });
    const keep = rows[0];
    const extras = rows.slice(1);
    extras.forEach((x) => extraIds.push(x._id));
    groups.push({
      dedup_key: dk,
      keepId: keep._id,
      keepStatus: keep.status,
      title: keep.title,
      claimedCount: rows.length,
      extraIds: extras.map((x) => x._id),
      extraAmount: extras.reduce((s, x) => s + Number(x.amount || 0), 0)
    });
  }

  console.log('重复组', groups.length, '将软删除条数', extraIds.length);
  console.table(groups.slice(0, 50).map((g) => ({
    标题: g.title, 份数: g.claimedCount, 正本状态: g.keepStatus, 多条金额合计: g.extraAmount, dedup_key: g.dedup_key
  })));
  window.__dedupCleanupPreview = { extraIds, groups, scanned };
  return window.__dedupCleanupPreview;
})();
```

---

## 2. 执行 / 续跑清理（写库）

单次云函数最多处理 **20** 条；批与批之间稍作等待，避免超时。  
若中途报超时：已删的会跳过（`is_deleted`），直接再跑一遍即可续跑。

```javascript
(async function applyDedupCleanup({
  packetIds = (window.__dedupCleanupPreview && window.__dedupCleanupPreview.extraIds) || [],
  chunkSize = 15,
  delayMs = 400
} = {}) {
  if (!packetIds.length) {
    console.error('没有待清理 id，请先跑预览');
    return;
  }
  let updated = 0;
  let skipped = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < packetIds.length; i += chunkSize) {
    const chunk = packetIds.slice(i, i + chunkSize);
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        const res = await uniCloud.callFunction({
          name: 'ops-points-admin',
          data: {
            action: 'opsIncomeDedupDuplicatesCleanup',
            params: { packetIds: chunk, apply: true }
          }
        });
        const r = res.result || res;
        if (r.code !== 0) throw new Error(r.message || 'fail');
        updated += (r.data && r.data.updated) || 0;
        skipped += (r.data && r.data.skipped) || 0;
        ok = true;
      } catch (e) {
        console.warn(`批次失败 retry=${retry + 1}`, e && e.message ? e.message : e);
        await sleep(1000 * (retry + 1));
      }
    }
    if (!ok) {
      console.error('中断于', i, '剩余可再执行本脚本续跑');
      window.__dedupCleanupPreview = { extraIds: packetIds.slice(i) };
      break;
    }
    console.log('进度', Math.min(i + chunkSize, packetIds.length), '/', packetIds.length);
    await sleep(delayMs);
  }
  console.log('完成', { updated, skipped, total: packetIds.length });
  return { updated, skipped, total: packetIds.length };
})();
```

一键预览 + 清理（默认预览；写库用 `{ apply: true, chunkSize: 15 }`）：

```javascript
(async function runDedupCleanupAll({
  apply = false,
  pageSize = 300,
  chunkSize = 15,
  delayMs = 400
} = {}) {
  const byKey = new Map();
  let cursorId = '';
  for (;;) {
    const res = await uniCloud.callFunction({
      name: 'ops-points-admin',
      data: {
        action: 'opsIncomeClaimedDedupDuplicatesScan',
        params: { pageSize, cursorId, includeAllStatus: true }
      }
    });
    const r = res.result || res;
    if (r.code !== 0) throw new Error(r.message || 'scan fail');
    const d = r.data || {};
    for (const row of d.rows || []) {
      const dk = String(row.dedup_key || '').trim();
      if (!dk) continue;
      if (!byKey.has(dk)) byKey.set(dk, []);
      byKey.get(dk).push(row);
    }
    if (d.done || !(d.rows || []).length) break;
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }
  const extraIds = [];
  for (const rows of byKey.values()) {
    if (rows.length < 2) continue;
    rows.sort(
      (a, b) =>
        Number(a.create_time || 0) - Number(b.create_time || 0) ||
        String(a._id).localeCompare(String(b._id))
    );
    rows.slice(1).forEach((x) => extraIds.push(x._id));
  }
  window.__dedupCleanupPreview = { extraIds };
  console.log(apply ? '开始清理' : '仅预览', '待删', extraIds.length);
  if (!apply) return { dryRun: true, extraIds };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let updated = 0;
  for (let i = 0; i < extraIds.length; i += chunkSize) {
    const chunk = extraIds.slice(i, i + chunkSize);
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        const res = await uniCloud.callFunction({
          name: 'ops-points-admin',
          data: {
            action: 'opsIncomeDedupDuplicatesCleanup',
            params: { packetIds: chunk, apply: true }
          }
        });
        const r = res.result || res;
        if (r.code !== 0) throw new Error(r.message || 'cleanup fail');
        updated += (r.data && r.data.updated) || 0;
        ok = true;
      } catch (e) {
        console.warn('批次失败，重试', retry + 1, e && e.message ? e.message : e);
        await sleep(1200 * (retry + 1));
      }
    }
    if (!ok) {
      window.__dedupCleanupPreview = { extraIds: extraIds.slice(i) };
      console.error('中断，剩余', extraIds.length - i, '条已挂到 window.__dedupCleanupPreview，再跑 applyDedupCleanup 即可');
      return { updated, remain: extraIds.length - i };
    }
    console.log('进度', Math.min(i + chunkSize, extraIds.length), '/', extraIds.length);
    await sleep(delayMs);
  }
  console.log('清理完成', { updated, total: extraIds.length });
  return { updated, total: extraIds.length };
})({ apply: false });
```
