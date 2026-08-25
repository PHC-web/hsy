# 商户升级清零补跑（定向）

针对商户 **`h5_1784970557335_odst4h`**：已于 **2026-08-22 18:56:15** 升级会员，但当时未执行完整清零（待提现、冻结金额、分片账本、未领红包仍残留）。

先上传部署云函数 **`merchant`**（含 `adminRetroactiveUpgradePointsClear`）。

打开 **管理后台**，F12 控制台执行。

## 补跑内容

- 商户 `account_points` / `pending_withdraw` / `withdraw_pending_balance` → 0
- 商户及绑定机具 `frozen_amount` → 0
- `hsy-points-slice-state` 未领取分片 → 软删除并归零
- `hsy-income-packets` 待领取红包 → `expired` 并归零
- 写入 `hsy-operation-logs`（`action=member_upgrade_points_clear`，`retroactive_backfill=true`）留底

---

## 1. 预览（不写库）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRetroactiveUpgradePointsClear',
    params: {
      dryRun: true,
      merchantUserId: 'h5_1784970557335_odst4h',
      upgradeAt: '2026-08-22 18:56:15'
    }
  }
}).then((res) => {
  const r = res.result || res;
  console.log(r);
  if (r.data && r.data.preview) {
    console.log('待提现', r.data.preview.clearedAccountPoints);
    console.log('冻结字段', r.data.preview.clearedFrozenAmount);
    console.log('分片合计', r.data.preview.sliceTotal, r.data.preview.sliceByTargetYm);
    console.log('未领红包', r.data.preview.pendingPacketTotal, r.data.preview.pendingPacketCount);
    if (r.data.preview.sliceSample) console.table(r.data.preview.sliceSample);
    if (r.data.preview.pendingPacketSample) console.table(r.data.preview.pendingPacketSample);
  }
});
```

确认 `preview.hasResidual === true` 且各项金额与预期一致后再执行下一步。

---

## 2. 正式补跑（写库）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRetroactiveUpgradePointsClear',
    params: {
      apply: true,
      merchantUserId: 'h5_1784970557335_odst4h',
      upgradeAt: '2026-08-22 18:56:15',
      note: '2026-08-22升级后遗留冻结/待提现补跑'
    }
  }
}).then((res) => {
  const r = res.result || res;
  console.log(r);
  if (r.data && r.data.after) {
    console.log('补跑后残留', r.data.after.hasResidual, r.data.after);
  }
});
```

成功时 `after.hasResidual` 应为 `false`。

---

## 3. 查看留底

商户列表 → **积分明细** → **F. 会员升级清零留底**

或控制台：

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'merchantUpgradePointsClearLogs',
    params: { merchantUserId: 'h5_1784970557335_odst4h', limit: 5 }
  }
}).then((res) => console.log(res.result || res));
```

---

## 说明

- 若返回 `409 已存在补跑清零记录`，说明已跑过；勿重复执行，除非确认需要重跑并传 `force: true`。
- `upgradeAt` 仅用于留底文案，不影响清零逻辑。
- 其他同类商户可将 `merchantUserId` / `upgradeAt` 替换后复用同一 action。
