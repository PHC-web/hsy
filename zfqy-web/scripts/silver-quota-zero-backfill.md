# 历史白银会员「剩余额度为 0」补写脚本

云函数：`merchant`  
Action：`adminSilverMembersQuotaZeroBackfill`

## 作用

- 仅处理 **非充值档白银会员**（兑换码白银、`silver_member`、会员名含「白银」等历史口径）
- **只补写当前剩余额度为 0** 的商户 → 写入 `1000`（可用 `grantYuan` 覆盖）
- **已有非 0 剩余额度的一律跳过**（含之前手动改过的、提现后仍有余额的）
- 若该商户 **未退回提现累计已达 1000**，视为额度已用尽，默认跳过（避免误补）

## 1. 先 dry-run 预览（不写库）

在 uniCloud 控制台 → 云函数 `merchant` → 云端测试，传入：

```json
{
  "action": "adminSilverMembersQuotaZeroBackfill",
  "data": {
    "dryRun": true,
    "chunkSize": 200
  }
}
```

查看返回：

- `patched`：本批将补写条数
- `skippedHasQuota`：因已有非 0 额度跳过（手动修正过的在这）
- `skippedExhausted`：因提现累计已满跳过
- `samples`：补写样例
- `nextCursor`：不为空则继续下一批

## 2. 分批执行写库

确认 `samples` 无误后，**同一批 cursor 从空开始**，传 `apply: true`：

```json
{
  "action": "adminSilverMembersQuotaZeroBackfill",
  "data": {
    "apply": true,
    "chunkSize": 200
  }
}
```

若 `done: false`，用上一批返回的 `nextCursor` 继续：

```json
{
  "action": "adminSilverMembersQuotaZeroBackfill",
  "data": {
    "apply": true,
    "chunkSize": 200,
    "cursorId": "上一批返回的 nextCursor"
  }
}
```

重复直到 `done: true`。

## 3. 可选参数

| 参数 | 说明 |
|------|------|
| `grantYuan` | 补写额度，默认 `1000` |
| `skipExhaustedCheck` | `true` 时不校验提现累计（慎用） |
| `chunkSize` | 每批 20–500，默认 200 |

## 4. 与旧脚本区别

| 脚本 | 行为 |
|------|------|
| `adminSilverMembersQuotaZeroBackfill`（本脚本） | **仅** `剩余额度=0` 时写入；非 0 不动 |
| `adminSilverExchangeMerchantsQuotaFloor` | 对已兑换白银做 `max(当前, 1000)`，可能抬高部分剩余额度 |

历史数据补 0 显示问题，请优先使用 **本脚本**。

## 5. 部署

修改后需上传云函数 **`merchant`** 再执行。

---

# 非 0 白银商户：按「1000 - 已提现」重算剩余额度

云函数：`merchant`  
Action：`adminSilverMembersQuotaRecalcByWithdrawn`

## 公式

```text
剩余额度 = max(0, 1000 - 已打款 - 未打款 - 审核中)
```

占用额度分三档（互斥，合计为扣减总额）：

| 分档 | 口径 |
|------|------|
| **已打款** | `arrival_status=received` 或 `is_paid=true`，且非待审核 |
| **未打款** | 已审核通过或自动提现处理中，尚未到账 |
| **审核中** | `audit_status=pending` |

以下**不计入**占用（发起时已扣、拒绝/失败后已退回）：`arrival_status=returned`、`audit_status=rejected`。

- 默认 **仅处理当前剩余额度 > 0** 的白银商户（与 zeroBackfill 互补）
- 重算结果与当前值相同则跳过

## 浏览器控制台

### 预览

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminSilverMembersQuotaRecalcByWithdrawn',
    params: { dryRun: true, chunkSize: 200 }
  }
}).then(res => console.log(res.result));
```

### 写库（单批）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminSilverMembersQuotaRecalcByWithdrawn',
    params: { apply: true, chunkSize: 200 }
  }
}).then(res => console.log(res.result));
```

### 自动跑完全部批次

```javascript
(async function runSilverQuotaRecalc() {
  let cursorId = '';
  let batch = 0;
  for (;;) {
    batch += 1;
    const res = await uniCloud.callFunction({
      name: 'merchant',
      data: {
        action: 'adminSilverMembersQuotaRecalcByWithdrawn',
        params: {
          apply: true,
          chunkSize: 200,
          ...(cursorId ? { cursorId } : {})
        }
      }
    });
    const r = res.result || res;
    console.log(`第 ${batch} 批`, r);
    if (r.code !== 0) break;
    const d = r.data || {};
    console.log('本批更新', d.patched, '未变化', d.skippedUnchanged);
    if (d.done) { console.log('全部完成'); break; }
    cursorId = d.nextCursor || '';
    if (!cursorId) break;
  }
})();
```

## 建议执行顺序

1. `adminSilverMembersQuotaZeroBackfill` — 把剩余为 **0** 且应授予 1000 的补上  
2. `adminSilverMembersQuotaRecalcByWithdrawn` — 把剩余 **> 0** 的按 `1000 - 已提现` 校正  

## 可选参数

| 参数 | 说明 |
|------|------|
| `onlyNonZero` | 默认 `true`；`false` 时连剩余为 0 的也按公式重算 |
| `grantYuan` | 授予总额，默认 `1000` |
