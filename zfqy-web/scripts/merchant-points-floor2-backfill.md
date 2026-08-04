# 商户积分余额向下取整到分（浏览器控制台）

先上传部署云函数 **`merchant`**（含 `adminFloorMerchantPointsBalances`，以及积分写入统一 `floorYuan2`）。

打开 **管理后台 H5**，F12 控制台执行。

## 口径

- **严格向下截断到分（不是四舍五入）**
- `125.22999` → **125.22**（不会变成 125.23）
- `0.8189` → **0.81**
- `146.57999999999996` → **146.57**

---

## 预览一批

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminFloorMerchantPointsBalances',
    params: { dryRun: true, chunkSize: 100 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 自动跑完全部（推荐）

```javascript
(async function runFloorMerchantPoints({ apply = true, chunkSize = 100 } = {}) {
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedSame: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminFloorMerchantPointsBalances',
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
    sum.skippedSame += d.skippedSame || 0;
    if (d.samples && d.samples.length) console.table(d.samples);
    if (d.done) {
      console.log('全部完成', sum);
      break;
    }
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }
  return sum;
})({ apply: false }); // 确认后改 { apply: true }
```
