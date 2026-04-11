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
					<text class="detail-title">工单对话</text>
					<text class="detail-close" @click="closeDetail">×</text>
				</view>
				<scroll-view scroll-y class="detail-messages">
					<view
						v-for="m in detailMessages"
						:key="m.id"
						class="dm-row"
						:class="m.role === 'user' ? 'dm-row--user' : 'dm-row--admin'"
					>
						<view class="dm-bubble">
							<text v-if="m.role === 'admin'" class="dm-meta">客服 · {{ m.adminName || '管理员' }}</text>
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
				</scroll-view>
				<view v-if="currentTicket && currentTicket.status === 'open'" class="detail-reply">
					<textarea v-model="replyText" class="reply-input" placeholder="输入回复内容" />
					<button type="primary" size="mini" :loading="replying" :disabled="!replyText.trim()" @click="submitReply">
						发送回复
					</button>
				</view>
				<view v-else class="detail-closed">工单已结束，仅可查看历史消息。</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
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
			detailMessages: [],
			replyText: '',
			replying: false
		};
	},
	onLoad() {
		this.search();
	},
	methods: {
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
			this.pageInfo.currentPage = page;
			this.loadList();
		},
		onPageSizeChange(pageSize) {
			this.pageInfo.pageSize = pageSize;
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		async openDetail(item) {
			this.currentId = item.id;
			this.replyText = '';
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
			this.detailMessages = ret.data?.messages || [];
			this.$refs.detailPopup.open();
			this.loadList();
		},
		closeDetail() {
			this.$refs.detailPopup.close();
		},
		previewImg(images, start) {
			const urls = (images || []).map((x) => x.url || x.fileID).filter(Boolean);
			if (!urls.length) return;
			uni.previewImage({ urls, current: urls[start] || urls[0] });
		},
		async submitReply() {
			const text = String(this.replyText || '').trim();
			if (!text || !this.currentId) return;
			this.replying = true;
			try {
				const ret = await this.$request(
					'feedbackAdminReply',
					{ feedbackId: this.currentId, text },
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '发送失败', icon: 'none' });
					return;
				}
				this.replyText = '';
				this.detailMessages = ret.data?.messages || [];
				uni.showToast({ title: '已回复', icon: 'success' });
				this.loadList();
			} finally {
				this.replying = false;
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
	max-height: 85vh;
	background: #fff;
	border-radius: 10px;
	padding: 12px;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
}

.detail-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.detail-title {
	font-weight: 700;
	font-size: 16px;
}

.detail-close {
	font-size: 22px;
	line-height: 1;
	color: #64748b;
	padding: 4px 8px;
}

.detail-messages {
	flex: 1;
	max-height: 48vh;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	padding: 8px;
	box-sizing: border-box;
}

.dm-row {
	display: flex;
	margin-bottom: 10px;
}
.dm-row--user {
	justify-content: flex-end;
}
.dm-row--admin {
	justify-content: flex-start;
}

.dm-bubble {
	max-width: 88%;
	padding: 8px 10px;
	border-radius: 8px;
	background: #f8fafc;
	border: 1px solid #e2e8f0;
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
	margin-top: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
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
	margin-top: 8px;
	font-size: 12px;
	color: #64748b;
}
</style>
