<template>
	<view class="page">
		<view class="card">
			<text class="title">兑换码兑换</text>
			<input v-model.trim="code" class="ipt" placeholder="请输入兑换码" />
			<button class="btn" type="primary" :loading="loading" @click="submit">立即兑换</button>
		</view>
	</view>
</template>

<script>
import { h5ExchangeCouponRedeem, h5RefreshHomeCache } from '@/pages/h5/common/api';
export default {
	data() {
		return { code: '', loading: false };
	},
	methods: {
		async submit() {
			const code = String(this.code || '').trim().toUpperCase();
			if (!code) return uni.showToast({ title: '请输入兑换码', icon: 'none' });
			this.loading = true;
			try {
				const res = await h5ExchangeCouponRedeem({ code });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '兑换失败', icon: 'none' });
					return;
				}
				await h5RefreshHomeCache();
				uni.showToast({ title: '兑换成功', icon: 'success' });
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
.title { display:block; color:#fff; font-size:16px; font-weight:700; margin-bottom:12px; }
.ipt { height: 40px; border-radius: 8px; background: rgba(0,0,0,.2); color:#fff; padding: 0 10px; }
.btn { margin-top: 12px; }
</style>
