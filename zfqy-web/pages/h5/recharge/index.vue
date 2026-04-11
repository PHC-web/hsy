<template>
	<view class="page">
		<view v-if="!rechargeReady" class="gate-wrap">
			<image class="h5-brand-logo h5-brand-logo--hero gate-logo" :src="h5Logo" mode="aspectFit" />
			<text class="gate-text">{{ gateText }}</text>
		</view>
		<block v-else>
		<view class="hero">
			<image class="h5-brand-logo h5-brand-logo--hero" :src="h5Logo" mode="aspectFit" />
			<text class="title">额度充值</text>
			<text class="sub">选择充值套餐，获取交易补贴额度</text>
		</view>
		<view class="timer-card">
			<text class="timer-title">退款周期</text>
			<text class="timer-main" v-if="countdown.phase === 'window'">可退款窗口倒计时：{{ countdown.refundDaysLeft }} 天</text>
			<text class="timer-main" v-else>距离可退款窗口：{{ countdown.days180Left }} 天</text>
			<text class="timer-sub" v-if="countdown.phase === 'window'">请在窗口期内处理；超时将自动进入下一轮 180 天周期。</text>
			<text class="timer-sub" v-else>到期后会开放 3 天可退款窗口；若未处理，将自动顺延并重新计算 180 天。</text>
		</view>
		<view class="card">
			<view v-for="item in packages" :key="item.id" class="pkg" :class="selectedId === item.id ? 'pkg-active' : ''" @click="selectedId = item.id">
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
			<button class="btn-refund" :disabled="loading" @click="refundReset">退款并重置数据</button>
		</view>
		<view class="rule-card">
			<text class="rule-title">退款规则说明</text>
			<text class="rule-item">1）重置后 180 天内无法退款。</text>
			<text class="rule-item">2）满 180 天后，系统会自动给客户 3 天提取时间；若客户在第 181~183 天未提取，额度将自动预存并顺延，系统继续配置对应额度，以此类推。</text>
			<text class="rule-item">3）如客户执意在 180 天内退款，将扣除 50% 违约金后返还剩余款项。</text>
		</view>
		</block>
	</view>
</template>

<script>
import { h5MineInfo, h5RechargeOptions, h5RechargeCreate, h5RechargeConfirm, h5RefundReset } from '@/pages/h5/common/api';
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
			currentPackage: null,
			countdown: {
				phase: 'lock',
				days180Left: 180,
				refundDaysLeft: 0
			}
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
			this.countdown = res.data?.countdown || this.countdown;
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
					content: `订单号：${res.data.orderNo}\n本次支付：¥${res.data.paidAmount}\n已增加额度：${res.data.quotaAdded}\n退款周期已重置为180天`,
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
		refundReset() {
			uni.showModal({
				title: '确认退款重置',
				content:
					'退款规则：1) 重置后180天内无法退款；2) 满180天后提供3天提取窗口，181~183天未提取将自动预存顺延；3) 180天内执意退款将扣除50%违约金。\\n\\n继续提交退款重置？',
				success: async (r) => {
					if (!r.confirm) return;
					this.loading = true;
					uni.showLoading({ title: '处理中...', mask: true });
					try {
						const res = await h5RefundReset('用户在H5发起退款重置');
						if (res.code !== 0) {
							uni.showToast({ title: res.message || '操作失败', icon: 'none' });
							return;
						}
						uni.showModal({
							title: '已完成',
							content: `退款单号：${res.data.refundNo}\n原金额：¥${res.data.refundAmount}\n违约金：¥${res.data.penaltyAmount}\n实际返还：¥${res.data.finalRefundAmount}`,
							showCancel: false
						});
						await this.loadOptions();
					} finally {
						this.loading = false;
						uni.hideLoading();
					}
				}
			});
		}
	}
};
</script>

<style src="@/common/h5-brand.css"></style>
<style scoped>
.page { min-height: 100vh; background: #f8fafc; padding: 16px; box-sizing: border-box; }
.gate-wrap {
	min-height: 50vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 24px;
}
.gate-logo {
	margin-bottom: 16px;
}

.gate-text {
	font-size: 14px;
	color: #64748b;
	text-align: center;
}
.hero { margin-bottom: 12px; text-align: center; }
.title { display: block; font-size: 24px; font-weight: 700; color: #111827; }
.sub { display: block; margin-top: 4px; color: #64748b; font-size: 12px; }
.timer-card { margin-bottom: 12px; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }
.timer-title { display: block; font-size: 13px; color: #64748b; }
.timer-main { display: block; margin-top: 4px; font-size: 16px; font-weight: 700; color: #0f172a; }
.timer-sub { display: block; margin-top: 6px; font-size: 12px; color: #475569; line-height: 1.5; }
.card { background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }
.pkg { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.pkg:last-child { margin-bottom: 0; }
.pkg-active { border-color: #2563eb; background: #eff6ff; }
.pkg-head { display: flex; justify-content: space-between; align-items: center; }
.pkg-title { font-size: 16px; font-weight: 700; color: #111827; }
.pkg-price { font-size: 18px; font-weight: 700; color: #dc2626; }
.pkg-tip { display: block; margin-top: 6px; color: #4b5563; font-size: 12px; line-height: 1.5; }
.pkg-upgrade { display: block; margin-top: 4px; color: #1d4ed8; font-size: 12px; }
.actions { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.btn-pay { border-radius: 999px; }
.btn-refund { border-radius: 999px; background: #fff; border: 1px solid #e5e7eb; color: #111827; }
.rule-card { margin-top: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 12px; }
.rule-title { display: block; font-size: 14px; font-weight: 700; color: #9a3412; margin-bottom: 6px; }
.rule-item { display: block; font-size: 12px; line-height: 1.6; color: #7c2d12; margin-top: 4px; }
</style>
