<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-tip">仅用于运维只读排查，不可代用户执行任何资金/权益操作</view>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<view class="search-card">
				<view class="row">
					<text class="label">商户ID</text>
					<uni-easyinput v-model.trim="merchantId" placeholder="请输入商户ID（hsy-merchant-users._id）" />
					<button size="mini" type="primary" :loading="loading" @click="loadAll">查询模拟数据</button>
				</view>
				<view class="readonly-actions">
					<button size="mini" disabled>提现（禁用）</button>
					<button size="mini" disabled>充值（禁用）</button>
					<button size="mini" disabled>退款（禁用）</button>
					<button size="mini" disabled>领取积分（禁用）</button>
					<button size="mini" disabled>签署协议（禁用）</button>
				</view>
			</view>

			<view class="tabs">
				<view
					v-for="tab in tabs"
					:key="tab.key"
					class="tab-item"
					:class="{ active: activeTab === tab.key }"
					@click="activeTab = tab.key"
				>{{ tab.name }}</view>
			</view>

			<view class="content-card">
				<view v-if="!merchantId" class="empty">请输入商户ID后查询</view>
				<view v-else-if="activePayload.error" class="empty error">{{ activePayload.error }}</view>
				<view v-else-if="activePayload.loading" class="empty">加载中...</view>
				<view v-else-if="!hasData(activePayload.data)" class="empty">暂无数据</view>
				<view v-else class="payload-wrap">
					<view class="section-title">{{ activeTabName }}（模拟只读）</view>
					<text class="json-text">{{ pretty(activePayload.data) }}</text>
				</view>
			</view>
		</view>
		<!-- #ifndef H5 --><fix-window /><!-- #endif -->
	</view>
</template>

<script>
function toDayRange(days = 30) {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - Math.max(0, Number(days || 0)));
	const toTs = (d, endOfDay = false) => {
		const x = new Date(d);
		if (endOfDay) x.setHours(23, 59, 59, 999);
		else x.setHours(0, 0, 0, 0);
		return x.getTime();
	};
	return { startTs: toTs(start, false), endTs: toTs(end, true) };
}

function initPayload() {
	return { loading: false, error: '', data: null };
}

export default {
	data() {
		return {
			loading: false,
			merchantId: '',
			activeTab: 'home',
			tabs: [
				{ key: 'home', name: 'H5首页', action: 'h5HomeDashboard', params: {} },
				{ key: 'mine', name: 'H5我的', action: 'h5MineInfo', params: {} },
				{ key: 'income', name: 'H5收益', action: 'h5IncomeList', params: {} },
				{ key: 'finance', name: 'H5财务', action: 'h5FinanceRecords', params: toDayRange(30) },
				{ key: 'withdraw', name: 'H5提现页', action: 'h5WithdrawInfo', params: {} },
				{ key: 'pending', name: 'H5待返积分', action: 'h5PendingReturnPoints', params: {} },
				{ key: 'coupons', name: 'H5优惠券', action: 'h5CouponMyList', params: {} },
				{ key: 'recharge', name: 'H5充值页', action: 'h5RechargeOptions', params: {} },
				{ key: 'device', name: 'H5码牌绑定', action: 'h5MachineBindingList', params: { page: 1, pageSize: 50 } },
				{ key: 'bindLog', name: 'H5绑定日志', action: 'h5MachineBindLogList', params: { page: 1, pageSize: 50 } },
				{ key: 'feedback', name: 'H5客服摘要', action: 'h5FeedbackSummary', params: {} },
				{ key: 'feedbackTicket', name: 'H5当前工单', action: 'h5FeedbackGetOpen', params: {} }
			],
			payloadMap: {
				home: initPayload(),
				mine: initPayload(),
				income: initPayload(),
				finance: initPayload(),
				withdraw: initPayload(),
				pending: initPayload(),
				coupons: initPayload(),
				recharge: initPayload(),
				device: initPayload(),
				bindLog: initPayload(),
				feedback: initPayload(),
				feedbackTicket: initPayload()
			}
		};
	},
	computed: {
		activePayload() {
			return this.payloadMap[this.activeTab] || initPayload();
		},
		activeTabName() {
			const hit = this.tabs.find((x) => x.key === this.activeTab);
			return hit ? hit.name : '-';
		}
	},
	methods: {
		pretty(v) {
			try {
				return JSON.stringify(v || {}, null, 2);
			} catch (e) {
				return String(v || '');
			}
		},
		hasData(v) {
			if (v == null) return false;
			if (Array.isArray(v)) return v.length > 0;
			if (typeof v === 'object') return Object.keys(v).length > 0;
			return true;
		},
		async fetchOne(tab) {
			const key = tab.key;
			const m = this.payloadMap[key];
			m.loading = true;
			m.error = '';
			try {
				const res = await uniCloud.callFunction({
					name: 'merchant',
					data: {
						action: tab.action,
						params: Object.assign({}, tab.params || {}, { merchantId: this.merchantId })
					}
				});
				const ret = (res && res.result) || {};
				if (ret.code !== 0) {
					m.error = ret.message || '查询失败';
					m.data = null;
					return;
				}
				m.data = ret.data || {};
			} catch (e) {
				m.error = e && e.message ? e.message : '查询异常';
				m.data = null;
			} finally {
				m.loading = false;
			}
		},
		async loadAll() {
			if (!this.merchantId) {
				uni.showToast({ title: '请先输入商户ID', icon: 'none' });
				return;
			}
			this.loading = true;
			try {
				await Promise.all(this.tabs.map((tab) => this.fetchOne(tab)));
				uni.showToast({ title: '模拟数据已加载', icon: 'success' });
			} finally {
				this.loading = false;
			}
		}
	}
};
</script>

<style scoped>
.page-wrap {
	padding: 16px;
}
.search-card {
	background: #fff;
	border-radius: 8px;
	padding: 12px;
	margin-bottom: 12px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.row {
	display: flex;
	align-items: center;
	gap: 10px;
}
.label {
	flex-shrink: 0;
	color: #606266;
	font-size: 13px;
}
.header-tip {
	font-size: 12px;
	color: #e6a23c;
	margin-left: auto;
}
.readonly-actions {
	margin-top: 10px;
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.tabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 12px;
}
.tab-item {
	padding: 6px 12px;
	border-radius: 999px;
	background: #f2f3f5;
	color: #606266;
	font-size: 12px;
	cursor: pointer;
}
.tab-item.active {
	background: #ecf5ff;
	color: #409eff;
}
.content-card {
	background: #fff;
	border-radius: 8px;
	min-height: 420px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	padding: 12px;
}
.section-title {
	font-size: 14px;
	color: #303133;
	font-weight: 600;
	margin-bottom: 8px;
}
.empty {
	padding: 28px 8px;
	text-align: center;
	color: #909399;
}
.empty.error {
	color: #f56c6c;
}
.payload-wrap {
	height: 100%;
}
.json-text {
	display: block;
	white-space: pre-wrap;
	word-break: break-all;
	font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
	font-size: 12px;
	line-height: 1.6;
	color: #303133;
	background: #f7f8fa;
	border-radius: 6px;
	padding: 10px;
	max-height: 640px;
	overflow-y: auto;
}
</style>
