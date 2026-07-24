# 用「最后领取积分时间」回填 login_time（浏览器控制台）

先上传部署云函数 **`merchant`**（需包含 action `adminLoginTimeBackfillFromLastClaim`）。

然后打开 **管理后台 H5**（已登录），按 F12 打开控制台，粘贴执行。

## 说明

- 取商户 `hsy-income-packets` 中 `status=claimed` 的最晚领取时间 → 写入 `login_time`
- **从未领取过积分：不改 login_time**
- 不改 `points_opt_week_applied`

---

## 1. 预览一批（不写库）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminLoginTimeBackfillFromLastClaim',
    params: { dryRun: true, chunkSize: 100 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 2. 写库单批

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminLoginTimeBackfillFromLastClaim',
    params: { apply: true, chunkSize: 100 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 3. 自动跑完全部（推荐）

```javascript
(async function runLoginTimeBackfillFromLastClaim({ apply = true, chunkSize = 100 } = {}) {
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedNoClaim: 0, skippedSame: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminLoginTimeBackfillFromLastClaim',
        params: {
          apply,
          dryRun: !apply,
          chunkSize,
          ...(cursorId ? { cursorId } : {})
        }
      }
    });
    const r = res.result || res;
    console.log(`第 ${batch} 批`, r);
    if (r.code !== 0) {
      console.error('中断', r.message || r);
      break;
    }
    const d = r.data || {};
    sum.scanned += d.scanned || 0;
    sum.updated += d.updated || 0;
    sum.skippedNoClaim += d.skippedNoClaim || 0;
    sum.skippedSame += d.skippedSame || 0;
    if (d.samples && d.samples.length) console.table(d.samples);
    if (d.done) {
      console.log('全部完成', sum);
      break;
    }
    cursorId = d.nextCursor || '';
    if (!cursorId) {
      console.log('无 nextCursor，结束', sum);
      break;
    }
  }
  return sum;
})();
```

先预览再写库：

```javascript
// 预览全部
await (async function () {
  /* 把上面函数里 apply 改成 false，或： */
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedNoClaim: 0, skippedSame: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminLoginTimeBackfillFromLastClaim',
        params: { apply: false, dryRun: true, chunkSize: 100, ...(cursorId ? { cursorId } : {}) }
      }
    });
    const r = res.result || res;
    console.log(`预览第 ${batch} 批`, r);
    if (r.code !== 0) break;
    const d = r.data || {};
    sum.scanned += d.scanned || 0;
    sum.updated += d.updated || 0;
    sum.skippedNoClaim += d.skippedNoClaim || 0;
    sum.skippedSame += d.skippedSame || 0;
    if (d.done) break;
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }
  console.log('预览合计', sum);
  return sum;
})();
```

确认无误后再执行第 3 节写库脚本（`apply: true`）。

---

## 4. 单商户试跑

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminLoginTimeBackfillFromLastClaim',
    params: { apply: true, merchantUserId: 'h5_xxxx' }
  }
}).then((res) => console.log(res.result || res));
```

---

## 返回字段

| 字段 | 含义 |
|------|------|
| `updated` | 本批改写（或将改写）条数 |
| `skippedNoClaim` | 无领取记录，跳过 |
| `skippedSame` | 已与领取时间相同，跳过 |
| `samples` | 样例：旧 login / 新 claim |
| `nextCursor` / `done` | 续跑游标 |
