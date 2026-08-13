# 清理误标的流水优化标记（浏览器控制台）

部署 **`merchant`**、**`machine`** 后执行。

清理两类：

1. **生效日之前**仍挂着 `is_flow_opt_trade` 的流水  
2. **已领取首期积分**（`trade_first` claimed）但仍挂优化待审的误标流水  

还原为普通流水，不删交易、不改已领积分。

```javascript
(async function runRepairFlowOptFlags({
  apply = true,
  effectiveFrom = '2026-08-13',
  chunkSize = 100
} = {}) {
  let cursorId = '';
  let batch = 0;
  const sum = { cleared: 0, clearedBefore: 0, clearedClaimed: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminClearFlowOptBeforeEffectiveFrom',
        params: {
          apply,
          dryRun: !apply,
          clearClaimed: true,
          effectiveFrom,
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
    sum.cleared += d.cleared || 0;
    sum.clearedBefore += d.clearedBefore || 0;
    sum.clearedClaimed += d.clearedClaimed || 0;
    if (d.samples && d.samples.length) console.table(d.samples);
    if (d.done) {
      console.log('全部完成', sum, 'effectiveFrom=', d.effectiveFromDate);
      break;
    }
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }
  return sum;
})({ apply: true, effectiveFrom: '2026-08-13' });
```
