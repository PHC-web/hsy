# 充值赠品发货补扫（按日 · 仅钻石档）

部署 **`merchant`** 后，管理后台 F12 执行。

默认扫描 **北京时间 2026-08-29** 当天、已支付的**钻石会员**充值单。

## 预览

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRechargeGiftShipmentBackfill',
    params: { dryRun: true, date: '2026-08-29' }
  }
}).then((res) => {
  const d = (res.result || res).data || {};
  console.log(d.message || res.result || res);
  console.log(d.explain);
  console.log('当日已支付', d.paidOrdersOnDay, '其中钻石', d.diamondOrdersOnDay);
  console.log('有赠品字段', d.diamondWithGiftType, '无赠品字段', d.diamondWithoutGiftType);
  console.table(d.allDiamondSamples || []);
  console.table(d.missingSamples || []);
  console.table(d.diamondSuspectNoGiftSamples || []);
});
```

## 正式补写（仅补：有赠品字段但无发货单）

```javascript
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminRechargeGiftShipmentBackfill',
    params: { apply: true, date: '2026-08-29' }
  }
}).then((res) => console.log(res.result || res));
```
