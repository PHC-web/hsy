# 已领取红包：同 dedup_key 重复领取排查（浏览器控制台）

先上传部署云函数 **`ops-points-admin`**（需包含分批版 `opsIncomeClaimedDedupDuplicatesScan`）。

打开 **管理后台 H5**（已登录），F12 控制台粘贴执行。

> 单次全量扫描会超时，请用下面的**分批循环**脚本。

## 说明

- 每次云函数只拉一页已领取红包（默认 300 条）
- 浏览器本地按 `dedup_key` 汇总：同键 ≥2 条 → 最早创建的为正本，其余计入多领
- 不写库

---

## 推荐：自动跑完全部

```javascript
(async function runClaimedDedupDupScan({
  pageSize = 300,
  subsidyKindFilter = '',
  merchantUserId = ''
} = {}) {
  const byKey = new Map();
  let cursorId = '';
  let batch = 0;
  let scanned = 0;
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'ops-points-admin',
      data: {
        action: 'opsIncomeClaimedDedupDuplicatesScan',
        params: {
          pageSize,
          cursorId,
          ...(subsidyKindFilter ? { subsidyKindFilter } : {}),
          ...(merchantUserId ? { merchantUserId } : {})
        }
      }
    });
    const r = res.result || res;
    if (r.code !== 0) {
      console.error('中断', r);
      return r;
    }
    const d = r.data || {};
    const rows = d.rows || [];
    scanned += rows.length;
    for (const row of rows) {
      const dk = String(row.dedup_key || '').trim();
      if (!dk) continue;
      if (!byKey.has(dk)) byKey.set(dk, []);
      byKey.get(dk).push(row);
    }
    console.log(`第 ${batch} 批 +${rows.length}，累计扫描 ${scanned}，去重键 ${byKey.size}`);
    if (d.done || !rows.length) break;
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }

  const groups = [];
  let extraClaimedYuan = 0;
  let extraPacketCount = 0;
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
    const extraAmount = extras.reduce((s, x) => s + Number(x.amount || 0), 0);
    extraClaimedYuan += extraAmount;
    extraPacketCount += extras.length;
    groups.push({
      dedup_key: dk,
      merchant_user_id: keep.merchant_user_id,
      title: keep.title,
      subsidy_kind_label: keep.subsidy_kind_label || keep.subsidy_kind,
      claimedCount: rows.length,
      keepId: keep._id,
      keepAmount: keep.amount,
      extraCount: extras.length,
      extraAmount: Number(extraAmount.toFixed(4)),
      packetIds: rows.map((x) => x._id),
      packets: rows.map((x) => ({
        _id: x._id,
        amount: x.amount,
        create_time: x.create_time,
        claimed_time: x.claimed_time,
        role: x._id === keep._id ? 'keep' : 'extra'
      }))
    });
  }
  groups.sort((a, b) => b.extraAmount - a.extraAmount);

  const userIds = [...new Set(groups.map((g) => g.merchant_user_id).filter(Boolean))];
  const merchants = {};
  for (let i = 0; i < userIds.length; i += 200) {
    const chunk = userIds.slice(i, i + 200);
    const mr = await uniCloud.callFunction({
      name: 'ops-points-admin',
      data: {
        action: 'opsIncomeClaimedDedupDuplicatesScan',
        params: { resolveMerchantsOnly: true, userIds: chunk }
      }
    });
    const m = ((mr.result || mr).data || {}).merchants || {};
    Object.assign(merchants, m);
  }
  for (const g of groups) {
    const m = merchants[g.merchant_user_id] || {};
    g.merchant_name = m.merchant_name || '-';
    g.merchant_mobile = m.merchant_mobile || '-';
  }

  const summary = {
    scanned,
    uniqueDedupKeys: byKey.size,
    duplicateGroupCount: groups.length,
    extraPacketCount,
    extraClaimedYuan: Number(extraClaimedYuan.toFixed(4))
  };
  console.log('汇总', summary);
  if (groups.length) {
    console.table(
      groups.map((g) => ({
        商户: g.merchant_name,
        标题: g.title,
        领取份数: g.claimedCount,
        正本: g.keepAmount,
        多领: g.extraAmount,
        dedup_key: g.dedup_key
      }))
    );
  }
  window.__claimedDedupDupResult = { summary, groups };
  console.log('完整结果已挂到 window.__claimedDedupDupResult');
  return { summary, groups };
})();
```

---

## 只扫历史池分期

把上面脚本参数改成：

```javascript
})({ subsidyKindFilter: 'release_pool_history' });
```

即末尾写成：

```javascript
})({ pageSize: 300, subsidyKindFilter: 'release_pool_history' });
```

---

## 指定商户

```javascript
})({ merchantUserId: 'h5_1780486753469_g4f12d' });
```
