<template>
	<view class="page">
		<view class="card">
			<text class="title">兑换码兑换</text>
			<text v-if="isSilverRenewal" class="sub">白银会员续兑：会员期将更新，可提现额度重置为 1000 元（非累加）</text>
			<input v-model.trim="code" class="ipt" placeholder="请输入兑换码" />
			<button class="btn" type="primary" :loading="loading" @click="submit">立即兑换</button>
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

<style scoped>
.page { min-height: 100vh; padding: 24px 16px; box-sizing: border-box; background: #0f172a; }
.card { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); border-radius: 12px; padding: 16px; }
.title { display:block; color:#fff; font-size:16px; font-weight:700; margin-bottom:8px; }
.sub { display:block; color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:12px; }
.ipt { height: 40px; border-radius: 8px; background: rgba(0,0,0,.2); color:#fff; padding: 0 10px; }
.btn { margin-top: 12px; }
</style>
