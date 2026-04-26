<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<view class="audit-switches">
						<view class="audit-item">
							<text class="audit-label">会员退款需审核</text>
							<switch :checked="auditConfig.memberRequired" @change="onAuditSwitchChange('memberRequired', $event)" />
						</view>
						<view class="audit-item">
							<text class="audit-label">非会员退款需审核</text>
							<switch :checked="auditConfig.nonMemberRequired" @change="onAuditSwitchChange('nonMemberRequired', $event)" />
						</view>
					</view>
					<button size="mini" @click="search">刷新</button>
					<button size="mini" type="primary" @click="runSearchFromHeader">查询</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">退款列表</text>
				<text class="page-sub">展示与审核 H5 充值全额退款（商家转账至零钱），审核流程与提现列表一致</text>
			</view>

			<view class="summary-bar">
				<text class="sum-item sum-main">总应退：¥ {{ summaryText.totalRefund }}</text>
				<text class="sum-item sum-main">总违约金：¥ {{ summaryText.totalPenalty }}</text>
				<text class="sum-item sum-main">总实退：¥ {{ summaryText.totalFinal }}</text>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">退款用户</uni-th>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'refundNo')">退款单号</uni-th>
							<uni-th align="center" width="100">应退(元)</uni-th>
							<uni-th align="center" width="100">违约金(元)</uni-th>
							<uni-th align="center" width="100">实退(元)</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">创建时间</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="stateFilterData" @filter-change="headerFilterChange($event, 'state')">转款状态</uni-th>
							<uni-th align="center" width="90">审核状态</uni-th>
							<uni-th align="center" width="130">失败原因</uni-th>
							<uni-th align="center" width="140">管理员操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td class="cell-user">{{ item.userDisplay }}</uni-td>
							<uni-td align="center">{{ item.refundNo }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.refundAmountText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.penaltyAmountText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.finalRefundAmountText }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.createTime || '-' }}</uni-td>
							<uni-td align="center">
								<text :class="stateTagClass(item.batchState)">{{ item.batchStateText }}</text>
							</uni-td>
							<uni-td align="center">{{ item.auditStatusText || '-' }}</uni-td>
							<uni-td align="center" class="cell-fail-reason">
								<button v-if="item.transferError" size="mini" class="btn-reason" @click="showFailReason(item)">查看</button>
								<text v-else class="fail-empty">-</text>
							</uni-td>
							<uni-td align="center">
								<view class="op-actions">
									<button
										v-if="item.auditRequired && item.auditStatus === 'pending' && item.batchState === 'PENDING_AUDIT'"
										size="mini"
										type="primary"
										class="op-btn"
										@click="approve(item, 'approve')"
									>
										同意退款
									</button>
									<button
										v-if="item.auditRequired && item.auditStatus === 'pending' && item.batchState === 'PENDING_AUDIT'"
										size="mini"
										type="warn"
										class="op-btn"
										@click="approve(item, 'reject')"
									>
										不同意退款
									</button>
									<button
										v-else-if="item.auditStatus === 'rejected' && item.batchState === 'PROCESSING'"
										size="mini"
										type="warn"
										class="op-btn"
										@click="fixRejectedProcessing(item)"
									>
										单笔状态修复
									</button>
									<button
										v-else-if="item.batchState === 'PROCESSING'"
										size="mini"
										type="warn"
										class="op-btn"
										@click="forceFail(item)"
									>
										标记失败
									</button>
									<text v-else class="op-done">{{ opHint(item) }}</text>
								</view>
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
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
export default {
	data() {
		return {
			searchForm: {
				userKeyword: '',
				refundNo: '',
				state: '',
				stateList: [],
				createTimeStart: '',
				createTimeEnd: ''
			},
			stateFilterData: [
				{ text: '待审核', value: 'PENDING_AUDIT', checked: false },
				{ text: '处理中', value: 'PROCESSING', checked: false },
				{ text: '已成功', value: 'SUCCESS', checked: false },
				{ text: '失败', value: 'FAILED', checked: false },
				{ text: '已拒绝', value: 'REJECTED', checked: false }
			],
			list: [],
			loading: false,
			summary: {
				totalRefund: 0,
				totalPenalty: 0,
				totalFinal: 0
			},
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			auditConfig: {
				memberRequired: false,
				nonMemberRequired: false
			},
			bizConfigRaw: null,
			pollTimer: null,
			pollBusy: false
		};
	},
	computed: {
		summaryText() {
			const s = this.summary || {};
			return {
				totalRefund: Number(s.totalRefund || 0).toFixed(2),
				totalPenalty: Number(s.totalPenalty || 0).toFixed(2),
				totalFinal: Number(s.totalFinal || 0).toFixed(2)
			};
		}
	},
	mounted() {
		this.loadAuditConfig();
		this.search();
		this.startAutoPoll();
	},
	beforeDestroy() {
		this.stopAutoPoll();
	},
	onHide() {
		this.stopAutoPoll();
	},
	onShow() {
		this.startAutoPoll();
	},
	onUnload() {
		this.stopAutoPoll();
	},
	methods: {
		stateTagClass(state) {
			const s = String(state || '');
			if (s === 'SUCCESS') return 'tag-ok';
			if (s === 'FAILED' || s === 'REJECTED') return 'tag-bad';
			if (s === 'PENDING_AUDIT') return 'tag-warn';
			return 'tag-warn';
		},
		startAutoPoll() {
			this.stopAutoPoll();
			this.pollTimer = setInterval(() => {
				this.autoPollProcessing();
			}, 20000);
		},
		stopAutoPoll() {
			if (this.pollTimer) {
				clearInterval(this.pollTimer);
				this.pollTimer = null;
			}
		},
		async autoPollProcessing() {
			if (this.pollBusy || this.loading) return;
			this.pollBusy = true;
			try {
				const res = await this.$request('refundTransferSyncProcessing', { limit: 20 }, { functionName: 'merchant' });
				if (res.code === 0) {
					const changed = Number(res?.data?.success || 0) + Number(res?.data?.failed || 0);
					if (changed > 0) this.search();
				}
			} catch (e) {
			} finally {
				this.pollBusy = false;
			}
		},
		async loadAuditConfig() {
			try {
				const res = await this.$request('bizConfigGet', {}, { functionName: 'merchant' });
				if (res.code !== 0) return;
				this.bizConfigRaw = res.data || {};
				const ra = (res.data && res.data.refundTransferAudit) || {};
				this.auditConfig = {
					memberRequired: !!ra.memberRequired,
					nonMemberRequired: !!ra.nonMemberRequired
				};
			} catch (e) {}
		},
		async onAuditSwitchChange(field, e) {
			const checked = !!(e && e.detail && e.detail.value);
			this.auditConfig[field] = checked;
			const payload = Object.assign({}, this.bizConfigRaw || {});
			payload.refundTransferAudit = Object.assign({}, payload.refundTransferAudit || {}, {
				memberRequired: !!this.auditConfig.memberRequired,
				nonMemberRequired: !!this.auditConfig.nonMemberRequired
			});
			const res = await this.$request('bizConfigSave', payload, { functionName: 'merchant' });
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '保存开关失败', icon: 'none' });
				await this.loadAuditConfig();
				return;
			}
			this.bizConfigRaw = payload;
			uni.showToast({ title: '已更新', icon: 'success' });
		},
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) {
				return { start: '', end: '' };
			}
			const a = Number(filter[0]);
			const b = Number(filter[1]);
			return {
				start: Number.isFinite(a) ? a : '',
				end: Number.isFinite(b) ? b : ''
			};
		},
		buildPayload() {
			const sf = this.searchForm;
			return {
				userKeyword: sf.userKeyword,
				refundNo: sf.refundNo,
				state: sf.stateList.length ? '' : sf.state,
				stateList: sf.stateList,
				createTimeStart: sf.createTimeStart,
				createTimeEnd: sf.createTimeEnd
			};
		},
		runSearchFromHeader() {
			this.pageInfo.currentPage = 1;
			this.search();
		},
		search() {
			this.loading = true;
			this.$request(
				'refundTransferList',
				{
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					...this.buildPayload()
				},
				{ functionName: 'merchant' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code === 0) {
						const raw = res.data.list || [];
						this.list = raw.map((row) =>
							Object.assign({}, row, {
								auditRequired: !!row.auditRequired,
								auditStatus: row.auditStatus || '',
								transferError: row.transferError || ''
							})
						);
						this.pageInfo.total = res.data.total || 0;
						const su = res.data.summary;
						if (su) {
							this.summary = {
								totalRefund: su.totalRefund,
								totalPenalty: su.totalPenalty,
								totalFinal: su.totalFinal
							};
						}
					} else {
						uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					}
				})
				.catch(() => {
					this.loading = false;
				});
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'userKeyword' && filterType === 'search') {
				sf.userKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'refundNo' && filterType === 'search') {
				sf.refundNo = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'createTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.createTimeStart = start;
				sf.createTimeEnd = end;
			} else if (field === 'state' && filterType === 'select') {
				sf.stateList = Array.isArray(filter) ? filter.map(String) : [];
				sf.state = '';
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		opHint(item) {
			if (item.auditRequired && item.auditStatus === 'pending' && item.batchState === 'PROCESSING') {
				return '打款处理中';
			}
			if (item.batchState === 'SUCCESS' || item.applied) return '已完成';
			if (item.batchState === 'FAILED') return '失败/可重试';
			return item.auditStatusText || '—';
		},
		async approve(item, actionType) {
			if (!item || !item.id) return;
			const actionTextMap = {
				approve: '同意退款',
				reject: '不同意退款'
			};
			const actionPromptMap = {
				approve: '确认同意退款吗？确认后将立即向用户发起商家转账（退回充值款）。',
				reject: '确认不同意退款吗？该笔申请将关闭，用户可重新发起退款。'
			};
			const actionText = actionTextMap[actionType] || '审批';
			const confirmRes = await new Promise((resolve) => {
				uni.showModal({
					title: '审批确认',
					content: actionPromptMap[actionType] || `确认将该记录标记为「${actionText}」吗？`,
					success: (res) => resolve(res.confirm)
				});
			});
			if (!confirmRes) return;
			uni.showLoading({ title: '提交中...', mask: true });
			try {
				const res = await this.$request('refundTransferApprove', { id: item.id, actionType }, { functionName: 'merchant' });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '审批失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: res.message || '审批成功', icon: 'success' });
				this.search();
			} catch (err) {
				uni.showToast({ title: err?.message || '审批失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async forceFail(item) {
			if (!item || !item.id) return;
			const ok = await new Promise((resolve) => {
				uni.showModal({
					title: '确认操作',
					content: `确认将退款单 ${item.refundNo || ''} 标记为失败吗？`,
					success: (res) => resolve(!!res.confirm)
				});
			});
			if (!ok) return;
			uni.showLoading({ title: '提交中...', mask: true });
			try {
				let res = await this.$request(
					'refundTransferForceFail',
					{ id: item.id, refundNo: item.refundNo, reason: '管理员手动标记失败' },
					{ functionName: 'merchant' }
				);
				if (res.code !== 0 && String(res.message || '').includes('无效的操作')) {
					// 兼容未升级到 refundTransferForceFail action 的老版本云函数
					res = await this.$request(
						'refundTransferApprove',
						{ id: item.id, actionType: 'forceFail', reason: '管理员手动标记失败' },
						{ functionName: 'merchant' }
					);
				}
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '操作失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '已标记失败', icon: 'success' });
				this.search();
			} catch (e) {
				uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async fixRejectedProcessing(item) {
			if (!item || !item.id) return;
			const ok = await new Promise((resolve) => {
				uni.showModal({
					title: '确认修复',
					content: `确认修复退款单 ${item.refundNo || ''} 的状态吗？\n将从“处理中”修复为“已拒绝”。`,
					success: (res) => resolve(!!res.confirm)
				});
			});
			if (!ok) return;
			uni.showLoading({ title: '修复中...', mask: true });
			try {
				const res = await this.$request(
					'refundTransferFixRejectedProcessing',
					{ id: item.id, refundNo: item.refundNo },
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '修复失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: res.message || '修复成功', icon: 'success' });
				this.search();
			} catch (e) {
				uni.showToast({ title: e?.message || '修复失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		showFailReason(item) {
			const reason = String(item?.transferError || '').trim();
			if (!reason) return;
			uni.showModal({
				title: '失败原因',
				content: reason,
				showCancel: false
			});
		},
		onPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.search();
		},
		onPageSizeChange(size) {
			const s = typeof size === 'number' ? size : Number(size?.pageSize || size?.size || size || 10);
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
			this.pageInfo.currentPage = 1;
			this.search();
		}
	}
};
</script>

<style scoped>
.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.audit-switches {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-right: 8px;
}

.audit-item {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.audit-label {
	font-size: 12px;
	color: #606266;
}

.uni-container {
	padding: 20px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.page-intro {
	margin-bottom: 12px;
	flex-shrink: 0;
}

.page-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #303133;
	margin-bottom: 4px;
}

.page-sub {
	display: block;
	font-size: 13px;
	color: #909399;
}

.summary-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 20px;
	margin-bottom: 12px;
	padding: 10px 12px;
	background: #fafafa;
	border-radius: 6px;
	border: 1px solid #ebeef5;
	flex-shrink: 0;
}

.sum-item {
	font-size: 14px;
	font-weight: 600;
}

.sum-main {
	color: #e6a23c;
}

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
	overflow: hidden;
	height: 100%;
	display: flex;
	flex-direction: column;
}

.uni-pagination-box {
	padding: 12px 16px;
	text-align: right;
	flex-shrink: 0;
}

.cell-user {
	white-space: pre-line;
	font-size: 13px;
	line-height: 1.45;
}

.cell-money {
	font-family: ui-monospace, monospace;
	font-size: 13px;
	color: #303133;
}

.cell-time {
	font-size: 12px;
	color: #606266;
}

.cell-fail-reason {
	font-size: 12px;
}

.btn-reason {
	min-width: 64px;
	height: 26px;
	line-height: 26px;
	padding: 0 10px;
	border-radius: 13px;
	color: #f56c6c;
	border: 1px solid #fbc4c4;
	background: #fff5f5;
}

.fail-empty {
	color: #c0c4cc;
}

.tag-ok {
	color: #18bc37;
	font-weight: 600;
}

.tag-warn {
	color: #e6a23c;
}

.tag-bad {
	color: #f56c6c;
}

.op-actions {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	gap: 6px;
	min-height: 56px;
}

.op-done {
	color: #67c23a;
	font-weight: 600;
	font-size: 12px;
}

.op-btn {
	min-width: 78px;
	height: 26px;
	line-height: 26px;
	padding: 0 8px;
	border-radius: 13px;
}
</style>
