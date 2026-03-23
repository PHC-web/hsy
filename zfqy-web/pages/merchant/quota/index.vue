<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
		</view>
		<view class="uni-container">
			<view class="empty-page">
				<text class="empty-text">额度包管理功能开发中...</text>
			</view>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
export default {};
</script>

<style scoped>
.uni-container {
	padding: 10px;
	min-height: 80vh;
	display: flex;
	align-items: center;
	justify-content: center;
}

.empty-text {
	font-size: 16px;
	color: #999;
}
</style>

