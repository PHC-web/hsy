<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" @click="reset">重置</button>
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
					<button size="mini" type="primary" @click="search">刷新</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" :key="tableKey" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">用户(昵称/手机)</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'snTrade')">SN/交易单号</uni-th>
							<uni-th align="center" width="120" filter-type="range" @filter-change="headerFilterChange($event, 'amount')" sortable @sort-change="amountSortChange">金额</uni-th>
							<uni-th align="center" width="100">营业执照</uni-th>
							<uni-th align="center" width="100">交易证明</uni-th>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'scenario')">经营场景</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="statusFilterData" @filter-change="headerFilterChange($event, 'status')">状态</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">创建时间</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'updateTime')">更新时间</uni-th>
							<uni-th align="center" width="100">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td class="cell-user">{{ item.userDisplay }}</uni-td>
							<uni-td class="cell-sn">{{ item.snTradeDisplay }}</uni-td>
							<uni-td align="right" class="cell-amount">{{ item.amountText }}</uni-td>
							<uni-td align="center">
								<image v-if="item.businessLicense" class="thumb" :src="item.businessLicense" mode="aspectFit" @click="previewImage(item.businessLicense)" />
								<text v-else>-</text>
							</uni-td>
							<uni-td align="center">
								<image v-if="item.tradeProof" class="thumb" :src="item.tradeProof" mode="aspectFit" @click="previewImage(item.tradeProof)" />
								<text v-else>-</text>
							</uni-td>
							<uni-td>{{ item.businessScenario }}</uni-td>
							<uni-td align="center">
								<text :class="statusClass(item.status)">{{ item.statusText }}</text>
							</uni-td>
							<uni-td align="center" class="cell-time">{{ item.createTime }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.updateTime }}</uni-td>
							<uni-td align="center">
								<text class="op-placeholder">—</text>
							</uni-td>
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
			searchForm: {
				userKeyword: '',
				snTradeKeyword: '',
				amountMin: '',
				amountMax: '',
				scenarioKeyword: '',
				status: '',
				statusList: [],
				createTimeStart: '',
				createTimeEnd: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				sortField: '',
				sortOrder: ''
			},
			statusFilterData: [
				{ text: '待审核', value: 'pending', checked: false },
				{ text: '审核通过', value: 'approved', checked: false },
				{ text: '审核驳回', value: 'rejected', checked: false },
				{ text: '审核中', value: 'reviewing', checked: false }
			],
			list: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			tableKey: 1,
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
	mounted() {
		this.search();
	},
	methods: {
		statusClass(status) {
			const s = String(status || '');
			if (s === 'approved') return 'status-ok';
			if (s === 'rejected') return 'status-bad';
			if (s === 'reviewing') return 'status-warn';
			return 'status-pending';
		},

		previewImage(url) {
			if (!url) return;
			uni.previewImage({ urls: [url], current: url });
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

		parseAmountRange(filter) {
			if (!Array.isArray(filter) || filter.length === 0) {
				return { min: '', max: '' };
			}
			const gt = filter[0];
			const lt = filter[1];
			const min = gt === '' || gt === undefined ? '' : Number(gt);
			const max = lt === '' || lt === undefined ? '' : Number(lt);
			return {
				min: min !== '' && Number.isFinite(min) ? min : '',
				max: max !== '' && Number.isFinite(max) ? max : ''
			};
		},

		runSearchFromHeader() {
			this.pageInfo.currentPage = 1;
			this.search();
		},
		reset() {
			this.searchForm = {
				userKeyword: '',
				snTradeKeyword: '',
				amountMin: '',
				amountMax: '',
				scenarioKeyword: '',
				status: '',
				statusList: [],
				createTimeStart: '',
				createTimeEnd: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				sortField: '',
				sortOrder: ''
			};
			this.statusFilterData = [
				{ text: '待审核', value: 'pending', checked: false },
				{ text: '审核通过', value: 'approved', checked: false },
				{ text: '审核驳回', value: 'rejected', checked: false },
				{ text: '审核中', value: 'reviewing', checked: false }
			];
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},

		search() {
			this.loading = true;
			const sf = this.searchForm;
			this.$request(
				'riskList',
				{
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					userKeyword: sf.userKeyword,
					snTradeKeyword: sf.snTradeKeyword,
					amountMin: sf.amountMin,
					amountMax: sf.amountMax,
					status: sf.statusList.length ? '' : sf.status,
					statusList: sf.statusList,
					createTimeStart: sf.createTimeStart,
					createTimeEnd: sf.createTimeEnd,
					updateTimeStart: sf.updateTimeStart,
					updateTimeEnd: sf.updateTimeEnd,
					scenarioKeyword: sf.scenarioKeyword,
					sortField: sf.sortField,
					sortOrder: sf.sortOrder
				},
				{ functionName: 'machine' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code === 0) {
						this.list = res.data.list || [];
						this.pageInfo.total = res.data.total || 0;
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
			} else if (field === 'snTrade' && filterType === 'search') {
				sf.snTradeKeyword = String(filter == null ? '' : filter).slice(0, 100);
			} else if (field === 'amount' && filterType === 'range') {
				const { min, max } = this.parseAmountRange(filter);
				sf.amountMin = min === '' ? '' : min;
				sf.amountMax = max === '' ? '' : max;
			} else if (field === 'scenario' && filterType === 'search') {
				sf.scenarioKeyword = String(filter == null ? '' : filter).slice(0, 100);
			} else if (field === 'status' && filterType === 'select') {
				sf.statusList = Array.isArray(filter) ? filter.map(String) : [];
				sf.status = '';
			} else if (field === 'createTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.createTimeStart = start;
				sf.createTimeEnd = end;
			} else if (field === 'updateTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.updateTimeStart = start;
				sf.updateTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},

		amountSortChange(e) {
			const order = e && e.order;
			const sf = this.searchForm;
			if (order === 'ascending') {
				sf.sortField = 'amount';
				sf.sortOrder = 'asc';
			} else if (order === 'descending') {
				sf.sortField = 'amount';
				sf.sortOrder = 'desc';
			} else {
				sf.sortField = '';
				sf.sortOrder = '';
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},

		onPageChanged(page) {
			this.pageInfo.currentPage = page;
			this.search();
		},

		onPageSizeChange(size) {
			this.pageInfo.pageSize = size;
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
			const sf = this.searchForm;
			const res = await this.$request('riskList', {
				page: 1,
				pageSize: 10000,
				userKeyword: sf.userKeyword,
				snTradeKeyword: sf.snTradeKeyword,
				amountMin: sf.amountMin,
				amountMax: sf.amountMax,
				status: sf.statusList.length ? '' : sf.status,
				statusList: sf.statusList,
				createTimeStart: sf.createTimeStart,
				createTimeEnd: sf.createTimeEnd,
				updateTimeStart: sf.updateTimeStart,
				updateTimeEnd: sf.updateTimeEnd,
				scenarioKeyword: sf.scenarioKeyword,
				sortField: sf.sortField,
				sortOrder: sf.sortOrder
			}, { functionName: 'machine' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			return (res.data?.list || []).map((x) => ({
				用户: x.userDisplay || '',
				SN交易单号: x.snTradeDisplay || '',
				金额: x.amountText || '',
				经营场景: x.businessScenario || '',
				状态: x.statusText || '',
				创建时间: x.createTime || '',
				更新时间: x.updateTime || ''
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
		toTxt(rows) { return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n'); },
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><risks>${items}</risks>`;
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
				if (!rows.length) return uni.showToast({ title: '暂无可导出数据', icon: 'none' });
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`风险管理_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`风险管理_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`风险管理_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`风险管理_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`风险管理_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`风险管理_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>
.uni-button {
	margin-left: 10px;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}
.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
.export-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 130px; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.12); z-index: 10; padding: 6px; }
.export-menu-item { line-height: 32px; padding: 0 10px; font-size: 13px; color: #303133; border-radius: 6px; cursor: pointer; }
.export-menu-item:hover { background: #f5f7fa; }

.uni-container {
	padding: 20px;
	height: calc(100vh - 50px);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
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

.cell-user,
.cell-sn {
	white-space: pre-line;
	font-size: 13px;
	line-height: 1.45;
}

.cell-amount {
	font-weight: 600;
	color: #2b6bff;
}

.cell-time {
	font-size: 12px;
	color: #606266;
}

.thumb {
	width: 48px;
	height: 48px;
	border-radius: 4px;
	border: 1px solid #ebeef5;
	cursor: pointer;
	vertical-align: middle;
}

.status-pending {
	color: #e6a23c;
}

.status-warn {
	color: #909399;
}

.status-ok {
	color: #18bc37;
}

.status-bad {
	color: #f56c6c;
}

.op-placeholder {
	color: #c0c4cc;
	font-size: 13px;
}

@media (max-height: 900px) {
	.table-container-wrapper {
		overflow-y: auto;
	}
}
</style>
