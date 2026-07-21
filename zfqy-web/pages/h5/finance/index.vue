<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<view class="nav-back" @click="goBack">
				<text class="bi bi-chevron-left nav-back-ico"></text>
				<text class="nav-back-txt">返回</text>
			</view>
			<text class="nav-title">财务管理</text>
			<text class="nav-placeholder"></text>
		</view>

		<view class="filters h5-glass-panel">
			
			<text class="f-label">开始日期</text>
			<picker mode="date" :value="startDate" @change="onStartDate">
				<view class="picker-val">{{ startDate }}</view>
			</picker>
			<text class="f-label">结束日期</text>
			<picker mode="date" :value="endDate" @change="onEndDate">
				<view class="picker-val">{{ endDate }}</view>
			</picker>
			<button class="btn-query" type="primary" size="mini" :loading="loading" @click="query">查询</button>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false" @scrolltolower="loadMore">
			<view class="list-inner">
				<view v-if="!list.length && !loading" class="empty">暂无记录</view>
				<view
					v-for="item in list"
					:key="item.id"
					class="row h5-glass-panel"
					:class="{ 'row-clickable': canLaunchConfirm(item) }"
					@click="onRowClick(item)"
				>
					<view class="row-head">
						<text class="row-type" :class="'t-' + item.recordType">{{ typeShort(item.recordType) }}</text>
						<text class="row-time">{{ item.timeText }}</text>
					</view>
					<text class="row-title">{{ item.title }}</text>
					<text v-if="item.subtitle" class="row-sub">{{ item.subtitle }}</text>
					<view class="row-amt">
						<text class="amt-label">{{ item.amountLabel }}</text>
						<text class="amt-val">¥{{ item.amount }}</text>
					</view>
					<text class="row-status">状态：{{ item.status }}</text>
					<text v-if="canLaunchConfirm(item)" class="row-action-tip">点击此处可进行收款</text>
					<text v-if="item.extra && item.extra.withdrawNo" class="row-extra">提现单：{{ item.extra.withdrawNo }}</text>
				</view>
				<view v-if="loading" class="loading-tip">加载中…</view>
				<view v-if="hasMore && list.length" class="load-more">上拉或继续滑动加载更多</view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5FinanceRecords, h5WithdrawConfirmPackage, h5WithdrawSyncAfterConfirm, h5WithdrawSyncMine } from '@/pages/h5/common/api';

function todayStr() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function daysAgoStr(days) {
	const d = new Date();
	d.setDate(d.getDate() - days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function dayBoundsToTs(startYmd, endYmd) {
	const [ys, ms, ds] = startYmd.split('-').map(Number);
	const [ye, me, de] = endYmd.split('-').map(Number);
	const startTs = new Date(ys, ms - 1, ds, 0, 0, 0, 0).getTime();
	const endTs = new Date(ye, me - 1, de, 23, 59, 59, 999).getTime();
	return { startTs, endTs };
}

export default {
	data() {
		return {
			startDate: daysAgoStr(90),
			endDate: todayStr(),
			list: [],
			page: 1,
			total: 0,
			loading: false,
			hasMore: false,
			_onPageVisible: null,
			_visRefreshTimer: null
		};
	},
	onLoad() {
		if (typeof document === 'undefined') return;
		this._onPageVisible = () => {
			if (document.visibilityState !== 'visible') return;
			if (this._visRefreshTimer) clearTimeout(this._visRefreshTimer);
			this._visRefreshTimer = setTimeout(() => {
				this._visRefreshTimer = null;
				this.query({ silent: true });
			}, 300);
		};
		document.addEventListener('visibilitychange', this._onPageVisible);
	},
	onUnload() {
		if (typeof document !== 'undefined' && this._onPageVisible) {
			document.removeEventListener('visibilitychange', this._onPageVisible);
			this._onPageVisible = null;
		}
		if (this._visRefreshTimer) {
			clearTimeout(this._visRefreshTimer);
			this._visRefreshTimer = null;
		}
	},
	onShow() {
		this.query();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		onStartDate(e) {
			this.startDate = e.detail.value;
		},
		onEndDate(e) {
			this.endDate = e.detail.value;
		},
		typeShort(t) {
			if (t === 'withdraw') return '提现';
			return '提现';
		},
		canLaunchConfirm(item) {
			return (
				item &&
				item.recordType === 'withdraw' &&
				item.extra &&
				String(item.extra.transferState || '') === 'WAIT_USER_CONFIRM'
			);
		},
		async onRowClick(item) {
			if (!this.canLaunchConfirm(item)) return;
			if (typeof window === 'undefined' || !window.WeixinJSBridge || !window.WeixinJSBridge.invoke) {
				uni.showToast({ title: '请在微信内打开后再确认收款', icon: 'none' });
				return;
			}
			const withdrawNo = item?.extra?.withdrawNo || '';
			if (!withdrawNo) {
				uni.showToast({ title: '缺少提现单号', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '拉起中...', mask: true });
			let invokeOk = false;
			try {
				const res = await h5WithdrawConfirmPackage(withdrawNo);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '获取确认参数失败', icon: 'none' });
					return;
				}
				const data = res.data || {};
				await new Promise((resolve) => {
					window.WeixinJSBridge.invoke(
						'requestMerchantTransfer',
						{
							mchId: String(data.mchId || ''),
							appId: String(data.appId || ''),
							package: String(data.package || '')
						},
						(r) => {
							const msg = String((r && r.err_msg) || '');
							if (msg.indexOf('ok') >= 0) {
								invokeOk = true;
							} else if (msg.indexOf('cancel') >= 0) {
								uni.showToast({ title: '你已取消确认收款', icon: 'none' });
							} else {
								uni.showToast({ title: msg || '拉起失败', icon: 'none' });
							}
							resolve();
						}
					);
				});
				if (invokeOk) {
					uni.showLoading({ title: '同步到账中…', mask: true });
					const sync = await h5WithdrawSyncAfterConfirm(withdrawNo, { rounds: 8, intervalMs: 1200 });
					if (sync.code === 0 && sync.data && sync.data.arrived) {
						uni.showToast({ title: '已到账', icon: 'success' });
					} else if (sync.code === 0) {
						uni.showToast({ title: sync.message || '确认已提交，请稍后刷新', icon: 'none' });
					} else {
						uni.showToast({ title: sync.message || '同步失败，请稍后刷新', icon: 'none' });
					}
				}
				await this.query({ silent: true });
			} finally {
				uni.hideLoading();
			}
		},
		async query(opts = {}) {
			const silent = !!opts.silent;
			this.page = 1;
			this.list = [];
			// 打开/刷新时先同步本商户处理中单据，避免 SUCCESS 拖到零点才更新
			try {
				await h5WithdrawSyncMine({ limit: 8 });
			} catch (e) {}
			await this.fetch(true, { silent });
		},
		async loadMore() {
			if (!this.hasMore || this.loading) return;
			this.page += 1;
			await this.fetch(false);
		},
		async fetch(reset, opts = {}) {
			const silent = !!opts.silent;
			const { startTs, endTs } = dayBoundsToTs(this.startDate, this.endDate);
			if (startTs > endTs) {
				uni.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
				return;
			}
			if (!silent) this.loading = true;
			try {
				const res = await h5FinanceRecords({
					startTs,
					endTs,
					page: this.page,
					pageSize: 20
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const rows = res.data?.list || [];
				this.total = res.data?.total || 0;
				this.list = reset ? rows : this.list.concat(rows);
				this.hasMore = this.list.length < this.total;
			} finally {
				if (!silent) this.loading = false;
			}
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
	display: flex;
	flex-direction: column;
}

.nav-bar {
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 8px;
}

.nav-back {
	flex-shrink: 0;
}

.nav-title {
	color: #0f172a;
	font-size: 17px;
	font-weight: 700;
}

.nav-placeholder {
	min-width: 64px;
}

.filters {
	margin: 0 12px 10px;
	padding: 12px 14px;
	position: relative;
	z-index: 2;
	flex-shrink: 0;
}

.f-label {
	display: block;
	font-size: 11px;
	color: #64748b;
	margin-top: 8px;
	margin-bottom: 4px;
}

.f-hint + .f-label {
	margin-top: 0;
}

.f-hint {
	display: block;
	font-size: 12px;
	color: #64748b;
	margin-bottom: 8px;
}

.picker-val {
	padding: 8px 10px;
	border-radius: 10px;
	background: #f1f5f9;
	border: 1px solid #e2e8f0;
	color: #334155;
	font-size: 14px;
}

.btn-query {
	margin-top: 12px;
	width: 100%;
	border-radius: 999px;
}

/* flex 子项内 scroll-view：height:0 + flex:1 才能占满剩余区域，避免与筛选区重叠 */
.scroll {
	flex: 1;
	height: 0;
	min-height: 0;
	width: 100%;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
}

.list-inner {
	padding: 0 12px 28px;
}

.empty {
	text-align: center;
	color: #64748b;
	padding: 24px;
	font-size: 14px;
}

.row {
	padding: 12px 14px;
	margin-bottom: 10px;
}

.row-clickable {
	border: 1px solid rgba(56, 189, 248, 0.45);
}

.row-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 6px;
}

.row-type {
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 6px;
	font-weight: 700;
}

.t-withdraw {
	background: rgba(16, 185, 129, 0.25);
	color: #059669;
}

.row-time {
	font-size: 12px;
	color: #64748b;
}

.row-title {
	font-size: 15px;
	font-weight: 600;
	color: #0f172a;
}

.row-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #64748b;
	word-break: break-all;
}

.row-amt {
	display: flex;
	justify-content: space-between;
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid #e2e8f0;
}

.amt-label {
	font-size: 12px;
	color: #64748b;
}

.amt-val {
	font-size: 16px;
	font-weight: 700;
	color: #059669;
}

.row-status {
	display: block;
	margin-top: 6px;
	font-size: 12px;
	color: #475569;
}

.row-action-tip {
	display: block;
	margin-top: 4px;
	font-size: 11px;
	color: #7dd3fc;
}

.row-extra {
	display: block;
	margin-top: 4px;
	font-size: 11px;
	color: #64748b;
	word-break: break-all;
}

.loading-tip,
.load-more {
	text-align: center;
	font-size: 12px;
	color: #64748b;
	padding: 10px;
}
</style>
