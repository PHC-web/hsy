# 协议签署图 base64 → 云存储（浏览器控制台）

先上传部署云函数 **`merchant`**（需包含 action `adminAgreementImgMigrateToCloud`），以及 **`brand`**（签署列表预览兼容 `cloud://`）。

然后打开 **管理后台 H5**（已登录），按 F12 打开控制台，粘贴执行。

## 说明

- 扫描 `hsy-merchant-users.agreement_img` 以 `data:image/` 开头的内嵌图
- 上传到云存储路径 `hsy/agreement/{merchantId}/...`，库内改为 `cloud://fileID`
- **读路径已兼容**：旧 base64 / `cloud://` / `http(s)` 均可预览与导出 PDF
- 新签署（`h5SignAgreement`）已直接上传云存储，不再写 base64
- 建议 `chunkSize` **8～10**（单文档可达数 MB，过大易超时）

---

## 1. 预览一批（不写库、不上传）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminAgreementImgMigrateToCloud',
    params: { dryRun: true, chunkSize: 8 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 2. 写库单批

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminAgreementImgMigrateToCloud',
    params: { apply: true, chunkSize: 8 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 3. 自动跑完全部（推荐）

```javascript
(async function runAgreementImgMigrateToCloud({ apply = true, chunkSize = 8 } = {}) {
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedOk: 0, skippedEmpty: 0, failed: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminAgreementImgMigrateToCloud',
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
    sum.skippedOk += d.skippedOk || 0;
    sum.skippedEmpty += d.skippedEmpty || 0;
    sum.failed += d.failed || 0;
    if (d.samples && d.samples.length) console.table(d.samples);
    if (d.errors && d.errors.length) console.warn('errors', d.errors);
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
// 预览全部（不上传）
await (async function () {
  let cursorId = '';
  let batch = 0;
  const sum = { scanned: 0, updated: 0, skippedOk: 0, skippedEmpty: 0, failed: 0 };
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminAgreementImgMigrateToCloud',
        params: { apply: false, dryRun: true, chunkSize: 8, ...(cursorId ? { cursorId } : {}) }
      }
    });
    const r = res.result || res;
    console.log(`预览第 ${batch} 批`, r);
    if (r.code !== 0) break;
    const d = r.data || {};
    sum.scanned += d.scanned || 0;
    sum.updated += d.updated || 0;
    sum.skippedOk += d.skippedOk || 0;
    sum.skippedEmpty += d.skippedEmpty || 0;
    sum.failed += d.failed || 0;
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
    action: 'adminAgreementImgMigrateToCloud',
    params: { apply: true, merchantUserId: 'h5_xxxx' }
  }
}).then((res) => console.log(res.result || res));
```

---

## 返回字段

| 字段 | 含义 |
|------|------|
| `updated` | 本批迁出（或 dry-run 将迁出）条数 |
| `skippedOk` | 已是 cloud:// 或 https，跳过 |
| `skippedEmpty` | 无图 |
| `failed` | 上传/写库失败 |
| `samples` | 样例：原字节数 / 新 fileID |
| `nextCursor` / `done` | 续跑游标 |
