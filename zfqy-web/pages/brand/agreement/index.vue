<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group header-actions">
				<button size="mini" @click="reset">重置</button>
				<button type="primary" size="mini" @click="openCreateDialog">发布新协议</button>
			</view>
		</view>

		<view class="uni-container">
			<view class="table-container">
				<uni-table border stripe :loading="loading">
					<uni-tr>
						<uni-th align="center" width="180">协议标题</uni-th>
						<uni-th align="center" width="160">版本</uni-th>
						<uni-th align="center" width="100">当前生效</uni-th>
						<uni-th align="center" width="130">通知全员重签</uni-th>
						<uni-th align="center" width="120">已签人数</uni-th>
						<uni-th align="center" width="220">发布时间</uni-th>
						<uni-th align="center" width="260">操作</uni-th>
					</uni-tr>
					<uni-tr v-for="row in list" :key="row.id">
						<uni-td align="center">{{ row.title }}</uni-td>
						<uni-td align="center">{{ row.version }}</uni-td>
						<uni-td align="center">{{ row.isCurrent ? '是' : '否' }}</uni-td>
						<uni-td align="center">{{ row.notifyAllResign ? '是' : '否' }}</uni-td>
						<uni-td align="center">{{ row.signedCount }}</uni-td>
						<uni-td align="center">{{ row.createTime }}</uni-td>
						<uni-td align="center">
							<view class="ops-cell">
								<button size="mini" @click="openPdf(row.pdfFileId)">查看PDF</button>
								<button type="primary" size="mini" @click="openSignList(row)">签署列表</button>
							</view>
						</uni-td>
					</uni-tr>
				</uni-table>
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

		<uni-popup ref="createPopup" type="dialog">
			<uni-popup-dialog mode="base" title="发布新协议" :before-close="true" @close="closeCreateDialog" @confirm="submitCreate">
				<view class="form-wrap create-form">
					<uni-easyinput v-model="createForm.title" placeholder="协议标题（如：开户优惠活动计划书）" />
					<view class="file-row">
						<button size="mini" class="upload-btn" @click="choosePdf">上传PDF</button>
						<text class="file-name" :class="{ 'file-name--ok': !!createForm.pdfFileId }">
							{{ createForm.pdfFileId ? '已上传' : '未上传' }}
						</text>
					</view>
					<view class="switch-row">
						<text>通知所有商户重新签署</text>
						<switch :checked="createForm.notifyAllResign" @change="(e) => (createForm.notifyAllResign = !!e.detail.value)" />
					</view>
				</view>
			</uni-popup-dialog>
		</uni-popup>

		<uni-popup ref="signListPopup" type="center">
			<view class="sign-list-dialog">
				<view class="dialog-title">签署列表 - {{ activeAgreement.title || '-' }}</view>
				<view class="dialog-filters">
					<uni-easyinput v-model="signQuery.keyword" placeholder="搜索昵称/手机号/商户ID" @confirm="loadSignList(true)" />
				</view>
				<scroll-view scroll-y class="sign-list-scroll">
					<uni-table border stripe :loading="signLoading">
						<uni-tr>
							<uni-th align="center" width="130">商户ID</uni-th>
							<uni-th align="center" width="120">昵称</uni-th>
							<uni-th align="center" width="120">手机号</uni-th>
							<uni-th align="center" width="170">签署时间</uni-th>
							<uni-th align="center" width="120">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="it in signList" :key="it.id">
							<uni-td align="center">{{ it.userId }}</uni-td>
							<uni-td align="center">{{ it.nickname }}</uni-td>
							<uni-td align="center">{{ it.mobile }}</uni-td>
							<uni-td align="center">{{ it.signedAt || '-' }}</uni-td>
							<uni-td align="center">
								<button size="mini" :disabled="!it.signImage" @click="previewSignImage(it.signImage)">查看图片</button>
							</uni-td>
						</uni-tr>
					</uni-table>
				</scroll-view>
				<view class="uni-pagination-box">
					<uni-pagination
						show-icon
						show-page-size
						:page-size="signPage.pageSize"
						v-model="signPage.currentPage"
						:total="signPage.total"
						@change="onSignPageChanged"
						@pageSizeChange="onSignPageSizeChange"
					/>
				</view>
				<view class="dialog-actions">
					<button @click="$refs.signListPopup.close()">关闭</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
export default {
	data() {
		return {
			loading: false,
			list: [],
			pageInfo: { currentPage: 1, pageSize: 10, total: 0 },
			createForm: {
				title: '开户优惠活动计划书',
				pdfFileId: '',
				notifyAllResign: false
			},
			activeAgreement: {},
			signLoading: false,
			signList: [],
			signQuery: { keyword: '' },
			signPage: { currentPage: 1, pageSize: 20, total: 0 }
		};
	},
	mounted() {
		this.loadList();
	},
	methods: {
		reset() {
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		onPageChanged(e) {
			this.pageInfo.currentPage = e;
			this.loadList();
		},
		onPageSizeChange(e) {
			this.pageInfo.pageSize = e;
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		async loadList() {
			this.loading = true;
			try {
				const res = await this.$request(
					'agreementList',
					{ page: this.pageInfo.currentPage, pageSize: this.pageInfo.pageSize },
					{ functionName: 'brand' }
				);
				if (res.code !== 0) return uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				this.list = res.data.list || [];
				this.pageInfo.total = res.data.total || 0;
			} finally {
				this.loading = false;
			}
		},
		openCreateDialog() {
			this.createForm = { title: '开户优惠活动计划书', pdfFileId: '', notifyAllResign: false };
			this.$refs.createPopup.open();
		},
		closeCreateDialog() {
			this.$refs.createPopup.close();
		},
		pickPdfFile() {
			return new Promise((resolve, reject) => {
				const normalize = (pick) => {
					const file = pick?.tempFiles?.[0] || pick?.files?.[0] || null;
					if (!file) return null;
					const filePath = file.path || file.tempFilePath || '';
					return {
						filePath: filePath ? String(filePath) : '',
						file: file,
						name: file.name || '',
						ext: 'pdf'
					};
				};
				const onSuccess = (pick) => resolve(normalize(pick));
				const onFail = (e) => reject(e);
				if (typeof uni.chooseMessageFile === 'function') {
					uni.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf'], success: onSuccess, fail: onFail });
					return;
				}
				if (typeof uni.chooseFile === 'function') {
					uni.chooseFile({ count: 1, extension: ['pdf'], success: onSuccess, fail: onFail });
					return;
				}
				// #ifdef H5
				try {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = 'application/pdf,.pdf';
					input.onchange = () => {
						const f = input.files && input.files[0];
						if (!f) return resolve(null);
						resolve({ filePath: '', file: f, name: f.name || '', ext: 'pdf' });
					};
					input.click();
				} catch (e) {
					reject(e);
				}
				// #endif
				// #ifndef H5
				reject(new Error('当前环境不支持文件选择'));
				// #endif
			});
		},
		async uploadPdfToCloud(picked) {
			const cloudPath = `agreements/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${picked?.ext || 'pdf'}`;
			const filePath = String(picked?.filePath || '').trim();
			// 优先使用字符串 filePath（多数端稳定）
			if (filePath) {
				const up = await uniCloud.uploadFile({ filePath, cloudPath });
				return up?.fileID || '';
			}
			// H5 兜底：部分端只能拿到 File 对象
			if (picked?.file) {
				const up = await uniCloud.uploadFile({ file: picked.file, cloudPath });
				return up?.fileID || '';
			}
			throw new Error('未获取到可上传的文件数据');
		},
		async choosePdf() {
			try {
				const picked = await this.pickPdfFile();
				if (!picked) return;
				const filename = String(picked.name || '').toLowerCase();
				if (filename && !filename.endsWith('.pdf')) {
					uni.showToast({ title: '请选择 PDF 文件', icon: 'none' });
					return;
				}
				uni.showLoading({ title: '上传中...', mask: true });
				this.createForm.pdfFileId = await this.uploadPdfToCloud(picked);
				if (!this.createForm.pdfFileId) {
					uni.showToast({ title: '上传结果异常，请重试', icon: 'none' });
					return;
				}
				uni.showToast({ title: '上传成功', icon: 'success' });
			} catch (e) {
				uni.showToast({ title: e.message || '上传失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async submitCreate() {
			if (!this.createForm.pdfFileId) return uni.showToast({ title: '请先上传PDF', icon: 'none' });
			const res = await this.$request(
				'agreementCreate',
				{
					title: this.createForm.title,
					pdfFileId: this.createForm.pdfFileId,
					notifyAllResign: this.createForm.notifyAllResign
				},
				{ functionName: 'brand' }
			);
			if (res.code !== 0) return uni.showToast({ title: res.message || '发布失败', icon: 'none' });
			uni.showToast({ title: '发布成功', icon: 'success' });
			this.$refs.createPopup.close();
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		openPdf(url) {
			if (!url) return;
			// #ifdef H5
			window.open(url, '_blank');
			// #endif
			// #ifndef H5
			uni.navigateTo({ url: `/uni_modules/uni-id-pages/pages/common/webview/webview?url=${encodeURIComponent(url)}` });
			// #endif
		},
		openSignList(row) {
			this.activeAgreement = row || {};
			this.signQuery = { keyword: '' };
			this.signPage = { currentPage: 1, pageSize: 20, total: 0 };
			this.signList = [];
			this.$refs.signListPopup.open();
			this.loadSignList(true);
		},
		onSignPageChanged(e) {
			this.signPage.currentPage = e;
			this.loadSignList();
		},
		onSignPageSizeChange(e) {
			this.signPage.pageSize = e;
			this.signPage.currentPage = 1;
			this.loadSignList();
		},
		async loadSignList(reset = false) {
			if (!this.activeAgreement.id) return;
			if (reset) this.signPage.currentPage = 1;
			this.signLoading = true;
			try {
				const res = await this.$request(
					'agreementSignList',
					{
						agreementId: this.activeAgreement.id,
						keyword: this.signQuery.keyword,
						status: 'signed',
						page: this.signPage.currentPage,
						pageSize: this.signPage.pageSize
					},
					{ functionName: 'brand' }
				);
				if (res.code !== 0) return uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				this.signList = res.data.list || [];
				this.signPage.total = res.data.total || 0;
			} finally {
				this.signLoading = false;
			}
		},
		previewSignImage(url) {
			if (!url) return;
			uni.previewImage({ urls: [url], current: url });
		}
	}
};
</script>

<style scoped>
.header-actions { margin-left: auto; display: flex; gap: 12px; }
.table-container { background: #fff; border-radius: 8px; padding: 12px; }
.ops-cell { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.form-wrap { display: flex; flex-direction: column; gap: 12px; min-width: 420rpx; }
.create-form {
	width: 520rpx;
	max-width: 76vw;
	padding: 4px 4px 2px;
	box-sizing: border-box;
}
.file-row, .switch-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-height: 34px;
}
.upload-btn {
	min-width: 90px;
	height: 30px;
	line-height: 30px;
	padding: 0 12px;
}
.file-name {
	color: #909399;
	font-size: 12px;
	flex-shrink: 0;
}
.file-name--ok {
	color: #67c23a;
	font-weight: 600;
}
:deep(.uni-popup-dialog) {
	border-radius: 12px;
}
:deep(.uni-popup-dialog .uni-dialog-title) {
	font-size: 18px;
	padding-top: 16px;
}
:deep(.uni-popup-dialog .uni-dialog-content) {
	padding: 12px 16px 8px;
}
:deep(.uni-popup-dialog .uni-dialog-button-group) {
	margin-top: 6px;
}
.sign-list-dialog { width: min(1200px, 92vw); background: #fff; border-radius: 10px; padding: 14px; }
.dialog-title { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
.dialog-filters { display: flex; gap: 10px; margin-bottom: 10px; }
.sign-list-scroll { max-height: 58vh; }
.dialog-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
</style>
