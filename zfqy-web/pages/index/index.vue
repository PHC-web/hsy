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

			<view class="panel-wrap preview-panel">
				<view class="preview-panel-head">
					<view class="panel-title mb0">数据预览中控台</view>
					<view class="preview-panel-hint">核心指标一览</view>
				</view>

				<view class="preview-grid">
					<view class="preview-card preview-card--accent-green">
						<view class="preview-card-head">
							<view class="preview-icon preview-icon--green"><text class="bi bi-speedometer2"></text></view>
							<text class="preview-card-title">机具与绑定</text>
						</view>
						<view class="preview-metrics preview-metrics--quad">
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.brandCount }}</text>
								<text class="preview-metric-label">品牌数</text>
							</view>
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.machineCount }}</text>
								<text class="preview-metric-label">机具数</text>
							</view>
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.activatedCount }}</text>
								<text class="preview-metric-label">激活数</text>
							</view>
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.boundCount }}</text>
								<text class="preview-metric-label">绑定数</text>
							</view>
						</view>
					</view>

					<view class="preview-card preview-card--accent-red">
						<view class="preview-card-head">
							<view class="preview-icon preview-icon--red"><text class="bi bi-currency-dollar"></text></view>
							<text class="preview-card-title">提现成功</text>
						</view>
						<view class="preview-metrics preview-metrics--stack">
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.withdrawCount }}</text>
								<text class="preview-metric-label">成功单数</text>
							</view>
							<view class="preview-metric">
								<text class="preview-metric-value preview-metric-value--money">{{ toMoney(dashboard.withdrawAmount) }}</text>
								<text class="preview-metric-label">成功金额</text>
							</view>
						</view>
					</view>

					<view class="preview-card preview-card--accent-purple">
						<view class="preview-card-head">
							<view class="preview-icon preview-icon--purple"><text class="bi bi-tools"></text></view>
							<text class="preview-card-title">激活概况</text>
						</view>
						<view class="preview-metrics preview-metrics--stack">
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.activatedCount }}</text>
								<text class="preview-metric-label">激活总数</text>
							</view>
							<view class="preview-metric preview-metric--highlight">
								<text class="preview-metric-value">{{ dashboard.todayActivatedCount }}</text>
								<text class="preview-metric-label">今日激活</text>
							</view>
						</view>
					</view>

					<view class="preview-card preview-card--accent-blue">
						<view class="preview-card-head">
							<view class="preview-icon preview-icon--blue"><text class="bi bi-bar-chart-line"></text></view>
							<text class="preview-card-title">用户与会员</text>
						</view>
						<view class="preview-metrics preview-metrics--user">
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.userCount }}</text>
								<text class="preview-metric-label">用户数</text>
							</view>
							<view class="preview-metric">
								<text class="preview-metric-value">{{ dashboard.memberCount }}</text>
								<text class="preview-metric-label">会员数</text>
							</view>
							<view class="preview-metric preview-metric--rate">
								<text class="preview-metric-value">{{ dashboard.memberRate }}<text class="preview-metric-unit">%</text></text>
								<text class="preview-metric-label">会员率</text>
							</view>
						</view>
					</view>
				</view>

				<view class="preview-membership">
					<view class="preview-membership-head">
						<view class="preview-icon preview-icon--orange"><text class="bi bi-people"></text></view>
						<view class="preview-membership-titles">
							<text class="preview-card-title">会员分档</text>
							<text class="preview-membership-sub">按当前会员档位统计商户人数</text>
						</view>
						<text class="preview-membership-total">合计 {{ membershipTierTotal }}</text>
					</view>
					<view class="preview-tier-grid">
						<view
							v-for="item in membershipTierItems"
							:key="item.key"
							class="preview-tier"
							:class="'preview-tier--' + item.key"
						>
							<text class="preview-tier-count">{{ item.count }}</text>
							<text class="preview-tier-label">{{ item.shortLabel }}</text>
						</view>
					</view>
				</view>
			</view>

			<view class="bottom-row">
				<view class="returns-card">
					<view class="returns-title">资金汇总</view>
					<view class="returns-stack">
						<view class="returns-metrics returns-metrics--overview">
							<view class="returns-metric">
								<view class="returns-metric-label">已提现金额</view>
								<view class="returns-metric-value">{{ toMoney(dashboard.arrivedWithdrawAmount) }}</view>
							</view>
							<view class="returns-metric">
								<view class="returns-metric-label">总刷卡金额</view>
								<view class="returns-metric-value">{{ toMoney(dashboard.boundMerchantTradeAmount) }}</view>
							</view>
							<view class="returns-metric returns-metric--rate">
								<view class="returns-metric-label">提现率</view>
								<view class="returns-metric-value">{{ withdrawRatePerWan }}</view>
							</view>
						</view>
						<view class="returns-tier-wrap">
							<view class="returns-metrics returns-metrics--tier">
								<view class="returns-metric">
									<view class="returns-metric-label">会员到账金额</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.arrivedWithdrawAmountMember) }}</view>
								</view>
								<view class="returns-metric">
									<view class="returns-metric-label">会员待打款</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.pendingWithdrawAmountMember) }}</view>
								</view>
								<view class="returns-metric">
									<view class="returns-metric-label">会员刷卡金额</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.boundMerchantTradeAmountMember) }}</view>
								</view>
								<view class="returns-metric returns-metric--rate">
									<view class="returns-metric-label">会员提现率</view>
									<view class="returns-metric-value">{{ withdrawRateMemberPerWan }}</view>
								</view>
								<view class="returns-metric">
									<view class="returns-metric-label">非会员到账金额</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.arrivedWithdrawAmountNonMember) }}</view>
								</view>
								<view class="returns-metric">
									<view class="returns-metric-label">非会员待打款</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.pendingWithdrawAmountNonMember) }}</view>
								</view>
								<view class="returns-metric">
									<view class="returns-metric-label">非会员刷卡金额</view>
									<view class="returns-metric-value">{{ toMoney(dashboard.boundMerchantTradeAmountNonMember) }}</view>
								</view>
								<view class="returns-metric returns-metric--rate">
									<view class="returns-metric-label">非会员提现率</view>
									<view class="returns-metric-value">{{ withdrawRateNonMemberPerWan }}</view>
								</view>
							</view>
						</view>
					</view>
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
							<view class="chart-summary">{{ trendRangeLabel }}交易额：{{ toMoney(trendSummary.totalFlow) }} ｜ 历史累计交易额：{{ toMoney(trendSummary.allTimeTotalFlow) }}</view>
						</view>
						<view ref="flowChart" class="echart-box"></view>
					</view>
					<view class="chart-card">
						<view class="chart-head">
							<view class="chart-title">新增商户 / 升级商户</view>
							<view class="chart-summary chart-summary--multi">
								<view>{{ trendRangeLabel }}累计新增绑定：{{ trendSummary.totalBindMerchantCount || 0 }} ｜ {{ trendRangeLabel }}累计升级商户：{{ trendSummary.totalRechargeMerchantCount || 0 }}</view>
								<view>历史累计新增绑定：{{ trendSummary.allTimeBindMerchantCount || 0 }} ｜ 历史累计升级商户：{{ trendSummary.allTimeRechargeMerchantCount || 0 }}</view>
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
	import adminConfig from '@/admin.config.js';
	import { canAccessAdminHome, canAccessPortal } from '@/js_sdk/uni-admin/resolveAdminEntryUrl.js';

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
					arrivedWithdrawAmount: 0,
					arrivedWithdrawAmountMember: 0,
					arrivedWithdrawAmountNonMember: 0,
					pendingWithdrawAmountMember: 0,
					pendingWithdrawAmountNonMember: 0,
					boundMerchantTradeAmount: 0,
					boundMerchantTradeAmountMember: 0,
					boundMerchantTradeAmountNonMember: 0,
					totalRechargeAmount: 0,
					totalRefundAmount: 0,
					membershipCounts: {
						normal: 0,
						silver: 0,
						gold: 0,
						white_gold: 0,
						diamond: 0,
						other: 0
					}
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
			const portalUrl = (adminConfig.portal && adminConfig.portal.url) || '/pages/portal/index';
			if (!canAccessAdminHome(this)) {
				if (canAccessPortal(this)) {
					uni.redirectTo({
						url: portalUrl,
						fail: () => {
							uni.showToast({ title: '跳转门户失败', icon: 'none' });
						}
					});
				} else {
					uni.showToast({ title: '无控制台访问权限', icon: 'none' });
				}
				return;
			}
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

					const summaryPromise = this.$request('adminHomeSummary', {}, { functionName: 'merchant' });
					const [
						brandRes,
						machineRes,
						activatedRes,
						boundRes,
						todayActivatedRes,
						withdrawRes,
						merchantRes,
						memberRes,
						summaryRes
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
						).count(),
						summaryPromise
					]);

					const withdrawRows = withdrawRes.result?.data || [];
					const withdrawAmount = withdrawRows.reduce((sum, item) => sum + Number(item.payable || 0), 0);

					const userCount = merchantRes.result?.total || 0;
					const memberCount = memberRes.result?.total || 0;
					const memberRate = userCount ? ((memberCount / userCount) * 100).toFixed(2) : '0.00';

					const sum = summaryRes && summaryRes.code === 0 ? summaryRes.data || {} : {};
					if (summaryRes && summaryRes.code !== 0) {
						uni.showToast({ title: summaryRes.message || '资金汇总加载失败', icon: 'none' });
					} else if (sum.membershipCounts && sum.membershipCounts._error) {
						console.error('membershipCounts', sum.membershipCounts._error);
					}

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
						arrivedWithdrawAmount: Number(sum.arrivedWithdrawAmount || 0),
						arrivedWithdrawAmountMember: Number(sum.arrivedWithdrawAmountMember || 0),
						arrivedWithdrawAmountNonMember: Number(sum.arrivedWithdrawAmountNonMember || 0),
						pendingWithdrawAmountMember: Number(sum.pendingWithdrawAmountMember || 0),
						pendingWithdrawAmountNonMember: Number(sum.pendingWithdrawAmountNonMember || 0),
						boundMerchantTradeAmount: Number(sum.boundMerchantTradeAmount || 0),
						boundMerchantTradeAmountMember: Number(sum.boundMerchantTradeAmountMember || 0),
						boundMerchantTradeAmountNonMember: Number(sum.boundMerchantTradeAmountNonMember || 0),
						totalRechargeAmount: Number(sum.totalRechargeAmount || 0),
						totalRefundAmount: Number(sum.totalRefundAmount || 0),
						membershipCounts: Object.assign(
							{
								normal: 0,
								silver: 0,
								gold: 0,
								white_gold: 0,
								diamond: 0,
								other: 0
							},
							sum.membershipCounts || {}
						)
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
					{ el: this.$refs.flowChart, model: this.trendCharts.flow, title: '每日交易额（与刷卡记录一致）' },
					{ el: this.$refs.bindChart, model: this.trendCharts.bindRechargeUsers, title: '每日新增绑定商户 / 每日升级商户' },
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
						{ name: '每日交易额(元)', data: s.dailyFlow || [] }
					]);
					this.trendCharts.bindRechargeUsers = this.buildLineData(categories, [
						{ name: '新增绑定商户数', data: s.newBindMerchantCount || [] },
						{ name: '升级商户数', data: s.rechargeMerchantCount || [] }
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
			membershipTierItems() {
				const c = this.dashboard.membershipCounts || {};
				return [
					{ key: 'normal', label: '普通会员', shortLabel: '普通', count: Number(c.normal) || 0 },
					{ key: 'silver', label: '白银会员', shortLabel: '白银', count: Number(c.silver) || 0 },
					{ key: 'gold', label: '黄金会员', shortLabel: '黄金', count: Number(c.gold) || 0 },
					{ key: 'white_gold', label: '白金会员', shortLabel: '白金', count: Number(c.white_gold) || 0 },
					{ key: 'diamond', label: '钻石会员', shortLabel: '钻石', count: Number(c.diamond) || 0 },
					{ key: 'other', label: '其他会员', shortLabel: '其他', count: Number(c.other) || 0 }
				];
			},
			membershipTierTotal() {
				return this.membershipTierItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
			},
			trendRangeLabel() {
				return this.trendRangeLabelText();
			},
			/** 每万元刷卡对应的已到账提现金额：已到账÷刷卡×10000，显示「X.XX元/万」 */
			withdrawRatePerWan() {
				const w = Number(this.dashboard.arrivedWithdrawAmount || 0);
				const s = Number(this.dashboard.boundMerchantTradeAmount || 0);
				if (!Number.isFinite(w) || !Number.isFinite(s) || s <= 0) return '0.00元/万';
				const yuanPerWan = (w / s) * 10000;
				if (!Number.isFinite(yuanPerWan)) return '0.00元/万';
				return `${yuanPerWan.toFixed(2)}元/万`;
			},
			withdrawRateMemberPerWan() {
				const w = Number(this.dashboard.arrivedWithdrawAmountMember || 0);
				const s = Number(this.dashboard.boundMerchantTradeAmountMember || 0);
				if (!Number.isFinite(w) || !Number.isFinite(s) || s <= 0) return '0.00元/万';
				const yuanPerWan = (w / s) * 10000;
				if (!Number.isFinite(yuanPerWan)) return '0.00元/万';
				return `${yuanPerWan.toFixed(2)}元/万`;
			},
			withdrawRateNonMemberPerWan() {
				const w = Number(this.dashboard.arrivedWithdrawAmountNonMember || 0);
				const s = Number(this.dashboard.boundMerchantTradeAmountNonMember || 0);
				if (!Number.isFinite(w) || !Number.isFinite(s) || s <= 0) return '0.00元/万';
				const yuanPerWan = (w / s) * 10000;
				if (!Number.isFinite(yuanPerWan)) return '0.00元/万';
				return `${yuanPerWan.toFixed(2)}元/万`;
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
	min-width: 0;
	width: 100%;
	max-width: 1480px;
	margin: 0 auto;
	padding: 12px 8px 28px;
	box-sizing: border-box;
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

.preview-panel .mb0 {
	margin-bottom: 0;
}

.preview-panel-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
	margin-bottom: 16px;
}

.preview-panel-hint {
	font-size: 12px;
	color: #94a3b8;
}

.preview-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 14px;
}

.preview-card {
	position: relative;
	padding: 14px 14px 12px;
	border-radius: 12px;
	background: #fff;
	border: 1px solid rgba(148, 163, 184, 0.18);
	box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
	overflow: hidden;
	transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.preview-card::before {
	content: '';
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 3px;
	border-radius: 12px 0 0 12px;
}

.preview-card--accent-green::before { background: linear-gradient(180deg, #22c55e, #16a34a); }
.preview-card--accent-red::before { background: linear-gradient(180deg, #f87171, #dc2626); }
.preview-card--accent-purple::before { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
.preview-card--accent-blue::before { background: linear-gradient(180deg, #38bdf8, #2563eb); }

.preview-card:hover {
	border-color: rgba(148, 163, 184, 0.35);
	box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
}

.preview-card-head {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 12px;
}

.preview-card-title {
	font-size: 14px;
	font-weight: 600;
	color: #334155;
	line-height: 1.3;
}

.preview-icon {
	width: 36px;
	height: 36px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #fff;
	font-size: 17px;
	flex-shrink: 0;
}

.preview-icon--green { background: linear-gradient(145deg, #22c55e, #16a34a); }
.preview-icon--red { background: linear-gradient(145deg, #f87171, #dc2626); }
.preview-icon--purple { background: linear-gradient(145deg, #a78bfa, #7c3aed); }
.preview-icon--blue { background: linear-gradient(145deg, #38bdf8, #2563eb); }
.preview-icon--orange { background: linear-gradient(135deg, #f59e0b, #ea580c); }

.preview-metrics {
	display: grid;
	gap: 8px;
}

.preview-metrics--quad {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preview-metrics--stack {
	grid-template-columns: 1fr;
}

.preview-metrics--user {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preview-metrics--user .preview-metric--rate {
	grid-column: 1 / -1;
}

.preview-metric {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	min-width: 0;
	padding: 10px 6px 8px;
	border-radius: 8px;
	background: #f8fafc;
	border: 1px solid rgba(148, 163, 184, 0.12);
}

.preview-metric--highlight {
	background: linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%);
	border-color: rgba(124, 58, 237, 0.15);
}

.preview-metric--highlight .preview-metric-value {
	color: #6d28d9;
}

.preview-metric--rate .preview-metric-value {
	color: #1d4ed8;
}

.preview-metric-value {
	font-size: clamp(18px, 1.6vw, 24px);
	line-height: 1.15;
	font-weight: 700;
	color: #0f172a;
	font-variant-numeric: tabular-nums;
}

.preview-metric-value--money {
	font-size: clamp(15px, 1.35vw, 20px);
}

.preview-metric-unit {
	font-size: 0.72em;
	font-weight: 600;
	margin-left: 1px;
}

.preview-metric-label {
	margin-top: 5px;
	font-size: 11px;
	color: #64748b;
	line-height: 1.3;
}

.preview-membership {
	margin-top: 14px;
	padding: 14px 14px 12px;
	border-radius: 12px;
	background: linear-gradient(145deg, #fafafa 0%, #f8fafc 100%);
	border: 1px solid rgba(148, 163, 184, 0.2);
}

.preview-membership-head {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 12px;
	flex-wrap: wrap;
}

.preview-membership-titles {
	flex: 1;
	min-width: 140px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.preview-membership-sub {
	font-size: 11px;
	color: #94a3b8;
	line-height: 1.35;
}

.preview-membership-total {
	font-size: 12px;
	font-weight: 600;
	color: #475569;
	padding: 4px 10px;
	border-radius: 999px;
	background: #fff;
	border: 1px solid rgba(148, 163, 184, 0.25);
	font-variant-numeric: tabular-nums;
}

.preview-tier-grid {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 10px;
}

.preview-tier {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 12px 8px 10px;
	border-radius: 10px;
	border: 1px solid transparent;
	min-width: 0;
	transition: transform 0.15s ease;
}

.preview-tier:hover {
	transform: translateY(-1px);
}

.preview-tier-count {
	font-size: 22px;
	font-weight: 700;
	line-height: 1.1;
	font-variant-numeric: tabular-nums;
}

.preview-tier-label {
	margin-top: 6px;
	font-size: 12px;
	font-weight: 500;
	line-height: 1.2;
}

.preview-tier--normal {
	background: #f1f5f9;
	border-color: #e2e8f0;
	color: #475569;
}
.preview-tier--normal .preview-tier-count { color: #334155; }

.preview-tier--silver {
	background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
	border-color: #cbd5e1;
	color: #64748b;
}
.preview-tier--silver .preview-tier-count { color: #475569; }

.preview-tier--gold {
	background: linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%);
	border-color: #fde68a;
	color: #b45309;
}
.preview-tier--gold .preview-tier-count { color: #d97706; }

.preview-tier--white_gold {
	background: linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%);
	border-color: #bae6fd;
	color: #0369a1;
}
.preview-tier--white_gold .preview-tier-count { color: #0284c7; }

.preview-tier--diamond {
	background: linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%);
	border-color: #ddd6fe;
	color: #6d28d9;
}
.preview-tier--diamond .preview-tier-count { color: #7c3aed; }

.preview-tier--other {
	background: linear-gradient(145deg, #fafaf9 0%, #f5f5f4 100%);
	border-color: #e7e5e4;
	color: #78716c;
}
.preview-tier--other .preview-tier-count { color: #57534e; }

@media (max-width: 1200px) {
	.preview-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 900px) {
	.preview-tier-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

@media (max-width: 560px) {
	.preview-tier-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.preview-membership-total {
		width: 100%;
		text-align: center;
	}
}

	.returns-card {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		max-width: 100%;
		padding: 12px 14px 14px;
		border-radius: 10px;
		color: #fff;
		background: linear-gradient(180deg, #ef3d86 0%, #d81b60 100%);
		box-shadow: 0 10px 24px rgba(216, 27, 96, 0.25);
		overflow: hidden;
	}

	.returns-title {
		font-size: 13px;
		opacity: 0.95;
		margin-bottom: 0;
	}

	.returns-stack {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}

	.returns-metrics--overview {
		box-sizing: border-box;
		display: grid;
		width: 100%;
		min-width: 0;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px 12px;
	}

	.returns-tier-wrap {
		padding-top: 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.22);
		min-width: 0;
	}

	/* 会员/非会员：到账、待打款、刷卡、提现率 */
	.returns-metrics--tier {
		box-sizing: border-box;
		display: grid;
		width: 100%;
		min-width: 0;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px 12px;
	}

	@media (max-width: 900px) {
		.returns-metrics--tier {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.returns-metrics--tier {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.returns-metric {
		min-width: 0;
		max-width: 100%;
		padding: 10px 12px 12px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.18);
		box-sizing: border-box;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 76px;
	}

	.returns-metric--rate .returns-metric-value {
		font-size: clamp(14px, 1.35vw, 18px);
	}

	.returns-metric-label {
		font-size: 11px;
		line-height: 1.35;
		opacity: 0.9;
		margin-bottom: 6px;
		white-space: normal;
		word-break: break-word;
		text-align: center;
		width: 100%;
	}

	.returns-metric-value {
		font-size: clamp(13px, 1.35vw, 17px);
		font-weight: 700;
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
		word-break: break-word;
		overflow-wrap: anywhere;
		text-align: center;
		width: 100%;
	}

.bottom-row {
	margin-top: 16px;
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
		.chart-grid {
			grid-template-columns: 1fr;
		}
		.bottom-row {
			margin-top: 14px;
		}
		.returns-card {
			width: 100%;
		}
	}

	@media screen and (max-width: 768px) {
		.preview-grid {
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
