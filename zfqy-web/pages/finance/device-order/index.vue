<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" type="warn" @click="batchDelete">批量删除</button>
					<button size="mini" @click="reset">重置</button>
					<button size="mini" type="primary" @click="search">刷新</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button size="mini" class="export-trigger" @click="toggleExportMenu">
							<text class="bi bi-download export-icon"></text>
							<text>导出</text>
							<text class="bi bi-chevron-down export-caret"></text>
						</button>
						<view v-if="showExportMenu" class="export-menu">
							<view v-for="opt in exportTypeOptions" :key="opt.value" class="export-menu-item" @click="selectAndExport(opt.value)">
								{{ opt.text }}
							</view>
						</view>
					</view>
				</view>
			</view>
		</view>

		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">设备订单</text>
				<text class="page-sub">支持提供给管理员进行提现订单管理</text>
			</view>

			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table :key="tableKey" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="46"><checkbox :checked="allChecked" @click="toggleAll" /></uni-th>
							<uni-th align="center" width="110" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具号</uni-th>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'companyKeyword')">分公司</uni-th>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'salesmanKeyword')">业务员</uni-th>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">微信用户</uni-th>
							<uni-th align="center" width="70">微信头像</uni-th>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'withdrawNo')">平台单号</uni-th>
							<uni-th align="center" width="90">应付金额</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="paidFilterData" @filter-change="headerFilterChange($event, 'isPaid')">支付状态</uni-th>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'wxTradeNo')">微信单号</uni-th>
							<uni-th align="center" width="90">实付金额</uni-th>
							<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'deviceKeyword')">设备</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'payTime')">支付时间</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">申请时间</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center"><checkbox :checked="selectedIds.includes(item.id)" @click="toggleRow(item.id)" /></uni-td>
							<uni-td align="center">{{ item.deviceId || '-' }}</uni-td>
							<uni-td align="center">{{ item.company || '-' }}</uni-td>
							<uni-td align="center">{{ item.salesman || '-' }}</uni-td>
							<uni-td align="center">{{ item.userName || '-' }}</uni-td>
							<uni-td align="center">
								<image v-if="item.avatar" class="avatar" :src="item.avatar" mode="aspectFill" />
								<text v-else>-</text>
							</uni-td>
							<uni-td align="center">{{ item.withdrawNo || '-' }}</uni-td>
							<uni-td align="right" class="money">{{ item.payableText }}</uni-td>
							<uni-td align="center">
								<text :class="item.isPaid ? 'tag-ok' : 'tag-warn'">{{ item.isPaidText }}</text>
							</uni-td>
							<uni-td align="center">{{ item.wxTradeNo || '-' }}</uni-td>
							<uni-td align="right" class="money">{{ item.realPayText }}</uni-td>
							<uni-td align="center">{{ item.deviceLabel || '-' }}</uni-td>
							<uni-td align="center">{{ item.payTime || '-' }}</uni-td>
							<uni-td align="center">{{ item.createTime || '-' }}</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
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
			loading: false,
			tableKey: 1,
			selectedIds: [],
			showExportMenu: false,
			searchForm: {
				deviceId: '',
				companyKeyword: '',
				salesmanKeyword: '',
				userKeyword: '',
				withdrawNo: '',
				isPaid: '',
				isPaidList: [],
				payTimeStart: '',
				payTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: '',
				deviceKeyword: '',
				wxTradeNo: ''
			},
			paidFilterData: [
				{ text: '未支付', value: '0', checked: false },
				{ text: '已支付', value: '1', checked: false }
			],
			list: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
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
		allChecked() {
			return this.list.length > 0 && this.selectedIds.length === this.list.length;
		}
	},
	mounted() {
		this.search();
	},
	methods: {
		toggleAll() {
			this.selectedIds = this.allChecked ? [] : this.list.map((x) => x.id);
		},
		toggleRow(id) {
			if (this.selectedIds.includes(id)) this.selectedIds = this.selectedIds.filter((x) => x !== id);
			else this.selectedIds = [...this.selectedIds, id];
		},
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) return { start: '', end: '' };
			return { start: Number(filter[0]) || '', end: Number(filter[1]) || '' };
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (filterType === 'search' && ['deviceId', 'companyKeyword', 'salesmanKeyword', 'userKeyword', 'withdrawNo', 'deviceKeyword', 'wxTradeNo'].includes(field)) {
				sf[field] = String(filter == null ? '' : filter).trim();
			} else if (field === 'isPaid' && filterType === 'select') {
				sf.isPaidList = Array.isArray(filter) ? filter.map(String) : [];
				sf.isPaid = '';
			} else if (field === 'payTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.payTimeStart = start;
				sf.payTimeEnd = end;
			} else if (field === 'createTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.createTimeStart = start;
				sf.createTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		buildPayload() {
			const sf = this.searchForm;
			return {
				deviceId: sf.deviceId,
				companyKeyword: sf.companyKeyword,
				salesmanKeyword: sf.salesmanKeyword,
				userKeyword: sf.userKeyword,
				withdrawNo: sf.withdrawNo,
				isPaid: sf.isPaidList.length ? '' : sf.isPaid,
				isPaidList: sf.isPaidList,
				payTimeStart: sf.payTimeStart,
				payTimeEnd: sf.payTimeEnd,
				createTimeStart: sf.createTimeStart,
				createTimeEnd: sf.createTimeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('withdrawList', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				...this.buildPayload()
			}, { functionName: 'merchant' }).then((res) => {
				this.loading = false;
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const rows = res.data?.list || [];
				this.list = rows.map((item) => {
					const payable = Number(item.payable || 0);
					const feeTax = Number(item.feeTax || 0);
					return {
						...item,
						userName: (item.userDisplay || '').split('\n')[0] || '-',
						avatar: '',
						wxTradeNo: '',
						realPayText: (payable - feeTax).toFixed(4),
						deviceLabel: item.deviceId || '-',
						createTime: item.createTime || ''
					};
				});
				this.pageInfo.total = res.data?.total || 0;
				this.selectedIds = [];
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				deviceId: '',
				companyKeyword: '',
				salesmanKeyword: '',
				userKeyword: '',
				withdrawNo: '',
				isPaid: '',
				isPaidList: [],
				payTimeStart: '',
				payTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: '',
				deviceKeyword: '',
				wxTradeNo: ''
			};
			this.paidFilterData = [
				{ text: '未支付', value: '0', checked: false },
				{ text: '已支付', value: '1', checked: false }
			];
			this.tableKey += 1;
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
		async fetchExportRows() {
			const res = await this.$request('withdrawList', {
				page: 1,
				pageSize: 10000,
				...this.buildPayload()
			}, { functionName: 'merchant' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			const list = res.data?.list || [];
			return list.map((item) => ({
				机具号: item.deviceId || '',
				分公司: item.company || '',
				业务员: item.salesman || '',
				微信用户: (item.userDisplay || '').replace(/\n/g, ' '),
				平台单号: item.withdrawNo || '',
				应付金额: item.payableText || '',
				支付状态: item.isPaidText || '',
				微信单号: '',
				实付金额: (Number(item.payable || 0) - Number(item.feeTax || 0)).toFixed(4),
				设备: item.deviceId || '',
				支付时间: item.payTime || '',
				申请时间: item.createTime || ''
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
			return `<?xml version="1.0" encoding="UTF-8"?><orders>${items}</orders>`;
		},
		toHtmlTable(rows) {
			const keys = Object.keys(rows[0] || {});
			const th = keys.map((k) => `<th>${k}</th>`).join('');
			const tr = rows.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`).join('');
			return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
		},
		async exportData(type) {
			try {
				uni.showLoading({ title: '导出中...', mask: true });
				const rows = await this.fetchExportRows();
				if (!rows.length) {
					uni.showToast({ title: '暂无可导出数据', icon: 'none' });
					return;
				}
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`订单管理_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`订单管理_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`订单管理_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`订单管理_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`订单管理_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`订单管理_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async batchDelete() {
			if (!this.selectedIds.length) {
				uni.showToast({ title: '请先选择订单', icon: 'none' });
				return;
			}
			const confirmRes = await new Promise((resolve) => {
				uni.showModal({
					title: '删除确认',
					content: `确认删除选中的 ${this.selectedIds.length} 条记录吗？`,
					success: (r) => resolve(!!r.confirm)
				});
			});
			if (!confirmRes) return;
			uni.showLoading({ title: '处理中...', mask: true });
			try {
				const res = await this.$request('withdrawDelete', { ids: this.selectedIds }, { functionName: 'merchant' });
				if (res.code !== 0) throw new Error(res.message || '删除失败');
				uni.showToast({ title: '批量删除成功', icon: 'success' });
				this.search();
			} catch (e) {
				uni.showToast({ title: e?.message || '批量删除失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		onPageChanged(page) {
			this.pageInfo.currentPage = page;
			this.search();
		},
		onPageSizeChange(size) {
			this.pageInfo.pageSize = size;
			this.pageInfo.currentPage = 1;
			this.search();
		}
	}
};
</script>

<style scoped>
.uni-container {
	padding: 20px;
	height: calc(100vh - 50px);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.page-intro {
	margin-bottom: 10px;
}

.page-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #303133;
}

.page-sub {
	display: block;
	font-size: 13px;
	color: #909399;
	margin-top: 2px;
}

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #fff;
	border-radius: 4px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
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

.money {
	color: #2b6bff;
	font-weight: 600;
}

.tag-ok {
	color: #18bc37;
}

.tag-warn {
	color: #e6a23c;
}

.avatar {
	width: 28px;
	height: 28px;
	border-radius: 50%;
}

.export-dropdown {
	position: relative;
}

.export-trigger {
	display: flex;
	align-items: center;
	gap: 8px;
}

.export-icon {
	font-size: 12px;
}

.export-caret {
	font-size: 12px;
	opacity: 0.8;
}

.export-menu {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	min-width: 130px;
	background: #fff;
	border: 1px solid #ebeef5;
	border-radius: 8px;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
	z-index: 10;
	padding: 6px;
}

.export-menu-item {
	line-height: 32px;
	padding: 0 10px;
	font-size: 13px;
	color: #303133;
	border-radius: 6px;
	cursor: pointer;
}

.export-menu-item:hover {
	background: #f5f7fa;
}

::v-deep .uni-table-th {
	white-space: nowrap;
}
</style>
