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
				<uni-table :key="tableKey" border stripe :loading="loading" empty-text="暂无额度包数据">
					<uni-tr>
						<uni-th align="center" width="46">
							<checkbox :checked="allChecked" @click="toggleAll" />
						</uni-th>
						<uni-th align="center" width="40">ID</uni-th>
						<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'packageId')">套餐id</uni-th>
						<uni-th align="center" width="80" filter-type="search" @filter-change="headerFilterChange($event, 'title')">标题</uni-th>
						<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'membershipName')">会员名称</uni-th>
						<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'bonusQuota')">免额度</uni-th>
						<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'realQuota')">额度</uni-th>
						<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'price')">套餐价格</uni-th>
						<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'sortOrder')">排序</uni-th>
						<uni-th align="center" width="170">关联商品</uni-th>
						<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'pickTotal')">可选数量</uni-th>
						<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'pickRequired')">必选数量</uni-th>
						<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'briefIntro')">套餐简介</uni-th>
						<uni-th align="center" width="200" filter-type="search" @filter-change="headerFilterChange($event, 'description')">套餐说明</uni-th>
						<uni-th align="center" width="170" filter-type="timestamp" @filter-change="headerFilterChange($event, 'updateTime')">更新时间</uni-th>
						<uni-th align="center" width="170" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">创建时间</uni-th>
						<uni-th align="center" width="120">操作</uni-th>
					</uni-tr>
					<uni-tr v-for="item in list" :key="item.id">
						<uni-td align="center">
							<checkbox :checked="selectedIds.includes(item.id)" @click="toggleRow(item.id)" />
						</uni-td>
						<uni-td align="center">{{ item.id }}</uni-td>
						<uni-td align="center">{{ item.packageId }}</uni-td>
						<uni-td align="center">{{ item.title }}</uni-td>
						<uni-td align="center">{{ item.membershipName || '—' }}</uni-td>
						<uni-td align="center">{{ item.bonusQuota || '-' }}</uni-td>
						<uni-td align="center">¥{{ Number(item.realQuota || 0).toFixed(2) }}</uni-td>
						<uni-td align="center">¥{{ Number(item.price || 0).toFixed(2) }}</uni-td>
						<uni-td align="center">{{ Number(item.sortOrder || 0) }}</uni-td>
						<uni-td align="center">{{ formatRelatedProducts(item.relatedProductIds) }}</uni-td>
						<uni-td align="center">{{ Number(item.pickTotal || 0) }}</uni-td>
						<uni-td align="center">{{ Number(item.pickRequired || 0) }}</uni-td>
						<uni-td align="center">{{ item.briefIntro || '—' }}</uni-td>
						<uni-td align="center">{{ item.description }}</uni-td>
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
					<view class="preview-card">
						<view class="preview-left">
							<text class="preview-label">售价</text>
							<text class="preview-price">{{ Number(formData.price || 0).toFixed(2) }}</text>
						</view>
						<view class="preview-btn">点击兑换</view>
					</view>
					<uni-forms ref="form" :modelValue="formData" label-width="110">
						<uni-forms-item label="套餐id">
							<uni-easyinput :value="previewPackageId" disabled placeholder="随套餐价格自动生成" />
						</uni-forms-item>
						<uni-forms-item label="标题">
							<uni-easyinput :value="previewTitle" disabled placeholder="随套餐价格自动生成" />
						</uni-forms-item>
						<uni-forms-item label="免额度" required>
							<uni-easyinput v-model="formData.bonusQuota" type="number" placeholder="例如 1000000" />
						</uni-forms-item>
						<uni-forms-item label="额度" required>
							<uni-easyinput v-model="formData.realQuota" type="number" placeholder="例如 3800" />
						</uni-forms-item>
						<uni-forms-item label="套餐价格" required>
							<uni-easyinput v-model="formData.price" type="number" placeholder="例如 600" />
						</uni-forms-item>
						<uni-forms-item label="排序" required>
							<uni-easyinput v-model="formData.sortOrder" type="number" placeholder="数字越小越靠前，例如 10" />
						</uni-forms-item>
						<uni-forms-item label="关联商品ID">
							<uni-data-checkbox
								:multiple="true"
								v-model="formData.relatedProductIds"
								:localdata="productSelectOptions"
								mode="tag"
								selected-color="#2979ff"
								selected-text-color="#ffffff"
							/>
						</uni-forms-item>
						<uni-forms-item label="可选数量">
							<uni-easyinput :value="String(formData.pickTotal || 0)" disabled placeholder="根据关联商品自动计算" />
						</uni-forms-item>
						<uni-forms-item label="必选数量">
							<uni-easyinput v-model="formData.pickRequired" type="number" placeholder="几选几中的“选几”" />
						</uni-forms-item>
						<uni-forms-item label="套餐简介">
							<uni-easyinput
								v-model.trim="formData.briefIntro"
								type="textarea"
								:autoHeight="true"
								placeholder="选填；H5 首页额度包卡片优先展示此文案，未填则展示套餐说明"
							/>
						</uni-forms-item>
						<uni-forms-item label="套餐说明" required>
							<uni-easyinput
								v-model.trim="formData.description"
								type="textarea"
								:autoHeight="true"
								placeholder="如图，一千元限时享一百五十万奖励额度，提现额度高达5700"
							/>
						</uni-forms-item>
						<uni-forms-item label="会员名称">
							<uni-easyinput v-model.trim="formData.membershipName" placeholder="H5 展示用，如：白金会员、钻石会员" />
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
	bonusQuota: 0,
	realQuota: 0,
	price: 0,
	sortOrder: 0,
	relatedProductIds: [],
	pickTotal: 0,
	pickRequired: 0,
	briefIntro: '',
	description: '',
	membershipName: ''
});

export default {
	data() {
		return {
			loading: false,
			searchForm: {
				packageId: '',
				title: '',
				membershipName: '',
				bonusQuota: '',
				realQuota: '',
				price: '',
				sortOrder: '',
				pickTotal: '',
				pickRequired: '',
				briefIntro: '',
				description: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: ''
			},
			list: [],
			selectedIds: [],
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			],
			formData: defaultForm(),
			productOptions: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			tableKey: 1
		};
	},
	watch: {
		'formData.relatedProductIds': {
			handler(value) {
				const ids = Array.isArray(value) ? value : [];
				this.formData.pickTotal = ids.length;
				if (Number(this.formData.pickRequired || 0) > ids.length) {
					this.formData.pickRequired = ids.length;
				}
			},
			deep: true
		}
	},
	computed: {
		allChecked() {
			return this.list.length > 0 && this.selectedIds.length === this.list.length;
		},
		previewPackageId() {
			const p = Number(this.formData.price || 0);
			if (!p) return '';
			return `pkg_${String(p).replace('.', '_')}`;
		},
		previewTitle() {
			const p = Number(this.formData.price || 0);
			if (!p) return '';
			return `${p}元套餐`;
		},
		productSelectOptions() {
			return (this.productOptions || []).map((item) => ({
				text: `${item.name || item.id}`,
				value: String(item.id)
			}));
		}
	},
	mounted() {
		this.loadProductOptions();
		this.search();
	},
	methods: {
		async loadProductOptions() {
			try {
				const res = await this.$request('productList', { page: 1, pageSize: 500 }, { functionName: 'merchant' });
				if (res.code === 0) this.productOptions = res.data.list || [];
			} catch (e) {}
		},
		formatRelatedProducts(ids) {
			const arr = Array.isArray(ids) ? ids : [];
			if (!arr.length) return '-';
			const map = new Map((this.productOptions || []).map((x) => [String(x.id), String(x.name || x.id)]));
			return arr.map((id) => map.get(String(id)) || String(id)).join(' / ');
		},
		toggleAll() {
			this.selectedIds = this.allChecked ? [] : this.list.map((x) => x.id);
		},
		toggleRow(id) {
			if (this.selectedIds.includes(id)) this.selectedIds = this.selectedIds.filter((x) => x !== id);
			else this.selectedIds = [...this.selectedIds, id];
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
			this.$request('quotaList', {
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
				packageId: '',
				title: '',
				membershipName: '',
				bonusQuota: '',
				realQuota: '',
				price: '',
				sortOrder: '',
				pickTotal: '',
				pickRequired: '',
				briefIntro: '',
				description: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				createTimeStart: '',
				createTimeEnd: ''
			};
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
			if (filterType === 'search' && ['packageId', 'title', 'membershipName', 'bonusQuota', 'realQuota', 'price', 'sortOrder', 'pickTotal', 'pickRequired', 'briefIntro', 'description'].includes(field)) {
				sf[field] = String(filter == null ? '' : filter).trim();
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
		openEdit(row) {
			if (!row) return;
			const relatedProductIds = Array.isArray(row.relatedProductIds) ? row.relatedProductIds.map((id) => String(id)) : [];
			this.formData = {
				id: row.id,
				bonusQuota: Number(String(row.bonusQuota || '').replace(/[^\d.]/g, '') || 0),
				realQuota: row.realQuota,
				price: row.price,
				sortOrder: Number(row.sortOrder || 0),
				relatedProductIds,
				pickTotal: relatedProductIds.length,
				pickRequired: Number(row.pickRequired || 0),
				briefIntro: row.briefIntro || '',
				description: row.description,
				membershipName: row.membershipName || ''
			};
			this.$refs.formPopup.open();
		},
		resetForm() {
			this.formData = defaultForm();
		},
		save() {
			const relatedProductIds = Array.isArray(this.formData.relatedProductIds) ? this.formData.relatedProductIds.map((id) => String(id)) : [];
			const payload = {
				id: this.formData.id,
				bonusQuota: Number(this.formData.bonusQuota || 0),
				realQuota: Number(this.formData.realQuota || 0),
				price: Number(this.formData.price || 0),
				sortOrder: Number(this.formData.sortOrder || 0),
				relatedProductIds,
				pickTotal: relatedProductIds.length,
				pickRequired: Number(this.formData.pickRequired || 0),
				briefIntro: (this.formData.briefIntro || '').trim(),
				description: this.formData.description,
				membershipName: (this.formData.membershipName || '').trim()
			};
			this.$request('quotaSave', payload, { functionName: 'merchant' }).then((res) => {
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
			const target = ids.length === 1 ? `额度包 ${ids[0]}` : `选中的 ${ids.length} 条额度包`;
			uni.showModal({
				title: '确认删除',
				content: `你确定要删除${target}么？`,
				success: (res) => {
					if (!res.confirm) return;
					this.$request('quotaDelete', { ids }, { functionName: 'merchant' }).then((ret) => {
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
			const res = await this.$request('quotaList', {
				page: 1,
				pageSize: 10000,
				...this.searchForm
			}, { functionName: 'merchant' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			const rows = res.data.list || [];
			return rows.map((item) => ({
				ID: item.id,
				套餐ID: item.packageId,
				标题: item.title,
				免额度: item.bonusQuota || '',
				额度: item.realQuota,
				套餐价格: item.price,
				排序: Number(item.sortOrder || 0),
				关联商品: this.formatRelatedProducts(item.relatedProductIds),
				可选数量: Number(item.pickTotal || 0),
				必选数量: Number(item.pickRequired || 0),
				套餐简介: item.briefIntro || '',
				套餐说明: item.description,
				会员名称: item.membershipName || '',
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
			return `<?xml version="1.0" encoding="UTF-8"?><quotas>${items}</quotas>`;
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
				if (type === 'json') this.downloadFile(`额度包_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`额度包_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`额度包_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`额度包_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`额度包_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`额度包_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
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

.dialog-panel {
	width: 760px;
	background: #fff;
	border-radius: 8px;
	padding: 18px 22px;
	max-height: 80vh;
	overflow-y: auto;
}

.dialog-title {
	font-size: 20px;
	font-weight: 600;
	color: #303133;
	margin-bottom: 12px;
}

.preview-card {
	display: flex;
	justify-content: space-between;
	align-items: center;
	background: linear-gradient(120deg, #e6f7ef 0%, #f4efff 100%);
	border-radius: 8px;
	padding: 14px 16px;
	margin-bottom: 14px;
}

.preview-left {
	display: flex;
	align-items: center;
	gap: 8px;
}

.preview-label {
	color: #606266;
	font-size: 15px;
}

.preview-price {
	color: #f56c6c;
	font-size: 36px;
	font-weight: 700;
	line-height: 1;
}

.preview-btn {
	padding: 10px 20px;
	border-radius: 6px;
	background: #111;
	color: #fff;
	font-size: 16px;
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
</style>
