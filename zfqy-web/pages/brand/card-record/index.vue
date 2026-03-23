<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="uni-sub-title hide-on-phone">刷卡记录</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="intro">
				<text class="intro-desc">支持提供给管理员对激活机具的刷卡记录进行查看</text>
				<view class="intro-rules">
					<text class="intro-item">· 刷卡激活：新卡本后台必须先机具入库处于未激活状态、单次刷卡金额必须大于设置的激活额度方可有效</text>
					<text class="intro-item">· 自动返邮：彩卡的必须先通过下单码或者由业务员在后台协助下单成功后方可有效</text>
					<text class="intro-item">· 代理权益：主要根据平台规则来定</text>
				</view>
			</view>

			<view class="search-form">
				<view class="search-grid">
					<view class="form-item">
						<form-input v-model="searchForm.deviceId" label="机具编号" placeholder="请输入机具编号" :maxlength="50" />
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.brandId" label="机具品牌" placeholder="请选择机具品牌">
							<option value="">全部</option>
							<option v-for="b in brandList" :key="b.value" :value="b.value">{{ b.label }}</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-input v-model="searchForm.tradeNo" label="交易单号" placeholder="请输入交易单号" :maxlength="50" />
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.merchantUserId" label="交易用户" placeholder="交易用户">
							<option value="">全部</option>
							<option v-for="m in merchantList" :key="m.id" :value="String(m.userId)">{{ m.wxUser }}</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.isActivated" label="是否激活">
							<option value="">全部</option>
							<option value="1">是</option>
							<option value="0">否</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.isCashback" label="是否返现">
							<option value="">全部</option>
							<option value="1">是</option>
							<option value="0">否</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-input v-model="searchForm.releaseAmount" label="本次释放" placeholder="正数" type="digit" @input="onReleaseAmountInput" />
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.riskStatus" label="风控状态">
							<option value="">全部</option>
							<option value="risk">风控</option>
							<option value="release">解除</option>
							<option value="no">否</option>
						</form-select>
					</view>
					<view class="form-item">
						<form-date-picker v-model="searchForm.tradeTime" label="交易时间" placeholder="交易时间" @change="onTradeTimeChange" />
					</view>
					<view class="form-item">
						<form-select v-model="searchForm.tradeType" label="交易类型">
							<option value="">全部</option>
							<option value="virtual">虚拟刷卡</option>
							<option value="real">实际消费</option>
						</form-select>
					</view>
					<view class="form-item submit-btn">
						<button size="mini" type="button" class="btn-primary" @click.prevent.stop="search">提交</button>
						<button size="mini" type="button" @click.prevent.stop="reset">重置</button>
					</view>
				</view>
			</view>

			<view class="summary-bar">
				<text class="summary-label">交易额</text>
				<text class="summary-value">¥{{ totalAmountText }}</text>
				<text class="refresh-icon" @click="search">🔄</text>
			</view>

			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading">
						<uni-tr>
							<uni-th>机具编号</uni-th>
							<uni-th>交易单号</uni-th>
							<uni-th>用户信息</uni-th>
							<uni-th>交易类型</uni-th>
							<uni-th>是否激活</uni-th>
							<uni-th>累计交易</uni-th>
							<uni-th>是否返现</uni-th>
							<uni-th>本次释放</uni-th>
							<uni-th>风控状态</uni-th>
							<uni-th>业务员</uni-th>
							<uni-th>分公司</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td>{{ item.deviceDisplay }}</uni-td>
							<uni-td>{{ item.tradeNo }}</uni-td>
							<uni-td class="cell-user">{{ item.userInfo }}</uni-td>
							<uni-td>
								<text class="amount-inline">{{ item.amountText }}</text>
								<text class="type-inline">{{ item.tradeTypeText }}</text>
							</uni-td>
							<uni-td>
								{{ item.isActivatedText }}
								<text v-if="item.isActivated" class="time-suffix">({{ item.activatedTime }})</text>
							</uni-td>
							<uni-td>
								<text class="money">{{ item.totalTransactionText }}</text>
								<text class="ratio-suffix">{{ item.ssfl }}</text>
							</uni-td>
							<uni-td>
								<text v-if="item.cashback > 0">{{ item.cashbackText }}</text>
								<text v-else>-</text>
								<text v-if="item.cashbackTime" class="time-suffix">{{ item.cashbackTime }}</text>
							</uni-td>
							<uni-td>
								<text v-if="item.releaseAmount > 0">{{ item.releaseAmountText }}</text>
								<text v-else>-</text>
								<text v-if="item.releaseRatioText !== '-'" class="ratio-suffix">{{ item.releaseRatioText }}</text>
							</uni-td>
							<uni-td>{{ item.riskStatus }}</uni-td>
							<uni-td>{{ item.salesman }}{{ item.salesmanTime ? '\n' + item.salesmanTime : '' }}</uni-td>
							<uni-td>
								<text class="company-main">{{ item.company }}</text>
								<text v-if="item.company" class="company-sub">({{ item.company }})</text>
							</uni-td>
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
				deviceId: '',
				brandId: '',
				tradeNo: '',
				merchantUserId: '',
				isActivated: '',
				isCashback: '',
				releaseAmount: '',
				riskStatus: '',
				tradeTime: '',
				timeStart: '',
				timeEnd: '',
				tradeType: ''
			},
			list: [],
			loading: false,
			totalAmount: 0,
			brandList: [],
			merchantList: [],
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			}
		};
	},
	computed: {
		totalAmountText() {
		 const n = Number(this.totalAmount);
		 return Number.isFinite(n) ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
		}
	},
	mounted() {
		this.getBrandList();
		this.getMerchantList();
		this.search();
	},
	methods: {
		getBrandList() {
			this.$request('list', { page: 1, pageSize: 1000 }, { functionName: 'brand' }).then(res => {
				if (res.code === 0 && res.data && res.data.list) {
						this.brandList = res.data.list.map(item => ({ value: String(item.id), label: item.brandName }));
				}
			});
		},
		getMerchantList() {
			this.$request('list', { page: 1, pageSize: 1000 }, { functionName: 'merchant' }).then(res => {
				if (res.code === 0 && res.data && res.data.list) {
						this.merchantList = res.data.list.map(m => ({
							...m,
							userId: String(m.userId)
						}));
				}
			});
		},
		onReleaseAmountInput(val) {
			const v = String(val || '').replace(/[^\d.]/g, '');
			const num = parseFloat(v);
			if (v !== '' && (isNaN(num) || num < 0)) {
				this.searchForm.releaseAmount = '';
				return;
			}
			this.searchForm.releaseAmount = v;
		},
		onTradeTimeChange(value, range) {
			this.searchForm.tradeTime = value;
			this.searchForm.timeStart = range && range.start ? range.start : '';
			this.searchForm.timeEnd = range && range.end ? range.end : '';
		},
		search() {
			// 点击瞬间快照表单，避免下拉框在异步或重绘时被重置导致请求用错条件
			const form = {
				deviceId: this.searchForm.deviceId,
				brandId: this.searchForm.brandId,
				tradeNo: this.searchForm.tradeNo,
				merchantUserId: this.searchForm.merchantUserId,
				isActivated: this.searchForm.isActivated,
				isCashback: this.searchForm.isCashback,
				releaseAmount: this.searchForm.releaseAmount,
				riskStatus: this.searchForm.riskStatus,
				timeStart: this.searchForm.timeStart,
				timeEnd: this.searchForm.timeEnd,
				tradeType: this.searchForm.tradeType
			};
			this.loading = true;
			this.$request('cardRecordList', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				...form
			}, { functionName: 'machine' }).then(res => {
				this.loading = false;
				if (res.code === 0) {
					this.list = (res.data && res.data.list) ? res.data.list : [];
					this.pageInfo.total = (res.data && res.data.total) || 0;
					this.totalAmount = (res.data && res.data.totalAmount) || 0;
				} else {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
				}
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				deviceId: '',
				brandId: '',
				tradeNo: '',
				merchantUserId: '',
				isActivated: '',
				isCashback: '',
				releaseAmount: '',
				riskStatus: '',
				tradeTime: '',
				timeStart: '',
				timeEnd: '',
				tradeType: ''
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
.intro {
	margin-bottom: 12px;
	padding: 12px 14px;
	background: #f7f9fc;
	border-radius: 6px;
	border: 1px solid #e8ecf1;
}
.intro-desc {
	display: block;
	font-size: 14px;
	color: #303133;
	margin-bottom: 8px;
}
.intro-rules {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.intro-item {
	font-size: 12px;
	color: #606266;
	line-height: 1.5;
}
.search-form {
	background: #fff;
	padding: 14px 16px;
	border-radius: 4px;
	box-shadow: 0 2px 12px rgba(0,0,0,0.06);
	margin-bottom: 12px;
	flex-shrink: 0;
}
.search-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px 14px;
	align-items: end;
}
.form-item { min-width: 0; }
.submit-btn {
	display: flex;
	align-items: end;
	gap: 10px;
}
.submit-btn .btn-primary {
	background-color: #007aff;
	color: #fff;
	border-color: #007aff;
}
.summary-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
	flex-shrink: 0;
}
.summary-label { font-size: 14px; color: #606266; }
.summary-value { font-size: 18px; font-weight: 700; color: #2b6bff; }
.refresh-icon {
	cursor: pointer;
	font-size: 16px;
	margin-left: 6px;
}
.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}
.table-container {
	background: #fff;
	border-radius: 4px;
	box-shadow: 0 2px 12px rgba(0,0,0,0.06);
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
.cell-user { white-space: pre-line; }
.amount-inline { color: #2b6bff; font-weight: 600; margin-right: 6px; }
.type-inline { font-size: 12px; color: #909399; }
.money { color: #2b6bff; font-weight: 600; }
.ratio-suffix { font-size: 12px; color: #606266; margin-left: 4px; }
.time-suffix { font-size: 12px; color: #909399; margin-left: 4px; display: block; }
.company-main { display: block; }
.company-sub { font-size: 12px; color: #2b6bff; display: block; }
@media (max-width: 1200px) {
	.search-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 992px) {
	.search-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
	.search-grid { grid-template-columns: 1fr; }
}
</style>
