<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>
		<view class="wrap">
			<view class="card h5-glass-panel">
				<image class="logo h5-brand-logo h5-brand-logo--hero" :src="h5Logo" mode="aspectFit" />
				<text class="ok">充值成功</text>
				<text class="title">恭喜你成为{{ tierName }}</text>
				<text class="desc">会员权益已生效，快去首页查看最新额度与奖励。</text>

				<view class="meta">
					<text class="meta-row">订单号：{{ orderNo || '-' }}</text>
					<text class="meta-row">本次支付：¥{{ paidAmount }}</text>
					<text class="meta-row">新增额度：{{ quotaAdded }}</text>
				</view>
				<button class="btn" type="primary" @click="goHome">确认，返回首页</button>
			</view>
		</view>
	</view>
</template>

<script>
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	data() {
		return {
			h5Logo: H5_APP_LOGO,
			tier: 'normal',
			tierName: '会员',
			paidAmount: '0.00',
			quotaAdded: '0',
			orderNo: ''
		};
	},
	onLoad(query) {
		const q = query || {};
		this.tier = String(q.tier || 'normal');
		this.tierName = String(q.tierName || '会员');
		this.paidAmount = String(q.paid || '0.00');
		this.quotaAdded = String(q.quota || '0');
		this.orderNo = String(q.orderNo || '');
	},
	methods: {
		goHome() {
			uni.redirectTo({ url: '/pages/h5/home/index' });
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
}
.wrap {
	position: relative;
	z-index: 1;
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 18px;
	box-sizing: border-box;
}
.card {
	width: 100%;
	max-width: 420px;
	border-radius: 20px;
	padding: 20px 16px 18px;
	text-align: center;
}
.logo {
	margin-bottom: 4px;
}
.ok {
	display: block;
	font-size: 13px;
	color: #86efac;
	font-weight: 700;
	letter-spacing: 0.06em;
}
.title {
	display: block;
	margin-top: 8px;
	font-size: 24px;
	font-weight: 800;
	color: #f8fafc;
	line-height: 1.35;
}
.desc {
	display: block;
	margin-top: 8px;
	font-size: 12px;
	color: rgba(203, 213, 225, 0.9);
	line-height: 1.55;
}
.meta {
	margin-top: 14px;
	padding: 12px;
	border-radius: 12px;
	background: rgba(15, 23, 42, 0.36);
	border: 1px solid rgba(255, 255, 255, 0.12);
	text-align: left;
}
.meta-row {
	display: block;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.95);
	line-height: 1.7;
	word-break: break-all;
}
.btn {
	margin-top: 16px;
	border-radius: 999px;
	box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
}
</style>
