<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
		</view>
		<view class="uni-container">
			<view class="empty-page">
				<text class="empty-text">风控管理功能开发中...</text>
			</view>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
export default {
};
</script>

<style scoped>
.fix-top-window {
	padding-top: 44px;
}

.uni-header {
	background-color: #fff;
	padding: 10px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 999;
}

.uni-container {
	padding: 10px;
	min-height: 80vh;
	display: flex;
	align-items: center;
	justify-content: center;
}

.empty-page {
	text-align: center;
	padding: 40px;
}

.empty-text {
	font-size: 16px;
	color: #999;
}
</style>