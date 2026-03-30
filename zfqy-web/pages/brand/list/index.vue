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
					<button type="primary" size="mini" @click="addBrand">添加品牌</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container">
				<uni-table ref="table" :key="tableKey" border stripe :loading="loading">
					<uni-tr>
						<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'brandId')">品牌ID</uni-th>
						<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'brandName')">品牌名称</uni-th>
						<uni-th align="center" width="120px">激活条件</uni-th>
						<uni-th align="center" width="80px">返佣费</uni-th>
						<uni-th align="center" width="80px">入库台数</uni-th>
						<uni-th align="center" width="80px">绑定数</uni-th>
						<uni-th align="center" width="80px">激活台数</uni-th>
						<uni-th align="center" width="80px">返邮机具</uni-th>
						<uni-th align="center" width="80px">返邮到账</uni-th>
						<uni-th align="center" width="90" filter-type="select" :filter-data="statusFilterData" @filter-change="headerFilterChange($event, 'status')">使用状态</uni-th>
						<uni-th align="center" width="200px">状态时间</uni-th>
						<uni-th align="center" width="200px">添加时间</uni-th>
						<uni-th align="center">操作</uni-th>
					</uni-tr>
					<uni-tr v-for="(item, index) in brandList" :key="index">
						<uni-td align="center">{{ item.id }}</uni-td>
						<uni-td align="center">{{ item.brandName }}</uni-td>
						<uni-td align="center">{{ item.activationCondition }}</uni-td>
						<uni-td align="center">{{ item.commission }}</uni-td>
						<uni-td align="center">{{ item.inStockCount }}</uni-td>
						<uni-td align="center">{{ item.bindCount }}</uni-td>
						<uni-td align="center">{{ item.activatedCount }}</uni-td>
						<uni-td align="center">{{ item.returnMachine }}</uni-td>
						<uni-td align="center">{{ item.returnPayment }}</uni-td>
						<uni-td align="center">
							<switch v-model="item.status" @change="changeStatus(item.id, item.status)" />
						</uni-td>
						<uni-td align="center">{{ item.statusTime }}</uni-td>
						<uni-td align="center">{{ item.addTime }}</uni-td>
						<uni-td align="center">
							<view class="uni-group">
								<button type="primary" size="mini" @click="editBrand(item.id)">编辑</button>
								<button type="primary" size="mini" @click="bindMachine(item.id)">绑定机具</button>
								<button type="warn" size="mini" @click="deleteBrand(item.id)">删除</button>
							</view>
						</uni-td>
					</uni-tr>
				</uni-table>
				<view class="uni-pagination-box">
					<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
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
				brandId: '',
				brandName: '',
				status: ''
			},
			tableKey: 1,
			statusFilterData: [
				{ text: '启用', value: '1', checked: false },
				{ text: '禁用', value: '0', checked: false }
			],
			brandList: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			loading: false,
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
		this.getBrandList();
	},
	methods: {
		addBrand() {
			uni.navigateTo({
				url: './add'
			});
		},
		editBrand(id) {
			uni.navigateTo({
				url: `./add?id=${id}`
			});
		},
		bindMachine(id) {
			console.log('绑定机具', id);
		},
		deleteBrand(id) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除该品牌吗？',
				confirmText: '确定',
				cancelText: '取消',
				success: (res) => {
					if (res.confirm) {
						this.$request('delete', { id }, {
							functionName: 'brand'
						}).then(res => {
							if (res.code === 0) {
								uni.showToast({ title: '删除成功', icon: 'success' });
								this.getBrandList();
							} else {
								uni.showToast({ title: res.message || '删除失败', icon: 'none' });
							}
						}).catch(err => {
							uni.showToast({ title: '网络错误', icon: 'none' });
							console.error('删除品牌失败:', err);
						});
					}
				}
			});
		},
		changeStatus(id, status) {
			this.$request('updateStatus', { id, status }, {
				functionName: 'brand'
			}).then(res => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '更新状态失败', icon: 'none' });
					this.getBrandList();
				}
			}).catch(err => {
				uni.showToast({ title: '网络错误', icon: 'none' });
				console.error('更新品牌状态失败:', err);
				this.getBrandList();
			});
		},
		reset() {
			this.searchForm = {
				brandId: '',
				brandName: '',
				status: ''
			};
			this.statusFilterData = [
				{ text: '启用', value: '1', checked: false },
				{ text: '禁用', value: '0', checked: false }
			];
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.getBrandList();
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			if (field === 'brandId' && filterType === 'search') {
				this.searchForm.brandId = String(filter == null ? '' : filter).trim().slice(0, 50);
			} else if (field === 'brandName' && filterType === 'search') {
				this.searchForm.brandName = String(filter == null ? '' : filter).trim().slice(0, 80);
			} else if (field === 'status' && filterType === 'select') {
				this.searchForm.status = Array.isArray(filter) && filter.length ? String(filter[0]) : '';
			}
			this.pageInfo.currentPage = 1;
			this.getBrandList();
		},
		onPageChanged(e) {
			this.pageInfo.currentPage = e;
			this.getBrandList();
		},
		onPageSizeChange(e) {
			this.pageInfo.pageSize = e;
			this.getBrandList();
		},
		getBrandList() {
			this.loading = true;
			this.$request('list', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				brandId: this.searchForm.brandId,
				brandName: this.searchForm.brandName,
				status: this.searchForm.status
			}, {
				functionName: 'brand'
			}).then(res => {
				this.loading = false;
				if (res.code === 0) {
					this.brandList = res.data.list;
					this.pageInfo.total = res.data.total;
				} else {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
				}
			}).catch(err => {
				this.loading = false;
				uni.showToast({ title: '网络错误', icon: 'none' });
				console.error('获取品牌列表失败:', err);
			});
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},
		async fetchExportRows() {
			const res = await this.$request('list', {
				page: 1,
				pageSize: 10000,
				brandId: this.searchForm.brandId,
				brandName: this.searchForm.brandName,
				status: this.searchForm.status
			}, { functionName: 'brand' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			return (res.data?.list || []).map((x) => ({
				品牌ID: x.id || '',
				品牌名称: x.brandName || '',
				激活条件: x.activationCondition || '',
				返佣费: x.commission || '',
				入库台数: x.inStockCount || 0,
				绑定数: x.bindCount || 0,
				激活台数: x.activatedCount || 0,
				返邮机具: x.returnMachine || 0,
				返邮到账: x.returnPayment || 0,
				使用状态: x.status ? '启用' : '禁用',
				状态时间: x.statusTime || '',
				添加时间: x.addTime || ''
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
			return `<?xml version="1.0" encoding="UTF-8"?><brands>${items}</brands>`;
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
				if (type === 'json') this.downloadFile(`品牌列表_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`品牌列表_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`品牌列表_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`品牌列表_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`品牌列表_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`品牌列表_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
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









.header-actions {
	display: flex;
	gap: 15px;
	align-items: center;
	margin-left: auto;
}

.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
.export-menu {
	position: absolute; right: 0; top: calc(100% + 6px); min-width: 130px;
	background: #fff; border: 1px solid #ebeef5; border-radius: 8px;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12); z-index: 10; padding: 6px;
}
.export-menu-item { line-height: 32px; padding: 0 10px; font-size: 13px; color: #303133; border-radius: 6px; cursor: pointer; }
.export-menu-item:hover { background: #f5f7fa; }

.table-container {
	background-color: #fff;
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	padding: 15px;
	overflow-x: hidden;
	width: 100%;
}

uni-table {
	width: 100%;
	min-width: 0;
}

uni-th {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 13px;
	padding: 8px 12px;
}

uni-td {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 13px;
	padding: 8px 12px;
}

.uni-pagination-box {
	margin-top: 20px;
	text-align: right;
}

</style>