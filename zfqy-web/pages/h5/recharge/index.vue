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
				<view v-if="!rechargeReady" class="gate-wrap">
					<image class="h5-brand-logo h5-brand-logo--hero gate-logo" :src="h5Logo" mode="aspectFit" />
					<text class="gate-text">{{ gateText }}</text>
				</view>
				<block v-else>
					<view class="hero h5-glass-panel">
						<image class="h5-brand-logo h5-brand-logo--hero" :src="h5Logo" mode="aspectFit" />
						<text class="title">额度充值</text>
						<text class="sub">选择充值套餐，获取交易补贴额度</text>
					</view>
					<view class="card h5-glass-panel">
						<view
							v-for="item in packages"
							:key="item.id"
							class="pkg"
							:class="selectedId === item.id ? 'pkg-active' : ''"
							@click="selectedId = item.id"
						>
							<view class="pkg-head">
								<text class="pkg-title">{{ item.title }}</text>
								<text class="pkg-price">¥{{ item.price }}</text>
							</view>
							<text class="pkg-tip">{{ item.benefitTip }}</text>
							<text class="pkg-upgrade" v-if="currentPackage && item.price > currentPackage.price">升级仅需补差价：¥{{ item.price - currentPackage.price }}</text>
						</view>
					</view>

					<view class="actions">
						<button class="btn-pay" type="primary" :disabled="loading || !selectedId || !canUpgrade" @click="payNow">{{ payButtonText }}</button>
					</view>
					<view class="rule-card h5-glass-panel">
						<text class="rule-title">规则说明</text>
						<text class="rule-item">1）充值后 180 天内无法退款。</text>
						<text class="rule-item">2）满 180 天后，系统将开发 3 天窗口期供您提取；若您 3 天未提取，额度将自动预存并顺延，系统继续配置对应额度，以此类推。</text>
						<text class="rule-item">3）如您执意在 180 天内退款，将扣除 50% 违约金后返还剩余款项。</text>
						<view class="rule-item rule-item-line">
							<text class="rule-item-text">4）退款请点击</text>
							<text class="rule-link" @click="openRefundWindow">这里</text>
							<text class="rule-item-text">。</text>
						</view>
					</view>
				</block>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5MineInfo, h5RechargeOptions, h5RechargeCreate, h5RechargeConfirm } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			h5Logo: H5_APP_LOGO,
			rechargeReady: false,
			gateText: '正在校验…',
			packages: [],
			selectedId: '',
			loading: false,
			currentPackage: null
		};
	},
	computed: {
		canUpgrade() {
			const picked = this.packages.find((x) => x.id === this.selectedId);
			if (!picked) return false;
			if (!this.currentPackage) return true;
			return Number(picked.price) > Number(this.currentPackage.price);
		},
		payButtonText() {
			const picked = this.packages.find((x) => x.id === this.selectedId);
			if (!picked) return '立即充值';
			if (this.currentPackage && Number(picked.price) > Number(this.currentPackage.price)) {
				return `补差价升级（¥${Number(picked.price) - Number(this.currentPackage.price)}）`;
			}
			if (this.currentPackage && Number(picked.price) <= Number(this.currentPackage.price)) return '当前档位不可重复充值';
			return `立即充值（¥${picked.price}）`;
		}
	},
	onShow() {
		this.ensureAgreementAndLoad();
	},
	methods: {
		async ensureAgreementAndLoad() {
			this.rechargeReady = false;
			this.gateText = '正在校验…';
			const mine = await h5MineInfo();
			if (mine.code !== 0) {
				this.gateText = mine.message || '获取用户信息失败';
				uni.showToast({ title: this.gateText, icon: 'none' });
				setTimeout(() => {
					uni.navigateBack({
						fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' })
					});
				}, 400);
				return;
			}
			const m = mine.data && mine.data.merchant;
			if (!m || !String(m.agreementImg || '').trim()) {
				this.gateText = '需先签署优惠活动计划书';
				uni.showToast({ title: '请先签署优惠活动计划书', icon: 'none' });
				setTimeout(() => {
					uni.redirectTo({ url: '/pages/h5/mine/index' });
				}, 500);
				return;
			}
			this.rechargeReady = true;
			await this.loadOptions();
		},
		async loadOptions() {
			const res = await h5RechargeOptions();
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				if (res.code === 403 || res.needAgreement) {
					this.rechargeReady = false;
					setTimeout(() => uni.redirectTo({ url: '/pages/h5/mine/index' }), 400);
				}
				return;
			}
			this.packages = (res.data && res.data.packages) || [];
			this.currentPackage = res.data?.currentPackage || null;
			if (this.currentPackage) {
				const up = this.packages.find((x) => Number(x.price) > Number(this.currentPackage.price));
				this.selectedId = up ? up.id : this.currentPackage.id;
			} else {
				this.selectedId = this.packages[0] ? this.packages[0].id : '';
			}
		},
		async payNow() {
			if (!this.selectedId) return;
			this.loading = true;
			uni.showLoading({ title: '处理中...', mask: true });
			try {
				const res = await h5RechargeCreate(this.selectedId);
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
				uni.showModal({
					title: '充值成功',
					content: `订单号：${res.data.orderNo}\n本次支付：¥${res.data.paidAmount}\n已增加额度：${res.data.quotaAdded}`,
					showCancel: false
				});
				await this.loadOptions();
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
		openRefundWindow() {
			uni.navigateTo({ url: '/pages/h5/recharge-refund/index' });
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
	padding: 16px 16px calc(32px + env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
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
	color: rgba(203, 213, 225, 0.92);
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
	color: #f8fafc;
}

.sub {
	display: block;
	margin-top: 6px;
	color: rgba(203, 213, 225, 0.88);
	font-size: 12px;
}

.card {
	padding: 14px;
	margin-bottom: 14px;
}

.pkg {
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 14px;
	padding: 12px;
	margin-bottom: 10px;
	background: rgba(15, 23, 42, 0.25);
}

.pkg:last-child {
	margin-bottom: 0;
}

.pkg-active {
	border-color: rgba(129, 140, 248, 0.65);
	background: rgba(99, 102, 241, 0.18);
	box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.pkg-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.pkg-title {
	font-size: 16px;
	font-weight: 700;
	color: #f1f5f9;
}

.pkg-price {
	font-size: 18px;
	font-weight: 700;
	color: #fca5a5;
}

.pkg-tip {
	display: block;
	margin-top: 8px;
	color: rgba(203, 213, 225, 0.9);
	font-size: 12px;
	line-height: 1.5;
}

.pkg-upgrade {
	display: block;
	margin-top: 6px;
	color: #a5b4fc;
	font-size: 12px;
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

.rule-item-line {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
}

.rule-item-text {
	font-size: 12px;
	line-height: 1.65;
	color: rgba(254, 243, 199, 0.88);
}

.rule-link {
	font-size: 12px;
	line-height: 1.65;
	color: #60a5fa;
	text-decoration: underline;
	margin: 0 2px;
}
</style>
