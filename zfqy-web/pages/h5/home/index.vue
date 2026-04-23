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
						<text class="hero-foot-txt">{{ mine.brandName || '-' }} · {{ deviceDisplayText }}</text>
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
				<view class="glass prestore-card" @click="goPrestore">
					<view class="prestore-main">
						<text class="prestore-title">额度预存</text>
						<text class="prestore-sub">快捷进入预存页面，升级档位与额度</text>
						<view class="prestore-packages">
							<view class="prestore-pkg-row">
								<text class="prestore-pkg-tag">¥600档</text>
								<text class="prestore-pkg-text">配置100万交易量，补贴市场价约3800元手续费</text>
							</view>
							<view class="prestore-pkg-row">
								<text class="prestore-pkg-tag">¥800档</text>
								<text class="prestore-pkg-text">配置150万交易量，补贴市场价约5700元手续费</text>
							</view>
							<view class="prestore-pkg-row">
								<text class="prestore-pkg-tag">¥1000档</text>
								<text class="prestore-pkg-text">配置200万交易量，补贴市场价约7600元手续费</text>
							</view>
							<text class="prestore-gift">赠送：碰一碰音响或扫码全能POS机（¥1000档专享）</text>
						</view>
					</view>
					<text class="prestore-arrow">›</text>
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
		<view v-if="loading" class="loading-mask">
			<view class="loading-card">
				<view class="loading-spinner"></view>
				<text class="loading-text">加载中...</text>
			</view>
		</view>
	</view>
</template>

<script>
import { h5HomeDashboard } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			loading: false,
			mine: {},
			membership: { tier: 'normal', name: '普通会员', accent: '#94a3b8' },
			withdraw: { today: '0.00', month: '0.00', year: '0.00' },
			pendingWithdraw: '0.00',
			quota: { remaining: '0.00', totalGrantedYuan: 0, usedYuan: '0.00' },
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
		deviceDisplayText() {
			const d = this.mine.deviceDisplay || this.mine.deviceId || '未绑定';
			return String(d);
		}
	},
	onShow() {
		this.load();
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
				this.mine = Object.assign({}, d.merchant || {}, {
					deviceDisplay: d.device?.display || (d.merchant && d.merchant.deviceId) || ''
				});
				this.membership = d.membership || this.membership;
				this.withdraw = d.withdraw || this.withdraw;
				this.pendingWithdraw = d.pendingWithdraw || '0.00';
				this.quota = Object.assign({}, this.quota, d.quota || {});
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
		goPrestore() {
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
.prestore-card {
	display: flex;
	gap: 10px;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	margin-bottom: 12px;
}
.prestore-main {
	flex: 1;
	min-width: 0;
}
.prestore-title {
	display: block;
	font-size: 15px;
	font-weight: 700;
	color: #e2e8f0;
}
.prestore-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}
.prestore-packages {
	margin-top: 10px;
	padding: 8px 10px;
	border-radius: 12px;
	background: rgba(15, 23, 42, 0.36);
	border: 1px solid rgba(255, 255, 255, 0.1);
}
.prestore-pkg-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	margin-top: 6px;
}
.prestore-pkg-row:first-child {
	margin-top: 0;
}
.prestore-pkg-tag {
	flex-shrink: 0;
	margin-top: 1px;
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 10px;
	font-weight: 700;
	line-height: 1.4;
	color: #fef3c7;
	background: rgba(245, 158, 11, 0.24);
	border: 1px solid rgba(251, 191, 36, 0.35);
}
.prestore-pkg-text {
	flex: 1;
	min-width: 0;
	font-size: 11px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.95);
}
.prestore-gift {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	font-weight: 700;
	line-height: 1.5;
	color: #fbbf24;
}
.prestore-arrow {
	font-size: 20px;
	color: rgba(148, 163, 184, 0.95);
}

.loading-hint {
	text-align: center;
	padding: 8px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.8);
}
.loading-mask {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(2, 6, 23, 0.45);
	backdrop-filter: blur(2px);
	-webkit-backdrop-filter: blur(2px);
}
.loading-card {
	min-width: 120px;
	padding: 16px 18px;
	border-radius: 14px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	background: rgba(15, 23, 42, 0.86);
	border: 1px solid rgba(255, 255, 255, 0.14);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}
.loading-spinner {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid rgba(148, 163, 184, 0.35);
	border-top-color: #a5b4fc;
	animation: h5-spin 0.8s linear infinite;
}
.loading-text {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.95);
}
@keyframes h5-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
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
