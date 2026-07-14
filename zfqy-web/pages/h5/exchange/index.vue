<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>
		<view class="page-inner">
			<view class="nav-bar">
				<view class="nav-back" @click="goBack">
					<text class="bi bi-chevron-left nav-back-ico"></text>
					<text class="nav-back-txt">返回</text>
				</view>
				<text class="nav-title">兑换码</text>
				<text class="nav-placeholder"></text>
			</view>
			<view class="card h5-glass-panel">
				<text class="title">兑换码兑换</text>
				<text v-if="isSilverRenewal" class="sub">白银会员续兑：会员期将更新，可提现额度重置为 1000 元（非累加）</text>
				<input v-model.trim="code" class="ipt h5-glass-input" placeholder="请输入兑换码" />
				<button class="btn" type="primary" :loading="loading" @click="submit">立即兑换</button>
			</view>
		</view>
		<h5-agreement-sign-sheet ref="agreementSheet" />
	</view>
</template>

<script>
import { h5ExchangeCouponRedeem, h5RefreshHomeCache, h5MineInfoCached } from '@/pages/h5/common/api';
import H5AgreementSignSheet from '@/pages/h5/components/H5AgreementSignSheet.vue';

export default {
	components: { H5AgreementSignSheet },
	data() {
		return { code: '', loading: false, isSilverRenewal: false };
	},
	onShow() {
		this.loadRenewalHint();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async loadRenewalHint() {
			try {
				const res = await h5MineInfoCached({ maxAgeMs: 60 * 1000 });
				if (res.code !== 0) return;
				const d = res.data || {};
				const m = d.merchant || {};
				const silver = d.silver || {};
				const ra = Number(m.rechargeAmount || 0);
				this.isSilverRenewal =
					ra <= 0 && (!!silver.active || String(m.membershipName || '').includes('白银'));
			} catch (e) {}
		},
		async submit() {
			const code = String(this.code || '').trim().toUpperCase();
			if (!code) return uni.showToast({ title: '请输入兑换码', icon: 'none' });
			const sheet = this.$refs.agreementSheet;
			if (!sheet) return;
			const agreed = await sheet.ensureSigned();
			if (!agreed) return;
			this.loading = true;
			try {
				const res = await h5ExchangeCouponRedeem({ code });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '兑换失败', icon: 'none' });
					return;
				}
				await h5RefreshHomeCache();
				uni.showToast({ title: res.message || '兑换成功', icon: 'success' });
				setTimeout(() => {
					uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
				}, 300);
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
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	background: transparent;
}
.page-inner {
	position: relative;
	z-index: 1;
	padding: 0 16px 24px;
	box-sizing: border-box;
}
.nav-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 0 12px;
}
.nav-title {
	color: #0f172a;
	font-size: 17px;
	font-weight: 700;
}
.nav-placeholder {
	min-width: 72px;
}
.card {
	padding: 20px 16px;
}
.title {
	display: block;
	color: #0f172a;
	font-size: 18px;
	font-weight: 700;
	margin-bottom: 8px;
}
.sub {
	display: block;
	color: #64748b;
	font-size: 13px;
	line-height: 1.5;
	margin-bottom: 16px;
}
.ipt {
	height: 44px;
	padding: 0 12px;
	box-sizing: border-box;
}
.btn {
	margin-top: 16px;
	border-radius: 999px;
}
</style>
