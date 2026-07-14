<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<scroll-view class="auth-scroll" scroll-y :show-scrollbar="false">
			<view class="auth-inner">
				<view class="hero">
					<image class="h5-brand-logo h5-brand-logo--hero" :src="h5Logo" mode="aspectFit" />
					<text class="title">慧收盈</text>
					<text class="sub">公众号服务号商户中心</text>
				</view>

				<view v-if="wechatLoading" class="card h5-glass-panel wechat-wait">
					<text class="wait-text">{{ wechatWaitText }}</text>
				</view>

				<view v-else-if="pendingBindDevice" class="card h5-glass-panel gate-card">
					<text class="gate-title">绑定机具</text>
					<text class="gate-tip">请先绑定机具号后即可进入慧收盈系统。</text>
					<input v-model="deviceId" class="input h5-glass-input gate-input" maxlength="50" placeholder="请输入机具号码" />
					<button class="btn-primary" type="primary" @click="submitBind">绑定并进入</button>
					<button v-if="showDevTools" class="btn-secondary" @click="submitTestLogin">改用 test 账号一键登录</button>
				</view>

				<view v-else-if="!isWechat" class="browser-login">
					<view class="card h5-glass-panel tip-card">
						<text class="tip-title">请使用微信打开</text>
						<text class="tip-text">
							商户中心需在微信内登录使用。请打开微信，从「慧收盈」公众号菜单进入；也可将本页链接复制到微信聊天中，再点击链接打开。
						</text>
						<button class="btn-outline" @click="copyPageLink">复制页面链接</button>
					</view>

					<view v-if="showDevTools" class="card h5-glass-panel mock-dev">
						<text class="mock-title">本地调试 · test 账号</text>
						<text class="mock-desc">
							固定账号 test（openid: mock_dev_test）。首次需绑定机具号，之后一键登录直接进入，不会再新建商户。
						</text>
						<button class="btn-primary" type="primary" @click="submitTestLogin">一键登录（test）</button>
					</view>

					<view v-if="showDevTools" class="card h5-glass-panel mock-dev">
						<text class="mock-title">本地调试 · 自定义 Mock</text>
						<text class="mock-desc">可改昵称/头像；仍使用同一固定 openid，不会每次新建商户。</text>
						<view class="field">
							<text class="label">微信昵称</text>
							<input v-model="form.nickname" class="input h5-glass-input" maxlength="40" placeholder="昵称，默认 test" />
						</view>
						<view class="field">
							<text class="label">头像 URL</text>
							<input v-model="form.avatar" class="input h5-glass-input" maxlength="500" placeholder="头像地址，可空" />
						</view>
						<button class="btn-secondary" @click="submitAuth">Mock 同步登录</button>
					</view>

					<view v-if="showDevTools" class="card h5-glass-panel mock-dev">
						<text class="mock-title">本地调试 · 使用授权 code</text>
						<text class="mock-desc">
							在微信内完成一次授权后，地址栏会带有 ?code=（一次性、约 5 分钟内有效）。可复制整段 URL 或只粘贴 code，在下方提交以便在电脑浏览器里联调。
						</text>
						<view class="field">
							<text class="label">code 或完整回调 URL</text>
							<input v-model="devCodeInput" class="input h5-glass-input" placeholder="粘贴 code 或 https://...?code=..." />
						</view>
						<button class="btn-secondary" @click="submitDevCode">用 code 登录</button>
					</view>
				</view>

				<view v-else class="card h5-glass-panel wechat-wait">
					<text class="wait-text">正在跳转微信授权…</text>
				</view>

				<view class="auth-bottom-spacer"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5AuthSync, h5BindMachine, h5WechatLogin } from '@/pages/h5/common/api';
import { saveSession, getSession, clearSession } from '@/pages/h5/common/session';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';
import { isH5DevToolsEnabled, H5_MOCK_TEST_OPENID, H5_MOCK_TEST_NICKNAME } from '@/pages/h5/common/env';

const WX_MP_APPID = 'wxeeb5a3a25894c4e1';

function isWechatUA() {
	// #ifdef H5
	if (typeof navigator === 'undefined') return false;
	return /micromessenger/i.test(navigator.userAgent || '');
	// #endif
	// #ifndef H5
	return false;
	// #endif
}

function getQueryCode() {
	// #ifdef H5
	if (typeof window === 'undefined') return '';
	const q = window.location.search || '';
	if (!q || q === '?') return '';
	const params = new URLSearchParams(q.replace(/^\?/, ''));
	return params.get('code') || '';
	// #endif
	// #ifndef H5
	return '';
	// #endif
}

function buildWechatOAuthUrl() {
	// #ifdef H5
	const redirect = `${window.location.protocol}//${window.location.host}/`;
	const redirectUri = encodeURIComponent(redirect);
	const state = Math.random().toString(36).slice(2, 12);
	return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WX_MP_APPID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
	// #endif
	// #ifndef H5
	return '';
	// #endif
}

export default {
	data() {
		return {
			h5Logo: H5_APP_LOGO,
			form: {
				nickname: '',
				avatar: ''
			},
			deviceId: '',
			merchantId: '',
			isWechat: false,
			wechatLoading: false,
			wechatWaitText: '正在跳转微信授权…',
			pendingBindDevice: false,
			oauthExchanging: false,
			devCodeInput: ''
		};
	},
	computed: {
		showDevTools() {
			return isH5DevToolsEnabled();
		}
	},
	onShow() {
		this.bootstrapH5();
	},
	methods: {
		bootstrapH5() {
			// #ifndef H5
			return;
			// #endif
			this.isWechat = isWechatUA();
			const session = getSession();
			this.pendingBindDevice = !!(session.merchantId && !session.deviceId);

			if (session.merchantId && session.deviceId) {
				uni.redirectTo({ url: '/pages/h5/home/index' });
				return;
			}

			const code = getQueryCode();
			if (code) {
				if (!this.oauthExchanging) this.exchangeWechatCode(code);
				return;
			}

			if (this.pendingBindDevice) {
				this.wechatLoading = false;
				return;
			}

			if (!this.isWechat) {
				this.wechatLoading = false;
				return;
			}

			this.wechatLoading = true;
			this.wechatWaitText = '正在跳转微信授权…';
			// #ifdef H5
			window.location.href = buildWechatOAuthUrl();
			// #endif
		},
		copyPageLink() {
			// #ifdef H5
			const url = typeof window !== 'undefined' && window.location ? window.location.href : '';
			if (!url) return;
			uni.setClipboardData({
				data: url,
				success: () => uni.showToast({ title: '已复制', icon: 'success' })
			});
			// #endif
		},
		submitDevCode() {
			// #ifdef H5
			if (!this.showDevTools) {
				uni.showToast({ title: '请使用微信打开本页面', icon: 'none' });
				return;
			}
			let raw = String(this.devCodeInput || '').trim();
			if (!raw) {
				uni.showToast({ title: '请粘贴 code 或完整 URL', icon: 'none' });
				return;
			}
			const fromQuery = raw.match(/[?&#]code=([^&#]+)/);
			if (fromQuery) {
				try {
					raw = decodeURIComponent(fromQuery[1]);
				} catch (e) {
					raw = fromQuery[1];
				}
			}
			const code = raw.replace(/\s/g, '');
			if (!code) {
				uni.showToast({ title: '未能解析出 code', icon: 'none' });
				return;
			}
			this.exchangeWechatCode(code);
			// #endif
		},
		async exchangeWechatCode(code) {
			if (this.oauthExchanging) return;
			this.oauthExchanging = true;
			this.wechatLoading = true;
			this.wechatWaitText = '微信登录中…';
			uni.showLoading({ title: '登录中...', mask: true });
			try {
				const res = await h5WechatLogin({ code });
				// #ifdef H5
				if (typeof window !== 'undefined' && window.history && window.location.search) {
					const clean = `${window.location.pathname}${window.location.hash || ''}`;
					window.history.replaceState({}, '', clean);
				}
				// #endif
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '登录失败', icon: 'none' });
					this.wechatLoading = false;
					return;
				}
				const m = res.data && res.data.merchant;
				this.merchantId = m && m.id;
				saveSession({
					merchantId: m && m.id,
					userId: m && m.userId,
					wxNickname: m && m.wxNickname,
					wxAvatar: m && m.wxAvatar,
					mobile: m && m.mobile,
					deviceId: m && m.deviceId
				});
				this.afterLoginReady(res.data);
			} finally {
				this.oauthExchanging = false;
				uni.hideLoading();
			}
		},
		afterLoginReady(data) {
			this.wechatLoading = false;
			if (this.applyH5UiStyleFromApiData) this.applyH5UiStyleFromApiData(data);
			const s = getSession();
			this.pendingBindDevice = !!(s.merchantId && !s.deviceId);
			if (data && data.needBind) {
				return;
			}
			uni.redirectTo({ url: '/pages/h5/home/index' });
		},
		async loginWithMockProfile({ nickname, avatar } = {}) {
			const res = await h5AuthSync({
				authMode: 'mock',
				h5DevMock: true,
				openid: H5_MOCK_TEST_OPENID,
				wxNickname: nickname || H5_MOCK_TEST_NICKNAME,
				wxAvatar: avatar || '',
				mobile: ''
			});
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '登录失败', icon: 'none' });
				return;
			}
			if (this.applyH5UiStyleFromApiData) this.applyH5UiStyleFromApiData(res.data);
			const m = res.data && res.data.merchant;
			this.merchantId = m && m.id;
			saveSession({
				merchantId: m && m.id,
				userId: m && m.userId,
				wxNickname: m && m.wxNickname,
				wxAvatar: m && m.wxAvatar,
				mobile: m && m.mobile,
				deviceId: m && m.deviceId
			});
			this.pendingBindDevice = !!(m && m.id && !(m.deviceId || '').trim());
			if (res.data && res.data.needBind) {
				return;
			}
			uni.redirectTo({ url: '/pages/h5/home/index' });
		},
		async submitTestLogin() {
			// #ifndef H5
			uni.showToast({ title: '请在 H5 环境使用', icon: 'none' });
			return;
			// #endif
			if (!this.showDevTools) {
				uni.showToast({ title: '请使用微信打开本页面', icon: 'none' });
				return;
			}
			clearSession();
			this.deviceId = '';
			this.merchantId = '';
			this.pendingBindDevice = false;
			uni.showLoading({ title: '登录中...', mask: true });
			try {
				await this.loginWithMockProfile({
					nickname: H5_MOCK_TEST_NICKNAME,
					avatar: ''
				});
			} finally {
				uni.hideLoading();
			}
		},
		async submitAuth() {
			// #ifndef H5
			uni.showToast({ title: '请在 H5 环境使用', icon: 'none' });
			return;
			// #endif
			if (!this.showDevTools) {
				uni.showToast({ title: '请使用微信打开本页面', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '登录中...', mask: true });
			try {
				await this.loginWithMockProfile({
					nickname: this.form.nickname || H5_MOCK_TEST_NICKNAME,
					avatar: this.form.avatar || ''
				});
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
				this.pendingBindDevice = false;
				uni.showToast({ title: '绑定成功', icon: 'success' });
				setTimeout(() => uni.redirectTo({ url: '/pages/h5/home/index' }), 350);
			} finally {
				uni.hideLoading();
			}
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
	background: transparent;
}

.auth-scroll {
	position: relative;
	z-index: 1;
	height: 100vh;
	box-sizing: border-box;
}

.auth-inner {
	padding: 28px 16px 32px;
}

.auth-bottom-spacer {
	height: 24px;
}

.hero {
	margin-bottom: 22px;
}

.title {
	display: block;
	font-size: 30px;
	font-weight: 800;
	color: #0f172a;
	letter-spacing: 0.03em;
}

.sub {
	display: block;
	margin-top: 8px;
	color: #64748b;
	font-size: 13px;
}

.card {
	border-radius: 20px;
	padding: 18px 16px;
	margin-bottom: 14px;
}

.wechat-wait {
	text-align: center;
	padding: 28px 16px;
}

.wait-text {
	font-size: 14px;
	color: #475569;
}

.gate-title {
	display: block;
	font-size: 17px;
	font-weight: 700;
	color: #0f172a;
	margin-bottom: 8px;
}

.gate-tip {
	display: block;
	font-size: 13px;
	color: #64748b;
	line-height: 1.55;
	margin-bottom: 14px;
}

.gate-input {
	margin-bottom: 12px;
}

.field {
	margin-bottom: 12px;
}

.label {
	display: block;
	font-size: 12px;
	color: #64748b;
	margin-bottom: 6px;
}

.input {
	border-radius: 12px;
	height: 42px;
	padding: 0 12px;
	font-size: 14px;
	box-sizing: border-box;
}

.btn-primary {
	margin-top: 8px;
	border-radius: 999px;
}

.browser-login {
	display: flex;
	flex-direction: column;
	gap: 0;
}

.tip-card {
	border-color: rgba(251, 191, 36, 0.45);
	box-shadow: 0 4px 20px rgba(251, 191, 36, 0.12);
}

.tip-title {
	display: block;
	font-size: 16px;
	font-weight: 700;
	color: #b45309;
	margin-bottom: 10px;
}

.tip-text {
	display: block;
	font-size: 13px;
	color: #92400e;
	line-height: 1.55;
	margin-bottom: 8px;
}

.btn-outline {
	margin-top: 10px;
	background: #ffffff;
	color: #b45309;
	border: 1px solid #fbbf24;
	border-radius: 999px;
	font-size: 14px;
}

.mock-title {
	display: block;
	font-size: 15px;
	font-weight: 700;
	color: #0f172a;
	margin-bottom: 6px;
}

.mock-desc {
	display: block;
	font-size: 12px;
	color: #64748b;
	line-height: 1.5;
	margin-bottom: 12px;
}

.btn-secondary {
	margin-top: 8px;
	background: #f8fafc;
	color: #334155;
	border: 1px solid #e2e8f0;
	border-radius: 999px;
	font-size: 14px;
}
</style>
