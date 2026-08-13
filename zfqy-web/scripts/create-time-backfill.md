# 存量商户回填 create_time（浏览器控制台）

先上传部署云函数 **`merchant`**（需包含 action `adminCreateTimeBackfill`）。

然后打开 **管理后台 H5**（已登录），按 F12 打开控制台，粘贴执行。

## 规则

- 仅处理 **没有有效 `create_time`** 的商户（空 / 0 / 缺失）
- 优先用 **`bind_time`** 写入 `create_time`
- 若无 `bind_time`，再用 **`update_time`**
- 两者都没有：跳过
- 已有 `create_time`：跳过，不覆盖

---

## 1. 预览一批（不写库）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminCreateTimeBackfill',
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
    action: 'adminCreateTimeBackfill',
    params: { apply: true, chunkSize: 100 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 3. 自动跑完全部（推荐）

```javascript
(async function runCreateTimeBackfill({ apply = true, chunkSize = 100 } = {}) {
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedHasCreate: 0, skippedNoSource: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminCreateTimeBackfill',
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
    sum.skippedHasCreate += d.skippedHasCreate || 0;
    sum.skippedNoSource += d.skippedNoSource || 0;
    if (d.samples && d.samples.length) console.table(d.samples);
    if (d.done) {
      console.log('全部完成', sum);
      break;
    }
    cursorId = d.nextCursor || '';
    if (!cursorId) {
      console.warn('未返回 nextCursor，停止', d);
      break;
    }
  }
  return sum;
})({ apply: true, chunkSize: 100 });
```

先预览可改成：

```javascript
runCreateTimeBackfill({ apply: false, chunkSize: 100 });
```

（若上面用 IIFE 未挂到全局，把整段函数定义先粘贴一次，再调用。）

---

## 4. 指定单个商户

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminCreateTimeBackfill',
    params: { apply: true, merchantUserId: '这里填 user_id 或 _id' }
  }
}).then((res) => console.log(res.result || res));
```
