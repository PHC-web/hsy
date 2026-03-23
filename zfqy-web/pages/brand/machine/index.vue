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
				<view class="search-grid">
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
							<uni-th>绑定人/时间/手机</uni-th>
							<uni-th>是否激活</uni-th>
							<uni-th>所属商户</uni-th>
							<uni-th>业务员</uni-th>
							<uni-th>入库时间</uni-th>
							<uni-th>操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in machineList" :key="item ? item.id : idx" v-if="item">
							<uni-td>{{ item.deviceId }}</uni-td>
							<uni-td>{{ item.brandName }}</uni-td>
							<uni-td>{{ item.totalTransaction }}</uni-td>
							<uni-td>{{ item.pendingWithdrawn }}</uni-td>
							<uni-td>{{ item.frozenAmount }}</uni-td>
							<uni-td>{{ item.speakerId }}</uni-td>
							<uni-td>{{ item.isBoundText }}</uni-td>
							<uni-td>
								<view v-if="item.isBound === 1" class="bind-info">
									<text>{{ item.bindUserName || '-' }}</text>
									<text class="bind-meta">{{ item.bindTime || '-' }}</text>
									<text class="bind-meta">{{ item.bindUserMobile || '-' }}</text>
								</view>
								<text v-else>-</text>
							</uni-td>
							<uni-td>
								{{ item.isActivatedText }}
								<text v-if="item.isActivated" class="time-text">({{ item.activatedTime }})</text>
							</uni-td>
							<uni-td>{{ item.merchant }}</uni-td>
							<uni-td>{{ item.salesman }}</uni-td>
							<uni-td>{{ item.inStockTime }}</uni-td>
							<uni-td>
								<view class="op-actions">
									<view class="op-row">
										<button class="op-btn" size="mini" type="primary" @click="openSwipe(item)">刷卡</button>
										<button class="op-btn" size="mini" type="primary" @click="openTrades(item)">交易</button>
										<button class="op-btn" size="mini" type="primary" @click="抽奖(item)">抽奖</button>
									</view>
									<view class="op-row">
										<button class="op-btn" size="mini" type="default" @click="编辑(item)">编辑</button>
										<button v-if="item.isBound === 1" class="op-btn" size="mini" type="warn" @click="解绑(item)">解绑</button>
										<button v-else class="op-btn" size="mini" type="primary" @click="打开绑定(item)">绑定</button>
										<button class="op-btn" size="mini" type="warn" @click="删除(item)">删除</button>
									</view>
								</view>
							</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
						<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
					</view>
				</view>
			</view>
		</view>

		<uni-popup ref="swipePopup" type="center">
			<view class="popup-card">
				<view class="popup-header">
					<text class="popup-title">虚拟刷卡</text>
					<text class="popup-subtitle">机具编号：{{ (swipeForm && swipeForm.deviceId) || '' }}</text>
				</view>
				<view class="popup-body">
					<uni-forms ref="swipeFormRef" v-model="swipeForm" :rules="swipeRules" validateTrigger="bind" @submit="submitSwipe">
						<uni-forms-item name="amount" label="刷卡金额" required>
							<uni-easyinput v-model="swipeForm.amount" type="number" :clearable="false" placeholder="请输入正数金额" />
						</uni-forms-item>
						<view class="uni-button-group">
							<button style="width: 100px;" type="primary" class="uni-button" :disabled="swipeSubmitting" @click="triggerSwipeSubmit">提交</button>
							<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="swipeSubmitting" @click="$refs.swipePopup.close()">返回</button>
						</view>
					</uni-forms>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="bindPopup" type="center">
			<view class="popup-card">
				<view class="popup-header">
					<text class="popup-title">绑定商户</text>
					<text class="popup-subtitle">机具编号：{{ (bindForm && bindForm.deviceId) || '' }}</text>
				</view>
				<view class="popup-body">
					<uni-forms ref="bindFormRef" v-model="bindForm" :rules="bindRules" validateTrigger="bind" @submit="submitBind">
						<uni-forms-item name="mobile" label="商户手机号" required>
							<uni-easyinput v-model="bindForm.mobile" type="number" placeholder="请输入商户手机号码" :maxlength="11" />
						</uni-forms-item>
						<view class="uni-button-group">
							<button style="width: 100px;" type="primary" class="uni-button" :disabled="bindSubmitting" @click="triggerBindSubmit">确定</button>
							<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="bindSubmitting" @click="$refs.bindPopup.close()">取消</button>
						</view>
					</uni-forms>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="tradePopup" type="center">
			<view class="popup-card popup-wide">
				<view class="popup-header trade-header">
					<view>
						<text class="popup-title">查看交易列表</text>
						<text class="popup-subtitle">机具编号：{{ tradeDeviceId }}</text>
					</view>
					<view class="trade-summary">
						<text class="trade-summary-label">交易额</text>
						<text class="trade-summary-value">￥{{ tradeTotalAmount.toFixed(2) }}</text>
					</view>
				</view>
				<view class="popup-body trade-body">
					<uni-table border stripe :loading="tradeLoading">
						<uni-tr>
							<uni-th align="center" width="120">机具编号</uni-th>
							<uni-th align="center" width="220">交易单号</uni-th>
							<uni-th align="center" width="140">用户信息</uni-th>
							<uni-th align="center" width="100">交易类型</uni-th>
							<uni-th align="center" width="90">是否激活</uni-th>
							<uni-th align="center" width="110">累计交易</uni-th>
							<uni-th align="center" width="90">是否返现</uni-th>
							<uni-th align="center" width="90">本次释放</uni-th>
							<uni-th align="center" width="130">时间</uni-th>
							<uni-th align="center" width="110">分公司</uni-th>
						</uni-tr>
						<uni-tr v-for="(row, idx) in tradeList" :key="idx" v-if="row">
							<uni-td align="center">{{ row.deviceId }}</uni-td>
							<uni-td align="center">{{ row.tradeNo }}</uni-td>
							<uni-td align="center" class="trade-user">{{ row.userInfo }}</uni-td>
							<uni-td align="center">{{ row.tradeType }}</uni-td>
							<uni-td align="center">{{ row.isActivated }}</uni-td>
							<uni-td align="center" class="trade-money">{{ row.totalTransaction }}</uni-td>
							<uni-td align="center">{{ row.cashback }}</uni-td>
							<uni-td align="center">{{ row.releaseAmount }}</uni-td>
							<uni-td align="center">{{ row.createTime }}</uni-td>
							<uni-td align="center">{{ row.company }}</uni-td>
						</uni-tr>
					</uni-table>
					<view class="trade-footer">
						<text class="trade-count">显示第 {{ tradePageInfo.from }} 到第 {{ tradePageInfo.to }} 条记录，共 {{ tradePageInfo.total }} 条记录</text>
						<view class="trade-actions">
							<button class="uni-button" size="mini" type="default" @click="$refs.tradePopup.close()">关闭</button>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import FormInput from '@/components/form/FormInput.vue';
import FormSelect from '@/components/form/FormSelect.vue';
import FormDatePicker from '@/components/form/FormDatePicker.vue';
import UniForms from "@/uni_modules/uni-forms/components/uni-forms/uni-forms";
import UniFormsItem from "@/uni_modules/uni-forms/components/uni-forms-item/uni-forms-item";
import UniEasyinput from "@/uni_modules/uni-easyinput/components/uni-easyinput/uni-easyinput";

export default {
	components: {
		FormInput,
		FormSelect,
		FormDatePicker,
		UniForms,
		UniFormsItem,
		UniEasyinput
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
			swipeSubmitting: false,
			swipeForm: {
				deviceId: '',
				amount: ''
			},
			swipeRules: {
				amount: {
					rules: [
						{ required: true, errorMessage: '请输入刷卡金额' },
						{
							validateFunction: (rule, value, data, callback) => {
								const v = Number(value);
								if (!Number.isFinite(v) || v <= 0) {
									callback('刷卡金额只允许输入正数');
									return;
								}
								callback();
							},
							errorMessage: '刷卡金额只允许输入正数'
						}
					]
				}
			},
			tradeDeviceId: '',
			tradeTotalAmount: 0,
			tradeLoading: false,
			tradeList: [],
			tradePageInfo: {
				page: 1,
				pageSize: 10,
				total: 0,
				from: 0,
				to: 0
			},
			bindForm: {
				deviceId: '',
				mobile: ''
			},
			bindSubmitting: false,
			bindRules: {
				mobile: {
					rules: [
						{ required: true, errorMessage: '请输入商户手机号码' },
						{ pattern: /^1\d{10}$/, errorMessage: '请输入正确的11位手机号' }
					]
				}
			},
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
				this.$request('list', { page: 1, pageSize: 1000 }, {
					functionName: 'brand'
				}).then(res => {
					if (res.code === 0) {
						this.brandList = (res.data?.list || []).map(item => ({
							value: item.id,
							label: item.brandName
						}));
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

			openSwipe(item) {
				if (item?.isBound !== 1 || !item?.bindUserId) {
					uni.showToast({ title: '未绑定用户不允许刷卡', icon: 'none' });
					return;
				}
				this.swipeForm = {
					deviceId: item.deviceId,
					amount: ''
				};
				this.$refs.swipePopup.open();
			},

			triggerSwipeSubmit() {
				this.$refs.swipeFormRef.submit();
			},

			submitSwipe(event) {
				if (this.swipeSubmitting) return;
				const { value, errors } = event.detail || {};
				if (errors) return;

				this.swipeSubmitting = true;
				uni.showLoading({ title: '提交中...', mask: true });
				this.$request('virtualSwipe', {
					deviceId: this.swipeForm.deviceId,
					amount: value.amount
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						uni.showToast({ title: '刷卡成功', icon: 'success' });
						this.$refs.swipePopup.close();
						this.search();
					} else {
						uni.showToast({ title: res.message || '刷卡失败', icon: 'none' });
					}
				}).catch(err => {
					uni.showModal({ content: err?.message || '请求服务失败', showCancel: false });
				}).finally(() => {
					this.swipeSubmitting = false;
					uni.hideLoading();
				});
			},

			openTrades(item) {
				this.tradeDeviceId = item.deviceId;
				const num = Number(String(item.totalTransaction || '').replace(/[^\d.]/g, ''));
				this.tradeTotalAmount = Number.isFinite(num) ? num : 0;
				this.tradePageInfo.page = 1;
				this.fetchTrades();
				this.$refs.tradePopup.open();
			},

			fetchTrades() {
				this.tradeLoading = true;
				this.$request('tradeList', {
					deviceId: this.tradeDeviceId,
					page: this.tradePageInfo.page,
					pageSize: this.tradePageInfo.pageSize
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						this.tradeList = (res.data && res.data.list) ? res.data.list : [];
						this.tradePageInfo.total = (res.data && res.data.total) || 0;
						const from = this.tradePageInfo.total === 0 ? 0 : (this.tradePageInfo.page - 1) * this.tradePageInfo.pageSize + 1;
						const to = Math.min(this.tradePageInfo.page * this.tradePageInfo.pageSize, this.tradePageInfo.total);
						this.tradePageInfo.from = from;
						this.tradePageInfo.to = to;
					} else {
						uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					}
				}).finally(() => {
					this.tradeLoading = false;
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
		刷卡(item) {
			this.openSwipe(item);
		},
		
		// 交易
		交易(item) {
			this.openTrades(item);
		},
		
		// 抽奖
		抽奖(item) {
			uni.showToast({ title: '抽奖功能开发中', icon: 'none' });
		},
		
		// 编辑
		编辑(item) {
			uni.showToast({ title: '编辑功能开发中', icon: 'none' });
		},
		
		// 打开绑定弹窗
			打开绑定(item) {
				this.bindForm = {
					deviceId: item.deviceId,
					mobile: ''
				};
				this.$refs.bindPopup.open();
			},

			triggerBindSubmit() {
				this.$refs.bindFormRef.submit();
			},

			submitBind(event) {
				if (this.bindSubmitting) return;
				const { value, errors } = event.detail || {};
				if (errors) return;

				this.bindSubmitting = true;
				uni.showLoading({ title: '提交中...', mask: true });
				this.$request('bind', {
					id: this.bindForm.deviceId,
					mobile: value.mobile
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						uni.showToast({ title: '绑定成功', icon: 'success' });
						this.$refs.bindPopup.close();
						this.search();
					} else {
						uni.showToast({ title: res.message || '绑定失败', icon: 'none' });
					}
				}).catch(err => {
					uni.showToast({ title: err?.message || '请求失败', icon: 'none' });
				}).finally(() => {
					this.bindSubmitting = false;
					uni.hideLoading();
				});
			},

			// 解绑
			解绑(item) {
				uni.showModal({
					title: '确认解绑',
					content: '此操作将解绑机器、删除流水、删除返邮，确定要解绑吗？此操作将无法恢复！',
					confirmText: '确定解绑',
					cancelText: '取消',
					success: (res) => {
						if (res.confirm) {
							uni.showLoading({ title: '解绑中...', mask: true });
							this.$request('unbind', { id: item.deviceId }, { functionName: 'machine' }).then(r => {
								uni.hideLoading();
								if (r.code === 0) {
									uni.showToast({ title: '解绑成功', icon: 'success' });
									this.search();
								} else {
									uni.showToast({ title: r.message || '解绑失败', icon: 'none' });
								}
							}).catch(() => {
								uni.hideLoading();
								uni.showToast({ title: '请求失败', icon: 'none' });
							});
						}
					}
				});
			},
		
		// 删除
		删除(item) {
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

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.form-item {
	min-width: 0;
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
	max-width: none;
}

.form-item input:focus,
.form-item select:focus {
	outline: none;
	border-color: #409eff;
	box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.submit-btn {
	display: flex;
	align-items: end;
	justify-content: flex-start;
	gap: 10px;
}

.submit-btn button {
	margin-right: 0;
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

.time-text {
	font-size: 12px;
	color: #909399;
	margin-left: 5px;
}

.bind-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 13px;
}
.bind-info .bind-meta {
	font-size: 12px;
	color: #606266;
}

.op-actions {
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: flex-start;
}

.op-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.op-btn {
	margin: 0 !important;
	min-width: 56px;
	padding: 0 10px;
	border-radius: 8px;
}

.op-btn[type="warn"] {
	background-color: #f56c6c;
	border-color: #f56c6c;
}

.op-btn[type="warn"]:active {
	opacity: 0.9;
}

.popup-card {
	width: 520px;
	background: #fff;
	border-radius: 12px;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
	overflow: hidden;
}

.popup-wide {
	width: 1080px;
	max-width: calc(100vw - 80px);
}

.popup-header {
	padding: 14px 18px;
	border-bottom: 1px solid #ebeef5;
	background: #f7f9fc;
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}

.popup-title {
	font-size: 16px;
	font-weight: 700;
	color: #2c3e50;
}

.popup-subtitle {
	font-size: 12px;
	color: #6b7280;
	margin-left: 12px;
}

.popup-body {
	padding: 16px 18px;
}

.trade-header {
	background: #2f3f52;
	color: #fff;
	border-bottom: 0;
}

.trade-header .popup-title,
.trade-header .popup-subtitle {
	color: #fff;
}

.trade-summary {
	display: flex;
	align-items: center;
	gap: 8px;
}

.trade-summary-label {
	font-size: 12px;
	opacity: 0.85;
}

.trade-summary-value {
	font-size: 14px;
	font-weight: 700;
	color: #ff4d4f;
}

.trade-body {
	padding: 0;
}

.trade-user {
	white-space: pre-line;
	color: #111827;
}

.trade-money {
	color: #2b6bff;
	font-weight: 700;
}

.trade-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 10px 14px;
	border-top: 1px solid #ebeef5;
	background: #fff;
}

.trade-count {
	font-size: 12px;
	color: #6b7280;
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

/* 屏幕高度较小时允许表格区域滚动，避免内容被截断 */
@media (max-height: 900px) {
	.table-container-wrapper {
		overflow-y: auto;
	}
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