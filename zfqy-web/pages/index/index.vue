<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group"></view>
		</view>
		<view class="uni-container dashboard-page">
			<view class="title-wrap">
				<view class="page-title">控制台</view>
				<view class="page-desc">用于展示当前系统中的统计数据、统计报表及重要实时数据</view>
			</view>

			<view class="panel-wrap">
				<view class="panel-title">数据预览中控台</view>
				<view class="cards-row">
					<view class="stat-card">
						<view class="icon-box green"><text class="bi bi-speedometer2"></text></view>
						<view class="card-content">
							<view class="card-value">{{ dashboard.brandCount }} / {{ dashboard.machineCount }} / {{ dashboard.activatedCount }} / {{ dashboard.boundCount }}</view>
							<view class="card-label">品牌数 / 机具数 / 激活数 / 绑定数</view>
						</view>
					</view>

					<view class="stat-card">
						<view class="icon-box red"><text class="bi bi-currency-dollar"></text></view>
						<view class="card-content">
							<view class="card-value">{{ dashboard.withdrawCount }} / {{ toMoney(dashboard.withdrawAmount) }}</view>
							<view class="card-label">提现单数 / 提现金额</view>
						</view>
					</view>

					<view class="stat-card">
						<view class="icon-box purple"><text class="bi bi-tools"></text></view>
						<view class="card-content">
							<view class="card-value">{{ dashboard.activatedCount }} / {{ dashboard.todayActivatedCount }}</view>
							<view class="card-label">激活总数 / 今日激活</view>
						</view>
					</view>

					<view class="stat-card">
						<view class="icon-box blue"><text class="bi bi-bar-chart-line"></text></view>
						<view class="card-content">
							<view class="card-value">{{ dashboard.userCount }} / {{ dashboard.memberCount }} / {{ dashboard.memberRate }}%</view>
							<view class="card-label">用户数 / 会员数 / 会员率</view>
						</view>
					</view>
				</view>
			</view>

			<view class="bottom-row">
				<view class="returns-card">
					<view class="returns-title">返现总额比例</view>
					<view class="returns-rate">{{ dashboard.returnRate }}%</view>
					<view class="returns-desc">总返现{{ toMoney(dashboard.returnPaid) }} / 应交服务{{ toMoney(dashboard.returnDue) }}</view>
				</view>

				<view class="summary-card">
					<view class="summary-title">数据说明</view>
					<view class="summary-item">提现：按提现记录汇总，金额保留两位小数</view>
					<view class="summary-item">激活：今日激活按当天 00:00 后时间统计</view>
					<view class="summary-item">会员率：会员数 / 用户数</view>
				</view>
			</view>
		</view>

		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
	export default {
		data() {
			return {
				loading: false,
				dashboard: {
					brandCount: 0,
					machineCount: 0,
					activatedCount: 0,
					boundCount: 0,
					withdrawCount: 0,
					withdrawAmount: 0,
					todayActivatedCount: 0,
					userCount: 0,
					memberCount: 0,
					memberRate: '0.00',
					returnPaid: 0,
					returnDue: 0,
					returnRate: '0.00'
				},
			}
		},
		onShow() {
			this.loadDashboard();
		},
		methods: {
			toMoney(value) {
				const num = Number(value || 0);
				return num.toLocaleString('zh-CN', {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				});
			},
			async loadDashboard() {
				this.loading = true;
				const db = uniCloud.database();
				const dbCmd = db.command;
				try {
					const todayStart = new Date();
					todayStart.setHours(0, 0, 0, 0);

					const [
						brandRes,
						machineRes,
						activatedRes,
						boundRes,
						todayActivatedRes,
						withdrawRes,
						merchantRes,
						memberRes
					] = await Promise.all([
						db.collection('opendb-brand').where({ is_deleted: false }).count(),
						db.collection('opendb-machine').where({ is_deleted: false }).count(),
						db.collection('opendb-machine').where({ is_deleted: false, is_activated: true }).count(),
						db.collection('opendb-machine').where({ is_deleted: false, is_bound: 1 }).count(),
						db.collection('opendb-machine').where({
							is_deleted: false,
							is_activated: true,
							activated_time: dbCmd.gte(todayStart)
						}).count(),
						db.collection('opendb-withdraw-records').where({ is_deleted: false }).field('amount').limit(10000).get(),
						db.collection('opendb-merchant-users').count(),
						db.collection('opendb-merchant-users').where({ device_id: dbCmd.neq('') }).count()
					]);

					const withdrawRows = withdrawRes.result?.data || [];
					const withdrawAmount = withdrawRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

					const brandStatRes = await db.collection('opendb-brand')
						.where({ is_deleted: false })
						.field('return_machine,return_payment')
						.limit(10000)
						.get();
					const brandRows = brandStatRes.result?.data || [];
					const returnDue = brandRows.reduce((sum, item) => sum + Number(item.return_machine || 0), 0);
					const returnPaid = brandRows.reduce((sum, item) => sum + Number(item.return_payment || 0), 0);

					const userCount = merchantRes.result?.total || 0;
					const memberCount = memberRes.result?.total || 0;
					const memberRate = userCount ? ((memberCount / userCount) * 100).toFixed(2) : '0.00';
					const returnRate = returnDue ? ((returnPaid / returnDue) * 100).toFixed(2) : '0.00';

					this.dashboard = {
						brandCount: brandRes.result?.total || 0,
						machineCount: machineRes.result?.total || 0,
						activatedCount: activatedRes.result?.total || 0,
						boundCount: boundRes.result?.total || 0,
						withdrawCount: withdrawRows.length,
						withdrawAmount,
						todayActivatedCount: todayActivatedRes.result?.total || 0,
						userCount,
						memberCount,
						memberRate,
						returnPaid,
						returnDue,
						returnRate
					};
				} catch (err) {
					uni.showModal({
						content: err.message || '首页数据加载失败',
						showCancel: false
					});
				} finally {
					this.loading = false;
				}
			}
		}
	}
</script>

<style>
.dashboard-page {
		background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
		min-height: 420px;
		padding: 18px 20px 28px;
		border-radius: 10px;
	}

	.title-wrap {
		margin-bottom: 8px;
	}

	.page-title {
		font-size: 20px;
		font-weight: 600;
		color: #2f2f2f;
	}

	.page-desc {
		margin-top: 6px;
		font-size: 12px;
		color: #8c8c8c;
	}

	.panel-title {
		margin-bottom: 16px;
		font-size: 22px;
		font-weight: 500;
		color: #4b4b4b;
	}

	.panel-wrap {
		margin-top: 16px;
		padding: 16px 18px 18px;
		border-radius: 10px;
		background: #fff;
		border: 1px solid #eef1f6;
		box-shadow: 0 2px 12px rgba(18, 38, 63, 0.05);
	}

	.cards-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.stat-card {
		width: calc(25% - 14px);
		min-width: 220px;
		display: flex;
		align-items: center;
		padding: 12px 12px;
		border-radius: 8px;
		background: #fafbfd;
		border: 1px solid #edf0f5;
	}

	.icon-box {
		width: 36px;
		height: 36px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 20px;
		margin-right: 12px;
	}

	.icon-box.green { background: #32b66f; }
	.icon-box.red { background: #e84c3d; }
	.icon-box.purple { background: #6f63b6; }
	.icon-box.blue { background: #33a9dc; }

	.card-value {
		font-size: 34px;
		line-height: 1.1;
		color: #333;
		font-weight: 600;
	}

	.card-label {
		margin-top: 4px;
		font-size: 14px;
		color: #888;
	}

	.returns-card {
		width: 320px;
		padding: 16px 18px;
		border-radius: 8px;
		color: #fff;
		background: linear-gradient(180deg, #ef3d86 0%, #d81b60 100%);
		box-shadow: 0 10px 24px rgba(216, 27, 96, 0.25);
	}

	.returns-title {
		font-size: 14px;
		opacity: 0.95;
	}

	.returns-rate {
		font-size: 36px;
		line-height: 1.2;
		margin-top: 8px;
	}

	.returns-desc {
		margin-top: 8px;
		font-size: 12px;
		opacity: 0.95;
	}

	.bottom-row {
		margin-top: 16px;
		display: flex;
		gap: 12px;
		align-items: stretch;
	}

	.summary-card {
		flex: 1;
		min-width: 260px;
		border-radius: 8px;
		background: #fff;
		border: 1px solid #eef1f6;
		padding: 14px 16px;
		box-shadow: 0 2px 12px rgba(18, 38, 63, 0.05);
	}

	.summary-title {
		font-size: 14px;
		font-weight: 600;
		color: #3d4a5d;
		margin-bottom: 10px;
	}

	.summary-item {
		font-size: 13px;
		line-height: 1.8;
		color: #6d7786;
	}

	@media screen and (max-width: 1200px) {
		.stat-card {
			width: calc(50% - 9px);
		}
	}

	@media screen and (max-width: 768px) {
		.stat-card {
			width: 100%;
		}
		.bottom-row {
			flex-direction: column;
		}
		.returns-card {
			width: 100%;
		}
	}
</style>
