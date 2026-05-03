<template>
	<view v-if="!allowRender" class="h5-entry-placeholder"></view>
	<view v-else class="fix-top-window">
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
							<view class="card-label">提现成功单数 / 提现成功金额</view>
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
					<view class="returns-title">积分提现汇总</view>
					<view class="returns-rate">{{ toMoney(dashboard.withdrawNetAmount) }}</view>
					<view class="returns-desc">累计实际到账{{ toMoney(dashboard.withdrawNetAmount) }} / 累计手续费{{ toMoney(dashboard.withdrawFeeAmount) }}</view>
				</view>

				<view class="summary-card">
					<view class="summary-title">数据说明</view>
					<view class="summary-item">提现：按提现记录汇总，金额保留两位小数</view>
					<view class="summary-item">激活：今日激活按当天 00:00 后时间统计</view>
					<view class="summary-item">会员率：会员数 / 用户数</view>
				</view>
			</view>

			<view class="panel-wrap chart-panel">
				<view class="panel-head">
					<view class="panel-title mb0">数据统计</view>
					<view class="range-tabs">
						<view
							v-for="opt in rangeOptions"
							:key="opt.value"
							class="range-tab"
							:class="{ active: trendRangeType === opt.value }"
							@click="changeTrendRange(opt.value)"
						>{{ opt.label }}</view>
					</view>
				</view>
				<view class="chart-grid">
					<view class="chart-card">
						<view class="chart-head">
							<view class="chart-title">流水统计</view>
							<view class="chart-summary">{{ trendRangeLabel }}总流水：{{ toMoney(trendSummary.totalFlow) }} ｜ 历史总流水：{{ toMoney(trendSummary.allTimeTotalFlow) }}</view>
						</view>
						<view ref="flowChart" class="echart-box"></view>
					</view>
					<view class="chart-card">
						<view class="chart-head">
							<view class="chart-title">新增商户 / 充值商户</view>
							<view class="chart-summary chart-summary--multi">
								<view>{{ trendRangeLabel }}累计新增绑定：{{ trendSummary.totalBindMerchantCount || 0 }} ｜ {{ trendRangeLabel }}累计充值商户：{{ trendSummary.totalRechargeMerchantCount || 0 }}</view>
								<view>历史累计新增绑定：{{ trendSummary.allTimeBindMerchantCount || 0 }} ｜ 历史累计充值商户：{{ trendSummary.allTimeRechargeMerchantCount || 0 }}</view>
							</view>
						</view>
						<view ref="bindChart" class="echart-box"></view>
					</view>
					<view class="chart-card">
						<view class="chart-head">
							<view class="chart-title">充值/退款金额</view>
							<view class="chart-summary chart-summary--multi">
								<view>{{ trendRangeLabel }}累计充值：{{ toMoney(trendSummary.totalRechargeAmount) }} ｜ {{ trendRangeLabel }}累计退款：{{ toMoney(trendSummary.totalRefundAmount) }}</view>
								<view>历史累计充值：{{ toMoney(trendSummary.allTimeRechargeAmount) }} ｜ 历史累计退款：{{ toMoney(trendSummary.allTimeRefundAmount) }}</view>
							</view>
						</view>
						<view ref="rechargeChart" class="echart-box"></view>
					</view>
					<view class="chart-card">
						<view class="chart-head">
							<view class="chart-title">积分兑换数量 / 兑换到账金额</view>
							<view class="chart-summary chart-summary--multi">
								<view>{{ trendRangeLabel }}累计兑换数量：{{ trendSummary.totalExchangeCount || 0 }} ｜ {{ trendRangeLabel }}累计到账：{{ toMoney(trendSummary.totalExchangeNetAmount) }}</view>
								<view>历史累计兑换数量：{{ trendSummary.allTimeExchangeCount || 0 }} ｜ 历史累计到账：{{ toMoney(trendSummary.allTimeExchangeNetAmount) }}</view>
							</view>
						</view>
						<view ref="exchangeChart" class="echart-box"></view>
					</view>
					<view class="chart-card chart-card--full">
						<view class="chart-head">
							<view class="chart-title">交易类型统计</view>
							<view class="chart-summary chart-summary--multi">
								<view>{{ trendRangeLabel }}交易次数：{{ trendSummary.totalTradeCount || 0 }} ｜ {{ trendRangeLabel }}交易金额：{{ toMoney(trendSummary.totalTradeAmount) }}</view>
								<view>历史累计交易次数：{{ trendSummary.allTimeTradeCount || 0 }} ｜ 历史累计交易金额：{{ toMoney(trendSummary.allTimeTradeAmount) }}</view>
							</view>
						</view>
						<view ref="tradeTypeChart" class="echart-box"></view>
					</view>
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
				allowRender: true,
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
					returnRate: '0.00',
					withdrawNetAmount: 0,
					withdrawFeeAmount: 0
				},
				trendRangeType: '30d',
				rangeOptions: [
					{ label: '今日', value: 'today' },
					{ label: '本周', value: 'week' },
					{ label: '本月', value: 'month' },
					{ label: '近30天', value: '30d' }
				],
				trendCharts: {
					flow: { categories: [], series: [] },
					bindRechargeUsers: { categories: [], series: [] },
					rechargeRefund: { categories: [], series: [] },
					exchange: { categories: [], series: [] },
					tradeType: { categories: [], countSeries: [], amountSeries: [] }
				},
				trendSummary: {
					totalFlow: 0,
					allTimeTotalFlow: 0,
					totalBindMerchantCount: 0,
					totalRechargeMerchantCount: 0,
					allTimeBindMerchantCount: 0,
					allTimeRechargeMerchantCount: 0,
					totalRechargeAmount: 0,
					totalRefundAmount: 0,
					allTimeRechargeAmount: 0,
					allTimeRefundAmount: 0,
					totalExchangeCount: 0,
					totalExchangeNetAmount: 0,
					allTimeExchangeCount: 0,
					allTimeExchangeNetAmount: 0,
					totalTradeCount: 0,
					allTimeTradeCount: 0,
					totalTradeAmount: 0,
					allTimeTradeAmount: 0
				},
				echartsReady: false,
				echartsInstances: [],
				_resizeHandler: null,
				_chartResizeObserver: null
			};
		},
		onLoad() {
			// #ifdef H5
			const pathname = (window.location && window.location.pathname) || '/';
			const search = (window.location && window.location.search) || '';
			const hash = (window.location && window.location.hash) || '';
			const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
			if (!isAdminPath) {
				this.allowRender = false;
				if (hash.indexOf('/pages/h5/') === -1) {
					window.location.replace(`${pathname}${search}#/pages/h5/auth/index`);
				}
				return;
			}
			this.allowRender = true;
			// #endif
		},
		onShow() {
			if (!this.allowRender) return;
			this.loadDashboard();
			this.loadTrendCharts();
		},
		onUnload() {
			this.disposeEcharts();
			// #ifdef H5
			if (this._resizeHandler && typeof window !== 'undefined') {
				window.removeEventListener('resize', this._resizeHandler);
				this._resizeHandler = null;
			}
			if (this._chartResizeObserver) {
				try { this._chartResizeObserver.disconnect(); } catch (e) {}
				this._chartResizeObserver = null;
			}
			// #endif
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
						db.collection('hsy-brand').where({ is_deleted: false }).count(),
						db.collection('hsy-machine').where({ is_deleted: false }).count(),
						db.collection('hsy-machine').where({ is_deleted: false, is_activated: true }).count(),
						db.collection('hsy-machine').where({ is_deleted: false, is_bound: 1 }).count(),
						db.collection('hsy-machine').where({
							is_deleted: false,
							is_activated: true,
							activated_time: dbCmd.gte(todayStart)
						}).count(),
						db.collection('hsy-withdraw-records').where({
							is_deleted: false,
							is_paid: true,
							arrival_status: 'received'
						}).field('payable,fee_tax').limit(10000).get(),
						db.collection('hsy-merchant-users').count(),
						db.collection('hsy-merchant-users').where(
							dbCmd.or([
								{ recharge_amount: dbCmd.gt(0) },
								{ recharge_total_yuan: dbCmd.gt(0) }
							])
						).count()
					]);

					const withdrawRows = withdrawRes.result?.data || [];
					const withdrawAmount = withdrawRows.reduce((sum, item) => sum + Number(item.payable || 0), 0);
					const withdrawFeeAmount = withdrawRows.reduce((sum, item) => sum + Number(item.fee_tax || 0), 0);

					const userCount = merchantRes.result?.total || 0;
					const memberCount = memberRes.result?.total || 0;
					const memberRate = userCount ? ((memberCount / userCount) * 100).toFixed(2) : '0.00';

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
						returnPaid: 0,
						returnDue: 0,
						returnRate: '0.00',
						withdrawNetAmount: withdrawAmount,
						withdrawFeeAmount
					};
				} catch (err) {
					uni.showModal({
						content: err.message || '首页数据加载失败',
						showCancel: false
					});
				} finally {
					this.loading = false;
				}
			},
			buildLineData(categories, defs = []) {
				return {
					categories: Array.isArray(categories) ? categories : [],
					series: defs.map((x) => ({
						name: x.name,
						data: Array.isArray(x.data) ? x.data : []
					}))
				};
			},
			changeTrendRange(v) {
				if (!v || v === this.trendRangeType) return;
				this.trendRangeType = v;
				this.loadTrendCharts();
			},
			trendRangeLabelText() {
				const m = {
					today: '今日',
					week: '本周',
					month: '本月',
					'30d': '近30日'
				};
				return m[this.trendRangeType] || '当前';
			},
			async ensureEchartsReady() {
				// #ifndef H5
				return false;
				// #endif
				// #ifdef H5
				if (this.echartsReady && window && window.echarts) return true;
				if (typeof window === 'undefined') return false;
				if (window.echarts) {
					this.echartsReady = true;
					return true;
				}
				const baseUrl = (typeof process !== 'undefined' && process.env && process.env.BASE_URL) ? process.env.BASE_URL : '/';
				const origin = window.location.origin || '';
				const candidates = [
					`${origin}${baseUrl}uni_modules/qiun-data-charts/static/h5/echarts.min.js`,
					`${origin}/uni_modules/qiun-data-charts/static/h5/echarts.min.js`
				];
				let loaded = false;
				for (const src of candidates) {
					try {
						await new Promise((resolve, reject) => {
							const old = document.getElementById('dashboard-echarts-loader');
							if (old && old.parentNode) old.parentNode.removeChild(old);
							const script = document.createElement('script');
							script.id = 'dashboard-echarts-loader';
							script.src = src;
							script.async = true;
							script.onload = resolve;
							script.onerror = reject;
							document.head.appendChild(script);
						});
						if (window.echarts) {
							loaded = true;
							break;
						}
					} catch (e) {}
				}
				if (!loaded) return false;
				this.echartsReady = !!window.echarts;
				return this.echartsReady;
				// #endif
			},
			disposeEcharts() {
				(this.echartsInstances || []).forEach((ins) => {
					try { ins && ins.dispose && ins.dispose(); } catch (e) {}
				});
				this.echartsInstances = [];
			},
			buildEchartOption(title, categories, series, rangeType) {
				const isToday = rangeType === 'today';
				const total = Array.isArray(categories) ? categories.length : 0;
				const windowSize = isToday ? 12 : 7;
				let startPercent = 0;
				if (total > windowSize && total > 0) {
					startPercent = Number((((total - windowSize) / total) * 100).toFixed(2));
				}
				return {
					tooltip: {
						trigger: 'axis',
						confine: true
					},
					legend: { top: 0, textStyle: { fontSize: 12 } },
					grid: { left: 42, right: 16, top: 34, bottom: 52 },
					xAxis: {
						type: 'category',
						data: categories || [],
						axisLabel: { rotate: isToday ? 0 : 28, fontSize: 11 }
					},
					yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
					dataZoom: [
						{
							type: 'inside',
							start: startPercent,
							end: 100
						},
						{
							type: 'slider',
							height: 16,
							bottom: 8,
							start: startPercent,
							end: 100
						}
					],
					series: (series || []).map((x) => ({
						name: x.name,
						type: 'line',
						smooth: false,
						showSymbol: false,
						lineStyle: { width: 2 },
						data: x.data || []
					}))
				};
			},
			buildTradeTypeOption(model, rangeType) {
				const categories = model.categories || [];
				const countSeries = Array.isArray(model.countSeries) ? model.countSeries : [];
				const amountSeries = Array.isArray(model.amountSeries) ? model.amountSeries : [];
				const isToday = rangeType === 'today';
				const total = Array.isArray(categories) ? categories.length : 0;
				const windowSize = isToday ? 12 : 7;
				let startPercent = 0;
				if (total > windowSize && total > 0) {
					startPercent = Number((((total - windowSize) / total) * 100).toFixed(2));
				}
				const countLegend = [];
				const amountLegend = [];
				const cleanLabel = (v) => String(v || '').replace(/\([^)]*\)/g, '').trim();
				const series = [];
				countSeries.forEach((x) => {
					const name = `${cleanLabel(x.label || x.type)}次数`;
					countLegend.push(name);
					series.push({
						name,
						type: 'bar',
						yAxisIndex: 0,
						barMaxWidth: 16,
						data: Array.isArray(x.data) ? x.data : []
					});
				});
				amountSeries.forEach((x) => {
					const name = `${cleanLabel(x.label || x.type)}金额`;
					amountLegend.push(name);
					series.push({
						name,
						type: 'line',
						yAxisIndex: 1,
						smooth: false,
						showSymbol: false,
						lineStyle: { width: 2 },
						data: Array.isArray(x.data) ? x.data : []
					});
				});
				return {
					tooltip: { trigger: 'axis', confine: true },
					legend: [
						{ top: 0, textStyle: { fontSize: 12 }, data: countLegend },
						{ top: 24, textStyle: { fontSize: 12 }, data: amountLegend }
					],
					grid: { left: 42, right: 52, top: 106, bottom: 62 },
					xAxis: {
						type: 'category',
						data: categories || [],
						axisLabel: { fontSize: 12 }
					},
					yAxis: [
						{ type: 'value', name: '次数', splitLine: { lineStyle: { type: 'dashed' } } },
						{ type: 'value', name: '金额(元)', splitLine: { show: false } }
					],
					dataZoom: [
						{
							type: 'inside',
							start: startPercent,
							end: 100
						},
						{
							type: 'slider',
							height: 16,
							bottom: 10,
							start: startPercent,
							end: 100
						}
					]
					,
					series
				};
			},
			async renderEcharts() {
				const ok = await this.ensureEchartsReady();
				if (!ok) return;
				// #ifdef H5
				await this.$nextTick();
				this.disposeEcharts();
				const refs = [
					{ el: this.$refs.flowChart, model: this.trendCharts.flow, title: '已绑定商户机具每日总流水' },
					{ el: this.$refs.bindChart, model: this.trendCharts.bindRechargeUsers, title: '每日新增绑定商户 / 每日充值商户' },
					{ el: this.$refs.rechargeChart, model: this.trendCharts.rechargeRefund, title: '每日充值金额 / 每日退款笔数' },
					{ el: this.$refs.exchangeChart, model: this.trendCharts.exchange, title: '每日积分兑换数量 / 兑换到账金额' },
					{ el: this.$refs.tradeTypeChart, model: this.trendCharts.tradeType, title: '不同交易类型次数及金额', custom: 'tradeType' }
				];
				refs.forEach((r) => {
					if (!r.el || !window.echarts) return;
					const dom = r.el.$el || r.el;
					if (!dom) return;
					const ins = window.echarts.init(dom);
					if (r.custom === 'tradeType') {
						ins.setOption(this.buildTradeTypeOption(r.model, this.trendRangeType), true);
					} else {
						ins.setOption(this.buildEchartOption(r.title, r.model.categories, r.model.series, this.trendRangeType), true);
					}
					this.echartsInstances.push(ins);
				});
				if (!this._resizeHandler) {
					this._resizeHandler = () => {
						(this.echartsInstances || []).forEach((ins) => {
							try { ins.resize(); } catch (e) {}
						});
					};
					window.addEventListener('resize', this._resizeHandler);
				}
				if (!this._chartResizeObserver && typeof window !== 'undefined' && window.ResizeObserver) {
					this._chartResizeObserver = new window.ResizeObserver(() => {
						(this.echartsInstances || []).forEach((ins) => {
							try { ins.resize(); } catch (e) {}
						});
					});
					const obsTargets = [this.$refs.flowChart, this.$refs.bindChart, this.$refs.rechargeChart, this.$refs.exchangeChart, this.$refs.tradeTypeChart]
						.map((x) => (x && (x.$el || x)))
						.filter(Boolean);
					obsTargets.forEach((el) => {
						try { this._chartResizeObserver.observe(el); } catch (e) {}
					});
				}
				// #endif
			},
			async loadTrendCharts() {
				try {
					const res = await this.$request('adminDashboardTrend30d', { rangeType: this.trendRangeType }, { functionName: 'merchant' });
					if (!res || res.code !== 0) return;
					const d = res.data || {};
					const categories = d.categories || [];
					const s = d.series || {};
					this.trendSummary = Object.assign({ totalFlow: 0 }, d.summary || {});
					this.trendCharts.flow = this.buildLineData(categories, [
						{ name: '每日总流水(元)', data: s.dailyFlow || [] }
					]);
					this.trendCharts.bindRechargeUsers = this.buildLineData(categories, [
						{ name: '新增绑定商户数', data: s.newBindMerchantCount || [] },
						{ name: '充值商户数', data: s.rechargeMerchantCount || [] }
					]);
					this.trendCharts.rechargeRefund = this.buildLineData(categories, [
						{ name: '充值金额(元)', data: s.rechargeAmount || [] },
						{ name: '退款金额(元)', data: s.refundAmount || [] }
					]);
					this.trendCharts.exchange = this.buildLineData(categories, [
						{ name: '积分兑换数量', data: s.exchangeCount || [] },
						{ name: '兑换到账金额(元)', data: s.exchangeNetAmount || [] }
					]);
					const tradeTypeStats = Array.isArray(d.tradeTypeStats) ? d.tradeTypeStats : [];
					const typeLabelMap = {};
					tradeTypeStats.forEach((x) => {
						const k = String(x.type || '');
						if (k) typeLabelMap[k] = x.label || k;
					});
					const countSeriesRaw = Array.isArray(s.tradeTypeCountSeries) ? s.tradeTypeCountSeries : [];
					const amountSeriesRaw = Array.isArray(s.tradeTypeAmountSeries) ? s.tradeTypeAmountSeries : [];
					this.trendCharts.tradeType = {
						categories,
						countSeries: countSeriesRaw.map((x) => ({
							type: x.type,
							label: x.label || typeLabelMap[String(x.type || '')] || String(x.type || ''),
							data: Array.isArray(x.data) ? x.data : []
						})),
						amountSeries: amountSeriesRaw.map((x) => ({
							type: x.type,
							label: x.label || typeLabelMap[String(x.type || '')] || String(x.type || ''),
							data: Array.isArray(x.data) ? x.data : []
						}))
					};
					await this.renderEcharts();
				} catch (e) {}
			}
		},
		computed: {
			trendRangeLabel() {
				return this.trendRangeLabelText();
			}
		}
	};
</script>

<style>
.h5-entry-placeholder {
	width: 100vw;
	height: 100vh;
	background: #fff;
}

.dashboard-page {
	min-height: 420px;
	padding: 12px 8px 28px;
	max-width: 1480px;
	margin: 0 auto;
}

	.title-wrap {
		margin-bottom: 12px;
	}

	.page-title {
		position: relative;
		font-size: 22px;
		font-weight: 700;
		color: #0f172a;
		padding-left: 14px;
		letter-spacing: 0.02em;
	}

	.page-title::before {
		content: '';
		position: absolute;
		left: 0;
		top: 4px;
		bottom: 4px;
		width: 4px;
		border-radius: 4px;
		background: linear-gradient(180deg, #2563eb 0%, #6366f1 100%);
	}

	.page-desc {
		margin-top: 8px;
		font-size: 13px;
		color: #64748b;
		line-height: 1.5;
	}

	.panel-title {
		margin-bottom: 16px;
		font-size: 18px;
		font-weight: 600;
		color: #334155;
	}

.panel-wrap {
	margin-top: 16px;
	padding: 18px 18px 20px;
	border-radius: 14px;
	background: #fff;
	border: 1px solid rgba(148, 163, 184, 0.22);
	box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
}

.cards-row {
	display: grid;
	grid-template-columns: repeat(4, minmax(240px, 1fr));
	gap: 12px;
}

.stat-card {
	display: flex;
	align-items: center;
	padding: 14px 14px;
	border-radius: 12px;
	background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
	border: 1px solid rgba(148, 163, 184, 0.2);
	box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	transition: box-shadow 0.2s ease, transform 0.2s ease;
	min-height: 88px;
}

	.stat-card:hover {
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
	}

	.icon-box {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 20px;
		margin-right: 12px;
	}

	.icon-box.green { background: linear-gradient(145deg, #22c55e, #16a34a); }
	.icon-box.red { background: linear-gradient(145deg, #f87171, #dc2626); }
	.icon-box.purple { background: linear-gradient(145deg, #a78bfa, #7c3aed); }
	.icon-box.blue { background: linear-gradient(145deg, #38bdf8, #2563eb); }

.card-value {
	font-size: clamp(22px, 2.1vw, 32px);
	line-height: 1.1;
	color: #0f172a;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	word-break: break-word;
}

	.card-label {
		margin-top: 6px;
		font-size: 13px;
		color: #64748b;
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
	display: grid;
	grid-template-columns: 320px 1fr;
	gap: 12px;
	align-items: stretch;
}

	.summary-card {
		flex: 1;
		min-width: 260px;
		border-radius: 14px;
		background: #fff;
		border: 1px solid rgba(148, 163, 184, 0.22);
		padding: 16px 18px;
		box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
	}

	.summary-title {
		font-size: 15px;
		font-weight: 600;
		color: #334155;
		margin-bottom: 12px;
	}

	.summary-item {
		font-size: 13px;
		line-height: 1.85;
		color: #64748b;
	}

	.chart-panel {
		margin-top: 16px;
	}
.panel-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	margin-bottom: 12px;
	gap: 10px;
	flex-wrap: wrap;
}
	.mb0 {
		margin-bottom: 0;
	}
	.range-tabs {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.range-tab {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		color: #475569;
		background: #f1f5f9;
		border: 1px solid #cbd5e1;
		cursor: pointer;
		user-select: none;
	}
	.range-tab.active {
		color: #1d4ed8;
		background: #dbeafe;
		border-color: #93c5fd;
		font-weight: 600;
	}
.chart-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(360px, 1fr));
	gap: 14px;
}
.chart-card {
	background: #fff;
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 12px;
	padding: 12px;
	min-height: 360px;
}
.chart-card--full {
	grid-column: 1 / -1;
}
	.chart-title {
		font-size: 14px;
		font-weight: 600;
		color: #334155;
		margin-bottom: 8px;
	}
.chart-head {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: flex-start;
	gap: 4px;
	margin-bottom: 8px;
}
	.chart-head .chart-title {
		margin-bottom: 0;
	}
.chart-summary {
	font-size: 12px;
	font-weight: 600;
	color: #1d4ed8;
	white-space: normal;
	line-height: 1.45;
	width: 100%;
}
.chart-summary--multi {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	white-space: normal;
	line-height: 1.45;
}
	.echart-box {
		width: 100%;
		height: 292px;
	}
.chart-card--full .echart-box {
	height: 460px;
}

	@media screen and (max-width: 1200px) {
		.cards-row {
			grid-template-columns: repeat(2, minmax(240px, 1fr));
		}
		.chart-grid {
			grid-template-columns: 1fr;
		}
		.bottom-row {
			grid-template-columns: 1fr;
		}
		.returns-card {
			width: 100%;
		}
	}

	@media screen and (max-width: 768px) {
		.cards-row {
			grid-template-columns: 1fr;
		}
		.panel-wrap {
			padding: 14px 12px 16px;
		}
		.chart-card {
			min-height: 340px;
		}
	}
</style>
