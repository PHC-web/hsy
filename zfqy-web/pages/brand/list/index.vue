<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
		
			<view class="uni-group">
				<view class="form-item">
					<select  size="mini" v-model="searchForm.status">
						<option value="">选择</option>
						<option value="1">启用</option>
						<option value="0">禁用</option>
					</select>
				</view>
				
				<input class="uni-search" size="mini" type="text" v-model="searchForm.brandName" placeholder="请输入品牌名称" />
		
					<button class="uni-button" size="mini" type="default" @click="search">搜索</button>
					<!-- <button class="uni-button" size="mini" type="default" @click="reset">重置</button> -->
					<button class="uni-button" type="primary" size="mini"
						@click="addBrand">添加品牌</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container">
				<uni-table ref="table" border stripe :loading="loading">
					<uni-tr>
						<uni-th align="center" width="80px">品牌ID</uni-th>
						<uni-th align="center" width="120px">品牌名称</uni-th>
						<uni-th align="center" width="120px">激活条件</uni-th>
						<uni-th align="center" width="80px">返佣费</uni-th>
						<uni-th align="center" width="80px">入库台数</uni-th>
						<uni-th align="center" width="80px">绑定数</uni-th>
						<uni-th align="center" width="80px">激活台数</uni-th>
						<uni-th align="center" width="80px">返邮机具</uni-th>
						<uni-th align="center" width="80px">返邮到账</uni-th>
						<uni-th align="center" width="80px">使用状态</uni-th>
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
				branch: '',
				brandName: '',
				status: '',
				statusTime: '',
				addTime: ''
			},
			brandList: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			loading: false
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
		search() {
			this.pageInfo.currentPage = 1;
			this.getBrandList();
		},
		reset() {
			this.searchForm = {
				branch: '',
				brandName: '',
				status: '',
				statusTime: '',
				addTime: ''
			};
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
		}
	}
};
</script>

<style scoped>









.search-form {
	background-color: #fff;
	padding: 15px;
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 15px;
}

.form-row {
	display: flex;
	flex-wrap: wrap;
	margin-bottom: 15px;
	align-items: flex-end;
	justify-content: space-between;
}

.form-item {
	flex: 1;
	min-width: 200px;
	max-width: 500px;
	margin-right: 20px;
	margin-bottom: 0;
}

.form-item label {
	display: block;
	margin-bottom: 8px;
	font-weight: bold;
	font-size: 14px;
	color: #666;
}

.form-item input {
	width: 100%;
	min-width: 200px;
	max-width: 300px;
	padding: 10px;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 14px;
}

.form-item select {
	width: 100%;
	min-width: 200px;
	max-width: 300px;
	padding: 5px 10px 5px 10px;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 14px;
	background-color: #fff;
	appearance: none;
	-webkit-appearance: none;
	-moz-appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10L6 9z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 10px center;
	background-size: 12px;
}

.form-item select:focus {
	outline: none;
	border-color: #409eff;
	box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.submit-btn {
	display: flex;
	gap: 15px;
	justify-content: flex-end;
	align-items: flex-end;
	min-width: 180px;
}

.submit-btn button {
	margin: 0;
	padding: 0 20px;
}

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

@media (max-width: 768px) {
	.uni-header {
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 10px;
	}

	.uni-group {
		width: 100%;
		justify-content: flex-end;
	}

	.form-row {
		flex-direction: column;
		align-items: stretch;
	}

	.form-item {
		margin-right: 0;
		margin-bottom: 10px;
	}

	.submit-btn {
		flex-direction: row;
		justify-content: flex-end;
	}
}
</style>