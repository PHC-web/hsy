<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<input v-model="keyword" class="kw-input" placeholder="摘要关键词" @confirm="search" />
				<button size="mini" type="primary" @click="search">搜索</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="200">摘要</uni-th>
							<uni-th align="center" width="70">状态</uni-th>
							<uni-th align="center" width="120">微信</uni-th>
							<uni-th align="center" width="110">手机</uni-th>
							<uni-th align="center" width="70">待客服</uni-th>
							<uni-th align="center" width="140">最后消息</uni-th>
							<uni-th align="center" width="80">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="left">
								<view class="cell-preview">{{ item.previewText || '-' }}</view>
							</uni-td>
							<uni-td align="center">{{ item.status === 'open' ? '进行中' : '已结束' }}</uni-td>
							<uni-td align="center">{{ item.merchantWx }}</uni-td>
							<uni-td align="center">{{ item.merchantMobile }}</uni-td>
							<uni-td align="center">
								<text v-if="item.adminUnread" class="tag tag-warn">新</text>
								<text v-else>—</text>
							</uni-td>
							<uni-td align="center">{{ item.lastMessageAt }}</uni-td>
							<uni-td align="center">
								<button size="mini" type="primary" @click="openDetail(item)">处理</button>
							</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>
			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination
					show-icon
					show-page-size
					:page-size="pageInfo.pageSize"
					v-model="pageInfo.currentPage"
					:total="pageInfo.total"
					@change="onPageChanged"
					@pageSizeChange="onPageSizeChange"
				/>
			</view>
		</view>

		<uni-popup ref="detailPopup" type="center">
			<view class="detail-popup">
				<view class="detail-head">
					<view class="detail-head-left">
						<image v-if="currentMerchant && currentMerchant.avatar" class="merchant-avatar" :src="currentMerchant.avatar" mode="aspectFill" />
						<view class="merchant-meta">
							<text class="detail-title">{{ currentMerchant ? currentMerchant.name : '工单对话' }}</text>
							<text v-if="currentMerchant" class="merchant-level">{{ currentMerchant.membershipName || '普通会员' }}</text>
						</view>
					</view>
					<text class="detail-close" @click="closeDetail">×</text>
				</view>
				<view class="detail-messages-wrap">
					<scroll-view
						scroll-y
						class="detail-messages"
						:scroll-into-view="scrollIntoView"
						scroll-with-animation
					>
						<view
							v-for="m in detailMessages"
							:key="m.id"
							class="dm-row"
							:class="m.role === 'user' ? 'dm-row--user' : 'dm-row--admin'"
						>
							<view class="dm-bubble" :class="m.role === 'user' ? 'dm-bubble--user' : 'dm-bubble--admin'">
								<text v-if="m.role === 'admin'" class="dm-meta">客服 · {{ displayAdminName(m) }}</text>
								<text v-if="m.role === 'user'" class="dm-meta">用户</text>
								<text v-if="m.content" class="dm-text">{{ m.content }}</text>
								<view v-if="m.images && m.images.length" class="dm-imgs">
									<image
										v-for="(img, ix) in m.images"
										:key="ix"
										class="dm-img"
										:src="img.url || img.fileID"
										mode="aspectFill"
										@click="previewImg(m.images, ix)"
									/>
								</view>
								<video v-if="m.videoUrl" class="dm-video" :src="m.videoUrl" controls />
								<text class="dm-time">{{ m.createTimeText }}</text>
							</view>
						</view>
						<view id="dm-bottom" class="dm-bottom-anchor"></view>
					</scroll-view>
				</view>
				<view v-if="currentTicket && currentTicket.status === 'open'" class="detail-reply">
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
					<textarea v-model="replyText" class="reply-input" placeholder="输入回复内容" />
					<view class="reply-actions">
						<button size="mini" :disabled="!!pendingVideoPath" @click="pickImages">图片</button>
						<button size="mini" :disabled="pendingImages.length > 0" @click="pickVideo">视频</button>
						<button
							type="default"
							size="mini"
							:loading="sendingRefundEntry"
							:disabled="!canSendRefundEntry"
							@click="sendRefundEntry"
						>
							发送退款入口
						</button>
						<button type="primary" size="mini" :loading="replying" :disabled="sendReplyDisabled" @click="submitReply">
							发送回复
						</button>
					</view>
				</view>
				<view v-else class="detail-closed">工单已结束，仅可查看历史消息。</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import { store as uniIdStore } from '@/uni_modules/uni-id-pages/common/store.js';

export default {
	data() {
		return {
			keyword: '',
			loading: false,
			list: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			currentId: '',
			currentTicket: null,
			currentMerchant: null,
			detailMessages: [],
			replyText: '',
			pendingImages: [],
			pendingVideoPath: '',
			replying: false,
			sendingRefundEntry: false,
			scrollIntoView: ''
		};
	},
	computed: {
		canSendRefundEntry() {
			return !!(this.currentTicket && this.currentTicket.status === 'open' && this.currentMerchant && this.currentMerchant.canSendRefundEntry);
		},
		sendReplyDisabled() {
			const t = String(this.replyText || '').trim();
			if (this.replying) return true;
			if (this.pendingImages.length) return false;
			if (this.pendingVideoPath) return false;
			return !t;
		}
	},
	onLoad() {
		this.search();
	},
	methods: {
		currentAdminDisplayName() {
			const u = uniIdStore.userInfo || {};
			const n = String(u.nickname || u.username || '').trim();
			return n || '管理员';
		},
		displayAdminName(m) {
			const n = String((m && m.adminName) || '').trim();
			if (!n || n === 'system') return '管理员';
			return n;
		},
		search() {
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		async loadList() {
			this.loading = true;
			try {
				const ret = await this.$request(
					'feedbackAdminList',
					{
						page: this.pageInfo.currentPage,
						pageSize: this.pageInfo.pageSize,
						keyword: this.keyword.trim()
					},
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '加载失败', icon: 'none' });
					return;
				}
				this.list = ret.data?.list || [];
				this.pageInfo.total = ret.data?.total || 0;
			} catch (e) {
				uni.showToast({ title: '加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		onPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.loadList();
		},
		onPageSizeChange(pageSize) {
			const s = typeof pageSize === 'number' ? pageSize : Number(pageSize?.pageSize || pageSize?.size || pageSize || 10);
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		async openDetail(item) {
			this.currentId = item.id;
			this.replyText = '';
			this.pendingImages = [];
			this.pendingVideoPath = '';
			const ret = await this.$request(
				'feedbackAdminMessages',
				{ feedbackId: item.id },
				{ functionName: 'merchant' }
			);
			if (ret.code !== 0) {
				uni.showToast({ title: ret.message || '加载失败', icon: 'none' });
				return;
			}
			this.currentTicket = ret.data?.ticket || null;
			this.currentMerchant = ret.data?.merchant || null;
			this.detailMessages = ret.data?.messages || [];
			this.$refs.detailPopup.open();
			this.$nextTick(() => {
				this.scrollToBottom();
				// 弹层与 flex 布局在 H5 上晚一帧才完成高度，补几次滚底才稳定
				[80, 200, 450].forEach((ms) => setTimeout(() => this.scrollToBottom(), ms));
			});
			this.loadList();
		},
		closeDetail() {
			this.currentMerchant = null;
			this.pendingImages = [];
			this.pendingVideoPath = '';
			this.scrollIntoView = '';
			this.$refs.detailPopup.close();
		},
		scrollToBottom() {
			this.scrollIntoView = '';
			this.$nextTick(() => {
				setTimeout(() => {
					this.scrollIntoView = 'dm-bottom';
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
		async uploadToCloud(localPath, extGuess) {
			const ext =
				extGuess ||
				(localPath.indexOf('.') > -1 ? localPath.split('.').pop().toLowerCase().slice(0, 8) : 'jpg');
			const cloudPath = `admin-feedback/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
			const up = await uniCloud.uploadFile({ filePath: localPath, cloudPath });
			const fileID = String(up?.fileID || up?.fileId || up?.file_id || '').trim();
			if (fileID) return fileID;
			const directUrl = String(up?.tempFileURL || up?.url || up?.fileUrl || '').trim();
			if (directUrl) return directUrl;
			throw new Error('图片上传成功但未返回可用地址');
		},
		previewImg(images, start) {
			const urls = (images || []).map((x) => x.url || x.fileID).filter(Boolean);
			if (!urls.length) return;
			uni.previewImage({ urls, current: urls[start] || urls[0] });
		},
		async submitReply() {
			const text = String(this.replyText || '').trim();
			if ((!text && !this.pendingImages.length && !this.pendingVideoPath) || !this.currentId) return;
			this.replying = true;
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
				const ret = await this.$request(
					'feedbackAdminReply',
					{
						feedbackId: this.currentId,
						text,
						images: imageIds,
						video: videoId,
						adminDisplayName: this.currentAdminDisplayName()
					},
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '发送失败', icon: 'none' });
					return;
				}
				this.replyText = '';
				this.pendingImages = [];
				this.pendingVideoPath = '';
				this.detailMessages = ret.data?.messages || [];
				this.$nextTick(() => {
					this.scrollToBottom();
					setTimeout(() => this.scrollToBottom(), 100);
				});
				uni.showToast({ title: '已回复', icon: 'success' });
				this.loadList();
			} catch (e) {
				uni.showToast({ title: e?.message || '发送失败', icon: 'none' });
			} finally {
				this.replying = false;
			}
		},
		async sendRefundEntry() {
			if (!this.currentId) return;
			if (!this.canSendRefundEntry) {
				uni.showToast({ title: '该商户非会员，无法发送退款入口', icon: 'none' });
				return;
			}
			this.sendingRefundEntry = true;
			try {
				const ret = await this.$request(
					'feedbackAdminSendRefundEntry',
					{
						feedbackId: this.currentId,
						adminDisplayName: this.currentAdminDisplayName()
					},
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '发送失败', icon: 'none' });
					return;
				}
				this.detailMessages = ret.data?.messages || [];
				this.$nextTick(() => {
					this.scrollToBottom();
					setTimeout(() => this.scrollToBottom(), 100);
				});
				const link = String(ret.data?.entryUrl || '');
				if (link) {
					uni.setClipboardData({
						data: link,
						success: () => {
							uni.showToast({ title: '已发送并复制退款入口', icon: 'success' });
						}
					});
				} else {
					uni.showToast({ title: '已发送退款入口', icon: 'success' });
				}
				this.loadList();
			} finally {
				this.sendingRefundEntry = false;
			}
		}
	}
};
</script>

<style scoped>
.kw-input {
	width: 200px;
	height: 30px;
	padding: 0 8px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	margin-right: 8px;
	font-size: 13px;
}

.cell-preview {
	text-align: left;
	font-size: 12px;
	line-height: 1.4;
	max-height: 3.6em;
	overflow: hidden;
}

.tag {
	font-size: 11px;
	padding: 2px 6px;
	border-radius: 4px;
}
.tag-warn {
	background: #fef3c7;
	color: #b45309;
}

.detail-popup {
	width: min(92vw, 720px);
	height: min(85vh, 720px);
	max-height: 85vh;
	background: #fff;
	border-radius: 10px;
	padding: 12px;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
}

.detail-head {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.detail-messages-wrap {
	flex: 1 1 0;
	min-height: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.detail-head-left {
	display: flex;
	align-items: center;
	gap: 10px;
}

.merchant-avatar {
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: #f1f5f9;
}

.merchant-meta {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.detail-title {
	font-weight: 700;
	font-size: 16px;
}

.merchant-level {
	font-size: 12px;
	color: #64748b;
}

.detail-close {
	font-size: 22px;
	line-height: 1;
	color: #64748b;
	padding: 4px 8px;
}

.detail-messages {
	flex: 1 1 0;
	height: 0;
	min-height: 0;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	padding: 8px;
	box-sizing: border-box;
}

.dm-bottom-anchor {
	width: 1px;
	height: 1px;
}

.dm-row {
	display: flex;
	margin-bottom: 10px;
}
.dm-row--user {
	justify-content: flex-start;
}
.dm-row--admin {
	justify-content: flex-end;
}

.dm-bubble {
	max-width: 88%;
	padding: 8px 10px;
	border-radius: 8px;
	background: #f8fafc;
	border: 1px solid #e2e8f0;
}
.dm-bubble--user {
	background: #f1f5f9;
	border-color: #e2e8f0;
}
.dm-bubble--admin {
	background: #eff6ff;
	border-color: #bfdbfe;
}
.dm-row--admin .dm-meta,
.dm-row--admin .dm-time {
	text-align: right;
}

.dm-meta {
	display: block;
	font-size: 11px;
	color: #64748b;
	margin-bottom: 4px;
}

.dm-text {
	font-size: 13px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}

.dm-imgs {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 6px;
}

.dm-img {
	width: 64px;
	height: 64px;
	border-radius: 4px;
}

.dm-video {
	width: 100%;
	max-height: 180px;
	margin-top: 6px;
}

.dm-time {
	display: block;
	margin-top: 6px;
	font-size: 10px;
	color: #94a3b8;
}

.detail-reply {
	flex-shrink: 0;
	margin-top: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.reply-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.pending-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
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
	width: 18px;
	height: 18px;
	line-height: 16px;
	text-align: center;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	font-size: 12px;
}

.pending-item--vid {
	width: auto;
	height: 56px;
	padding: 0 10px;
	border-radius: 8px;
	display: flex;
	align-items: center;
	background: #f1f5f9;
}

.pending-vid-label {
	font-size: 12px;
	color: #334155;
}

.reply-input {
	width: 100%;
	min-height: 72px;
	border: 1px solid #e5e7eb;
	border-radius: 6px;
	padding: 8px;
	font-size: 13px;
	box-sizing: border-box;
}

.detail-closed {
	flex-shrink: 0;
	margin-top: 8px;
	font-size: 12px;
	color: #64748b;
}
</style>
