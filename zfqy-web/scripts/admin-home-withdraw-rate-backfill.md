# 首页月度提现率：历史月回填

首次部署后，定时任务只会重算**本月**（以及未封存的上月）。更早月份需要手动回填一次，写入 `hsy-admin-month-metrics` 后封存，之后不再扫流水。

## 前置

1. 上传数据库 schema：`hsy-admin-month-metrics`（含 `ym` 唯一索引）
2. 部署云函数：`merchant`、`admin-home-cache-cron`

## 回填（云函数 merchant）

每次建议 `monthsBack` 取 **1～3**，避免超时。例如回填近 6 个自然月（含本月），可分两次：

```js
// 第 1 次：本月 + 往前 3 个月
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminHomeMonthMetricsBackfill',
    data: { monthsBack: 3 },
    uid: 'admin'
  }
})

// 第 2 次：再往前（会重算重叠月；已封存月默认跳过，可用 force:true 强制）
uniCloud.callFunction({
  name: 'merchant',
  data: {
    action: 'adminHomeMonthMetricsBackfill',
    data: { monthsBack: 6 },
    uid: 'admin'
  }
})
```

强制重算已封存月：

```js
data: { monthsBack: 2, force: true }
```

## 口径

| 指标 | 说明 |
|------|------|
| 常规流水 | 刷卡记录金额（过风险+优化审核） |
| 风险流水 | 风险管理：未审核 + 审核不通过（通过的已计入常规，不重复） |
| 优化流水 | 流水优化：未审核 + 审核不通过（通过的已计入常规，不重复） |
| 总刷卡 | 常规 + 风险 + 优化 |
| 提现 | `is_paid` 且 `arrival_status=received` 的 `payable`，按 `arrival_time` 归月 |
| 领取积分 | `hsy-income-packets` 已领取，按 `claimed_time` 归月 |
| 未提现 | `max(0, 领取积分 - 提现)`（同月粗估） |
| 提现率 | 提现÷总刷卡×10000，展示「元/万」 |

若此前已回填过旧口径月度数据，请用 `force: true` 强制重算一次。

## 预测（后四月）

综合近月提现率 EMA、领取/转化、全平台待提现存量、分片冻结释放与刷卡趋势，粗估后四月提现率；仅供参考。
