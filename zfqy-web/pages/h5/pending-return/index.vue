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
			<text class="nav-title">待返积分</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="inner">
				<view class="card h5-glass-panel hero">
					<text class="hero-label">当前月起待返合计</text>
					<text class="hero-val">{{ totalText }} 分</text>
					<text class="hero-sub">当前统计月：{{ currentMonth }}</text>
				</view>

				<!-- <view class="card h5-glass-panel note-card">
					<text class="note-txt">{{ ruleNote }}</text>
				</view> -->

				<view v-if="!loading && !list.length" class="empty h5-glass-panel">
					<text class="empty-txt">暂无可展示的待返分摊。绑定机具并产生合理真实流水后，将按规则在此按月汇总。</text>
				</view>

				<view v-for="row in list" :key="row.month" class="row h5-glass-panel">
					<text class="row-month">{{ row.monthLabel }}</text>
					<text class="row-amt">{{ row.points }} 分</text>
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
import { h5PendingReturnPoints } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			loading: false,
			currentMonth: '-',
			list: [],
			totalUpcoming: 0,
			ruleNote: ''
		};
	},
	computed: {
		totalText() {
			return Number(this.totalUpcoming || 0).toFixed(2);
		}
	},
	onShow() {
		this.load();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async load() {
			this.loading = true;
			try {
				const res = await h5PendingReturnPoints();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.currentMonth = d.currentMonth || '-';
				this.list = Array.isArray(d.list) ? d.list : [];
				this.totalUpcoming = Number(d.totalUpcoming || 0);
				this.ruleNote = d.ruleNote || '';
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

.scroll {
	flex: 1;
	min-height: 0;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
}
.inner {
	padding: 0 16px 24px;
}

.card {
	padding: 16px 18px;
	margin-bottom: 14px;
}

.hero-label {
	display: block;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 8px;
}
.hero-val {
	display: block;
	font-size: 26px;
	font-weight: 800;
	color: #a7f3d0;
	letter-spacing: 0.02em;
}
.hero-sub {
	display: block;
	margin-top: 10px;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.88);
}

.note-card {
	padding: 14px 16px;
}
.note-txt {
	font-size: 11px;
	color: rgba(148, 163, 184, 0.95);
	line-height: 1.55;
}

.row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 18px;
	margin-bottom: 10px;
}
.row-month {
	font-size: 15px;
	font-weight: 600;
	color: #e2e8f0;
}
.row-amt {
	font-size: 16px;
	font-weight: 700;
	color: #fde68a;
	font-variant-numeric: tabular-nums;
}

.empty {
	padding: 20px 16px;
	margin-bottom: 12px;
}
.empty-txt {
	font-size: 13px;
	color: rgba(186, 199, 216, 0.9);
	line-height: 1.55;
}

.loading-tip {
	text-align: center;
	padding: 12px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.85);
}
.bottom-spacer {
	height: 20px;
}
</style>
