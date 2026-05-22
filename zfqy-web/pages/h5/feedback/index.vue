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
			<text class="nav-title">售后反馈</text>
			<view class="nav-end-wrap">
				<text v-if="ticket" class="nav-end" @click="onCloseFeedback">结束反馈</text>
				<text v-else class="nav-end nav-end--placeholder">结束反馈</text>
			</view>
		</view>

		<scroll-view
			class="msg-scroll"
			scroll-y
			:scroll-into-view="scrollInto"
			:show-scrollbar="false"
			scroll-with-animation
		>
			<view class="msg-inner">
				<view v-if="!loading && !ticket && !messages.length" class="empty-hint h5-glass-panel">
					<text class="empty-title">暂无进行中的会话</text>
					<text class="empty-sub">输入文字或上传图片/视频后发送，即可发起反馈；客服回复后会在此显示。</text>
				</view>
				<view
					v-for="m in messages"
					:id="'m-' + m.id"
					:key="m.id"
					class="msg-row"
					:class="m.role === 'user' ? 'msg-row--user' : 'msg-row--admin'"
				>
					<view class="bubble h5-glass-panel" :class="m.role === 'user' ? 'bubble--user' : 'bubble--admin'">
						<text v-if="m.role === 'admin'" class="bubble-meta">客服</text>
						<text v-if="m.content && !m.refundEntryPath" class="bubble-text">{{ m.content }}</text>
						<view v-if="m.images && m.images.length" class="img-grid">
							<image
								v-for="(img, ix) in m.images"
								:key="ix"
								class="thumb"
								:src="img.url || img.fileID"
								mode="aspectFill"
								@click="previewImage(m.images, ix)"
							/>
						</view>
						<video v-if="m.videoUrl" class="vid" :src="m.videoUrl" controls object-fit="contain"></video>
						<view v-if="m.refundEntryPath" class="refund-entry-box">
							<button
								class="refund-entry-btn"
								size="mini"
								type="primary"
								:disabled="isRefundEntryExpired(m)"
								@click="openRefundEntry(m)"
							>
								退款
							</button>
						</view>
						<text class="bubble-time">{{ m.createTimeText }}</text>
					</view>
				</view>
				<view class="bottom-anchor" id="msg-bottom"></view>
			</view>
		</scroll-view>
		<view class="composer h5-glass-panel">
			<view v-if="pendingImages.length || pendingVideoPath" class="pending-row">
				<view v-for="(p, i) in pendingImages" :key="i" class="pending-item">
					<image class="pending-thumb" :src="p" mode="aspectFill" />
					<text class="pending-x" @click="removePendingImage(i)">×</text>
				</view>
				<view v-if="pendingVideoPath" class="pending-item pending-item--vid">
					<text class="pending-vid-label">视频已选</text>
					<text class="pending-x" @click="pendingVideoPath = ''">×</text>
				</view>
			</view>
			<textarea
				v-model="draftText"
				class="composer-input"
				:maxlength="2000"
				placeholder="描述您的问题（可与图片或视频一起发送）"
				:auto-height="true"
			/>
			<view class="composer-actions">
				<button class="mini-btn" size="mini" :disabled="!!pendingVideoPath" @click="pickImages">图片</button>
				<button class="mini-btn" size="mini" :disabled="pendingImages.length > 0" @click="pickVideo">视频</button>
				<button class="send-btn" type="primary" size="mini" :loading="sending" :disabled="sendDisabled" @click="send">发送</button>
			</view>
		</view>
	</view>
</template>

<script>
import { h5FeedbackGetOpen, h5FeedbackSend, h5FeedbackClose } from '@/pages/h5/common/api';
import { getSession } from '@/pages/h5/common/session';

export default {
	data() {
		return {
			loading: true,
			ticket: null,
			messages: [],
			draftText: '',
			pendingImages: [],
			pendingVideoPath: '',
			sending: false,
			scrollInto: '',
			nowTick: Date.now(),
			nowTimer: null
		};
	},
	computed: {
		sendDisabled() {
			const t = String(this.draftText || '').trim();
			if (this.sending) return true;
			if (this.pendingVideoPath) return false;
			if (this.pendingImages.length) return false;
			return !t;
		}
	},
	onShow() {
		this.loadThread();
		if (!this.nowTimer) {
			this.nowTimer = setInterval(() => {
				this.nowTick = Date.now();
			}, 1000);
		}
	},
	onHide() {
		if (this.nowTimer) {
			clearInterval(this.nowTimer);
			this.nowTimer = null;
		}
	},
	onUnload() {
		if (this.nowTimer) {
			clearInterval(this.nowTimer);
			this.nowTimer = null;
		}
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async loadThread() {
			this.loading = true;
			try {
				const res = await h5FeedbackGetOpen();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.ticket = res.data?.ticket || null;
				this.messages = res.data?.messages || [];
				this.scrollToBottom();
			} finally {
				this.loading = false;
			}
		},
		scrollToBottom() {
			this.scrollInto = '';
			this.$nextTick(() => {
				setTimeout(() => {
					this.scrollInto = 'msg-bottom';
				}, 16);
			});
		},
		pickImages() {
			if (this.pendingVideoPath) return;
			const remain = 9 - this.pendingImages.length;
			if (remain <= 0) return;
			uni.chooseImage({
				count: remain,
				sizeType: ['compressed'],
				sourceType: ['album', 'camera'],
				success: (r) => {
					const paths = r.tempFilePaths || [];
					this.pendingImages = this.pendingImages.concat(paths);
				}
			});
		},
		pickVideo() {
			if (this.pendingImages.length) return;
			uni.chooseVideo({
				sourceType: ['album', 'camera'],
				maxDuration: 120,
				success: (r) => {
					this.pendingVideoPath = r.tempFilePath || '';
				}
			});
		},
		removePendingImage(i) {
			this.pendingImages.splice(i, 1);
		},
		previewImage(images, start) {
			const urls = (images || []).map((x) => x.url || x.fileID).filter(Boolean);
			if (!urls.length) return;
			uni.previewImage({ urls, current: urls[start] || urls[0] });
		},
		isRefundEntryExpired(msg) {
			void this.nowTick;
			const exp = Number(msg?.refundEntryExpireTime || 0);
			if (!exp) return false;
			return Date.now() > exp;
		},
		openRefundEntry(msg) {
			if (this.isRefundEntryExpired(msg)) {
				uni.showToast({ title: '退款入口已过期，请联系在线客服', icon: 'none' });
				return;
			}
			const path = String(msg?.refundEntryPath || '').trim();
			if (!path) {
				uni.showToast({ title: '退款入口无效', icon: 'none' });
				return;
			}
			this.confirmRefundAction(() => {
				uni.navigateTo({ url: path });
			});
		},
		confirmRefundAction(onConfirm) {
			uni.showModal({
				title: '确认退款',
				content: '该操作会失去您在慧收盈平台的所有权益，是否确定？',
				success: (r) => {
					if (!r.confirm) return;
					if (typeof onConfirm === 'function') onConfirm();
				}
			});
		},
		async uploadToCloud(localPath, extGuess) {
			const session = getSession() || {};
			const mid = session.merchantId || session.userId || 'anon';
			const ext =
				extGuess ||
				(localPath.indexOf('.') > -1 ? localPath.split('.').pop().toLowerCase().slice(0, 8) : 'jpg');
			const cloudPath = `h5-feedback/${mid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
			const up = await uniCloud.uploadFile({ filePath: localPath, cloudPath });
			return up.fileID;
		},
		async send() {
			if (this.sendDisabled) return;
			const text = String(this.draftText || '').trim();
			if (!text && !this.pendingImages.length && !this.pendingVideoPath) return;
			this.sending = true;
			uni.showLoading({ title: '发送中', mask: true });
			try {
				const imageIds = [];
				for (const p of this.pendingImages) {
					const id = await this.uploadToCloud(p, 'jpg');
					imageIds.push(id);
				}
				let videoId = '';
				if (this.pendingVideoPath) {
					videoId = await this.uploadToCloud(this.pendingVideoPath, 'mp4');
				}
				const res = await h5FeedbackSend({
					text,
					images: imageIds,
					video: videoId
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '发送失败', icon: 'none' });
					return;
				}
				this.draftText = '';
				this.pendingImages = [];
				this.pendingVideoPath = '';
				this.ticket = res.data?.ticket || this.ticket;
				this.messages = res.data?.messages || [];
				this.scrollToBottom();
			} catch (e) {
				console.error(e);
				uni.showToast({ title: e.message || '发送失败', icon: 'none' });
			} finally {
				this.sending = false;
				uni.hideLoading();
			}
		},
		onCloseFeedback() {
			uni.showModal({
				title: '结束反馈',
				content: '结束后可再次发起新的反馈会话。确定结束当前会话吗？',
				success: async (r) => {
					if (!r.confirm) return;
					uni.showLoading({ title: '处理中', mask: true });
					try {
						const res = await h5FeedbackClose();
						if (res.code !== 0) {
							uni.showToast({ title: res.message || '操作失败', icon: 'none' });
							return;
						}
						this.ticket = null;
						this.messages = [];
						uni.showToast({ title: '已结束', icon: 'success' });
					} finally {
						uni.hideLoading();
					}
				}
			});
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	height: 100vh;
	height: 100dvh;
	position: relative;
	box-sizing: border-box;
	background: transparent;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.nav-bar {
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 10px;
	backdrop-filter: blur(8px);
}

.nav-back {
	color: rgba(226, 232, 240, 0.95);
	font-size: 15px;
	min-width: 64px;
}

.nav-title {
	flex: 1;
	text-align: center;
	font-size: 17px;
	font-weight: 700;
	color: #f8fafc;
}

.nav-end {
	min-width: 72px;
	text-align: right;
	font-size: 13px;
	color: #fca5a5;
}

.nav-end--refund {
	color: #93c5fd;
}

.nav-end-wrap {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	min-width: 72px;
}

.nav-end--placeholder {
	opacity: 0;
}

.msg-scroll {
	flex: 1;
	min-height: 0;
	height: auto;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	overflow: hidden;
}

.msg-inner {
	padding: 8px 12px 12px;
}

.empty-hint {
	padding: 16px;
	margin-bottom: 12px;
}

.empty-title {
	display: block;
	font-size: 15px;
	font-weight: 600;
	color: #f1f5f9;
	margin-bottom: 8px;
}

.empty-sub {
	display: block;
	font-size: 12px;
	line-height: 1.55;
	color: rgba(203, 213, 225, 0.88);
}

.msg-row {
	display: flex;
	margin-bottom: 12px;
}

.msg-row--user {
	justify-content: flex-end;
}

.msg-row--admin {
	justify-content: flex-start;
}

.bubble {
	max-width: 86%;
	padding: 10px 12px;
	border-radius: 14px;
}

.bubble--user {
	background: rgba(99, 102, 241, 0.35);
	border: 1px solid rgba(165, 180, 252, 0.35);
}

.bubble--admin {
	background: rgba(15, 23, 42, 0.45);
	border: 1px solid rgba(148, 163, 184, 0.25);
}

.bubble-meta {
	display: block;
	font-size: 11px;
	color: rgba(251, 191, 36, 0.95);
	margin-bottom: 6px;
}

.bubble-text {
	display: block;
	font-size: 14px;
	line-height: 1.5;
	color: #f8fafc;
	white-space: pre-wrap;
	word-break: break-word;
}

.bubble-time {
	display: block;
	margin-top: 8px;
	font-size: 10px;
	color: rgba(148, 163, 184, 0.85);
}

.refund-entry-box {
	margin-top: 6px;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
}

.refund-entry-btn {
	background: rgba(59, 130, 246, 0.9) !important;
}

.img-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}

.thumb {
	width: 72px;
	height: 72px;
	border-radius: 8px;
	background: rgba(0, 0, 0, 0.2);
}

.vid {
	width: 100%;
	max-height: 200px;
	margin-top: 8px;
	border-radius: 8px;
}

.bottom-anchor {
	height: 1px;
}

.composer {
	margin: 0 10px;
	padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	border-bottom-left-radius: 0;
	border-bottom-right-radius: 0;
}

.pending-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
}

.pending-item {
	position: relative;
	width: 56px;
	height: 56px;
}

.pending-thumb {
	width: 56px;
	height: 56px;
	border-radius: 8px;
}

.pending-x {
	position: absolute;
	top: -6px;
	right: -6px;
	width: 20px;
	height: 20px;
	line-height: 18px;
	text-align: center;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	border-radius: 50%;
	font-size: 14px;
}

.pending-item--vid {
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(15, 23, 42, 0.5);
	border-radius: 8px;
	width: auto;
	padding: 0 10px;
}

.pending-vid-label {
	font-size: 12px;
	color: #e2e8f0;
}

.composer-input {
	width: 100%;
	min-height: 64px;
	max-height: 120px;
	font-size: 14px;
	color: #f8fafc;
	background: rgba(15, 23, 42, 0.35);
	border-radius: 10px;
	padding: 8px 10px;
	box-sizing: border-box;
}

.composer-actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 10px;
}

.mini-btn {
	background: rgba(255, 255, 255, 0.12) !important;
	color: #e2e8f0 !important;
	border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.send-btn {
	min-width: 88px;
}
</style>
