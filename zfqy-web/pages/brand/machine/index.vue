<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<input class="uni-search" type="text" v-model="searchForm.deviceId" maxlength="50" @confirm="runSearchFromHeader"
					placeholder="设备编号" />
				<button class="uni-button hide-on-phone" type="default" size="mini" @click="runSearchFromHeader">搜索</button>
				<button class="uni-button" type="primary" size="mini" @click="addMachine">添加机具</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">设备编码</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="brandFilterData" @filter-change="headerFilterChange($event, 'brandId')">机具品牌</uni-th>
							<uni-th align="center" width="90">累计交易</uni-th>
							<uni-th align="center" width="100">待提/已提</uni-th>
							<uni-th align="center" width="90">冻结金额</uni-th>
							<uni-th align="center" width="110" filter-type="search" @filter-change="headerFilterChange($event, 'speakerId')">自有音箱号</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isBoundFilterData" @filter-change="headerFilterChange($event, 'isBound')">是否绑定</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'bindTime')">绑定人/时间/手机</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isActivatedFilterData" @filter-change="headerFilterChange($event, 'isActivated')">是否激活</uni-th>
							<uni-th align="center" width="130" filter-type="timestamp" @filter-change="headerFilterChange($event, 'activatedTime')">激活时间</uni-th>
							<uni-th align="center" width="100">所属商户</uni-th>
							<uni-th align="center" width="90">业务员</uni-th>
							<uni-th align="center" width="130" filter-type="timestamp" @filter-change="headerFilterChange($event, 'inStockTime')">入库时间</uni-th>
							<uni-th align="center" width="220">操作</uni-th>
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
							<uni-td align="center">{{ item.isActivatedText }}</uni-td>
							<uni-td align="center">{{ item.isActivated ? item.activatedTime : '-' }}</uni-td>
							<uni-td>{{ item.merchant }}</uni-td>
							<uni-td>{{ item.salesman }}</uni-td>
							<uni-td align="center">{{ item.inStockTime }}</uni-td>
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
import UniForms from "@/uni_modules/uni-forms/components/uni-forms/uni-forms";
import UniFormsItem from "@/uni_modules/uni-forms/components/uni-forms-item/uni-forms-item";
import UniEasyinput from "@/uni_modules/uni-easyinput/components/uni-easyinput/uni-easyinput";

export default {
	components: {
		UniForms,
		UniFormsItem,
		UniEasyinput
	},
	data() {
		return {
			searchForm: {
				deviceId: '',
				brandId: '',
				brandIds: [],
				speakerId: '',
				isBound: '',
				isBoundList: [],
				bindTimeStart: '',
				bindTimeEnd: '',
				isActivated: '',
				isActivatedList: [],
				activatedTimeStart: '',
				activatedTimeEnd: '',
				inStockTimeStart: '',
				inStockTimeEnd: ''
			},
			isBoundFilterData: [
				{ text: '未绑定', value: '0', checked: false },
				{ text: '已绑定', value: '1', checked: false },
				{ text: '已解绑', value: '2', checked: false }
			],
			isActivatedFilterData: [
				{ text: '已激活', value: '1', checked: false },
				{ text: '未激活', value: '0', checked: false }
			],
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
	computed: {
		brandFilterData() {
			return (this.brandList || []).map((brand) => ({
				text: brand.label,
				value: String(brand.value),
				checked: false
			}));
		}
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
							value: String(item.id),
							label: item.brandName
						}));
					}
				});
			},
			
			// 搜索
			search() {
				this.loading = true;
				const sf = this.searchForm;
				this.$request('list', {
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					deviceId: sf.deviceId,
					brandId: sf.brandIds.length ? '' : sf.brandId,
					brandIds: sf.brandIds,
					speakerId: sf.speakerId,
					isBound: sf.isBoundList.length ? '' : sf.isBound,
					isBoundList: sf.isBoundList,
					bindTimeStart: sf.bindTimeStart,
					bindTimeEnd: sf.bindTimeEnd,
					isActivated: sf.isActivatedList.length ? '' : sf.isActivated,
					isActivatedList: sf.isActivatedList,
					activatedTimeStart: sf.activatedTimeStart,
					activatedTimeEnd: sf.activatedTimeEnd,
					inStockTimeStart: sf.inStockTimeStart,
					inStockTimeEnd: sf.inStockTimeEnd
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

			runSearchFromHeader() {
				this.pageInfo.currentPage = 1;
				this.search();
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

			headerFilterChange(e, field) {
				const { filterType, filter } = e || {};
				const sf = this.searchForm;
				if (field === 'deviceId' && filterType === 'search') {
					sf.deviceId = String(filter == null ? '' : filter).slice(0, 50);
				} else if (field === 'speakerId' && filterType === 'search') {
					sf.speakerId = String(filter == null ? '' : filter).slice(0, 50);
				} else if (field === 'brandId' && filterType === 'select') {
					sf.brandIds = Array.isArray(filter) ? filter.map(String) : [];
					sf.brandId = '';
				} else if (field === 'isBound' && filterType === 'select') {
					sf.isBoundList = Array.isArray(filter) ? filter.map(String) : [];
					sf.isBound = '';
				} else if (field === 'isActivated' && filterType === 'select') {
					sf.isActivatedList = Array.isArray(filter) ? filter.map(String) : [];
					sf.isActivated = '';
				} else if (field === 'bindTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.bindTimeStart = start;
					sf.bindTimeEnd = end;
				} else if (field === 'activatedTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.activatedTimeStart = start;
					sf.activatedTimeEnd = end;
				} else if (field === 'inStockTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.inStockTimeStart = start;
					sf.inStockTimeEnd = end;
				}
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

/* 屏幕高度较小时允许表格区域滚动，避免内容被截断 */
@media (max-height: 900px) {
	.table-container-wrapper {
		overflow-y: auto;
	}
}

</style>