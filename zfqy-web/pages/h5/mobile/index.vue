<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<view class="nav-back" @click="goBack">
				<text class="bi bi-chevron-left nav-back-ico"></text>
				<text class="nav-back-txt">返回</text>
			</view>
			<text class="nav-title">手机号</text>
			<text class="nav-placeholder"></text>
		</view>

		<view class="content">
			<view class="card h5-glass-panel">
				<text class="label">手机号码</text>
				<input
					class="input"
					type="number"
					maxlength="11"
					placeholder="请输入11位手机号"
					placeholder-class="ph"
					v-model="mobileInput"
				/>
				<text class="hint">请确认号码填写正确</text>
				<button class="btn-save" type="primary" :loading="saving" :disabled="saveDisabled" @click="save">保存</button>
			</view>
		</view>
	</view>
</template>

<script>
import { h5MineInfo, h5SetMobileDirect } from '@/pages/h5/common/api';
import { saveSession, getSession } from '@/pages/h5/common/session';

export default {
	data() {
		return {
			mobileInput: '',
			saving: false
		};
	},
	computed: {
		saveDisabled() {
			return this.saving || !/^1\d{10}$/.test(String(this.mobileInput || '').trim());
		}
	},
	onShow() {
		this.prefill();
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async prefill() {
			const s = getSession();
			if (s.mobile) {
				this.mobileInput = String(s.mobile);
				return;
			}
			const res = await h5MineInfo();
			if (res.code === 0 && res.data?.merchant?.mobile) {
				this.mobileInput = String(res.data.merchant.mobile);
			}
		},
		async save() {
			const m = String(this.mobileInput || '').trim();
			if (!/^1\d{10}$/.test(m)) {
				uni.showToast({ title: '请输入11位手机号', icon: 'none' });
				return;
			}
			this.saving = true;
			try {
				const res = await h5SetMobileDirect({ mobile: m });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '保存失败', icon: 'none' });
					return;
				}
				const mer = res.data?.merchant;
				if (mer) {
					saveSession({
						mobile: mer.mobile || m
					});
				}
				uni.showToast({ title: '已保存', icon: 'success' });
				setTimeout(() => uni.navigateBack(), 400);
			} finally {
				this.saving = false;
			}
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	background: transparent;
}

.nav-bar {
	position: relative;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 10px;
}

.nav-back {
	flex-shrink: 0;
}

.nav-title {
	flex: 1;
	text-align: center;
	font-size: 17px;
	font-weight: 700;
	color: #0f172a;
}

.nav-placeholder {
	min-width: 64px;
}

.content {
	position: relative;
	z-index: 1;
	padding: 8px 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.card {
	padding: 18px 16px 20px;
}

.label {
	display: block;
	font-size: 13px;
	color: #64748b;
	margin-bottom: 10px;
}

.input {
	width: 100%;
	height: 48px;
	padding: 0 14px;
	box-sizing: border-box;
	border-radius: 12px;
	background: #e2e8f0;
	border: 1px solid #e2e8f0;
	color: #0f172a;
	font-size: 17px;
	letter-spacing: 0.04em;
}

.ph {
	color: #64748b;
}

.hint {
	display: block;
	margin-top: 14px;
	font-size: 12px;
	line-height: 1.55;
	color: #64748b;
}

.btn-save {
	margin-top: 22px;
	border-radius: 999px;
	width: 100%;
}
</style>
