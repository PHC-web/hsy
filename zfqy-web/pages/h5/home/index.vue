<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="scroll-inner">
				<view class="top-row">
					<text class="page-title">商户中心</text>
					<view class="top-refresh-btn" @click="refreshPage">刷新</view>
				</view>

				<!-- 会员与头像 -->
				<view class="h5-glass-panel hero-card" :class="'tier-' + (membership.tier || 'normal')">
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

				<view v-if="showSilverTradeStat" class="h5-glass-panel silver-trade-card">
					<text class="silver-trade-title">当月流水统计</text>
					<text class="silver-trade-value">¥{{ silverMonthTradeYuan }}</text>
				</view>

				<!-- 提现统计 -->
				<view class="section-label">
					<text class="section-title">提现累积</text>
					<text class="section-sub">已到账金额（北京时间自然日/月/年）</text>
				</view>
				<view class="h5-glass-panel stat-grid">
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
				<view class="h5-glass-panel duo-row">
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

				<view v-if="quota.totalGrantedYuan > 0" class="h5-glass-panel quota-bar-wrap">
					<view class="quota-bar-bg">
						<view class="quota-bar-fill" :style="{ width: quotaBarPercent + '%' }"></view>
					</view>
					<text class="quota-bar-cap">剩余 {{ quotaBarPercent }}%</text>
				</view>
				<view class="h5-glass-panel prestore-card" @click="goPrestore">
					<view class="prestore-main">
						<text class="prestore-title">额度包</text>
						<text class="prestore-sub">快捷进入升级页面，升级档位与额度</text>
						<view class="prestore-packages h5-glass-surface">
							<view v-for="pkg in prestorePackages" :key="pkg.id || pkg.price" class="prestore-pkg-row">
								<text class="prestore-pkg-tag">{{ pkg.membershipName || '会员' }}</text>
								<text class="prestore-pkg-text">{{ pkg.benefitTip || '查看详情请进入额度包' }}</text>
							</view>
							<text v-if="hasGiftPackage" class="prestore-gift">赠送：碰一碰音响或扫码全能POS机{{ giftExclusiveSuffix }}</text>
						</view>
					</view>
					<text class="prestore-arrow">›</text>
				</view>

				<view v-if="pending" class="loading-hint">
					<text>加载中…</text>
				</view>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>

		<view class="tabbar h5-glass-tabbar safe-bottom">
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
		<h5-agreement-sign-sheet ref="navAgreementSheet" />
	</view>
</template>

<script>
import { h5HomeDashboardCached } from '@/pages/h5/common/api';
import H5AgreementSignSheet from '@/pages/h5/components/H5AgreementSignSheet.vue';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';
import { isDiamondRechargePrice } from '@/common/recharge-tiers';

export default {
	components: { H5AgreementSignSheet },
	data() {
		return {
			loading: false,
			pending: false,
			mine: {},
			membership: { tier: 'normal', name: '普通会员', accent: '#94a3b8' },
			withdraw: { today: '0.00', month: '0.00', year: '0.00' },
			withdrawContext: { role: '', silverMonthTradeYuan: 0 },
			pendingWithdraw: '0.00',
			quota: { remaining: '0.00', totalGrantedYuan: 0, usedYuan: '0.00' },
			prestorePackages: [],
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
		},
		showSilverTradeStat() {
			return String(this.withdrawContext.role || '') === 'silver_member';
		},
		silverMonthTradeYuan() {
			return Number(this.withdrawContext.silverMonthTradeYuan || 0).toFixed(2);
		},
		hasGiftPackage() {
			return (this.prestorePackages || []).some((x) => x && x.giftChoiceRequired);
		},
		/** 含实物赠品的档位对应的会员名称，如（钻石会员专享）或（白金会员、钻石会员专享） */
		giftExclusiveSuffix() {
			const pkgs = (this.prestorePackages || []).filter((x) => x && x.giftChoiceRequired);
			if (!pkgs.length) return '';
			const tierLabel = (p) => {
				const n = String(p.membershipName || '').trim();
				if (n) return n;
				const price = Number(p.price || 0);
				if (isDiamondRechargePrice(price)) return '钻石会员';
				if (price >= 800) return '铂金会员';
				if (price >= 600) return '白金会员';
				return '';
			};
			const names = [...new Set(pkgs.map(tierLabel).filter(Boolean))];
			if (!names.length) return '（专享）';
			return `（${names.join('、')}专享）`;
		}
	},
	onShow() {
		let force = false;
		try {
			const ts = Number(uni.getStorageSync('h5_refund_success_refresh_ts') || 0);
			const consumed = Number(uni.getStorageSync('h5_refund_success_refresh_ts_home') || 0);
			if (ts > 0 && ts > consumed) {
				force = true;
				uni.setStorageSync('h5_refund_success_refresh_ts_home', ts);
			}
		} catch (e) {}
		this.load(force);
	},
	methods: {
		async load(force = false) {
			this.pending = true;
			const maskTimer = setTimeout(() => {
				this.loading = true;
			}, 320);
			try {
				const res = await h5HomeDashboardCached({ maxAgeMs: 5 * 60 * 1000, force: !!force });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				if (this.applyH5UiStyleFromApiData) this.applyH5UiStyleFromApiData(d);
				this.mine = Object.assign({}, d.merchant || {}, {
					deviceDisplay: d.device?.display || (d.merchant && d.merchant.deviceId) || ''
				});
				this.membership = d.membership || this.membership;
				this.withdrawContext = d.withdrawContext || this.withdrawContext;
				this.withdraw = d.withdraw || this.withdraw;
				this.pendingWithdraw = d.pendingWithdraw || '0.00';
				this.quota = Object.assign({}, this.quota, d.quota || {});
				this.prestorePackages = (d.rechargePackages || []).slice(0, 6);
			} finally {
				clearTimeout(maskTimer);
				this.pending = false;
				this.loading = false;
			}
		},
		async refreshPage() {
			if (this.pending || this.loading) return;
			await this.load(true);
			uni.showToast({ title: '已刷新', icon: 'none' });
		},
		goIncome() {
			uni.redirectTo({ url: '/pages/h5/income/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		},
		async goPrestore() {
			if (this.pending || this.loading) return;
			const sheet = this.$refs.navAgreementSheet;
			if (sheet) {
				const ok = await sheet.ensureSigned();
				if (!ok) return;
			}
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	overflow: hidden;
	background: transparent;
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
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 14px;
}
.page-title {
	font-size: 22px;
	font-weight: 700;
	color: #0f172a;
	letter-spacing: 0.02em;
}
.top-refresh-btn {
	padding: 4px 12px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 600;
	color: #2563eb;
	background: #dbeafe;
	border: 1px solid #bfdbfe;
}

.hero-card {
	padding: 18px 18px 14px;
	margin-bottom: 16px;
	overflow: hidden;
}
.hero-card.tier-diamond {
	border-color: #7dd3fc;
	box-shadow: 0 8px 24px rgba(14, 165, 233, 0.12);
}
.hero-card.tier-platinum {
	border-color: #d8b4fe;
	box-shadow: 0 8px 24px rgba(168, 85, 247, 0.1);
}
.hero-card.tier-white_gold {
	border-color: #fde047;
	box-shadow: 0 8px 24px rgba(234, 179, 8, 0.1);
}
.hero-shine {
	position: absolute;
	top: -40%;
	left: -20%;
	width: 70%;
	height: 80%;
	background: linear-gradient(120deg, rgba(255, 255, 255, 0.85), transparent 55%);
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
	border: 2px solid #e2e8f0;
	box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
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
	color: #0f172a;
}
.mobile {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #64748b;
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
	background: rgba(255, 255, 255, 0.55);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	border: 1px solid rgba(255, 255, 255, 0.72);
}
.member-badge-txt {
	font-size: 13px;
	font-weight: 600;
	color: #334155;
	letter-spacing: 0.04em;
}
.hero-foot {
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px solid #e2e8f0;
	position: relative;
	z-index: 1;
}
.hero-foot-txt {
	font-size: 12px;
	color: #64748b;
}

.silver-trade-card {
	margin-bottom: 14px;
	padding: 14px 16px;
}
.silver-trade-title {
	display: block;
	font-size: 12px;
	color: #64748b;
}
.silver-trade-value {
	display: block;
	margin-top: 6px;
	font-size: 24px;
	font-weight: 800;
	color: #059669;
	letter-spacing: 0.02em;
}

.section-label {
	margin: 6px 4px 10px;
}
.section-title {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: #334155;
}
.section-sub {
	display: block;
	margin-top: 2px;
	font-size: 11px;
	color: #94a3b8;
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
	color: #64748b;
	margin-bottom: 6px;
}
.stat-value {
	display: block;
	font-size: 17px;
	font-weight: 700;
	color: #0f172a;
	letter-spacing: 0.02em;
}
.stat-div {
	width: 1px;
	background: #e2e8f0;
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
	background: #e2e8f0;
	margin: 14px 0;
}
.duo-label {
	display: block;
	font-size: 12px;
	color: #64748b;
	margin-bottom: 8px;
}
.duo-value {
	display: block;
	font-size: 22px;
	font-weight: 800;
	letter-spacing: 0.02em;
}
.accent-gold {
	color: #d97706;
}
.accent-mint {
	color: #059669;
}
.duo-hint {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: #94a3b8;
	line-height: 1.45;
}

.quota-bar-wrap {
	margin-bottom: 14px;
	padding: 14px 16px 16px;
}
.quota-bar-bg {
	height: 8px;
	border-radius: 999px;
	background: #e2e8f0;
	overflow: hidden;
}
.quota-bar-fill {
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, #10b981, #34d399, #6ee7b7);
	transition: width 0.45s ease;
}
.quota-bar-cap {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: #94a3b8;
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
	color: #0f172a;
}
.prestore-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #64748b;
}
.prestore-packages {
	margin-top: 10px;
	padding: 8px 10px;
	border-radius: 12px;
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
	color: #b45309;
	background: #fef3c7;
	border: 1px solid #fde68a;
}
.prestore-pkg-text {
	flex: 1;
	min-width: 0;
	font-size: 11px;
	line-height: 1.5;
	color: #475569;
}
.prestore-gift {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	font-weight: 700;
	line-height: 1.5;
	color: #d97706;
}
.prestore-arrow {
	font-size: 20px;
	color: #94a3b8;
}

.loading-hint {
	text-align: center;
	padding: 8px;
	font-size: 12px;
	color: #94a3b8;
}
.loading-mask {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(15, 23, 42, 0.12);
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
	background: #ffffff;
	border: 1px solid #e2e8f0;
	box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
}
.loading-spinner {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid #e2e8f0;
	border-top-color: #2563eb;
	animation: h5-spin 0.8s linear infinite;
}
.loading-text {
	font-size: 12px;
	color: #475569;
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
}
.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	color: #94a3b8;
	font-size: 14px;
}
.tab.active {
	color: #2563eb;
	font-weight: 700;
}
</style>
