<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<text class="nav-back" @click="goBack">‹ 返回</text>
			<text class="nav-title">规则说明</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="inner">
				<view class="h5-glass-panel card">
					<text class="card-title">主营业务</text>
					<view class="bullet-list">
						<text class="bullet">1. 为商户提供收款码牌服务与交易管理能力，支持日常经营收款。</text>
						<text class="bullet">2. 提供额度包套餐，按档位配置对应的交易权益额度。</text>
						<text class="bullet">3. 提供积分激励与提现能力，商户可在满足规则后申请积分兑换提现。</text>
					</view>
				</view>

				<view class="h5-glass-panel card">
					<text class="card-title">活动时间与参与对象</text>
					<view class="bullet-list">
						<text class="bullet">1. 活动周期：长期有效（若有阶段调整，以平台公告时间为准）。</text>
						<text class="bullet">2. 参与对象：已完成实名认证并绑定设备的正常经营商户。</text>
						<text class="bullet">3. 生效条件：签署活动计划书后，按页面指引完成充值/参与。</text>
					</view>
				</view>

				<view class="h5-glass-panel card">
					<text class="card-title">活动玩法与奖励内容</text>
					<view class="bullet-list">
						<text class="bullet">1. 商户可按档位升级额度包，获得对应交易权益额度。</text>
						<text class="bullet">2. 在真实交易达标条件下，系统按规则分期释放积分奖励。</text>
						<text class="bullet">3. 积分可用于平台内合规场景兑换，满足提现条件后可申请奖励提现。</text>
						<text class="bullet">4. 奖励发放以平台实时风控、审核结果和页面展示为准。</text>
					</view>
				</view>

				<view class="h5-glass-panel card">
					<text class="card-title">退款规则</text>
					<view class="bullet-list">
						<text class="bullet">1. 退款金额以当前账号“充值金额”为准，到账后会清空对应充值权益额度。</text>
						<text class="bullet">2. 退款通过微信商家转账流程发起，具体是否需要审核以平台当前配置为准。</text>
						<text class="bullet">3. 退款成功后，会员档位会回到普通会员，充值相关额度字段重置。</text>
						<text class="bullet">4. 实际到账金额若涉及规则扣减（如违约金），以退款页面展示与结果为准。</text>
					</view>
				</view>

				<view class="h5-glass-panel card">
					<text class="card-title">用户如何参与活动并领取资金（完整步骤）</text>
					<view class="step-list">
						<view v-for="(item, idx) in steps" :key="idx" class="step-item">
							<view class="step-no">{{ idx + 1 }}</view>
							<text class="step-text">{{ item }}</text>
						</view>
					</view>
					<view class="quick-actions">
						<view class="quick-btn" @click="goRecharge">去额度包</view>
						<view class="quick-btn" @click="goRefund">去退款与周期</view>
						<view class="quick-btn" @click="goWithdraw">去奖励提现</view>
					</view>
				</view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
export default {
	data() {
		return {
			steps: [
				'进入【我的】-【额度包】，确认当前充值档位与权益信息。',
				'如需退款，进入【退款与周期】页面发起退款申请，并按页面提示完成确认。',
				'若提示需审核，请等待平台审核通过后继续微信收款确认。',
				'退款成功后，返回【我的】页面查看充值金额与会员状态是否已更新。',
				'如有可提现积分，进入【我的】-【财务管理】或【奖励提现】发起提现申请。',
				'在微信侧完成收款确认后，提现状态会更新为已到账，具体到账以微信和银行处理结果为准。'
			]
		};
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		goRecharge() {
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		},
		goRefund() {
			uni.navigateTo({ url: '/pages/h5/recharge-refund/index' });
		},
		goWithdraw() {
			uni.navigateTo({ url: '/pages/h5/withdraw/index' });
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
	display: flex;
	flex-direction: column;
}

.nav-bar {
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 8px;
}

.nav-back {
	color: rgba(226, 232, 240, 0.95);
	font-size: 15px;
	min-width: 64px;
}

.nav-title {
	color: #f8fafc;
	font-size: 17px;
	font-weight: 700;
}

.nav-placeholder {
	min-width: 64px;
}

.scroll {
	flex: 1;
	height: 0;
	min-height: 0;
	width: 100%;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
}

.inner {
	padding: 0 12px 20px;
}

.card {
	padding: 14px 14px 12px;
	margin-bottom: 12px;
}

.card-title {
	display: block;
	font-size: 15px;
	font-weight: 700;
	color: #f8fafc;
	margin-bottom: 8px;
}

.bullet-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.bullet {
	display: block;
	font-size: 13px;
	line-height: 1.65;
	color: rgba(226, 232, 240, 0.94);
}

.step-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.step-item {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.step-no {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	flex-shrink: 0;
	text-align: center;
	line-height: 20px;
	font-size: 12px;
	font-weight: 700;
	color: #0f172a;
	background: #a7f3d0;
	margin-top: 1px;
}

.step-text {
	flex: 1;
	font-size: 13px;
	line-height: 1.65;
	color: rgba(226, 232, 240, 0.94);
}

.quick-actions {
	display: flex;
	gap: 8px;
	margin-top: 12px;
}

.quick-btn {
	flex: 1;
	height: 34px;
	line-height: 34px;
	text-align: center;
	border-radius: 8px;
	font-size: 12px;
	font-weight: 600;
	color: #0f172a;
	background: #a7f3d0;
}
</style>
