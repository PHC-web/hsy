<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<view class="audit-switches">
						<view class="audit-item">
							<text class="audit-label">会员提现需审核</text>
							<switch :checked="auditConfig.memberRequired" @change="onAuditSwitchChange('memberRequired', $event)" />
						</view>
						<view class="audit-item">
							<text class="audit-label">非会员提现需审核</text>
							<switch :checked="auditConfig.nonMemberRequired" @change="onAuditSwitchChange('nonMemberRequired', $event)" />
						</view>
					</view>
					<button size="mini" @click="search">刷新</button>
					<button size="mini" type="primary" @click="runSearchFromHeader">查询</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button size="mini" class="export-trigger" @click="toggleExportMenu">
							<text class="bi bi-download export-icon"></text>
							<text>导出</text>
							<text class="bi bi-chevron-down export-caret"></text>
						</button>
						<view v-if="showExportMenu" class="export-menu">
							<view
								v-for="opt in exportTypeOptions"
								:key="opt.value"
								class="export-menu-item"
								@click="selectAndExport(opt.value)"
							>
								{{ opt.text }}
							</view>
						</view>
					</view>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">提现列表</text>
				<text class="page-sub">支持提供给管理员进行代理提现审批</text>
			</view>

			<view class="summary-bar">
				<text class="sum-item sum-main">总提现：¥ {{ summaryText.totalWithdraw }}</text>
				<text class="sum-item sum-main">总手续费+税费：¥ {{ summaryText.totalFeeTax }}</text>
				<text class="sum-item sum-main">总付款：¥ {{ summaryText.totalPayable }}</text>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">提现用户</uni-th>
							<!-- <uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'companyKeyword')">分公司</uni-th> -->
							<!-- <uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'salesmanKeyword')">业务员</uni-th> -->
							<uni-th align="center" width="110" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具号</uni-th>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'withdrawNo')">提现单号</uni-th>
							<uni-th align="center" width="100">提现金额(元)</uni-th>
							<uni-th align="center" width="110">税费+手续费(元)</uni-th>
							<uni-th align="center" width="100">应付金额</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'payTime')">打款时间</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="paidFilterData" @filter-change="headerFilterChange($event, 'isPaid')">是否打款</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'arrivalTime')">到账时间</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="arrivalFilterData" @filter-change="headerFilterChange($event, 'arrivalStatus')">是否到账</uni-th>
							<uni-th align="center" width="90">审核状态</uni-th>
							<uni-th align="center" width="130">失败原因</uni-th>
							<uni-th align="center" width="140">管理员操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td class="cell-user">{{ item.userDisplay }}</uni-td>
							<!-- <uni-td align="center">{{ item.company }}</uni-td> -->
							<!-- <uni-td align="center">{{ item.salesman }}</uni-td> -->
							<uni-td align="center">{{ item.deviceId }}</uni-td>
							<uni-td align="center">{{ item.withdrawNo }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.amountText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.feeTaxText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.payableText }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.payTime || '-' }}</uni-td>
							<uni-td align="center">
								<text
									:class="
										item.isPaid
											? 'tag-paid'
											: item.arrivalStatus === 'expired' || item.arrivalStatus === 'returned'
												? 'tag-bad'
												: 'tag-unpaid'
									"
								>{{ item.isPaidText }}</text>
							</uni-td>
							<uni-td align="center" class="cell-time">{{ item.arrivalTime || '-' }}</uni-td>
							<uni-td align="center">
								<text :class="item.arrivalClassName">{{ item.arrivalStatusText }}</text>
							</uni-td>
							<uni-td align="center">{{ item.auditStatusText || '-' }}</uni-td>
							<uni-td align="center" class="cell-fail-reason">
								<view v-if="item.transferError" class="fail-reason-wrap">
									<text class="fail-reason-text">{{ item.transferError }}</text>
									<button size="mini" class="btn-reason" @click="showFailReason(item)">详情</button>
								</view>
								<text v-else class="fail-empty">-</text>
							</uni-td>
							<uni-td align="center">
								<view class="op-actions">
									<button
										v-if="item.auditRequired && item.auditStatus === 'pending'"
										size="mini"
										type="primary"
										class="op-btn"
										@click="approve(item, 'approve')"
									>{{ item.needReaudit ? '重新同意提现' : '同意提现' }}</button>
									<button
										v-if="item.auditRequired && item.auditStatus === 'pending'"
										size="mini"
										type="warn"
										class="op-btn"
										@click="approve(item, 'reject')"
									>不同意提现</button>
									<text v-else class="op-done">{{ item.auditStatusText || '已处理' }}</text>
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
function arrivalStatusTagClass(status) {
	const s = String(status || '');
	if (s === 'received') return 'tag-ok';
	if (s === 'returned' || s === 'expired') return 'tag-bad';
	return 'tag-warn';
}

export default {
	data() {
		return {
			searchForm: {
				userKeyword: '',
				companyKeyword: '',
				salesmanKeyword: '',
				deviceId: '',
				withdrawNo: '',
				isPaid: '',
				isPaidList: [],
				payTimeStart: '',
				payTimeEnd: '',
				arrivalStatus: '',
				arrivalStatusList: [],
				arrivalTimeStart: '',
				arrivalTimeEnd: ''
			},
			paidFilterData: [
				{ text: '未打款', value: '0', checked: false },
				{ text: '已打款', value: '1', checked: false }
			],
			arrivalFilterData: [
				{ text: '未到账', value: 'pending', checked: false },
				{ text: '已到账', value: 'received', checked: false },
				{ text: '已退回', value: 'returned', checked: false },
				{ text: '已失效', value: 'expired', checked: false }
			],
			list: [],
			loading: false,
			summary: {
				totalWithdraw: 0,
				totalFeeTax: 0,
				totalPayable: 0
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
			pollBusy: false,
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			]
		};
	},
	computed: {
		summaryText() {
			const s = this.summary || {};
			return {
				totalWithdraw: Number(s.totalWithdraw || 0).toFixed(4),
				totalFeeTax: Number(s.totalFeeTax || 0).toFixed(4),
				totalPayable: Number(s.totalPayable || 0).toFixed(4)
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
				const res = await this.$request(
					'withdrawSyncProcessing',
					{ limit: 20 },
					{ functionName: 'merchant' }
				);
				if (res.code === 0) {
					const changed =
						Number(res?.data?.success || 0) +
						Number(res?.data?.failed || 0) +
						Number(res?.data?.reconciled || 0);
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
				const wa = (res.data && res.data.withdrawAudit) || {};
				this.auditConfig = {
					memberRequired: !!wa.memberRequired,
					nonMemberRequired: !!wa.nonMemberRequired
				};
			} catch (e) {}
		},
		async onAuditSwitchChange(field, e) {
			const checked = !!(e && e.detail && e.detail.value);
			this.auditConfig[field] = checked;
			const payload = Object.assign({}, this.bizConfigRaw || {});
			payload.withdrawAudit = Object.assign({}, payload.withdrawAudit || {}, {
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
				companyKeyword: sf.companyKeyword,
				salesmanKeyword: sf.salesmanKeyword,
				deviceId: sf.deviceId,
				withdrawNo: sf.withdrawNo,
				isPaid: sf.isPaidList.length ? '' : sf.isPaid,
				isPaidList: sf.isPaidList,
				payTimeStart: sf.payTimeStart,
				payTimeEnd: sf.payTimeEnd,
				arrivalStatus: sf.arrivalStatusList.length ? '' : sf.arrivalStatus,
				arrivalStatusList: sf.arrivalStatusList,
				arrivalTimeStart: sf.arrivalTimeStart,
				arrivalTimeEnd: sf.arrivalTimeEnd
			};
		},

		runSearchFromHeader() {
			this.pageInfo.currentPage = 1;
			this.search();
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},

		search() {
			this.loading = true;
			this.$request(
				'withdrawList',
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
								arrivalClassName: arrivalStatusTagClass(row.arrivalStatus),
								auditRequired: !!row.auditRequired,
								auditStatus: row.auditStatus || '',
								auditStatusText: row.auditStatusText || '-',
								needReaudit: !!row.needReaudit,
								transferError: row.transferError || ''
							})
						);
						this.pageInfo.total = res.data.total || 0;
						const su = res.data.summary;
						if (su) {
							this.summary = {
								totalWithdraw: su.totalWithdraw,
								totalFeeTax: su.totalFeeTax,
								totalPayable: su.totalPayable
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
			} else if (field === 'companyKeyword' && filterType === 'search') {
				sf.companyKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'salesmanKeyword' && filterType === 'search') {
				sf.salesmanKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'deviceId' && filterType === 'search') {
				sf.deviceId = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'withdrawNo' && filterType === 'search') {
				sf.withdrawNo = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'isPaid' && filterType === 'select') {
				sf.isPaidList = Array.isArray(filter) ? filter.map(String) : [];
				sf.isPaid = '';
			} else if (field === 'payTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.payTimeStart = start;
				sf.payTimeEnd = end;
			} else if (field === 'arrivalTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.arrivalTimeStart = start;
				sf.arrivalTimeEnd = end;
			} else if (field === 'arrivalStatus' && filterType === 'select') {
				sf.arrivalStatusList = Array.isArray(filter) ? filter.map(String) : [];
				sf.arrivalStatus = '';
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},

		async exportCsv() {
			uni.showLoading({ title: '导出中...', mask: true });
			try {
				const res = await this.$request(
					'withdrawExportCsv',
					{
						...this.buildPayload()
					},
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '导出失败', icon: 'none' });
					return;
				}
				const { csv, total, truncated } = res.data || {};
				// #ifdef H5
				const blob = new Blob(['\uFEFF' + (csv || '')], { type: 'text/csv;charset=utf-8;' });
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = `提现列表_${Date.now()}.csv`;
				a.click();
				URL.revokeObjectURL(a.href);
				if (truncated) {
					uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
				}
				// #endif
				// #ifndef H5
				const text = csv || '';
				if (text.length > 8000) {
					uni.showModal({
						content: '当前环境请使用浏览器访问后台以导出完整 CSV。',
						showCancel: false
					});
				} else {
					uni.setClipboardData({
						data: text,
						success: () => {
							uni.showToast({ title: '已复制到剪贴板', icon: 'none' });
						}
					});
				}
				if (truncated) {
					uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
				}
				// #endif
			} catch (err) {
				uni.showToast({ title: err?.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async fetchExportRows() {
			const res = await this.$request(
				'withdrawList',
				{
					page: 1,
					pageSize: 10000,
					...this.buildPayload()
				},
				{ functionName: 'merchant' }
			);
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			const list = res.data?.list || [];
			return list.map((item) => ({
				提现用户: (item.userDisplay || '').replace(/\n/g, ' '),
				分公司: item.company || '',
				业务员: item.salesman || '',
				机具号: item.deviceId || '',
				提现单号: item.withdrawNo || '',
				提现金额: item.amountText || '',
				税费手续费: item.feeTaxText || '',
				应付金额: item.payableText || '',
				打款时间: item.payTime || '',
				是否打款: item.isPaidText || '',
				到账时间: item.arrivalTime || '',
				是否到账: item.arrivalStatusText || '',
				审核状态: item.auditStatusText || '',
				失败原因: item.transferError || ''
			}));
		},
		downloadFile(filename, content, mimeType) {
			// #ifdef H5
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			// #endif
			// #ifndef H5
			uni.setClipboardData({ data: String(content || '') });
			// #endif
		},
		toCsv(rows) {
			const keys = Object.keys(rows[0] || {});
			const esc = (s) => {
				const t = String(s == null ? '' : s);
				return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
			};
			const lines = [keys.join(',')];
			rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(',')));
			return '\uFEFF' + lines.join('\r\n');
		},
		toTxt(rows) {
			return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n');
		},
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><withdraws>${items}</withdraws>`;
		},
		toHtmlTable(rows) {
			const keys = Object.keys(rows[0] || {});
			const th = keys.map((k) => `<th>${k}</th>`).join('');
			const tr = rows.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`).join('');
			return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
		},
		async exportData(type) {
			if (type === 'csv') {
				await this.exportCsv();
				return;
			}
			try {
				uni.showLoading({ title: '导出中...', mask: true });
				const rows = await this.fetchExportRows();
				if (!rows.length) {
					uni.showToast({ title: '暂无可导出数据', icon: 'none' });
					return;
				}
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`提现列表_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`提现列表_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`提现列表_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`提现列表_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`提现列表_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async approve(item, actionType) {
			if (!item || !item.id) return;
			const actionTextMap = {
				approve: '同意提现',
				reject: '不同意提现'
			};
			const actionPromptMap = {
				approve: item.needReaudit
					? '该笔提现微信打款失败，确认重新同意并再次发起打款吗？'
					: '确认同意提现吗？确认后将立即向用户发起商家打款。',
				reject: '确认不同意提现吗？确认后将退回本次冻结的积分与额度。'
			};
			const actionText = actionTextMap[actionType] || '审批';
			const confirmRes = await new Promise((resolve) => {
				uni.showModal({
					title: '审批确认',
					content: actionPromptMap[actionType] || `确认将该记录标记为“${actionText}”吗？`,
					success: (res) => resolve(res.confirm)
				});
			});
			if (!confirmRes) return;

			uni.showLoading({ title: '提交中...', mask: true });
			try {
				const res = await this.$request(
					'withdrawApprove',
					{ id: item.id, actionType },
					{ functionName: 'merchant' }
				);
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

.export-dropdown {
	position: relative;
}

.export-trigger {
	display: flex;
	gap: 6px;
	align-items: center;
}

.export-icon,
.export-caret {
	font-size: 12px;
}

.export-menu {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	min-width: 130px;
	background: #fff;
	border: 1px solid #ebeef5;
	border-radius: 4px;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	z-index: 20;
	padding: 4px 0;
}

.export-menu-item {
	padding: 8px 12px;
	font-size: 12px;
	color: #303133;
	cursor: pointer;
}

.export-menu-item:hover {
	background: #f5f7fa;
	color: #409eff;
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
	color: #f56c6c;
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
	max-width: 220px;
}

.fail-reason-wrap {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.fail-reason-text {
	display: block;
	color: #f56c6c;
	line-height: 1.45;
	word-break: break-all;
	text-align: center;
	max-width: 210px;
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

.tag-paid {
	color: #18bc37;
	font-weight: 600;
}

.tag-unpaid {
	color: #909399;
}

.tag-ok {
	color: #18bc37;
}

.tag-warn {
	color: #e6a23c;
}

.tag-bad {
	color: #f56c6c;
}

.op-placeholder {
	color: #c0c4cc;
	font-size: 13px;
}

.op-actions {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	gap: 6px;
	min-height: 56px;
}

.op-inline {
	display: flex;
	gap: 6px;
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
