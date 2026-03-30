<template>
	<view class="page">
		<view class="hero">
			<text class="title">慧收盈</text>
			<text class="sub">公众号服务号商户中心</text>
		</view>

		<view class="card">
			<view class="field">
				<text class="label">微信昵称</text>
				<input v-model="form.nickname" class="input" maxlength="40" placeholder="请输入微信昵称（Mock）" />
			</view>
			<view class="field">
				<text class="label">头像URL</text>
				<input v-model="form.avatar" class="input" maxlength="500" placeholder="请输入头像地址（Mock）" />
			</view>
			<view class="field">
				<text class="label">手机号</text>
				<input v-model="form.mobile" class="input" maxlength="11" type="number" placeholder="请输入手机号（Mock）" />
			</view>
			<button class="btn-primary" type="primary" @click="submitAuth">进入并同步信息</button>
		</view>

		<uni-popup ref="bindPopup" type="center">
			<view class="popup">
				<text class="popup-title">绑定机具</text>
				<text class="popup-tip">请输入机具号码完成绑定</text>
				<input v-model="deviceId" class="input" maxlength="50" placeholder="请输入机具号码" />
				<view class="popup-actions">
					<button size="mini" @click="$refs.bindPopup.close()">稍后</button>
					<button size="mini" type="primary" @click="submitBind">立即绑定</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import { h5AuthSync, h5BindMachine } from '@/pages/h5/common/api';
import { saveSession } from '@/pages/h5/common/session';

export default {
	data() {
		return {
			form: {
				nickname: '',
				avatar: '',
				mobile: ''
			},
			deviceId: '',
			merchantId: ''
		};
	},
	methods: {
		async submitAuth() {
			if (!/^1\d{10}$/.test(String(this.form.mobile || ''))) {
				uni.showToast({ title: '请输入11位手机号', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '登录中...', mask: true });
			try {
				const res = await h5AuthSync({
					authMode: 'mock',
					wxNickname: this.form.nickname || '微信用户',
					wxAvatar: this.form.avatar || '',
					mobile: this.form.mobile
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '登录失败', icon: 'none' });
					return;
				}
				const m = res.data && res.data.merchant;
				this.merchantId = m && m.id;
				saveSession({
					merchantId: m && m.id,
					userId: m && m.userId,
					wxNickname: m && m.wxNickname,
					wxAvatar: m && m.wxAvatar,
					mobile: m && m.mobile
				});
				if (res.data && res.data.needBind) {
					this.$refs.bindPopup.open();
				} else {
					uni.redirectTo({ url: '/pages/h5/home/index' });
				}
			} finally {
				uni.hideLoading();
			}
		},
		async submitBind() {
			if (!this.deviceId) {
				uni.showToast({ title: '请输入机具号码', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '绑定中...', mask: true });
			try {
				const res = await h5BindMachine({ deviceId: this.deviceId });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '绑定失败', icon: 'none' });
					return;
				}
				const m = res.data && res.data.merchant;
				saveSession({
					merchantId: m && m.id,
					userId: m && m.userId,
					deviceId: m && m.deviceId,
					brandName: m && m.brandName
				});
				uni.showToast({ title: '绑定成功', icon: 'success' });
				this.$refs.bindPopup.close();
				setTimeout(() => uni.redirectTo({ url: '/pages/h5/home/index' }), 350);
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>
.page { min-height: 100vh; background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 60%); padding: 30px 16px; }
.hero { margin-bottom: 20px; }
.title { display: block; font-size: 28px; font-weight: 700; color: #0f172a; }
.sub { display: block; margin-top: 6px; color: #64748b; font-size: 13px; }
.card { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); }
.field { margin-bottom: 12px; }
.label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.input { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; height: 38px; padding: 0 10px; font-size: 14px; }
.btn-primary { margin-top: 8px; border-radius: 999px; }
.popup { width: 300px; background: #fff; border-radius: 12px; padding: 16px; }
.popup-title { display: block; font-size: 16px; font-weight: 700; color: #111827; }
.popup-tip { display: block; font-size: 12px; color: #6b7280; margin: 6px 0 10px; }
.popup-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
</style>

