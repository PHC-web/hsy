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
			<text class="nav-title">优惠券</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="inner">
			<!-- 	<view class="card h5-glass-panel hero">
					<text class="hero-label">本月合理流水（元）</text>
					<text class="hero-val">¥{{ monthFlow }}</text>
					<text class="hero-sub">统计月 {{ monthNo }}；与「收益」页气泡待领规则一致，达标后请到「收益」点气泡领取积分。</text>
				</view> -->

				<view v-if="!loading && !list.length" class="empty h5-glass-panel">
					<text class="empty-txt">暂无优惠券记录。</text>
				</view>

				<view v-for="row in list" :key="row.id" class="row h5-glass-panel">
					<view class="row-head">
						<text class="row-name">{{ row.name }}</text>
						<text class="row-status" :class="statusClass(row.status)">{{ row.statusText }}</text>
					</view>
					<text v-if="row.description" class="row-desc">{{ row.description }}</text>
					<view class="row-metrics">
						<text class="metric">门槛 ¥{{ row.monthlyThresholdYuan }}</text>
						<text class="metric metric-gold">奖励 ¥{{ row.rewardYuan }}</text>
					</view>
					<view v-if="row.status === 'tracking'" class="progress-wrap">
						<view class="progress-bg">
							<view class="progress-fill" :style="{ width: row.progressPercent + '%' }"></view>
						</view>
						<text class="progress-cap">本月进度 {{ row.progressPercent }}%</text>
					</view>
					<view class="row-foot">
						<text class="foot-i">发放 {{ row.issuedAtText }}</text>
						<text class="foot-i">截止 {{ row.validUntilText }}</text>
					</view>
				</view>

				<view v-if="loading" class="loading-tip">
					<text>加载中…</text>
				</view>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5CouponMyList } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			loading: false,
			list: [],
			monthFlow: '0.00',
			monthNo: '-'
		};
	},
	onShow() {
		this.load();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		statusClass(st) {
			if (st === 'claimed') return 'st-ok';
			if (st === 'expired_no_qualify') return 'st-bad';
			if (st === 'reward_issued') return 'st-warn';
			return '';
		},
		async load() {
			this.loading = true;
			try {
				const res = await h5CouponMyList();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.list = Array.isArray(d.list) ? d.list : [];
				this.monthFlow = d.currentMonthFlowYuan != null ? String(d.currentMonthFlowYuan) : '0.00';
				this.monthNo = d.monthNo || '-';
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
	flex-shrink: 0;
}
.nav-title {
	color: #0f172a;
	font-size: 17px;
	font-weight: 700;
}
.nav-placeholder {
	width: 64px;
}

.scroll {
	flex: 1;
	min-height: 0;
	position: relative;
	z-index: 1;
}
.inner {
	padding: 12px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}

.card {
	padding: 16px;
	margin-bottom: 12px;
	border-radius: 18px;
}
.hero-label {
	display: block;
	font-size: 12px;
	color: #64748b;
}
.hero-val {
	display: block;
	margin-top: 8px;
	font-size: 26px;
	font-weight: 800;
	color: #fde68a;
	letter-spacing: 0.02em;
}
.hero-sub {
	display: block;
	margin-top: 10px;
	font-size: 11px;
	line-height: 1.55;
	color: #64748b;
}

.empty {
	padding: 24px 16px;
	text-align: center;
}
.empty-txt {
	font-size: 13px;
	color: #64748b;
	line-height: 1.6;
}

.row {
	padding: 14px 16px;
	margin-bottom: 10px;
	border-radius: 18px;
}
.row-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}
.row-name {
	font-size: 15px;
	font-weight: 700;
	color: #0f172a;
	flex: 1;
	min-width: 0;
}
.row-status {
	font-size: 11px;
	font-weight: 600;
	padding: 4px 8px;
	border-radius: 999px;
	background: #e2e8f0;
	color: #64748b;
	flex-shrink: 0;
}
.st-ok {
	color: #059669;
	border: 1px solid rgba(52, 211, 153, 0.35);
}
.st-bad {
	color: #fca5a5;
	border: 1px solid rgba(248, 113, 113, 0.35);
}
.st-warn {
	color: #fde68a;
	border: 1px solid rgba(250, 204, 21, 0.35);
}
.row-desc {
	display: block;
	margin-top: 8px;
	font-size: 12px;
	color: #64748b;
	line-height: 1.5;
}
.row-metrics {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 10px;
}
.metric {
	font-size: 12px;
	color: #475569;
}
.metric-gold {
	color: #b45309;
	font-weight: 600;
}
.progress-wrap {
	margin-top: 12px;
}
.progress-bg {
	height: 6px;
	border-radius: 999px;
	background: #e2e8f0;
	overflow: hidden;
}
.progress-fill {
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, #2563eb, #3b82f6);
	max-width: 100%;
}
.progress-cap {
	display: block;
	margin-top: 6px;
	font-size: 11px;
	color: #64748b;
	text-align: right;
}
.row-foot {
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px solid #e2e8f0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.foot-i {
	font-size: 11px;
	color: #64748b;
}

.loading-tip {
	text-align: center;
	padding: 12px;
	font-size: 12px;
	color: #64748b;
}
.bottom-spacer {
	height: 16px;
}
</style>
