<template>
	<view class="page">
		<view class="page-bg" aria-hidden="true">
			<view class="orb orb-a"></view>
			<view class="orb orb-b"></view>
			<view class="orb orb-c"></view>
			<view class="mesh"></view>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="scroll-inner">
				<view class="top-row">
					<text class="page-title">商户中心</text>
				</view>

				<!-- 会员与头像 -->
				<view class="glass hero-card" :class="'tier-' + (membership.tier || 'normal')">
					<view class="hero-shine" aria-hidden="true"></view>
					<view class="hero-row">
						<image class="avatar" :src="avatarUrl" mode="aspectFill" />
						<view class="hero-text">
							<text class="nick">{{ mine.wxNickname || '微信用户' }}</text>
							<text class="mobile">{{ mine.mobile || '手机号未绑定' }}</text>
							<view class="badge-row">
								<view class="member-badge" :style="{ borderColor: (membership.accent || '#94a3b8') + '66', boxShadow: '0 0 20px ' + (membership.accent || '#94a3b8') + '22' }">
									<text class="member-badge-dot" :style="{ color: membership.accent || '#94a3b8' }">●</text>
									<text class="member-badge-txt">{{ membership.name || '普通会员' }}</text>
								</view>
							</view>
						</view>
					</view>
					<view class="hero-foot">
						<text class="hero-foot-txt">{{ mine.brandName || '-' }} · {{ mine.deviceId || '未绑定机具' }}</text>
					</view>
				</view>

				<!-- 提现统计 -->
				<view class="section-label">
					<text class="section-title">提现累积</text>
					<text class="section-sub">已到账金额（北京时间自然日/月/年）</text>
				</view>
				<view class="glass stat-grid">
					<view class="stat-cell">
						<text class="stat-label">今日</text>
						<text class="stat-value">¥{{ withdraw.today }}</text>
					</view>
					<view class="stat-div"></view>
					<view class="stat-cell">
						<text class="stat-label">本月</text>
						<text class="stat-value">¥{{ withdraw.month }}</text>
					</view>
					<view class="stat-div"></view>
					<view class="stat-cell">
						<text class="stat-label">本年</text>
						<text class="stat-value">¥{{ withdraw.year }}</text>
					</view>
				</view>

				<!-- 待提现 + 剩余额度 -->
				<view class="glass duo-row">
					<view class="duo-block">
						<text class="duo-label">待提现金额</text>
						<text class="duo-value accent-gold">¥{{ pendingWithdraw }}</text>
					</view>
					<view class="duo-v"></view>
					<view class="duo-block">
						<text class="duo-label">剩余提现额度</text>
						<text class="duo-value accent-mint">¥{{ quota.remaining }}</text>
						<text v-if="quota.totalGrantedYuan > 0" class="duo-hint">
							总额度 ¥{{ quotaTotalStr }} · 已用 ¥{{ quota.usedYuan }}
						</text>
					</view>
				</view>

				<view v-if="quota.totalGrantedYuan > 0" class="glass quota-bar-wrap">
					<view class="quota-bar-bg">
						<view class="quota-bar-fill" :style="{ width: quotaBarPercent + '%' }"></view>
					</view>
					<text class="quota-bar-cap">剩余 {{ quotaBarPercent }}%</text>
				</view>

				<!-- 退款窗口倒计时（未充值时右侧为「额度充值」入口） -->
				<view class="glass countdown-card">
					<view class="cd-head">
						<text class="cd-title">退款窗口倒计时</text>
						<view
							v-if="countdown.phase === 'none'"
							class="cd-badge cd-badge--action"
							@click="goRecharge"
						>
							<text class="cd-badge-action-txt">额度充值</text>
							<text class="cd-badge-action-arrow">›</text>
						</view>
						<text v-else class="cd-badge">{{ countdownPhaseLabel }}</text>
					</view>
					<text class="cd-desc">{{ countdownDesc }}</text>
					<view v-if="countdownDigits" class="cd-digits">
						<view v-for="(p, i) in countdownDigits" :key="i" class="cd-seg">
							<text class="cd-num">{{ p.num }}</text>
							<text class="cd-unit">{{ p.unit }}</text>
						</view>
					</view>
					<text v-else class="cd-idle">{{ countdownIdleText }}</text>
				</view>

				<view v-if="loading" class="loading-hint">
					<text>加载中…</text>
				</view>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>

		<view class="tabbar safe-bottom">
			<view class="tab active">首页</view>
			<view class="tab" @click="goIncome">收益</view>
			<view class="tab" @click="goMine">我的</view>
		</view>
	</view>
</template>

<script>
import { h5HomeDashboard, h5MineInfo } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			loading: false,
			serverSkew: 0,
			mine: {},
			membership: { tier: 'normal', name: '普通会员', accent: '#94a3b8' },
			withdraw: { today: '0.00', month: '0.00', year: '0.00' },
			pendingWithdraw: '0.00',
			quota: { remaining: '0.00', totalGrantedYuan: 0, usedYuan: '0.00' },
			countdown: {
				phase: 'none',
				days180Left: 0,
				refundDaysLeft: 0,
				windowStartMs: 0,
				windowEndMs: 0,
				cycleAnchorStartMs: 0
			},
			tick: 0,
			tickTimer: null,
			defaultAvatar: H5_APP_LOGO
		};
	},
	computed: {
		avatarUrl() {
			const u = String(this.mine.wxAvatar || '').trim();
			return u || this.defaultAvatar;
		},
		quotaTotalStr() {
			const n = Number(this.quota.totalGrantedYuan || 0);
			return Number.isInteger(n) ? String(n) : n.toFixed(2);
		},
		quotaBarPercent() {
			const total = Number(this.quota.totalGrantedYuan || 0);
			const rem = parseFloat(String(this.quota.remaining || '0'));
			if (total <= 0) return 0;
			const p = Math.round((rem / total) * 1000) / 10;
			return Math.min(100, Math.max(0, p));
		},
		effectiveNow() {
			void this.tick;
			return Date.now() + (this.serverSkew || 0);
		},
		countdownTargetMs() {
			const c = this.countdown;
			if (!c) return 0;
			if (c.phase === 'lock') return Number(c.windowStartMs || 0);
			if (c.phase === 'window') return Number(c.windowEndMs || 0);
			return 0;
		},
		countdownRemainingMs() {
			const end = this.countdownTargetMs;
			if (!end || this.countdown.phase === 'none') return 0;
			return Math.max(0, end - this.effectiveNow);
		},
		countdownDigits() {
			const ms = this.countdownRemainingMs;
			if (!ms || this.countdown.phase === 'none') return null;
			const sec = Math.floor(ms / 1000);
			const d = Math.floor(sec / 86400);
			const h = Math.floor((sec % 86400) / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = sec % 60;
			const parts = [];
			if (d > 0) parts.push({ num: String(d), unit: '天' });
			parts.push({ num: String(h).padStart(2, '0'), unit: '时' });
			parts.push({ num: String(m).padStart(2, '0'), unit: '分' });
			parts.push({ num: String(s).padStart(2, '0'), unit: '秒' });
			return parts;
		},
		countdownPhaseLabel() {
			const p = this.countdown.phase;
			if (p === 'window') return '开放窗口';
			if (p === 'lock') return '锁定周期';
			return '未开始';
		},
		countdownDesc() {
			const p = this.countdown.phase;
			if (p === 'window') {
				return '当前处于权益处理开放窗口（含退款申请等），距窗口结束还剩：';
			}
			if (p === 'lock') {
				return '下一开放窗口开始前为锁定周期，倒计时结束后可进入 3 天处理窗口：';
			}
			return '您尚未充值';
		},
		countdownIdleText() {
			if (this.countdown.phase === 'none') return '';
			if (this.countdownRemainingMs <= 0) return '正在刷新…';
			return '';
		}
	},
	onShow() {
		this.load();
		if (!this.tickTimer) {
			this.tickTimer = setInterval(() => {
				this.tick += 1;
			}, 1000);
		}
	},
	onUnload() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	},
	onHide() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	},
	methods: {
		async load() {
			this.loading = true;
			try {
				const res = await h5HomeDashboard();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				if (typeof d.serverTime === 'number') {
					this.serverSkew = d.serverTime - Date.now();
				}
				this.mine = d.merchant || {};
				this.membership = d.membership || this.membership;
				this.withdraw = d.withdraw || this.withdraw;
				this.pendingWithdraw = d.pendingWithdraw || '0.00';
				this.quota = Object.assign({}, this.quota, d.quota || {});
				this.countdown = Object.assign({}, this.countdown, d.countdown || {});
			} finally {
				this.loading = false;
			}
		},
		goIncome() {
			uni.redirectTo({ url: '/pages/h5/income/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		},
		async goRecharge() {
			const mine = await h5MineInfo();
			if (mine.code !== 0) {
				uni.showToast({ title: mine.message || '获取用户信息失败', icon: 'none' });
				return;
			}
			const m = mine.data && mine.data.merchant;
			if (!m || !String(m.agreementImg || '').trim()) {
				uni.showToast({ title: '请先在「我的」中签署优惠活动计划书', icon: 'none' });
				uni.navigateTo({ url: '/pages/h5/mine/index' });
				return;
			}
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		}
	}
};
</script>

<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	overflow: hidden;
}

.page-bg {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 0;
	background: linear-gradient(160deg, #070b14 0%, #121829 38%, #0b1020 70%, #15102a 100%);
}

.mesh {
	position: absolute;
	inset: 0;
	opacity: 0.35;
	background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
	background-size: 14px 14px;
	pointer-events: none;
}

.orb {
	position: absolute;
	border-radius: 50%;
	filter: blur(72px);
	pointer-events: none;
}
.orb-a {
	width: 220px;
	height: 220px;
	top: -40px;
	right: -30px;
	background: rgba(99, 102, 241, 0.45);
}
.orb-b {
	width: 280px;
	height: 280px;
	top: 28%;
	left: -80px;
	background: rgba(56, 189, 248, 0.28);
}
.orb-c {
	width: 200px;
	height: 200px;
	bottom: 18%;
	right: -40px;
	background: rgba(244, 114, 182, 0.22);
}

.scroll {
	position: relative;
	z-index: 1;
	height: calc(100vh - 56px - env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
}
.scroll-inner {
	padding: 12px 16px 8px;
}

.top-row {
	margin-bottom: 14px;
}
.page-title {
	font-size: 22px;
	font-weight: 700;
	color: rgba(248, 250, 252, 0.96);
	letter-spacing: 0.02em;
}

.glass {
	position: relative;
	background: rgba(255, 255, 255, 0.07);
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 22px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(22px);
	-webkit-backdrop-filter: blur(22px);
	overflow: hidden;
}

.hero-card {
	padding: 18px 18px 14px;
	margin-bottom: 16px;
}
.hero-card.tier-diamond {
	border-color: rgba(125, 211, 252, 0.35);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(56, 189, 248, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.hero-card.tier-platinum {
	border-color: rgba(216, 180, 254, 0.35);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(192, 132, 252, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.hero-card.tier-white_gold {
	border-color: rgba(253, 224, 71, 0.28);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(250, 204, 21, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.hero-shine {
	position: absolute;
	top: -40%;
	left: -20%;
	width: 70%;
	height: 80%;
	background: linear-gradient(120deg, rgba(255, 255, 255, 0.14), transparent 55%);
	transform: rotate(-18deg);
	pointer-events: none;
}
.hero-row {
	display: flex;
	align-items: center;
	gap: 14px;
	position: relative;
	z-index: 1;
}
.avatar {
	width: 64px;
	height: 64px;
	border-radius: 20px;
	border: 2px solid rgba(255, 255, 255, 0.2);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
	flex-shrink: 0;
}
.hero-text {
	flex: 1;
	min-width: 0;
}
.nick {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #f8fafc;
}
.mobile {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.65);
}
.badge-row {
	margin-top: 10px;
}
.member-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px 5px 10px;
	border-radius: 999px;
	background: rgba(15, 23, 42, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.2);
}
.member-badge-dot {
	font-size: 8px;
	line-height: 1;
}
.member-badge-txt {
	font-size: 13px;
	font-weight: 600;
	color: rgba(254, 252, 232, 0.95);
	letter-spacing: 0.04em;
}
.hero-foot {
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	position: relative;
	z-index: 1;
}
.hero-foot-txt {
	font-size: 12px;
	color: rgba(203, 213, 225, 0.72);
}

.section-label {
	margin: 6px 4px 10px;
}
.section-title {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: rgba(226, 232, 240, 0.88);
}
.section-sub {
	display: block;
	margin-top: 2px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.85);
}

.stat-grid {
	display: flex;
	align-items: stretch;
	margin-bottom: 14px;
	padding: 6px 0;
}
.stat-cell {
	flex: 1;
	padding: 14px 8px;
	text-align: center;
}
.stat-label {
	display: block;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 6px;
}
.stat-value {
	display: block;
	font-size: 17px;
	font-weight: 700;
	color: #f1f5f9;
	letter-spacing: 0.02em;
}
.stat-div {
	width: 1px;
	background: rgba(255, 255, 255, 0.08);
	margin: 12px 0;
}

.duo-row {
	display: flex;
	margin-bottom: 12px;
	padding: 4px 0;
}
.duo-block {
	flex: 1;
	padding: 16px 14px;
}
.duo-v {
	width: 1px;
	background: rgba(255, 255, 255, 0.08);
	margin: 14px 0;
}
.duo-label {
	display: block;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 8px;
}
.duo-value {
	display: block;
	font-size: 22px;
	font-weight: 800;
	letter-spacing: 0.02em;
}
.accent-gold {
	color: #fde68a;
	text-shadow: 0 0 24px rgba(250, 204, 21, 0.25);
}
.accent-mint {
	color: #a7f3d0;
	text-shadow: 0 0 24px rgba(52, 211, 153, 0.2);
}
.duo-hint {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.9);
	line-height: 1.45;
}

.quota-bar-wrap {
	margin-bottom: 14px;
	padding: 14px 16px 16px;
}
.quota-bar-bg {
	height: 8px;
	border-radius: 999px;
	background: rgba(15, 23, 42, 0.45);
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.06);
}
.quota-bar-fill {
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, #34d399, #6ee7b7, #a7f3d0);
	box-shadow: 0 0 16px rgba(52, 211, 153, 0.35);
	transition: width 0.45s ease;
}
.quota-bar-cap {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.9);
	text-align: right;
}

.countdown-card {
	padding: 16px 18px 18px;
	margin-bottom: 20px;
}
.cd-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 8px;
}
.cd-title {
	font-size: 15px;
	font-weight: 700;
	color: #f8fafc;
}
.cd-badge {
	font-size: 11px;
	padding: 4px 10px;
	border-radius: 999px;
	background: rgba(99, 102, 241, 0.25);
	color: #c7d2fe;
	border: 1px solid rgba(129, 140, 248, 0.35);
	flex-shrink: 0;
}
.cd-badge--action {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 6px 12px;
	background: rgba(255, 255, 255, 0.12);
	border: 1px solid rgba(199, 210, 254, 0.45);
	color: #e0e7ff;
}
.cd-badge-action-txt {
	font-size: 12px;
	font-weight: 600;
	color: #e0e7ff;
}
.cd-badge-action-arrow {
	font-size: 14px;
	color: rgba(199, 210, 254, 0.95);
	line-height: 1;
}
.cd-desc {
	display: block;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.92);
	line-height: 1.55;
	margin-bottom: 14px;
}
.cd-digits {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 10px 14px;
}
.cd-seg {
	min-width: 52px;
	padding: 10px 12px;
	border-radius: 14px;
	background: rgba(15, 23, 42, 0.4);
	border: 1px solid rgba(255, 255, 255, 0.1);
	text-align: center;
}
.cd-num {
	display: block;
	font-size: 20px;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	color: #e0e7ff;
	letter-spacing: 0.04em;
}
.cd-unit {
	display: block;
	margin-top: 2px;
	font-size: 10px;
	color: rgba(148, 163, 184, 0.95);
}
.cd-idle {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.85);
}

.loading-hint {
	text-align: center;
	padding: 8px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.8);
}
.bottom-spacer {
	height: 12px;
}

.tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 10;
	display: flex;
	height: calc(56px + env(safe-area-inset-bottom, 0px));
	padding-bottom: env(safe-area-inset-bottom, 0px);
	box-sizing: border-box;
	align-items: flex-start;
	padding-top: 0;
	background: rgba(15, 23, 42, 0.72);
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.2);
}
.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	color: rgba(148, 163, 184, 0.9);
	font-size: 14px;
}
.tab.active {
	color: #a5b4fc;
	font-weight: 700;
}
</style>
