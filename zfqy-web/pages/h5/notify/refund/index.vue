<template>
	<view class="page">
		<view class="card">
			<text class="title">退款结果异步通知地址</text>
			<text class="url">{{ url || '未配置 WX_PAY_REFUND_NOTIFY_URL' }}</text>
			<button class="btn" :disabled="!url" @click="copyUrl">复制地址</button>
		</view>
	</view>
</template>

<script>
import { h5RechargeOptions } from '@/pages/h5/common/api';

export default {
	data() {
		return { url: '' };
	},
	onShow() {
		this.load();
	},
	methods: {
		async load() {
			const res = await h5RechargeOptions();
			if (res.code === 0) {
				this.url = res.data?.notifyUrls?.refund || '';
			}
		},
		copyUrl() {
			if (!this.url) return;
			uni.setClipboardData({ data: this.url, success: () => uni.showToast({ title: '已复制', icon: 'success' }) });
		}
	}
};
</script>

<style scoped>
.page { min-height: 100vh; padding: 16px; background: #f8fafc; box-sizing: border-box; }
.card { background: #fff; border-radius: 12px; padding: 14px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }
.title { display: block; font-size: 16px; font-weight: 700; color: #111827; }
.url { display: block; margin-top: 10px; font-size: 13px; line-height: 1.5; color: #334155; word-break: break-all; }
.btn { margin-top: 14px; border-radius: 999px; }
</style>
