<template>
	<view class="page-income">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>
		<!-- 可滚动主区域：高度 = 视口 − 底部 tabbar（含安全区），超出时出现滚动条 -->
		<scroll-view
			class="page-income__scroll"
			scroll-y
			:show-scrollbar="true"
			:scroll-with-animation="false"
			:lower-threshold="120"
			:style="scrollViewStyle"
			@scrolltolower="loadMoreDetails"
		>
			<view class="page-income__scroll-inner">
			<view class="hero">
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
				<view class="subsidy-ticker subsidy-ticker--double" v-if="tickerList.length">
					<view class="subsidy-ticker-line">
						<view class="subsidy-ticker-track" :style="{ animationDuration: `${tickerDuration}s` }">
							<view v-for="(item, idx) in tickerRenderTop" :key="`t_${item.id}_${idx}`" class="subsidy-ticker-row">
								<image :src="item.avatar || appLogo" mode="aspectFill" class="subsidy-avatar" />
								<text class="subsidy-text">{{ item.name }} 已获得补贴</text>
								<text class="subsidy-amount">¥{{ item.amount }}</text>
								<text class="subsidy-text">！</text>
							</view>
						</view>
					</view>
					<view class="subsidy-ticker-line">
						<view class="subsidy-ticker-track subsidy-ticker-track--delay" :style="{ animationDuration: `${tickerDuration}s` }">
							<view v-for="(item, idx) in tickerRenderBottom" :key="`b_${item.id}_${idx}`" class="subsidy-ticker-row">
								<image :src="item.avatar || appLogo" mode="aspectFill" class="subsidy-avatar" />
								<text class="subsidy-text">{{ item.name }} 已获得补贴</text>
								<text class="subsidy-amount">¥{{ item.amount }}</text>
								<text class="subsidy-text">！</text>
							</view>
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
					<view v-for="row in detailList" :key="row.id" class="detail-row">
						<view class="row-left">
							<text class="row-title">{{ row.title }}</text>
							<text class="row-time">{{ row.timeText || '-' }}</text>
						</view>
						<view class="row-right">
							<text class="coin">🪙</text>
							<text class="row-amt plus">+{{ row.amount }}</text>
						</view>
					</view>
					<view class="detail-footer">
						<text v-if="detailLoadingMore" class="detail-footer-txt">加载中...</text>
						<text v-else-if="!detailHasMore" class="detail-footer-txt">没有更多了</text>
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
import { h5IncomeList, h5IncomeClaimedList, h5IncomeClaimAll, h5IncomeClaim, h5RefreshHomeCache } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			packets: [],
			detailList: [],
			detailPage: 1,
			detailHasMore: false,
			detailLoadingMore: false,
			pendingTotal: '0.00',
			pendingCount: 0,
			summaryPoints: '0.00',
			tickerList: [],
			appLogo: H5_APP_LOGO,
			loading: false,
			pendingExpanded: true,
			claimingId: '',
			servicePhone: '400-668-5796',
			scrollHeightPx: 0
		};
	},
	computed: {
		scrollViewStyle() {
			if (this.scrollHeightPx > 0) {
				return { height: `${this.scrollHeightPx}px` };
			}
			return {};
		},
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
			return this.tickerList.length ? [...this.tickerList, ...this.tickerList] : [];
		},
		tickerRenderTop() {
			return this.tickerRenderList.filter((_, idx) => idx % 2 === 0);
		},
		tickerRenderBottom() {
			return this.tickerRenderList.filter((_, idx) => idx % 2 === 1);
		},
		tickerDuration() {
			return Math.max(6, this.tickerList.length * 1.6);
		}
	},
	onShow() {
		this.syncScrollHeight();
		this.loadData();
	},
	onReady() {
		this.syncScrollHeight();
	},
	onUnload() {
		this.unbindScrollHeight();
	},
	methods: {
		syncScrollHeight() {
			try {
				const sys = uni.getSystemInfoSync() || {};
				const safeBottom = Number((sys.safeAreaInsets && sys.safeAreaInsets.bottom) || 0);
				const winH = Number(sys.windowHeight || 0);
				const tabH = 56 + safeBottom;
				if (winH > tabH + 80) {
					this.scrollHeightPx = winH - tabH;
				}
			} catch (e) {}
			// #ifdef H5
			if (typeof window !== 'undefined' && !this._onWinResize) {
				this._onWinResize = () => this.syncScrollHeight();
				window.addEventListener('resize', this._onWinResize, { passive: true });
			}
			// #endif
		},
		unbindScrollHeight() {
			// #ifdef H5
			if (typeof window !== 'undefined' && this._onWinResize) {
				window.removeEventListener('resize', this._onWinResize);
				this._onWinResize = null;
			}
			// #endif
		},
		/** 待领取总额 = 各气泡展示金额之和（避免单笔 toFixed 与合计不一致） */
		syncPendingTotalFromPackets() {
			const sum = (this.packets || []).reduce((s, p) => s + Number(p.amount || 0), 0);
			this.pendingTotal = (Math.round(sum * 100) / 100).toFixed(2);
		},
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
			uni.makePhoneCall({
				phoneNumber: String(this.servicePhone || '').trim(),
				fail: () => {
					uni.showToast({ title: '拨号失败，请稍后重试', icon: 'none' });
				}
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
				this.detailPage = 1;
				this.detailHasMore = !!d.detailHasMore;
				this.syncPendingTotalFromPackets();
				this.pendingCount = Number(d.pendingCount || 0);
				const realTicker = (d.subsidyTicker || []).map((x, idx) => ({
					id: x.id || `ticker_${idx}`,
					name: String(x.name || '商户用户'),
					avatar: String(x.avatar || ''),
					amount: Number(x.amount || 0).toFixed(2)
				}));
				this.tickerList = realTicker.slice(0, 20);
				this.servicePhone = String(d.servicePhone || '400-668-5796').trim() || '400-668-5796';
				const su = d.summary || {};
				this.summaryPoints = su.accountPoints != null ? String(su.accountPoints) : '0.00';
			} finally {
				this.loading = false;
			}
		},
		appendDetailRows(rows) {
			const incoming = Array.isArray(rows) ? rows : [];
			if (!incoming.length) return;
			const seen = new Set((this.detailList || []).map((x) => String(x.id || '')));
			const extra = incoming.filter((x) => x && x.id && !seen.has(String(x.id)));
			if (extra.length) this.detailList = this.detailList.concat(extra);
		},
		async loadMoreDetails() {
			if (!this.detailHasMore || this.detailLoadingMore || this.loading) return;
			const nextPage = this.detailPage + 1;
			this.detailLoadingMore = true;
			try {
				const res = await h5IncomeClaimedList({ page: nextPage, pageSize: 50 });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.appendDetailRows(d.detailList || []);
				this.detailPage = Number(d.detailPage) || nextPage;
				this.detailHasMore = !!d.detailHasMore;
			} finally {
				this.detailLoadingMore = false;
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
				await h5RefreshHomeCache();
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
				await h5RefreshHomeCache();
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
/* 整页锁高；滚动只发生在下方 scroll-view，避免微信 webview 裁切后无法下滑 */
.page-income {
	width: 100%;
	height: 100vh;
	height: 100dvh;
	max-height: 100vh;
	max-height: 100dvh;
	display: flex;
	flex-direction: column;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
}

.page-income__scroll {
	flex: 1 1 auto;
	width: 100%;
	height: 0;
	min-height: 0;
	box-sizing: border-box;
	z-index: 1;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
}

/* uni-app H5 会包一层 .uni-scroll-view，必须把高度和 overflow 传到内层才能滚 */
.page-income__scroll ::v-deep .uni-scroll-view,
.page-income__scroll ::v-deep .uni-scroll-view-content {
	height: 100%;
	max-height: 100%;
}
.page-income__scroll ::v-deep .uni-scroll-view {
	overflow-y: auto !important;
	-webkit-overflow-scrolling: touch;
}

.page-income__scroll-inner {
	min-height: 100%;
	box-sizing: border-box;
	padding: 12px 16px 0;
	position: relative;
	z-index: 1;
}

.page-income__tabbar {
	flex-shrink: 0;
	position: relative;
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
	height: 28px;
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
	background: rgba(255, 251, 235, 0.96);
	color: #92400e;
	border: 2rpx solid rgba(217, 119, 6, 0.5);
}
.pill-gold .pill-icon,
.pill-gold .pill-txt {
	color: #92400e;
	font-weight: 700;
}
.pill-service {
	background: #f1f5f9;
	color: #334155;
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
	height: 126rpx;
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
.subsidy-ticker-track--delay {
	animation-delay: -2s;
}
.subsidy-ticker-line {
	height: 58rpx;
	overflow: hidden;
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
	0% { transform: translateX(0); }
	100% { transform: translateX(-50%); }
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
	color: #475569;
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
	color: #0f172a;
	flex: 1;
}
.detail-meta {
	font-size: 12px;
	color: #64748b;
}
.detail-hint {
	font-size: 12px;
	color: #64748b;
}
.detail-arrow {
	font-size: 12px;
	color: #d97706;
	width: 20px;
	text-align: right;
}

.detail-divider {
	height: 1px;
	background: #e2e8f0;
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
	border-bottom: 1px solid #e2e8f0;
}

.detail-footer {
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.detail-footer-txt {
	font-size: 12px;
	color: #94a3b8;
	line-height: 48px;
}

.row-left {
	flex: 1;
	min-width: 0;
}
.row-title {
	display: block;
	font-size: 15px;
	color: #334155;
	font-weight: 600;
}
.row-time {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #64748b;
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
	color: #059669;
}
.row-amt.plus {
	color: #047857;
}

.detail-empty {
	padding: 16px 0;
	text-align: center;
	font-size: 13px;
	color: #64748b;
}

.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	font-size: 14px;
}
</style>
