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
				<text class="hero-sub">平台联合收单补贴，商家笔笔收款补贴手续费。</text>
				<view class="subsidy-ticker" v-if="tickerList.length">
					<view class="subsidy-ticker-track" :style="{ animationDuration: `${tickerDuration}s` }">
						<view v-for="(item, idx) in tickerRenderList" :key="`${item.id}_${idx}`" class="subsidy-ticker-row">
							<image :src="item.avatar || appLogo" mode="aspectFill" class="subsidy-avatar" />
							<text class="subsidy-text">{{ item.name }} 已获得补贴</text>
							<text class="subsidy-amount">¥{{ item.amount }}</text>
							<text class="subsidy-text">！</text>
						</view>
					</view>
				</view>

				<view class="mascot-stage">
					<view class="ingot-overlay">
						<text class="ingot-inner-money">¥{{ pendingTotal }}</text>
					</view>
					<view
						v-for="(row, idx) in packets"
						:key="row.id || idx"
						class="bubble"
						:class="{ 'bubble--busy': claimingId === row.id }"
						:style="bubbleStyle(idx)"
						@click.stop="claimOne(row)"
					>
						<image class="bubble-ingot-image" src="/static/h5/yuanbao.png" mode="aspectFit" />
						<view class="bubble-badge">
							<text class="bubble-amt">+{{ row.amount }}</text>
						</view>
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
	<!-- 			<view class="detail-head" @click="togglePendingExpand">
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
				<view v-else-if="pendingExpanded && !packets.length" class="detail-empty">暂无待领取记录</view> -->

				<!-- <view class="detail-divider"></view> -->

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
import { h5IncomeList, h5IncomeClaimAll, h5IncomeClaim } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			packets: [],
			detailList: [],
			pendingTotal: '0.00',
			pendingCount: 0,
			summaryPoints: '0.00',
			tickerList: [],
			appLogo: H5_APP_LOGO,
			loading: false,
			pendingExpanded: true,
			claimingId: ''
		};
	},
	computed: {
		claimDisabled() {
			return Number(this.pendingTotal) <= 0 || this.loading || !!this.claimingId;
		},
		claimBtnClass() {
			return this.claimDisabled ? 'claim-btn--disabled' : 'claim-btn--active';
		},
		claimBtnText() {
			return this.claimDisabled ? '暂无奖励' : '一键领取';
		},
		tickerRenderList() {
			return this.tickerList.length > 1 ? [...this.tickerList, ...this.tickerList] : this.tickerList;
		},
		tickerDuration() {
			return Math.max(10, this.tickerList.length * 3);
		}
	},
	onShow() {
		this.loadData();
	},
	methods: {
		bubbleStyle(idx) {
			const leftSlots = [
				{ top: 12, left: 2 },
				{ top: 28, left: 5 },
				{ top: 44, left: 1 },
				{ top: 60, left: 6 },
				{ top: 76, left: 3 },
				{ top: 20, left: 8 },
				{ top: 52, left: 2 },
				{ top: 68, left: 7 }
			];
			const rightSlots = [
				{ top: 14, right: 2 },
				{ top: 30, right: 5 },
				{ top: 46, right: 1 },
				{ top: 62, right: 6 },
				{ top: 78, right: 3 },
				{ top: 22, right: 8 },
				{ top: 54, right: 2 },
				{ top: 70, right: 7 }
			];
			const isLeft = idx % 2 === 0;
			const pairIndex = Math.floor(idx / 2);
			const slots = isLeft ? leftSlots : rightSlots;
			const s = slots[pairIndex % slots.length];
			const delay = (idx % 5) * 0.12;
			const z = Math.max(2, this.packets.length - idx + 2);
			if (isLeft) {
				return { top: `${s.top}%`, left: `${s.left}%`, animationDelay: `${delay}s`, zIndex: z };
			}
			return { top: `${s.top}%`, right: `${s.right}%`, animationDelay: `${delay}s`, zIndex: z };
		},
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
				const realTicker = (d.subsidyTicker || []).map((x, idx) => ({
					id: x.id || `ticker_${idx}`,
					name: String(x.name || '商户用户'),
					avatar: String(x.avatar || ''),
					amount: Number(x.amount || 0).toFixed(2)
				}));
				// 临时置顶一条测试播报，便于确认滚动样式效果。
				this.tickerList = [
					{ id: 'ticker_demo', name: '测试商户', avatar: '', amount: '200.00' },
					...realTicker
				];
				const su = d.summary || {};
				this.summaryPoints = su.accountPoints != null ? String(su.accountPoints) : '0.00';
			} finally {
				this.loading = false;
			}
		},
		async claimOne(row) {
			const id = row && row.id;
			if (!id || this.claimingId || this.loading) return;
			this.claimingId = id;
			uni.showLoading({ title: '领取中...', mask: true });
			try {
				const res = await h5IncomeClaim(id);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '领取失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '领取成功', icon: 'success' });
				await this.loadData();
			} finally {
				this.claimingId = '';
				uni.hideLoading();
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
	padding: 20rpx 0rpx 44rpx 0rpx;
	overflow: hidden;
	margin-bottom: 28rpx;
	background-color: #7f1d1d;
	background-image: url('/static/h5/income-mascot-cat.png');
	background-position: center;
	background-repeat: no-repeat;
	background-size: 100% 100%;
}

.hero-top {
	padding: 0rpx 20rpx 0rpx 20rpx;
	position: relative;
	z-index: 1;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 12rpx;
}

.pill {
	display: flex;
	align-items: center;
	gap: 8rpx;
	padding: 12rpx 20rpx;
	border-radius: 999rpx;
	font-size: 22rpx;
	max-width: 52%;
}
.pill-gold {
	background: rgba(15, 23, 42, 0.35);
	color: #fde68a;
	border: 2rpx solid rgba(250, 204, 21, 0.35);
}
.pill-service {
	background: rgba(15, 23, 42, 0.35);
	color: #e2e8f0;
	border: 2rpx solid rgba(255, 255, 255, 0.16);
}
.pill-icon { font-size: 24rpx; line-height: 1; }
.pill-txt { flex: 1; line-height: 1.3; }

.hero-title {
	position: relative;
	z-index: 1;
	display: block;
	text-align: center;
	margin: 8rpx auto 0;
	padding: 10rpx 20rpx 8rpx;
	width: fit-content;
	max-width: 92%;
	font-size: 40rpx;
	font-weight: 900;
	color: #ffffff;
	letter-spacing: 1px;
	border-radius: 12rpx;
	background: rgba(127, 29, 29, 0.42);
	text-shadow: 0 3px 16px rgba(0, 0, 0, 0.3), 0 1px 1px rgba(127, 29, 29, 0.6);
}

.hero-sub {
	position: relative;
	z-index: 1;
	display: block;
	text-align: center;
	margin: 10rpx auto 0;
	padding: 8rpx 20rpx;
	width: fit-content;
	max-width: 92%;
	font-size: 22rpx;
	font-weight: 600;
	line-height: 1.5;
	color: rgba(255, 247, 237, 0.98);
	border-radius: 12rpx;
	background: rgba(127, 29, 29, 0.35);
	text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.subsidy-ticker {
	position: relative;
	z-index: 1;
	margin: 12rpx auto 0;
	width: 100%;
	height: 58rpx;
	border-radius: 999px;
	/* background: rgba(15, 23, 42, 0.24); */
	/* border: 2rpx solid rgba(255, 255, 255, 0.28); */
	/* backdrop-filter: blur(6px); */
	-webkit-backdrop-filter: blur(6px);
	overflow: hidden;
}

.subsidy-ticker-track {
	display: inline-flex;
	align-items: center;
	height: 58rpx;
	white-space: nowrap;
	will-change: transform;
	animation-name: ticker-marquee-left;
	animation-timing-function: linear;
	animation-iteration-count: infinite;
}

.subsidy-ticker-row {
	height: 58rpx;
	padding: 0 28rpx 0 18rpx;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 8rpx;
	flex: 0 0 auto;
}

.subsidy-avatar {
	width: 34rpx;
	height: 34rpx;
	border-radius: 50%;
	border: 2rpx solid rgba(255, 255, 255, 0.6);
	background: rgba(255, 255, 255, 0.0);
	flex-shrink: 0;
}

.subsidy-text {
	font-size: 23rpx;
	line-height: 1;
	color: #ffffff;
	font-weight: 500;
}

.subsidy-amount {
	font-size: 26rpx;
	line-height: 1;
	font-weight: 800;
	color: #facc15;
	text-shadow: 0 1px 6px rgba(250, 204, 21, 0.35);
}

@keyframes ticker-marquee-left {
	0% { transform: translateX(100%); }
	100% { transform: translateX(-100%); }
}

/* 仅叠气泡与金额；招财猫由整张 .hero 背景承担，避免重复一张小图 */
.mascot-stage {
	padding: 0rpx 20rpx 0rpx 20rpx;
	position: relative;
	z-index: 1;
	margin-top: 36rpx;
	min-height: 600rpx;
	border-radius: 32rpx;
	overflow: visible;
	background: transparent;
}

/* 背景图已含「待领取奖励」文案，此处只叠金额，用 top + margin 压在字样下方 */
.ingot-overlay {
	position: absolute;
	left: 50%;
	top: 360rpx;
	bottom: auto;
	width: 56%;
	max-width: 440rpx;
	transform: translateX(-50%);
	text-align: center;
	pointer-events: none;
	z-index: 2;
}
.ingot-inner-money {
	display: block;
	margin-top: 26px;
	font-size: 20px;
	font-weight: 800;
	color: #b91c1c;
	line-height: 1.15;
	text-shadow: 0 1px 2px rgba(255, 255, 255, 0.45);
}

.bubble {
	position: absolute;
	z-index: 4;
	width: 74px;
	height: 84px;
	padding: 0;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	justify-content: center;
	transform: translateY(-50%);
	animation: bubble-float-y 2.6s ease-in-out infinite;
}

.bubble-ingot-image {
	width: 56px;
	height: 42px;
	display: block;
}

.bubble-badge {
	position: absolute;
	left: 50%;
	bottom: 4px;
	transform: translateX(-50%);
	min-width: 52px;
	height: 24px;
	padding: 0 12px;
	border-radius: 999px;
	background: linear-gradient(180deg, #fb7185 0%, #ef4444 72%, #dc2626 100%);
	box-shadow: 0 2px 8px rgba(185, 28, 28, 0.3);
	display: flex;
	align-items: center;
	justify-content: center;
}

.bubble--busy {
	opacity: 0.55;
	pointer-events: none;
}
.bubble-amt {
	font-size: 15px;
	font-weight: 800;
	color: #fff7ed;
	line-height: 1;
	white-space: nowrap;
	text-shadow: 0 1px 2px rgba(127, 29, 29, 0.35);
}

@keyframes bubble-float-y {
	0%,
	100% {
		margin-top: 0;
	}
	50% {
		margin-top: -5px;
	}
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
