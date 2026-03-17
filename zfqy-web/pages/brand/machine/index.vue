<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button class="uni-button" type="primary" size="mini" @click="addMachine">添加机具</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="search-form">
				<view class="form-row">
					<view class="form-item">
						<form-input 
							v-model="searchForm.deviceId" 
							label="设备编号" 
							placeholder="请输入设备编号" 
							:maxlength="50"
						/>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.brandId" label="机具品牌">
							<option value="">选择</option>
							<option v-for="brand in brandList" :key="brand.value" :value="brand.value">{{ brand.label }}</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-input 
							v-model="searchForm.speakerId" 
							label="自有音箱号" 
							placeholder="请输入自有音箱号" 
							:maxlength="50"
						/>
					</view>
				</view>
				<view class="form-row">
					<view class="form-item">
						<form-select v-model="searchForm.isBound" label="是否绑定">
							<option value="">全部</option>
							<option value="0">未绑定</option>
							<option value="1">已绑定</option>
							<option value="2">已解绑</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-date-picker 
							v-model="searchForm.bindTime" 
							label="绑定时间" 
							placeholder="选择绑定时间"
							@change="onBindTimeChange"
						/>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.bindUserId" label="绑定用户">
							<option value="">选择</option>
							<!-- 用户列表功能尚未开发，先留空 -->
						</form-select>
					</view>
				</view>
				<view class="form-row">
					<view class="form-item">
						<form-select v-model="searchForm.isActivated" label="是否激活">
							<option value="">全部</option>
							<option value="1">已激活</option>
							<option value="0">未激活</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-date-picker 
							v-model="searchForm.activatedTime" 
							label="激活时间" 
							placeholder="选择激活时间"
							@change="onActivatedTimeChange"
						/>
					</view>
					<view class="form-item">
						<form-date-picker 
							v-model="searchForm.inStockTime" 
							label="入库时间" 
							placeholder="选择入库时间"
							@change="onInStockTimeChange"
						/>
					</view>
				</view>
				<view class="form-row">
					<view class="form-item submit-btn">
						<button size="mini" type="primary" @click="search">提交</button>
						<button size="mini" type="default" @click="reset">重置</button>
					</view>
				</view>
			</view>
			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading">
						<uni-tr>
							<uni-th>设备编码</uni-th>
							<uni-th>机具品牌</uni-th>
							<uni-th>累计交易</uni-th>
							<uni-th>待提/已提</uni-th>
							<uni-th>冻结金额</uni-th>
							<uni-th>自有音箱号</uni-th>
							<uni-th>是否绑定</uni-th>
							<uni-th>是否激活</uni-th>
							<uni-th>所属商户</uni-th>
							<uni-th>业务员</uni-th>
							<uni-th>入库时间</uni-th>
							<uni-th>操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in machineList" :key="item.id">
							<uni-td>{{ item.deviceId }}</uni-td>
							<uni-td>{{ item.brandName }}</uni-td>
							<uni-td>{{ item.totalTransaction }}</uni-td>
							<uni-td>{{ item.pendingWithdrawn }}</uni-td>
							<uni-td>{{ item.frozenAmount }}</uni-td>
							<uni-td>{{ item.speakerId }}</uni-td>
							<uni-td>{{ item.isBoundText }}</uni-td>
							<uni-td>
								{{ item.isActivatedText }}
								<text v-if="item.isActivated" class="time-text">({{ item.activatedTime }})</text>
							</uni-td>
							<uni-td>{{ item.merchant }}</uni-td>
							<uni-td>{{ item.salesman }}</uni-td>
							<uni-td>{{ item.inStockTime }}</uni-td>
							<uni-td>
								<button size="mini" type="primary" @click="刷卡">刷卡</button>
								<button size="mini" type="primary" @click="交易">交易</button>
								<button size="mini" type="primary" @click="抽奖">抽奖</button>
								<button size="mini" type="primary" @click="编辑">编辑</button>
								<button size="mini" type="default" @click="解绑">解绑</button>
								<button size="mini" type="default" @click="删除">删除</button>
							</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
						<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import FormInput from '@/components/form/FormInput.vue';
import FormSelect from '@/components/form/FormSelect.vue';
import FormDatePicker from '@/components/form/FormDatePicker.vue';

export default {
	components: {
		FormInput,
		FormSelect,
		FormDatePicker
	},
	data() {
		return {
			searchForm: {
				deviceId: '',
				brandId: '',
				speakerId: '',
				isBound: '',
				bindTime: '',
				bindTimeStart: '',
				bindTimeEnd: '',
				bindUserId: '',
				isActivated: '',
				activatedTime: '',
				activatedTimeStart: '',
				activatedTimeEnd: '',
				inStockTime: '',
				inStockTimeStart: '',
				inStockTimeEnd: ''
			},
			machineList: [],
			brandList: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			}
		};
	},
	mounted() {
			this.getBrandList();
			this.search();
		},
		methods: {
			// 获取品牌列表
			getBrandList() {
				this.$request('getBrands', {}, {
					functionName: 'machine'
				}).then(res => {
					if (res.code === 0) {
						this.brandList = res.data;
					}
				});
			},
			
			// 搜索
			search() {
				this.loading = true;
				this.$request('list', {
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					deviceId: this.searchForm.deviceId,
					brandId: this.searchForm.brandId,
					speakerId: this.searchForm.speakerId,
					isBound: this.searchForm.isBound,
					bindTimeStart: this.searchForm.bindTimeStart,
					bindTimeEnd: this.searchForm.bindTimeEnd,
					bindUserId: this.searchForm.bindUserId,
					isActivated: this.searchForm.isActivated,
					activatedTimeStart: this.searchForm.activatedTimeStart,
					activatedTimeEnd: this.searchForm.activatedTimeEnd,
					inStockTimeStart: this.searchForm.inStockTimeStart,
					inStockTimeEnd: this.searchForm.inStockTimeEnd
				}, {
					functionName: 'machine'
				}).then(res => {
					this.loading = false;
					if (res.code === 0) {
						this.machineList = res.data.list;
						this.pageInfo.total = res.data.total;
					}
				}).catch(() => {
					this.loading = false;
				});
			},
			
			// 重置
			reset() {
				this.searchForm = {
					deviceId: '',
					brandId: '',
					speakerId: '',
					isBound: '',
					bindTime: '',
					bindTimeStart: '',
					bindTimeEnd: '',
					bindUserId: '',
					isActivated: '',
					activatedTime: '',
					activatedTimeStart: '',
					activatedTimeEnd: '',
					inStockTime: '',
					inStockTimeStart: '',
					inStockTimeEnd: ''
				};
				this.pageInfo.currentPage = 1;
				this.search();
			},
			
			// 分页变化
			onPageChanged(page) {
				this.pageInfo.currentPage = page;
				this.search();
			},
			
			// 页大小变化
			onPageSizeChange(size) {
				this.pageInfo.pageSize = size;
				this.pageInfo.currentPage = 1;
				this.search();
			},
			
			// 添加机具
			addMachine() {
				// 跳转到添加页面
				uni.navigateTo({
					url: '/pages/brand/machine/add'
				});
			},
			
			// 绑定时间变化
			onBindTimeChange(value, range) {
				this.searchForm.bindTime = value;
				this.searchForm.bindTimeStart = range ? range.start : '';
				this.searchForm.bindTimeEnd = range ? range.end : '';
			},
			
			// 激活时间变化
			onActivatedTimeChange(value, range) {
				this.searchForm.activatedTime = value;
				this.searchForm.activatedTimeStart = range ? range.start : '';
				this.searchForm.activatedTimeEnd = range ? range.end : '';
			},
			
			// 入库时间变化
			onInStockTimeChange(value, range) {
				this.searchForm.inStockTime = value;
				this.searchForm.inStockTimeStart = range ? range.start : '';
				this.searchForm.inStockTimeEnd = range ? range.end : '';
			},
		
		// 刷卡
		刷卡() {
			uni.showToast({ title: '刷卡功能开发中', icon: 'none' });
		},
		
		// 交易
		交易() {
			uni.showToast({ title: '交易功能开发中', icon: 'none' });
		},
		
		// 抽奖
		抽奖() {
			uni.showToast({ title: '抽奖功能开发中', icon: 'none' });
		},
		
		// 编辑
		编辑() {
			uni.showToast({ title: '编辑功能开发中', icon: 'none' });
		},
		
		// 解绑
		解绑() {
			uni.showToast({ title: '解绑功能开发中', icon: 'none' });
		},
		
		// 删除
		删除() {
			uni.showToast({ title: '删除功能开发中', icon: 'none' });
		}
	}
};
</script>

<style scoped>




.uni-button {
	margin-left: 10px;
}

.uni-container {
	padding: 20px;
	height: calc(100vh - 50px);
	display: flex;
	flex-direction: column;
}

.search-form {
	background-color: #ffffff;
	padding: 20px;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
	margin-bottom: 20px;
	flex-shrink: 0;
}

.table-container-wrapper {
	flex: 1;
	overflow-y: auto;
}

.form-row {
	display: flex;
	margin-bottom: 15px;
}

.form-item {
	flex: 1;
	margin-right: 20px;
	max-width: 400px;
}

.form-item:last-child {
	margin-right: 0;
}

.form-item label {
	display: block;
	margin-bottom: 8px;
	font-size: 14px;
	color: #606266;
}

.form-item input,
.form-item select {
	width: 100%;
	padding: 8px 12px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	font-size: 14px;
	max-width: 300px;
}

.form-item input:focus,
.form-item select:focus {
	outline: none;
	border-color: #409eff;
	box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.submit-btn {
	display: flex;
	align-items: flex-end;
}

.submit-btn button {
	margin-right: 10px;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

.uni-pagination-box {
	padding: 20px;
	text-align: right;
}

.time-text {
	font-size: 12px;
	color: #909399;
	margin-left: 5px;
}

.datetime-shortcut {
	display: flex;
	flex-wrap: wrap;
	padding: 10px;
	background-color: #f5f7fa;
	border-bottom: 1px solid #ebeef5;
}

.datetime-shortcut button {
	margin: 5px;
	padding: 5px 10px;
	font-size: 12px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	background-color: #ffffff;
}

.datetime-shortcut button:hover {
	border-color: #409eff;
	color: #409eff;
}
</style>