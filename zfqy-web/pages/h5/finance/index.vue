<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<text class="nav-back" @click="goBack">‹ 返回</text>
			<text class="nav-title">财务管理</text>
			<text class="nav-placeholder"></text>
		</view>

		<view class="filters h5-glass-panel">
			<text class="f-label">类型</text>
			<picker mode="selector" :range="typeLabels" :value="typeIndex" @change="onTypeChange">
				<view class="picker-val">{{ typeLabels[typeIndex] }}</view>
			</picker>
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
				<view v-for="item in list" :key="item.id" class="row h5-glass-panel">
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
					<text v-if="item.extra && item.extra.platformNo" class="row-extra">单号：{{ item.extra.platformNo }}</text>
					<text v-if="item.extra && item.extra.withdrawNo" class="row-extra">提现单：{{ item.extra.withdrawNo }}</text>
					<text v-if="item.extra && item.extra.refundNo" class="row-extra">退款单：{{ item.extra.refundNo }}</text>
				</view>
				<view v-if="loading" class="loading-tip">加载中…</view>
				<view v-if="hasMore && list.length" class="load-more">上拉或继续滑动加载更多</view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5FinanceRecords } from '@/pages/h5/common/api';

const TYPES = [
	{ value: 'all', label: '全部' },
	{ value: 'recharge', label: '充值' },
	{ value: 'refund', label: '退款' },
	{ value: 'withdraw', label: '提现' }
];

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
			typeLabels: TYPES.map((x) => x.label),
			typeIndex: 0,
			startDate: daysAgoStr(90),
			endDate: todayStr(),
			list: [],
			page: 1,
			total: 0,
			loading: false,
			hasMore: false
		};
	},
	onShow() {
		this.query();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		onTypeChange(e) {
			this.typeIndex = Number(e.detail.value || 0);
		},
		onStartDate(e) {
			this.startDate = e.detail.value;
		},
		onEndDate(e) {
			this.endDate = e.detail.value;
		},
		typeShort(t) {
			if (t === 'recharge') return '充值';
			if (t === 'refund') return '退款';
			if (t === 'withdraw') return '提现';
			return '';
		},
		async query() {
			this.page = 1;
			this.list = [];
			await this.fetch(true);
		},
		async loadMore() {
			if (!this.hasMore || this.loading) return;
			this.page += 1;
			await this.fetch(false);
		},
		async fetch(reset) {
			const { startTs, endTs } = dayBoundsToTs(this.startDate, this.endDate);
			if (startTs > endTs) {
				uni.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
				return;
			}
			const recordType = TYPES[this.typeIndex].value;
			this.loading = true;
			try {
				const res = await h5FinanceRecords({
					recordType,
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
				this.loading = false;
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
	color: rgba(226, 232, 240, 0.95);
	font-size: 15px;
	min-width: 64px;
}

.nav-title {
	color: #f8fafc;
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
	color: rgba(186, 199, 216, 0.85);
	margin-top: 8px;
	margin-bottom: 4px;
}

.f-label:first-child {
	margin-top: 0;
}

.picker-val {
	padding: 8px 10px;
	border-radius: 10px;
	background: rgba(15, 23, 42, 0.4);
	border: 1px solid rgba(255, 255, 255, 0.1);
	color: #e2e8f0;
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
	color: rgba(148, 163, 184, 0.95);
	padding: 24px;
	font-size: 14px;
}

.row {
	padding: 12px 14px;
	margin-bottom: 10px;
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

.t-recharge {
	background: rgba(59, 130, 246, 0.25);
	color: #93c5fd;
}

.t-refund {
	background: rgba(245, 158, 11, 0.25);
	color: #fcd34d;
}

.t-withdraw {
	background: rgba(16, 185, 129, 0.25);
	color: #6ee7b7;
}

.row-time {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}

.row-title {
	font-size: 15px;
	font-weight: 600;
	color: #f8fafc;
}

.row-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(203, 213, 225, 0.88);
	word-break: break-all;
}

.row-amt {
	display: flex;
	justify-content: space-between;
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.amt-label {
	font-size: 12px;
	color: rgba(186, 199, 216, 0.9);
}

.amt-val {
	font-size: 16px;
	font-weight: 700;
	color: #a7f3d0;
}

.row-status {
	display: block;
	margin-top: 6px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.85);
}

.row-extra {
	display: block;
	margin-top: 4px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.9);
	word-break: break-all;
}

.loading-tip,
.load-more {
	text-align: center;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.85);
	padding: 10px;
}
</style>
