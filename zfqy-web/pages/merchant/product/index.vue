<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" type="primary" @click="openAdd">新增</button>
					<button size="mini" type="warn" @click="removeSelected">删除</button>
					<button size="mini" @click="reset">重置</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-wrap admin-table-slot">
				<view class="table-scroll">
					<uni-table :key="tableKey" border stripe :loading="loading" empty-text="暂无商品数据">
						<uni-tr>
							<uni-th align="center" width="48"><checkbox :checked="allChecked" @click="toggleAll" /></uni-th>
							<uni-th align="left" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'name')">商品名称</uni-th>
							<uni-th align="left" width="280" filter-type="search" @filter-change="headerFilterChange($event, 'intro')">商品介绍</uni-th>
							<uni-th align="center" width="96">商品图片</uni-th>
							<uni-th
								align="center"
								width="88"
								filter-type="select"
								:filter-data="enabledFilterData"
								@filter-change="headerFilterChange($event, 'isEnabled')"
							>状态</uni-th>
							<uni-th align="center" width="80" filter-type="search" @filter-change="headerFilterChange($event, 'sortOrder')">排序</uni-th>
							<uni-th align="center" width="168">更新时间</uni-th>
							<uni-th align="center" width="168">创建时间</uni-th>
							<uni-th align="center" width="140">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center"><checkbox :checked="selectedIds.includes(item.id)" @click="toggleRow(item.id)" /></uni-td>
							<uni-td align="left">
								<text class="cell-name" :title="item.name">{{ item.name || '-' }}</text>
							</uni-td>
							<uni-td align="left">
								<text class="cell-intro" :title="item.intro || ''">{{ item.intro || '-' }}</text>
							</uni-td>
							<uni-td align="center">
								<image
									v-if="item.image"
									class="cover"
									:src="item.image"
									mode="aspectFill"
									@click="previewImg(item.image)"
								/>
								<text v-else class="cell-muted">-</text>
							</uni-td>
							<uni-td align="center">
								<text class="status-tag" :class="item.isEnabled !== false ? 'status-tag--on' : 'status-tag--off'">
									{{ item.isEnabledText }}
								</text>
							</uni-td>
							<uni-td align="center">
								<text class="sort-num">{{ Number(item.sortOrder || 0) }}</text>
							</uni-td>
							<uni-td align="center">
								<text class="cell-time">{{ item.updateTime || '-' }}</text>
							</uni-td>
							<uni-td align="center">
								<text class="cell-time">{{ item.createTime || '-' }}</text>
							</uni-td>
							<uni-td align="center">
								<view class="row-ops">
									<button class="act-btn act-btn--edit" @click="openEdit(item)">编辑</button>
									<button class="act-btn act-btn--danger" @click="removeOne(item)">删除</button>
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

			<uni-popup ref="formPopup" type="center">
				<view class="dialog-panel">
					<view class="dialog-title">{{ formData.id ? '编辑商品' : '新增商品' }}</view>
					<uni-forms :modelValue="formData" label-width="100">
						<uni-forms-item label="商品名称" required><uni-easyinput v-model.trim="formData.name" placeholder="请输入商品名称" /></uni-forms-item>
						<uni-forms-item label="商品介绍" required><uni-easyinput v-model.trim="formData.intro" placeholder="请输入商品介绍" /></uni-forms-item>
						<uni-forms-item label="图片URL" required>
							<textarea v-model="formData.imagesText" class="img-textarea" placeholder="每行一个图片URL，第一张作为封面" />
						</uni-forms-item>
						<uni-forms-item label="状态">
							<switch :checked="formData.isEnabled" @change="formData.isEnabled = !!$event.detail.value" />
						</uni-forms-item>
						<uni-forms-item label="排序"><uni-easyinput v-model="formData.sortOrder" type="number" placeholder="数字越小越靠前" /></uni-forms-item>
					</uni-forms>
					<view class="dialog-actions">
						<button size="mini" type="primary" @click="save">确定</button>
						<button size="mini" @click="resetForm">重置</button>
					</view>
				</view>
			</uni-popup>
		</view>
		<!-- #ifndef H5 --><fix-window /><!-- #endif -->
	</view>
</template>

<script>
const defaultForm = () => ({ id: '', name: '', intro: '', imagesText: '', isEnabled: true, sortOrder: 0 });
export default {
	data() {
		return {
			loading: false,
			list: [],
			selectedIds: [],
			tableKey: 1,
			searchForm: { name: '', intro: '', isEnabled: '', sortOrder: '' },
			enabledFilterData: [
				{ text: '上架', value: '1', checked: false },
				{ text: '下架', value: '0', checked: false }
			],
			formData: defaultForm(),
			pageInfo: { currentPage: 1, pageSize: 10, total: 0 }
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
			this.selectedIds = this.selectedIds.includes(id)
				? this.selectedIds.filter((x) => x !== id)
				: [...this.selectedIds, id];
		},
		previewImg(url) {
			const src = String(url || '').trim();
			if (!src) return;
			uni.previewImage({ urls: [src], current: src });
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			if (filterType === 'search' && ['name', 'intro', 'sortOrder'].includes(field)) {
				this.searchForm[field] = String(filter == null ? '' : filter).trim();
			}
			if (field === 'isEnabled' && filterType === 'select') {
				this.searchForm.isEnabled = Array.isArray(filter) && filter.length ? String(filter[0]) : '';
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		search() {
			this.loading = true;
			this.$request(
				'productList',
				{ page: this.pageInfo.currentPage, pageSize: this.pageInfo.pageSize, ...this.searchForm },
				{ functionName: 'merchant' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code !== 0) return uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					this.list = res.data.list || [];
					this.pageInfo.total = res.data.total || 0;
					this.selectedIds = [];
				})
				.catch(() => {
					this.loading = false;
				});
		},
		reset() {
			this.searchForm = { name: '', intro: '', isEnabled: '', sortOrder: '' };
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		openAdd() {
			this.formData = defaultForm();
			this.$refs.formPopup.open();
		},
		openEdit(row) {
			this.formData = {
				id: row.id,
				name: row.name,
				intro: row.intro,
				imagesText: (row.images || []).join('\n'),
				isEnabled: row.isEnabled !== false,
				sortOrder: Number(row.sortOrder || 0)
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
				intro: this.formData.intro,
				imagesText: this.formData.imagesText,
				isEnabled: !!this.formData.isEnabled,
				sortOrder: Number(this.formData.sortOrder || 0)
			};
			this.$request('productSave', payload, { functionName: 'merchant' }).then((res) => {
				if (res.code !== 0) return uni.showToast({ title: res.message || '保存失败', icon: 'none' });
				uni.showToast({ title: '保存成功', icon: 'success' });
				this.$refs.formPopup.close();
				this.search();
			});
		},
		removeOne(item) {
			this.removeIds([item.id]);
		},
		removeSelected() {
			if (!this.selectedIds.length) return uni.showToast({ title: '请先选择记录', icon: 'none' });
			this.removeIds(this.selectedIds);
		},
		removeIds(ids) {
			uni.showModal({
				title: '确认删除',
				content: `你确定要删除选中的 ${ids.length} 条商品么？`,
				success: (res) => {
					if (!res.confirm) return;
					this.$request('productDelete', { ids }, { functionName: 'merchant' }).then((ret) => {
						if (ret.code !== 0) return uni.showToast({ title: ret.message || '删除失败', icon: 'none' });
						uni.showToast({ title: '删除成功', icon: 'success' });
						this.search();
					});
				}
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
	border-radius: 8px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
	overflow: hidden;
	display: flex;
	flex-direction: column;
}
.table-scroll {
	flex: 1;
	min-height: 0;
	overflow: auto;
}
.cell-name {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: #303133;
	line-height: 1.4;
	word-break: break-all;
}
.cell-intro {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	font-size: 13px;
	color: #606266;
	line-height: 1.5;
	text-align: left;
	word-break: break-word;
	white-space: normal;
}
.cell-muted {
	color: #c0c4cc;
	font-size: 13px;
}
.cell-time {
	font-size: 12px;
	color: #909399;
	white-space: nowrap;
}
.cover {
	width: 56px;
	height: 56px;
	border-radius: 8px;
	background: #f5f7fa;
	border: 1px solid #ebeef5;
	cursor: pointer;
	vertical-align: middle;
}
.status-tag {
	display: inline-block;
	min-width: 44px;
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 600;
	line-height: 20px;
}
.status-tag--on {
	color: #067647;
	background: #ecfdf3;
}
.status-tag--off {
	color: #b54708;
	background: #fffaeb;
}
.sort-num {
	display: inline-block;
	min-width: 28px;
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 13px;
	font-weight: 600;
	color: #409eff;
	background: #ecf5ff;
}
.row-ops {
	display: inline-flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: 8px;
	justify-content: center;
	align-items: center;
	white-space: nowrap;
}
.act-btn {
	margin: 0;
	padding: 0 12px;
	height: 28px;
	line-height: 28px;
	font-size: 12px;
	border-radius: 4px;
	border: 1px solid transparent;
	background: #fff;
	box-sizing: border-box;
}
.act-btn::after {
	border: none;
}
.act-btn--edit {
	color: #409eff;
	border-color: #b3d8ff;
	background: #ecf5ff;
}
.act-btn--edit:hover {
	color: #fff;
	background: #409eff;
	border-color: #409eff;
}
.act-btn--danger {
	color: #f56c6c;
	border-color: #fbc4c4;
	background: #fef0f0;
}
.act-btn--danger:hover {
	color: #fff;
	background: #f56c6c;
	border-color: #f56c6c;
}
.uni-pagination-box {
	padding: 12px 16px;
	text-align: right;
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
.img-textarea {
	width: 100%;
	min-height: 110px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	padding: 8px;
	box-sizing: border-box;
}
.dialog-actions {
	margin-top: 14px;
	display: flex;
	gap: 10px;
}
</style>
