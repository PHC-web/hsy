<template>
	<view class="page-income">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>
		<!-- 可滚动主区域：高度 = 视口 − 底部 tabbar（含安全区），超出时出现滚动条 -->
		<scroll-view class="page-income__scroll" scroll-y :scroll-with-animation="true">
			<view class="page-income__scroll-inner">
			<view class="hero h5-glass-panel">
				<view class="hero-top">
					<view class="pill pill-gold">
						<text class="pill-icon">◎</text>
						<text class="pill-txt">累计奖励：{{ summaryPoints }}分</text>
					</view>
					<view class="pill pill-service" @click="contactService">
						<text class="pill-icon">💬</text>
						<text class="pill-txt">联系客服</text>
					</view>
				</view>

				<text class="hero-title">商家收款免手续费</text>
				<text class="hero-sub">平台联合收单补贴，商家笔笔收款补贴手续费</text>

				<view class="mascot-row">
					<view class="mascot">
						<view class="cat-face"></view>
						<view class="cat-ear l"></view>
						<view class="cat-ear r"></view>
						<view class="cat-body"></view>
					</view>
					<view class="ingot">
						<text class="ingot-inner-label">待领取奖励</text>
						<text class="ingot-inner-money">¥{{ pendingTotal }}</text>
					</view>
				</view>

				<button
					class="claim-btn"
					:class="claimBtnClass"
					:disabled="claimDisabled"
					@click="claimAll"
				>
					{{ claimBtnText }}
				</button>
			</view>

			<view class="detail-card h5-glass-panel">
				<view class="detail-head" @click="togglePendingExpand">
					<text class="detail-title">待领取明细</text>
					<text class="detail-meta" v-if="pendingCount > 0">{{ pendingCount }} 笔</text>
					<text class="detail-arrow">{{ pendingExpanded ? '▼' : '▶' }}</text>
				</view>
				<view v-if="pendingExpanded && packets.length" class="detail-list">
					<view v-for="(row, idx) in packets" :key="row.id || idx" class="detail-row">
						<view class="row-left">
							<text class="row-title">{{ row.title }}</text>
							<text class="row-time">{{ row.createTime || '-' }}</text>
						</view>
						<view class="row-right">
							<text class="coin">🪙</text>
							<text class="row-amt plus">+{{ row.amount }}</text>
						</view>
					</view>
				</view>
				<view v-else-if="pendingExpanded && !packets.length" class="detail-empty">暂无待领取记录</view>

				<view class="detail-divider"></view>

				<view class="detail-head detail-head-2">
					<text class="detail-title">奖励明细</text>
					<text class="detail-hint">已入账</text>
				</view>
				<view v-if="detailList.length" class="detail-list">
					<view v-for="(row, idx) in detailList" :key="row.id || idx" class="detail-row">
						<view class="row-left">
							<text class="row-title">{{ row.title }}</text>
							<text class="row-time">{{ row.timeText || '-' }}</text>
						</view>
						<view class="row-right">
							<text class="coin">🪙</text>
							<text class="row-amt plus">+{{ row.amount }}</text>
						</view>
					</view>
				</view>
				<view v-else class="detail-empty">暂无已入账记录，领取后在此查看</view>
			</view>

			<!-- 底部留白，避免最后一行贴边（tabbar 已固定，此处仅作视觉呼吸） -->
			<view class="scroll-end-spacer"></view>
			</view>
		</scroll-view>

		<view class="page-income__tabbar h5-glass-tabbar">
			<view class="tabbar-inner">
				<view class="tab" @click="goHome">首页</view>
				<view class="tab active">收益</view>
				<view class="tab" @click="goMine">我的</view>
			</view>
		</view>
	</view>
</template>

<script>
import { h5IncomeList, h5IncomeClaimAll } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			packets: [],
			detailList: [],
			pendingTotal: '0.00',
			pendingCount: 0,
			summaryPoints: '0.00',
			loading: false,
			pendingExpanded: true
		};
	},
	computed: {
		claimDisabled() {
			return Number(this.pendingTotal) <= 0 || this.loading;
		},
		claimBtnClass() {
			return this.claimDisabled ? 'claim-btn--disabled' : 'claim-btn--active';
		},
		claimBtnText() {
			return this.claimDisabled ? '暂无奖励' : '一键领取';
		}
	},
	onShow() {
		this.loadData();
	},
	methods: {
		togglePendingExpand() {
			this.pendingExpanded = !this.pendingExpanded;
		},
		contactService() {
			uni.showModal({
				title: '联系客服',
				content: '如有疑问请联系业务员或平台客服；后续可在后台配置客服电话或企业微信。',
				showCancel: false
			});
		},
		async loadData() {
			this.loading = true;
			try {
				const res = await h5IncomeList();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.packets = d.packets || [];
				this.detailList = d.detailList || [];
				this.pendingTotal = d.pendingTotal != null ? String(d.pendingTotal) : '0.00';
				this.pendingCount = Number(d.pendingCount || 0);
				const su = d.summary || {};
				this.summaryPoints = su.accountPoints != null ? String(su.accountPoints) : '0.00';
			} finally {
				this.loading = false;
			}
		},
		async claimAll() {
			if (this.claimDisabled) return;
			uni.showLoading({ title: '领取中...', mask: true });
			try {
				const res = await h5IncomeClaimAll();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '领取失败', icon: 'none' });
					return;
				}
				const n = res.data && res.data.claimedCount != null ? res.data.claimedCount : 0;
				uni.showToast({ title: n ? `已领取 ${n} 笔` : '暂无待领取', icon: 'success' });
				await this.loadData();
			} finally {
				uni.hideLoading();
			}
		},
		goHome() {
			uni.redirectTo({ url: '/pages/h5/home/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
/* 整页：锁高度，避免外层再滚；内容只在 scroll-view 内滚 */
.page-income {
	width: 100%;
	height: 100vh;
	max-height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
}

/* 与底部 tabbar 占位一致：56px + 安全区 */
.page-income__scroll {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: calc(56px + constant(safe-area-inset-bottom));
	bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
	z-index: 1;
}

.page-income__scroll-inner {
	min-height: 100%;
	box-sizing: border-box;
	padding: 12px 16px 0;
	position: relative;
	z-index: 1;
}

/* 固定在视口底部，不随内容滚动 */
.page-income__tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 300;
	padding-bottom: constant(safe-area-inset-bottom);
	padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tabbar-inner {
	display: flex;
	align-items: flex-start;
	height: calc(56px + env(safe-area-inset-bottom, 0px));
	padding-bottom: env(safe-area-inset-bottom, 0px);
	box-sizing: border-box;
}

.scroll-end-spacer {
	height: 12px;
}

.hero {
	position: relative;
	padding: 16px 16px 22px;
	overflow: hidden;
	margin-bottom: 14px;
}

.hero-top {
	position: relative;
	z-index: 1;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 16px;
}

.pill {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 10px;
	border-radius: 999px;
	font-size: 11px;
	max-width: 52%;
}
.pill-gold {
	background: rgba(15, 23, 42, 0.35);
	color: #fde68a;
	border: 1px solid rgba(250, 204, 21, 0.35);
}
.pill-service {
	background: rgba(255, 255, 255, 0.08);
	color: #e2e8f0;
	border: 1px solid rgba(255, 255, 255, 0.16);
}
.pill-icon { font-size: 12px; line-height: 1; }
.pill-txt { flex: 1; line-height: 1.3; }

.hero-title {
	position: relative;
	z-index: 1;
	display: block;
	text-align: center;
	font-size: 22px;
	font-weight: 800;
	color: #f8fafc;
	letter-spacing: 0.5px;
	text-shadow: 0 2px 20px rgba(0, 0, 0, 0.35);
}

.hero-sub {
	position: relative;
	z-index: 1;
	display: block;
	text-align: center;
	margin-top: 8px;
	padding: 0 12px;
	font-size: 12px;
	line-height: 1.55;
	color: rgba(203, 213, 225, 0.92);
}

.mascot-row {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	gap: 0;
	margin-top: 20px;
	min-height: 140px;
}

.mascot {
	position: relative;
	width: 100px;
	height: 120px;
	flex-shrink: 0;
}
.cat-face {
	position: absolute;
	left: 50%;
	top: 8px;
	transform: translateX(-50%);
	width: 72px;
	height: 64px;
	border-radius: 50%;
	background: linear-gradient(160deg, #fde68a, #f59e0b 55%, #d97706);
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}
.cat-ear {
	position: absolute;
	top: 0;
	width: 22px;
	height: 22px;
	border-radius: 6px;
	background: linear-gradient(180deg, #fbbf24, #b45309);
	transform: rotate(-25deg);
}
.cat-ear.l { left: 8px; }
.cat-ear.r { right: 8px; transform: rotate(25deg); }
.cat-body {
	position: absolute;
	left: 50%;
	bottom: 0;
	transform: translateX(-50%);
	width: 88px;
	height: 56px;
	border-radius: 50% 50% 40% 40%;
	background: linear-gradient(180deg, #fcd34d, #ea580c);
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
}

.ingot {
	width: 132px;
	height: 96px;
	margin-left: -12px;
	margin-bottom: 8px;
	border-radius: 12px 12px 20px 20px;
	background: linear-gradient(145deg, #fef08a 0%, #facc15 35%, #ca8a04 100%);
	box-shadow:
		inset 0 2px 6px rgba(255, 255, 255, 0.65),
		0 10px 24px rgba(0, 0, 0, 0.35);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border: 2px solid rgba(234, 179, 8, 0.85);
}
.ingot-inner-label {
	font-size: 11px;
	color: #78350f;
	font-weight: 600;
}
.ingot-inner-money {
	font-size: 22px;
	font-weight: 800;
	color: #451a03;
	margin-top: 4px;
}

.claim-btn {
	position: relative;
	z-index: 1;
	margin: 20px auto 0;
	width: 86%;
	height: 48px;
	line-height: 48px;
	border-radius: 999px;
	font-size: 17px;
	font-weight: 700;
	border: none;
}
.claim-btn--active {
	background: linear-gradient(180deg, #fde047, #eab308);
	color: #451a03;
	box-shadow: 0 6px 0 #a16207, 0 10px 28px rgba(0, 0, 0, 0.35);
}
.claim-btn--disabled {
	background: rgba(255, 255, 255, 0.1);
	color: rgba(226, 232, 240, 0.65);
	box-shadow: none;
}

.detail-card {
	position: relative;
	margin-top: 0;
	padding: 18px 16px 24px;
	min-height: 200px;
}

.detail-head {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
}
.detail-head-2 {
	margin-top: 4px;
}
.detail-title {
	font-size: 16px;
	font-weight: 700;
	color: #f1f5f9;
	flex: 1;
}
.detail-meta {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}
.detail-hint {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}
.detail-arrow {
	font-size: 12px;
	color: #fcd34d;
	width: 20px;
	text-align: right;
}

.detail-divider {
	height: 1px;
	background: rgba(255, 255, 255, 0.08);
	margin: 12px 0 16px;
}

.detail-list {
	margin-top: 8px;
}

.detail-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 14px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.detail-row:last-child {
	border-bottom: none;
}

.row-left {
	flex: 1;
	min-width: 0;
}
.row-title {
	display: block;
	font-size: 15px;
	color: #e2e8f0;
	font-weight: 600;
}
.row-time {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}

.row-right {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
}
.coin {
	font-size: 14px;
}
.row-amt {
	font-size: 17px;
	font-weight: 700;
	color: #fde68a;
}
.row-amt.plus {
	color: #fde68a;
}

.detail-empty {
	padding: 16px 0;
	text-align: center;
	font-size: 13px;
	color: rgba(148, 163, 184, 0.9);
}

.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	font-size: 14px;
}
</style>
