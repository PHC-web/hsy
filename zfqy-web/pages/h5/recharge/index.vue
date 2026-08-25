<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<scroll-view class="recharge-scroll" scroll-y :show-scrollbar="false">
			<view class="recharge-inner">
				<view class="nav-bar">
					<view class="nav-back" @click="goBack">
						<text class="bi bi-chevron-left nav-back-ico"></text>
						<text class="nav-back-txt">返回</text>
					</view>
					<text class="nav-title">额度包</text>
					<text class="nav-placeholder"></text>
				</view>
				<view v-if="!rechargeReady" class="gate-wrap">
					<image class="h5-brand-logo h5-brand-logo--hero gate-logo" :src="h5Logo" mode="aspectFit" />
					<text class="gate-text">{{ gateText }}</text>
				</view>
				<block v-else>
					<view class="hero h5-glass-panel">
						<image class="h5-brand-logo h5-brand-logo--hero" :src="h5Logo" mode="aspectFit" />
						<text class="title">额度包</text>
						<text class="sub">选择额度包，获取交易补贴额度</text>
					</view>
					<view class="card h5-glass-panel">
						<view
							v-for="item in packages"
							:key="item.id"
							class="pkg"
							:class="selectedId === item.id ? 'pkg-active' : ''"
							@click="onSelectPackage(item)"
						>
							<view
								v-if="item.descText"
								class="pkg-desc"
								:class="packageDescTierClass(item)"
							>
								<text class="pkg-desc-body">{{ item.descText }}</text>
							</view>

							<view class="pkg-top">
								<view class="pkg-top-main">
									<text class="pkg-title">{{ item.title }}</text>
									<text v-if="item.membershipName" class="pkg-member">会员 · {{ item.membershipName }}</text>
								</view>
								<view class="pkg-top-side">
									<text class="pkg-price">¥{{ item.price }}</text>
									<text class="pkg-check" :class="selectedId === item.id ? 'pkg-check--on' : ''">{{ selectedId === item.id ? '✓' : '' }}</text>
								</view>
							</view>

							<text class="pkg-upgrade" v-if="currentPackage && item.price > currentPackage.price">升级仅需补差价 ¥{{ item.price - currentPackage.price }}</text>
						</view>
					</view>

					<view v-if="selectedPackage && selectedPackage.giftChoiceRequired" class="gift-card h5-glass-panel">
						<text class="gift-title">实物赠品（请任选其一）</text>
						<text class="gift-hint">支付成功后由平台按您所选安排发货，可联系客服查询进度。</text>
						<view
							v-for="opt in selectedPackage.giftOptions || []"
							:key="opt.value"
							class="gift-row"
							:class="giftChoice === opt.value ? 'gift-row--on' : ''"
							@click="giftChoice = opt.value"
						>
							<text class="gift-radio">{{ giftChoice === opt.value ? '●' : '○' }}</text>
							<text class="gift-label">{{ opt.label }}</text>
						</view>
					</view>

					<view class="actions">
						<button class="btn-pay" type="primary" :disabled="loading || !selectedId || !canUpgrade" @click="payNow">{{ payButtonText }}</button>
					</view>
					<!-- <view class="rule-card h5-glass-panel">
						<text class="rule-title">规则说明</text>
						<text class="rule-item">1）充值后 {{ refundCycleDays }} 天内无法退款。</text>
						<text class="rule-item">2）满 {{ refundCycleDays }} 天后，系统将开放 {{ refundWindowDays }} 天窗口期供您提取；若您 {{ refundWindowDays }} 天未提取，额度将自动保留并顺延，系统继续配置对应额度，以此类推。</text>
						<text class="rule-item">3）如您执意在 {{ refundCycleDays }} 天内退款，将扣除 50% 违约金后返还剩余款项。</text>
					</view> -->
				</block>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>
		<h5-agreement-sign-sheet ref="agreementSheet" />
	</view>
</template>

<script>
import { h5RechargeOptions, h5RechargeCreate, h5RechargeConfirm, h5RefreshHomeCache } from '@/pages/h5/common/api';
import H5AgreementSignSheet from '@/pages/h5/components/H5AgreementSignSheet.vue';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';
import { isDiamondRechargePrice } from '@/common/recharge-tiers';

export default {
	components: { H5AgreementSignSheet },
	data() {
		return {
			h5Logo: H5_APP_LOGO,
			rechargeReady: false,
			gateText: '正在校验…',
			packages: [],
			selectedId: '',
			loading: false,
			currentPackage: null,
			refundCycleDays: 180,
			refundWindowDays: 3,
			giftChoice: ''
		};
	},
	computed: {
		selectedPackage() {
			return this.packages.find((x) => x.id === this.selectedId) || null;
		},
		giftOk() {
			const p = this.selectedPackage;
			if (!p || !p.giftChoiceRequired) return true;
			return this.giftChoice === 'speaker' || this.giftChoice === 'scan_pos';
		},
		canUpgrade() {
			const picked = this.packages.find((x) => x.id === this.selectedId);
			if (!picked) return false;
			if (!this.giftOk) return false;
			if (!this.currentPackage) return true;
			return Number(picked.price) > Number(this.currentPackage.price);
		},
		payButtonText() {
			const picked = this.packages.find((x) => x.id === this.selectedId);
			if (!picked) return '立即升级';
			if (this.currentPackage && Number(picked.price) > Number(this.currentPackage.price)) {
				return `补差价升级（¥${Number(picked.price) - Number(this.currentPackage.price)}）`;
			}
			if (this.currentPackage && Number(picked.price) <= Number(this.currentPackage.price)) return '当前档位不可重复充值';
			return `立即升级（¥${picked.price}）`;
		}
	},
	onShow() {
		this.initPage();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		onSelectPackage(item) {
			this.selectedId = item.id;
			this.syncGiftChoice();
		},
		packageDescText(item) {
			if (!item) return '';
			const tip = String(item.benefitTip || '').trim();
			if (tip) return tip;
			return String(item.benefitText || '').trim();
		},
		packageDescTierClass(item) {
			const name = String(item?.membershipName || '').trim();
			if (name.includes('钻石')) return 'pkg-desc--diamond';
			if (name.includes('白金')) return 'pkg-desc--white-gold';
			if (name.includes('铂金')) return 'pkg-desc--platinum';
			if (name.includes('黄金')) return 'pkg-desc--gold';
			const price = Number(item?.price || 0);
			if (isDiamondRechargePrice(price)) return 'pkg-desc--diamond';
			if (price >= 800) return 'pkg-desc--white-gold';
			if (price >= 600 || price === 0.1) return 'pkg-desc--gold';
			return 'pkg-desc--default';
		},
		async initPage() {
			this.rechargeReady = false;
			this.gateText = '加载中…';
			await this.loadOptions();
		},
		async loadOptions() {
			const res = await h5RechargeOptions();
			if (res.code !== 0) {
				this.gateText = res.message || '加载失败';
				uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				if (res.code === 404) {
					setTimeout(() => {
						uni.navigateBack({
							fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' })
						});
					}, 400);
				}
				return;
			}
			const raw = (res.data && res.data.packages) || [];
			this.packages = raw.map((p) => ({
				...p,
				descText: this.packageDescText(p)
			}));
			this.currentPackage = res.data?.currentPackage || null;
			this.refundCycleDays = Number(res.data?.refundCycle?.cycleDays || 180);
			this.refundWindowDays = Number(res.data?.refundCycle?.windowDays || 3);
			if (this.currentPackage) {
				const up = this.packages.find((x) => Number(x.price) > Number(this.currentPackage.price));
				this.selectedId = up ? up.id : this.currentPackage.id;
			} else {
				this.selectedId = this.packages[0] ? this.packages[0].id : '';
			}
			this.rechargeReady = true;
			this.syncGiftChoice();
		},
		syncGiftChoice() {
			const p = this.packages.find((x) => x.id === this.selectedId);
			if (!p || !p.giftChoiceRequired) {
				this.giftChoice = '';
				return;
			}
			const opts = p.giftOptions || [];
			if (!opts.some((o) => o.value === this.giftChoice)) {
				this.giftChoice = '';
			}
		},
		async payNow() {
			if (!this.selectedId) return;
			const sheet = this.$refs.agreementSheet;
			if (!sheet) return;
			const agreed = await sheet.ensureSigned();
			if (!agreed) return;
			if (!this.giftOk) {
				uni.showToast({ title: '请选择赠品（碰一碰音响或扫码全能POS机）', icon: 'none' });
				return;
			}
			const pickedPackage = this.packages.find((x) => x.id === this.selectedId) || null;
			this.loading = true;
			uni.showLoading({ title: '处理中...', mask: true });
			try {
				const payload = { packageId: this.selectedId };
				if (this.giftChoice) payload.rechargeGiftType = this.giftChoice;
				const res = await h5RechargeCreate(payload);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '充值失败', icon: 'none' });
					return;
				}
				const payRes = await this.invokeWxPay(res.data.wxPayParams || {});
				if (!payRes.success) {
					uni.showToast({ title: payRes.message || '支付未完成', icon: 'none' });
					return;
				}
				const confirmRes = await h5RechargeConfirm(res.data.orderNo);
				if (confirmRes.code !== 0 || !confirmRes.data?.paid) {
					uni.showToast({ title: confirmRes.message || '支付确认中，请稍后刷新', icon: 'none' });
					return;
				}
				await h5RefreshHomeCache();
				const tier = this.resolveTierByPrice(
					pickedPackage ? Number(pickedPackage.price || 0) : 0,
					pickedPackage
				);
				const successUrl = `/pages/h5/recharge-success/index?tier=${encodeURIComponent(tier.tier)}&tierName=${encodeURIComponent(tier.name)}&paid=${encodeURIComponent(String(res.data.paidAmount || '0'))}&quota=${encodeURIComponent(String(res.data.quotaAdded || '0'))}&orderNo=${encodeURIComponent(String(res.data.orderNo || ''))}`;
				uni.redirectTo({ url: successUrl });
			} finally {
				this.loading = false;
				uni.hideLoading();
			}
		},
		invokeWxPay(params) {
			return new Promise((resolve) => {
				// #ifdef H5
				if (typeof window === 'undefined') {
					resolve({ success: false, message: '请在微信内打开后支付' });
					return;
				}
				const invokePay = () => window.WeixinJSBridge.invoke('getBrandWCPayRequest', params, (r) => {
					const msg = String(r && r.err_msg ? r.err_msg : '').toLowerCase();
					if (msg.includes('ok')) resolve({ success: true });
					else if (msg.includes('cancel')) resolve({ success: false, message: '已取消支付' });
					else resolve({ success: false, message: '支付失败，请重试' });
				});
				if (window.WeixinJSBridge) {
					invokePay();
					return;
				}
				document.addEventListener('WeixinJSBridgeReady', invokePay, { once: true });
				// #endif
				// #ifndef H5
				resolve({ success: false, message: '当前环境不支持微信支付' });
				// #endif
			});
		},
		resolveTierByPrice(priceRaw, pkg) {
			const price = Number(priceRaw || 0);
			let out;
			if (isDiamondRechargePrice(price)) out = { tier: 'diamond', name: '钻石会员' };
			else if (price >= 800) out = { tier: 'platinum', name: '铂金会员' };
			else if (price >= 600 || price === 0.1) out = { tier: 'white_gold', name: '白金会员' };
			else out = { tier: 'normal', name: '会员' };
			const custom = pkg && String(pkg.membershipName || pkg.membership_name || '').trim();
			if (custom) return { ...out, name: custom };
			return out;
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style src="@/common/h5-brand.css"></style>
<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
}

.recharge-scroll {
	position: relative;
	z-index: 1;
	height: 100vh;
	box-sizing: border-box;
}

.recharge-inner {
	padding: 0 16px calc(32px + env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
}

.nav-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 0 10px;
	position: relative;
	z-index: 2;
}

.nav-title {
	color: #0f172a;
	font-size: 17px;
	font-weight: 700;
}

.nav-placeholder {
	min-width: 72px;
}

.bottom-spacer {
	height: 24px;
}

.gate-wrap {
	min-height: 60vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 32px 24px;
}

.gate-logo {
	margin-bottom: 16px;
}

.gate-text {
	font-size: 14px;
	color: #64748b;
	text-align: center;
	line-height: 1.5;
}

.hero {
	margin-bottom: 14px;
	padding: 18px 16px 20px;
	text-align: center;
}

.title {
	display: block;
	font-size: 24px;
	font-weight: 700;
	color: #0f172a;
}

.sub {
	display: block;
	margin-top: 6px;
	color: #64748b;
	font-size: 12px;
}

.card {
	padding: 14px;
	margin-bottom: 14px;
}

.pkg {
	border: 1px solid rgba(255, 255, 255, 0.78);
	border-radius: 16px;
	padding: 14px 14px 12px;
	margin-bottom: 12px;
	background: rgba(255, 255, 255, 0.48);
	backdrop-filter: blur(14px) saturate(165%);
	-webkit-backdrop-filter: blur(14px) saturate(165%);
	display: flex;
	flex-direction: column;
	gap: 0;
}

.pkg:last-child {
	margin-bottom: 0;
}

.pkg-active {
	border-color: rgba(147, 197, 253, 0.9);
	background: rgba(239, 246, 255, 0.55);
	backdrop-filter: blur(16px) saturate(175%);
	-webkit-backdrop-filter: blur(16px) saturate(175%);
	box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.15), 0 8px 24px rgba(37, 99, 235, 0.1);
}

.pkg-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 10px;
	padding-top: 4px;
}

.pkg-top-main {
	flex: 1;
	min-width: 0;
}

.pkg-top-side {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.pkg-member {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #7c3aed;
	letter-spacing: 0.02em;
}

.pkg-title {
	font-size: 16px;
	font-weight: 700;
	color: #334155;
	letter-spacing: 0.02em;
}

.pkg-price {
	font-size: 18px;
	font-weight: 800;
	color: #dc2626;
}

.pkg-check {
	width: 22px;
	height: 22px;
	border-radius: 50%;
	border: 1px solid #cbd5e1;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	font-weight: 700;
	color: transparent;
	background: #f8fafc;
}

.pkg-check--on {
	color: #fff;
	border-color: #2563eb;
	background: linear-gradient(145deg, #2563eb, #1d4ed8);
	box-shadow: 0 0 8px rgba(37, 99, 235, 0.25);
}

.pkg-desc {
	margin-top: 0;
	margin-bottom: 12px;
	padding: 16px 16px 18px;
	border-radius: 14px;
	box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
}

/* 黄金：暖金色 */
.pkg-desc--gold {
	background: linear-gradient(160deg, #fffbeb 0%, #ffffff 100%);
	border: 1px solid #fde68a;
	border-left: 4px solid #f59e0b;
}

/* 白金：银灰 */
.pkg-desc--white-gold {
	background: linear-gradient(160deg, #f8fafc 0%, #ffffff 100%);
	border: 1px solid #e2e8f0;
	border-left: 4px solid #94a3b8;
}

/* 铂金（若后台使用该名称） */
.pkg-desc--platinum {
	background: linear-gradient(160deg, #faf5ff 0%, #ffffff 100%);
	border: 1px solid #e9d5ff;
	border-left: 4px solid #a855f7;
}

/* 钻石 / 默认：青蓝 */
.pkg-desc--diamond,
.pkg-desc--default {
	background: linear-gradient(160deg, #eff6ff 0%, #ffffff 100%);
	border: 1px solid #bfdbfe;
	border-left: 4px solid #3b82f6;
}

.pkg-desc-body {
	display: block;
	font-size: 12px;
	font-weight: 600;
	line-height: 1.75;
	color: #334155;
	letter-spacing: 0.01em;
	white-space: pre-wrap;
	word-break: break-word;
	text-align: left;
	-webkit-font-smoothing: antialiased;
}

.pkg-upgrade {
	display: block;
	margin-top: 10px;
	padding: 6px 10px;
	border-radius: 8px;
	text-align: center;
	color: #2563eb;
	font-size: 12px;
	font-weight: 600;
	background: #eff6ff;
	border: 1px solid #bfdbfe;
}

.actions {
	margin-top: 4px;
}

.btn-pay {
	border-radius: 999px;
	box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
}

.rule-card {
	margin-top: 6px;
	padding: 16px;
	border-color: rgba(251, 191, 36, 0.28);
	box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.12), 0 12px 40px rgba(0, 0, 0, 0.2);
}

.rule-title {
	display: block;
	font-size: 14px;
	font-weight: 700;
	color: #fde68a;
	margin-bottom: 8px;
}

.rule-item {
	display: block;
	font-size: 12px;
	line-height: 1.65;
	color: rgba(254, 243, 199, 0.88);
	margin-top: 6px;
}

.gift-card {
	margin-bottom: 14px;
	padding: 14px 16px;
	border-color: rgba(167, 243, 208, 0.25);
	box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.12), 0 12px 40px rgba(0, 0, 0, 0.2);
}

.gift-title {
	display: block;
	font-size: 14px;
	font-weight: 700;
	color: #059669;
	margin-bottom: 6px;
}

.gift-hint {
	display: block;
	font-size: 11px;
	line-height: 1.55;
	color: #475569;
	margin-bottom: 12px;
}

.gift-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	margin-bottom: 8px;
	border-radius: 12px;
	border: 1px solid #e2e8f0;
	background: #f8fafc;
}

.gift-row:last-child {
	margin-bottom: 0;
}

.gift-row--on {
	border-color: rgba(52, 211, 153, 0.55);
	background: rgba(16, 185, 129, 0.12);
}

.gift-radio {
	font-size: 14px;
	color: #059669;
	width: 20px;
	text-align: center;
}

.gift-label {
	font-size: 14px;
	font-weight: 600;
	color: #0f172a;
}
</style>
