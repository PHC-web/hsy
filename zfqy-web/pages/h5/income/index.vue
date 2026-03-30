<template>
	<view class="page">
		<view class="header">
			<text class="title">收益中心</text>
			<text class="sub">金树送福，点击红包领取积分奖励</text>
		</view>

		<view class="tree-card">
			<view class="festival-glow"></view>
			<view class="tree-crown"></view>
			<view class="tree-trunk"></view>
			<view
				v-for="(item, idx) in packetViews"
				:key="item.id"
				class="packet"
				:style="{ left: item.left + '%', top: item.top + '%' }"
				@click="claimOne(item.id)"
			>
				<text class="packet-text">福</text>
				<text class="packet-money">¥{{ item.amount }}</text>
			</view>
			<view v-if="!packetViews.length" class="no-packet">暂无可领取红包</view>
		</view>

		<view class="bar">
			<text class="count">可领取 {{ packetViews.length }} 个</text>
			<button size="mini" type="primary" class="claim-all" @click="claimAll">一键领取</button>
		</view>

		<view class="tabbar">
			<view class="tab" @click="goHome">首页</view>
			<view class="tab active">收益</view>
			<view class="tab" @click="goMine">我的</view>
		</view>
	</view>
</template>

<script>
import { h5IncomeList, h5IncomeClaim, h5IncomeClaimAll } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			packets: []
		};
	},
	computed: {
		packetViews() {
			const basePos = [
				[20, 22], [35, 14], [50, 18], [65, 15], [78, 24],
				[25, 35], [40, 30], [55, 33], [70, 36], [18, 48],
				[32, 45], [47, 50], [62, 46], [76, 50], [24, 60],
				[38, 62], [52, 60], [66, 63], [80, 60], [47, 72]
			];
			return (this.packets || []).slice(0, 20).map((p, i) => ({
				...p,
				left: basePos[i][0],
				top: basePos[i][1]
			}));
		}
	},
	onShow() {
		this.loadPackets();
	},
	methods: {
		async loadPackets() {
			const res = await h5IncomeList();
			if (res.code === 0) {
				this.packets = (res.data && res.data.packets) || [];
			}
		},
		async claimOne(packetId) {
			const res = await h5IncomeClaim(packetId);
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '领取失败', icon: 'none' });
				return;
			}
			uni.showToast({ title: '领取成功', icon: 'success' });
			this.loadPackets();
		},
		async claimAll() {
			const res = await h5IncomeClaimAll();
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '领取失败', icon: 'none' });
				return;
			}
			uni.showToast({ title: `已领取${res.data.claimedCount}个`, icon: 'success' });
			this.loadPackets();
		},
		goHome() {
			uni.redirectTo({ url: '/pages/h5/home/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		}
	}
};
</script>

<style scoped>
.page {
	height: 100vh;
	overflow: hidden;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	padding: 16px 16px 72px;
	background: radial-gradient(circle at 50% 6%, #fee2e2, #fef2f2 34%, #fff7ed 68%, #fff1f2 100%);
}
.header { margin-bottom: 12px; }
.title { display: block; font-size: 24px; font-weight: 700; color: #991b1b; }
.sub { display: block; margin-top: 4px; font-size: 12px; color: #b91c1c; }
.tree-card {
	position: relative;
	flex: 1;
	min-height: 350px;
	border-radius: 16px;
	background: radial-gradient(circle at 50% 16%, #fecaca, #ef4444 46%, #b91c1c 100%);
	box-shadow: inset 0 18px 35px rgba(255, 255, 255, 0.18), 0 12px 28px rgba(153, 27, 27, 0.28);
	overflow: hidden;
}
.festival-glow {
	position: absolute;
	left: 50%;
	top: -15%;
	transform: translateX(-50%);
	width: 92%;
	height: 55%;
	background: radial-gradient(circle, rgba(253, 224, 71, 0.55), rgba(253, 224, 71, 0));
}
.tree-crown {
	position: absolute;
	left: 50%;
	top: 12%;
	transform: translateX(-50%);
	width: 72%;
	height: 58%;
	border-radius: 55% 55% 45% 45%;
	background: radial-gradient(circle at 40% 25%, #fde68a, #f59e0b 48%, #b45309 95%);
}
.tree-trunk {
	position: absolute;
	left: 50%;
	bottom: 0;
	transform: translateX(-50%);
	width: 56px;
	height: 144px;
	border-radius: 14px 14px 0 0;
	background: linear-gradient(180deg, #9a3412, #7c2d12);
}
.packet {
	position: absolute;
	transform: translate(-50%, -50%);
	width: 46px;
	height: 58px;
	border-radius: 10px 10px 16px 16px;
	background: linear-gradient(180deg, #ef4444, #b91c1c);
	box-shadow: 0 4px 14px rgba(127, 29, 29, 0.52);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}
.packet-text { color: #fde68a; font-size: 12px; font-weight: 700; line-height: 1; }
.packet-money { color: #fff7ed; font-size: 9px; margin-top: 4px; }
.no-packet { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: #fff; font-size: 14px; background: rgba(0,0,0,0.16); padding: 8px 14px; border-radius: 20px; }
.bar {
	margin-top: 12px;
	background: #fff7ed;
	border: 1px solid #fdba74;
	border-radius: 10px;
	padding: 10px 12px;
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.count { color: #111827; font-size: 13px; }
.claim-all { border-radius: 999px; background: #dc2626; border-color: #dc2626; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #e5e7eb; display: flex; height: 56px; }
.tab { flex: 1; text-align: center; line-height: 56px; color: #6b7280; font-size: 14px; }
.tab.active { color: #dc2626; font-weight: 600; }
</style>

