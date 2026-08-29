# 人工补录充值赠品发货

商户 **`h5_1787989939643_7y76cb`** 选择 **扫码全能POS机**（`giftType: scan_pos`）。

先部署云函数 **`merchant`**（含 `adminRechargeGiftShipmentManualCreate`）。

管理后台 F12 执行。

## 1. 预览（不写库）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRechargeGiftShipmentManualCreate',
    params: {
      dryRun: true,
      merchantUserId: 'h5_1787989939643_7y76cb',
      giftType: 'scan_pos',
      giftLabel: '扫码全能POS机'
    }
  }
}).then((res) => console.log(res.result || res));
```

确认 `preview` 里订单号、商户信息无误后再执行下一步。

## 2. 正式补录

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRechargeGiftShipmentManualCreate',
    params: {
      apply: true,
      merchantUserId: 'h5_1787989939643_7y76cb',
      giftType: 'scan_pos',
      giftLabel: '扫码全能POS机'
    }
  }
}).then((res) => console.log(res.result || res));
```

成功后刷新 **充值赠品发货**，应能看到该商户、赠品为「扫码全能POS机」。

若提示找不到充值单，把订单号加上：

```javascript
params: {
  apply: true,
  merchantUserId: 'h5_1787989939643_7y76cb',
  giftType: 'scan_pos',
  giftLabel: '扫码全能POS机',
  orderNo: '这里填支付订单号'
}
```
