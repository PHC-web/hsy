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
			<text class="nav-title">奖励提现</text>
			<text class="nav-placeholder"></text>
		</view>

		<view class="scroll">
			<view class="inner">
				<view class="card h5-glass-panel">
					<text class="card-label">当前可兑换积分</text>
					<text class="card-points">{{ info.redeemablePoints }} 分</text>
					<text class="card-sub">会员类型：{{ info.membershipName }} · 1 积分 = 1 元</text>
					<text v-if="!info.inBusinessHours" class="card-warn">{{ offHoursHint }}</text>
				</view>

				<view class="card h5-glass-panel">
					<text class="field-label">兑换积分（整数）</text>
					<view class="safe-input-wrap">
						<input
							v-model="pointsInput"
							class="safe-input-native"
							type="text"
							inputmode="numeric"
							placeholder="请输入要兑换的积分"
							confirm-type="done"
						/>
					</view>
					<text class="field-hint">本次范围：{{ info.minPoints }}～{{ info.maxPoints }} 分 / 笔</text>
				</view>

				<view class="card h5-glass-panel rules">
					<text class="rules-title">兑换说明</text>
					<text class="rules-item">1）单笔手续费 {{ info.feePerOrderYuan }} 元，在兑换积分对应金额中扣除。</text>
					<text class="rules-item">2）实际打款金额以适用税费政策及审核结果为准，此处「预估到账」仅供参考。</text>
					<text class="rules-item">3）办理时间：工作日 9:00–18:00（北京时间）。</text>
				</view>

				<button
					class="submit-btn"
					type="primary"
					:disabled="submitDisabled"
					:loading="submitting"
					@click="submit"
				>
					提交申请
				</button>
				<view class="bottom-spacer"></view>
			</view>
		</view>
	</view>
</template>

<script>
import { h5WithdrawInfo, h5WithdrawApply, h5RefreshHomeCache } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			loading: false,
			submitting: false,
			pointsInput: '',
			info: {
				redeemablePoints: 0,
				isRechargeMember: false,
				membershipName: '-',
				minPoints: 30,
				maxPoints: 200,
				feePerOrderYuan: 3,
				inBusinessHours: true
			}
		};
	},
	computed: {
		memberMin() {
			return 10;
		},
		nonMemberMin() {
			return 30;
		},
		offHoursHint() {
			return '当前非提现办理时间。请在周一至周五 9:00–18:00（北京时间）提交。';
		},
		previewPoints() {
			const n = parseInt(String(this.pointsInput).trim(), 10);
			return Number.isFinite(n) && n > 0 ? n : 0;
		},
		previewPayable() {
			const p = this.previewPoints;
			if (!p) return '0.00';
			const v = p - this.info.feePerOrderYuan;
			return v > 0 ? v.toFixed(2) : '0.00';
		},
		submitDisabled() {
			if (this.loading || this.submitting) return true;
			if (!this.info.inBusinessHours) return true;
			const n = this.previewPoints;
			if (!n) return true;
			if (n < this.info.minPoints || n > this.info.maxPoints) return true;
			if (n > this.info.redeemablePoints) return true;
			if (n - this.info.feePerOrderYuan <= 0) return true;
			return false;
		}
	},
	onShow() {
		this.loadInfo();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async loadInfo() {
			this.loading = true;
			try {
				const res = await h5WithdrawInfo();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.info = Object.assign({}, this.info, {
					redeemablePoints: Number(d.redeemablePoints || 0),
					isRechargeMember: !!d.isRechargeMember,
					membershipName: d.membershipName || '-',
					minPoints: Number(d.minPoints != null ? d.minPoints : 30),
					maxPoints: Number(d.maxPoints != null ? d.maxPoints : 200),
					feePerOrderYuan: Number(d.feePerOrderYuan != null ? d.feePerOrderYuan : 3),
					inBusinessHours: !!d.inBusinessHours
				});
			} finally {
				this.loading = false;
			}
		},
		async submit() {
			if (this.submitDisabled) return;
			const n = this.previewPoints;
			uni.showLoading({ title: '提交中…', mask: true });
			this.submitting = true;
			try {
				const res = await h5WithdrawApply({ points: n });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '提交失败', icon: 'none' });
					return;
				}
				await h5RefreshHomeCache();
				const no = res.data && res.data.withdrawNo;
				uni.showModal({
					title: '提交成功',
					content: no ? `提现单号：${no}\n请留意财务管理中的进度。` : '请留意财务管理中的进度。',
					showCancel: false,
					success: (r) => {
						this.pointsInput = '';
						if (r && r.confirm) {
							uni.redirectTo({ url: '/pages/h5/finance/index' });
						}
					}
				});
			} finally {
				this.submitting = false;
				uni.hideLoading();
			}
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
	min-height: 0;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
}
.inner {
	padding: 0 16px 24px;
}

.card {
	padding: 16px 18px;
	margin-bottom: 14px;
}
.card-label {
	display: block;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 8px;
}
.card-points {
	display: block;
	font-size: 28px;
	font-weight: 800;
	color: #fde68a;
	letter-spacing: 0.02em;
}
.card-sub {
	display: block;
	margin-top: 10px;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.9);
	line-height: 1.5;
}
.card-warn {
	display: block;
	margin-top: 12px;
	font-size: 12px;
	color: #fca5a5;
	line-height: 1.45;
}

.field-label {
	display: block;
	font-size: 13px;
	font-weight: 600;
	color: #e2e8f0;
	margin-bottom: 10px;
}
.field-input {
	width: 100%;
}
.safe-input-wrap {
	width: 100%;
	background: #ffffff;
	border: 1px solid #cbd5e1;
	border-radius: 10px;
	padding: 0 12px;
	box-sizing: border-box;
	position: relative;
	z-index: 5;
}
.safe-input-native {
	width: 100%;
	height: 42px;
	line-height: 42px;
	font-size: 16px;
	color: #0f172a;
	caret-color: #0f172a;
	-webkit-text-fill-color: #0f172a;
	background: transparent;
	border: 0;
	outline: none;
}
.safe-input-native::placeholder {
	color: #94a3b8;
	-webkit-text-fill-color: #94a3b8;
}
.field-hint {
	display: block;
	margin-top: 10px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.95);
}

.summary .sum-line {
	display: block;
	font-size: 13px;
	color: rgba(226, 232, 240, 0.9);
	margin-bottom: 6px;
}
.summary .sum-strong {
	margin-top: 8px;
	font-size: 15px;
	font-weight: 700;
	color: #a7f3d0;
}

.rules-title {
	display: block;
	font-size: 14px;
	font-weight: 700;
	color: #f8fafc;
	margin-bottom: 10px;
}
.rules-item {
	display: block;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.92);
	line-height: 1.55;
	margin-bottom: 8px;
}

.submit-btn {
	margin-top: 8px;
	border-radius: 999px;
	font-weight: 600;
}
.bottom-spacer {
	height: 24px;
}
</style>
