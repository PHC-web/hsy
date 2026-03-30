<template>
	<view class="page">
		<view class="header">
			<text class="title">首页</text>
			<text class="tip">该页面按需求暂时留空</text>
		</view>
		<view class="empty-card">
			<text class="empty-text">敬请期待更多功能</text>
		</view>
		<view class="tabbar">
			<view class="tab active">首页</view>
			<view class="tab" @click="goIncome">收益</view>
			<view class="tab" @click="goMine">我的</view>
		</view>
	</view>
</template>

<script>
export default {
	methods: {
		goIncome() {
			uni.redirectTo({ url: '/pages/h5/income/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		}
	}
};
</script>

<style scoped>
.page { min-height: 100vh; background: #f8fafc; padding: 16px; padding-bottom: 80px; box-sizing: border-box; }
.header { margin-bottom: 12px; }
.title { display: block; font-size: 24px; font-weight: 700; color: #0f172a; }
.tip { display: block; margin-top: 4px; color: #64748b; font-size: 13px; }
.empty-card { background: #fff; border-radius: 12px; min-height: 260px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }
.empty-text { color: #94a3b8; font-size: 14px; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #e5e7eb; display: flex; height: 56px; }
.tab { flex: 1; text-align: center; line-height: 56px; color: #6b7280; font-size: 14px; }
.tab.active { color: #2563eb; font-weight: 600; }
</style>

