<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" type="primary" @click="openAdd">新增</button>
					<button size="mini" type="warn" @click="removeSelected">删除</button>
					<button size="mini" @click="reset">重置</button>
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
			<view class="table-wrap admin-table-slot">
				<uni-table :key="tableKey" border stripe :loading="loading" empty-text="暂无优惠券数据">
					<uni-tr>
						<uni-th align="center" width="46">
							<checkbox :checked="allChecked" @click="toggleAll" />
						</uni-th>
						<uni-th align="center" width="180" filter-type="search" @filter-change="headerFilterChange($event, 'name')">名称</uni-th>
						<uni-th align="center" filter-type="search" @filter-change="headerFilterChange($event, 'description')">说明</uni-th>
						<uni-th align="center" width="90" filter-type="select" :filter-data="typeFilterData" @filter-change="headerFilterChange($event, 'type')">类型</uni-th>
						<uni-th align="center" width="110" filter-type="search" @filter-change="headerFilterChange($event, 'amount')">金额（元）</uni-th>
						<uni-th align="center" width="150" filter-type="search" @filter-change="headerFilterChange($event, 'monthlyThreshold')">月需消费总额（元）</uni-th>
						<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'validDays')">有效天数</uni-th>
						<uni-th align="center" width="170" filter-type="timestamp" @filter-change="headerFilterChange($event, 'updateTime')">更新时间</uni-th>
						<uni-th align="center" width="170" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">创建时间</uni-th>
						<uni-th align="center" width="150">操作</uni-th>
					</uni-tr>
					<uni-tr v-for="item in list" :key="item.id">
						<uni-td align="center">
							<checkbox :checked="selectedIds.includes(item.id)" @click="toggleRow(item.id)" />
						</uni-td>
						<uni-td align="center">{{ item.name }}</uni-td>
						<uni-td align="center">{{ item.description || '-' }}</uni-td>
						<uni-td align="center">{{ item.typeText }}</uni-td>
						<uni-td align="center">{{ item.amount }}</uni-td>
						<uni-td align="center">{{ item.monthlyThreshold }}</uni-td>
						<uni-td align="center">{{ item.validDays }}</uni-td>
						<uni-td align="center">{{ item.updateTime }}</uni-td>
						<uni-td align="center">{{ item.createTime }}</uni-td>
						<uni-td align="center">
							<view class="row-ops">
								<button size="mini" type="primary" @click="openEdit(item)">编辑</button>
								<button size="mini" type="warn" @click="removeOne(item)">删除</button>
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

			<uni-popup ref="formPopup" type="center">
				<view class="dialog-panel">
					<view class="dialog-title">{{ formData.id ? '编辑' : '添加' }}</view>
					<uni-forms ref="form" :modelValue="formData" label-width="100">
						<uni-forms-item label="名称" required>
							<uni-easyinput v-model.trim="formData.name" placeholder="请输入名称" />
						</uni-forms-item>
						<uni-forms-item label="说明">
							<uni-easyinput v-model.trim="formData.description" placeholder="请输入说明" />
						</uni-forms-item>
						<uni-forms-item label="类型" required>
							<uni-data-select v-model="formData.type" :localdata="typeOptions" />
						</uni-forms-item>
						<uni-forms-item label="金额（元）" required>
							<uni-easyinput v-model="formData.amount" type="number" placeholder="请输入金额" />
						</uni-forms-item>
						<uni-forms-item label="月需消费总额（元）" required>
							<uni-easyinput v-model="formData.monthlyThreshold" type="number" placeholder="请输入月需消费总额" />
						</uni-forms-item>
						<uni-forms-item label="有效天数" required>
							<uni-easyinput v-model="formData.validDays" type="number" placeholder="请输入有效天数" />
						</uni-forms-item>
					</uni-forms>
					<view class="dialog-actions">
						<button type="primary" size="mini" @click="save">确定</button>
						<button size="mini" @click="resetForm">重置</button>
					</view>
				</view>
			</uni-popup>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
const defaultForm = () => ({
	id: '',
	name: '',
	description: '',
	type: 'cash',
	amount: '',
	monthlyThreshold: '',
	validDays: 0
});

export default {
	data() {
		return {
			loading: false,
			searchForm: {
				name: '',
				description: '',
				type: '',
				amount: '',
				monthlyThreshold: '',
				validDays: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: ''
			},
			list: [],
			selectedIds: [],
			formData: defaultForm(),
			typeOptions: [
				{ text: '现金券', value: 'cash' },
				{ text: '折扣券', value: 'discount' }
			],
			exportType: 'csv',
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			],
			typeFilterData: [
				{ text: '现金券', value: 'cash', checked: false },
				{ text: '折扣券', value: 'discount', checked: false }
			],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			tableKey: 1
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
			if (this.selectedIds.includes(id)) {
				this.selectedIds = this.selectedIds.filter((x) => x !== id);
			} else {
				this.selectedIds = [...this.selectedIds, id];
			}
		},
		search() {
			this.loading = true;
			this.$request('couponList', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				...this.searchForm
			}, { functionName: 'merchant' }).then((res) => {
				this.loading = false;
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.list = res.data.list || [];
				this.pageInfo.total = res.data.total || 0;
				this.selectedIds = [];
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				name: '',
				description: '',
				type: '',
				amount: '',
				monthlyThreshold: '',
				validDays: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: ''
			};
			this.typeFilterData = [
				{ text: '现金券', value: 'cash', checked: false },
				{ text: '折扣券', value: 'discount', checked: false }
			];
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) return { start: '', end: '' };
			return { start: Number(filter[0]) || '', end: Number(filter[1]) || '' };
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (filterType === 'search' && ['name', 'description', 'amount', 'monthlyThreshold', 'validDays'].includes(field)) {
				sf[field] = String(filter == null ? '' : filter).trim();
			} else if (field === 'type' && filterType === 'select') {
				sf.type = Array.isArray(filter) && filter.length ? String(filter[0]) : '';
			} else if (field === 'updateTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.updateTimeStart = start;
				sf.updateTimeEnd = end;
			} else if (field === 'createTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.createTimeStart = start;
				sf.createTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		openAdd() {
			this.formData = defaultForm();
			this.$refs.formPopup.open();
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.exportType = type;
			this.showExportMenu = false;
			this.exportData(type);
		},
		openEdit(row) {
			let target = row;
			if (!target) return;
			this.formData = {
				id: target.id,
				name: target.name,
				description: target.description,
				type: target.type || 'cash',
				amount: String(target.amount),
				monthlyThreshold: String(target.monthlyThreshold),
				validDays: String(target.validDays)
			};
			this.$refs.formPopup.open();
		},
		resetForm() {
			this.formData = defaultForm();
		},
		save() {
			const payload = {
				id: this.formData.id,
				name: this.formData.name,
				description: this.formData.description,
				type: this.formData.type,
				amount: Number(this.formData.amount),
				monthlyThreshold: Number(this.formData.monthlyThreshold),
				validDays: Number(this.formData.validDays)
			};
			this.$request('couponSave', payload, { functionName: 'merchant' }).then((res) => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '保存失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '保存成功', icon: 'success' });
				this.$refs.formPopup.close();
				this.search();
			});
		},
		removeOne(item) {
			this.removeIds([item.id]);
		},
		removeSelected() {
			if (!this.selectedIds.length) {
				uni.showToast({ title: '请先选择记录', icon: 'none' });
				return;
			}
			this.removeIds(this.selectedIds);
		},
		removeIds(ids) {
			const target = ids.length === 1 ? `优惠券 ${ids[0]}` : `选中的 ${ids.length} 条优惠券`;
			uni.showModal({
				title: '确认删除',
				content: `你确定要删除${target}么？`,
				success: (res) => {
					if (!res.confirm) return;
					this.$request('couponDelete', { ids }, { functionName: 'merchant' }).then((ret) => {
						if (ret.code !== 0) {
							uni.showToast({ title: ret.message || '删除失败', icon: 'none' });
							return;
						}
						uni.showToast({ title: '删除成功', icon: 'success' });
						this.search();
					});
				}
			});
		},
		async fetchExportRows() {
			const res = await this.$request('couponList', {
				page: 1,
				pageSize: 10000,
				...this.searchForm
			}, { functionName: 'merchant' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			const rows = res.data.list || [];
			return rows.map((item) => ({
				名称: item.name,
				说明: item.description || '',
				类型: item.typeText,
				金额: item.amount,
				月需消费总额: item.monthlyThreshold,
				有效天数: item.validDays,
				更新时间: item.updateTime,
				创建时间: item.createTime
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
			return `<?xml version="1.0" encoding="UTF-8"?><coupons>${items}</coupons>`;
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
				if (type === 'json') this.downloadFile(`优惠券_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`优惠券_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`优惠券_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`优惠券_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`优惠券_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`优惠券_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
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
	padding: 16px;
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

.export-dropdown {
	position: relative;
}

.export-trigger {
	display: flex;
	gap: 8px;
	align-items: center;
}

.export-icon,
.export-caret {
	font-size: 12px;
}

.export-menu {
	position: absolute;
	top: calc(100% + 6px);
	left: 0;
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

.table-wrap {
	flex: 1;
	min-height: 0;
	background: #fff;
	border-radius: 4px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.row-ops {
	display: flex;
	gap: 6px;
	justify-content: center;
	align-items: center;
	flex-wrap: nowrap;
}

.row-ops button {
	min-width: 44px;
	padding: 0 8px;
	height: 24px;
	line-height: 24px;
}

.uni-pagination-box {
	padding: 12px 16px;
	text-align: right;
}

.dialog-panel {
	width: 720px;
	background: #fff;
	border-radius: 8px;
	padding: 18px 22px;
}

.dialog-title {
	font-size: 20px;
	font-weight: 600;
	color: #303133;
	margin-bottom: 18px;
}

.dialog-actions {
	margin-top: 14px;
	display: flex;
	gap: 10px;
}

@media (max-width: 900px) {
	.dialog-panel {
		width: 92vw;
	}
}

::v-deep .uni-table-th {
	white-space: nowrap;
}
</style>

