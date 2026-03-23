<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="uni-sub-title hide-on-phone">商户列表</view>
				<button size="mini" type="primary" @click="goAdd">模拟商户注册</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="search-form">
				<view class="search-grid">
					<view class="form-item">
						<form-input v-model="searchForm.mobile" label="手机号码" placeholder="请输入手机号码" :maxlength="11" @input="onMobileInput" />
					</view>
					<view class="form-item">
						<form-input v-model="searchForm.deviceId" label="机具号码" placeholder="请输入机具号码" :maxlength="50" @input="onDeviceInput" />
					</view>
					<view class="form-item">
						<form-input v-model="searchForm.wxNickname" label="微信用户" placeholder="请输入微信用户" :maxlength="20" />
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.useStatus" label="使用状态">
							<option value="">全部</option>
							<option value="1">正常</option>
							<option value="0">异常</option>
						</form-select>
					</view>

					<view class="form-item">
						<form-select v-model="searchForm.flag1" label="1">
							<option value="">全部</option>
							<option value="0">禁用</option>
							<option value="1">启用</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.flag2" label="2">
							<option value="">全部</option>
							<option value="0">禁用</option>
							<option value="1">启用</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.flag3" label="3">
							<option value="">全部</option>
							<option value="0">禁用</option>
							<option value="1">启用</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.microMerchant" label="小微商户">
							<option value="">全部</option>
							<option value="0">禁用</option>
							<option value="1">启用</option>
						</form-select>
					</view>

					<view class="form-item">
						<form-date-picker v-model="searchForm.loginTime" label="登录时间" placeholder="选择登录时间" @change="onLoginTimeChange" />
					</view>
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
							<uni-th align="center" width="60">头像</uni-th>
							<uni-th align="center" width="60">协议</uni-th>
							<uni-th align="center" width="120">机具号码</uni-th>
							<uni-th align="center" width="160">微信用户</uni-th>
							<uni-th align="center" width="90">剩余额度</uni-th>
							<uni-th align="center" width="90">待提现</uni-th>
							<uni-th align="center" width="90">已提现</uni-th>
							<uni-th align="center" width="90">冻结金额</uni-th>
							<uni-th align="center" width="70">优惠券</uni-th>
							<uni-th align="center" width="80">使用状态</uni-th>
							<uni-th align="center" width="60">1</uni-th>
							<uni-th align="center" width="60">2</uni-th>
							<uni-th align="center" width="60">3</uni-th>
							<uni-th align="center" width="80">小微商户</uni-th>
							<uni-th align="center" width="150">登录时间</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center">
								<image class="avatar" :src="item.avatar || defaultAvatar" mode="aspectFill" />
							</uni-td>
							<uni-td align="center">
								<image class="agreement" :src="item.agreement || defaultAgreement" mode="aspectFill" />
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ item.deviceDisplay }}</view>
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ item.wxUser }}</view>
							</uni-td>
							<uni-td align="center" class="money">{{ item.remainingQuota }}</uni-td>
							<uni-td align="center" class="money">{{ item.pendingWithdraw }}</uni-td>
							<uni-td align="center" class="money">{{ item.withdrawn }}</uni-td>
							<uni-td align="center" class="money">{{ item.frozenAmount }}</uni-td>
							<uni-td align="center">{{ item.couponCount }}</uni-td>
							<uni-td align="center">
								<switch :checked="item.status" @change="onSwitch(item, 'status', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag1" @change="onSwitch(item, 'flag1', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag2" @change="onSwitch(item, 'flag2', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag3" @change="onSwitch(item, 'flag3', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.microMerchant" @change="onSwitch(item, 'micro_merchant', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">{{ item.loginTime }}</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
						<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
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
import FormInput from '@/components/form/FormInput.vue';
import FormSelect from '@/components/form/FormSelect.vue';
import FormDatePicker from '@/components/form/FormDatePicker.vue';

export default {
	components: { FormInput, FormSelect, FormDatePicker },
	data() {
		return {
			searchForm: {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				microMerchant: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			},
			list: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			defaultAvatar: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M24 24a7 7 0 1 0-7-7 7 7 0 0 0 7 7Zm0 4c-7.18 0-13 3.13-13 7v2h26v-2c0-3.87-5.82-7-13-7Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E',
			defaultAgreement: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M15 12h14l4 4v20H15V12Zm14 1.5V17h3.5L29 13.5ZM18 20h12v2H18v-2Zm0 5h12v2H18v-2Zm0 5h9v2h-9v-2Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E'
		};
	},
	mounted() {
		this.search();
	},
	methods: {
		onMobileInput(val) {
			this.searchForm.mobile = String(val || '').replace(/\D/g, '').slice(0, 11);
		},
		onDeviceInput(val) {
			this.searchForm.deviceId = String(val || '').replace(/\D/g, '').slice(0, 50);
		},
		onLoginTimeChange(value, range) {
			this.searchForm.loginTime = value;
			this.searchForm.loginTimeStart = range ? range.start : '';
			this.searchForm.loginTimeEnd = range ? range.end : '';
		},
		search() {
			this.loading = true;
			this.$request('list', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				mobile: this.searchForm.mobile,
				deviceId: this.searchForm.deviceId,
				wxNickname: this.searchForm.wxNickname,
				useStatus: this.searchForm.useStatus,
				flag1: this.searchForm.flag1,
				flag2: this.searchForm.flag2,
				flag3: this.searchForm.flag3,
				microMerchant: this.searchForm.microMerchant,
				loginTimeStart: this.searchForm.loginTimeStart,
				loginTimeEnd: this.searchForm.loginTimeEnd
			}, { functionName: 'merchant' }).then(res => {
				this.loading = false;
				if (res.code === 0) {
					this.list = res.data.list;
					this.pageInfo.total = res.data.total;
				} else {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
				}
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				microMerchant: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			};
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
		goAdd() {
			uni.navigateTo({ url: '/pages/merchant/list/add' });
		},
		onSwitch(item, field, value) {
			this.$request('updateSwitch', { id: item.id, field, value }, { functionName: 'merchant' }).then(res => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '更新失败', icon: 'none' });
					this.search();
				}
			}).catch(() => {
				uni.showToast({ title: '网络错误', icon: 'none' });
				this.search();
			});
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

.search-form {
	background-color: #ffffff;
	padding: 14px 16px;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
	margin-bottom: 12px;
	flex-shrink: 0;
}

.search-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px 14px;
	align-items: end;
}

.form-item {
	min-width: 0;
}

.submit-btn {
	display: flex;
	align-items: end;
	gap: 10px;
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

.avatar,
.agreement {
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: #f3f4f6;
}

.agreement {
	border-radius: 8px;
}

.cell-multiline {
	white-space: pre-line;
	line-height: 18px;
}

.money {
	color: #2b6bff;
	font-weight: 600;
}

@media (max-width: 1200px) {
	.search-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

@media (max-width: 992px) {
	.search-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 768px) {
	.search-grid {
		grid-template-columns: 1fr;
	}
}
</style>

