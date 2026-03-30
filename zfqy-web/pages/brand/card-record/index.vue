<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="uni-sub-title hide-on-phone">刷卡记录</view>
				<input
					class="uni-search"
					type="text"
					v-model="searchForm.deviceId"
					maxlength="50"
					placeholder="机具编号"
					@confirm="runSearchFromHeader"
				/>
				<button class="uni-button hide-on-phone" type="default" size="mini" @click="runSearchFromHeader">搜索</button>
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

			<view class="summary-bar">
				<text class="summary-label">交易额</text>
				<text class="summary-value">¥{{ totalAmountText }}</text>
				<text class="refresh-icon" @click="search">🔄</text>
			</view>

			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具编号</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="brandFilterData" @filter-change="headerFilterChange($event, 'brandId')">品牌</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'tradeNo')">交易单号</uni-th>
							<uni-th align="center" width="140" filter-type="select" :filter-data="merchantFilterData" @filter-change="headerFilterChange($event, 'merchantUserId')">交易用户</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="tradeTypeFilterData" @filter-change="headerFilterChange($event, 'tradeType')">交易类型</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isActivatedFilterData" @filter-change="headerFilterChange($event, 'isActivated')">是否激活</uni-th>
							<uni-th align="center" width="100">累计交易</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isCashbackFilterData" @filter-change="headerFilterChange($event, 'isCashback')">是否返现</uni-th>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'releaseAmount')">本次释放</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="riskFilterData" @filter-change="headerFilterChange($event, 'riskStatus')">风控状态</uni-th>
							<uni-th align="center" width="140" filter-type="timestamp" @filter-change="headerFilterChange($event, 'tradeTime')">交易时间</uni-th>
							<uni-th align="center" width="100">业务员</uni-th>
							<uni-th align="center" width="100">分公司</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td>{{ item.devicePlain || item.deviceId }}</uni-td>
							<uni-td align="center">{{ item.brandName || '-' }}</uni-td>
							<uni-td>{{ item.tradeNo }}</uni-td>
							<uni-td class="cell-user">{{ item.userInfo }}</uni-td>
							<uni-td align="center">
								<text class="amount-inline">{{ item.amountText }}</text>
								<text class="type-inline">{{ item.tradeTypeText }}</text>
							</uni-td>
							<uni-td align="center">
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
							<uni-td align="center">
								<text v-if="item.releaseAmount > 0">{{ item.releaseAmountText }}</text>
								<text v-else>-</text>
								<text v-if="item.releaseRatioText !== '-'" class="ratio-suffix">{{ item.releaseRatioText }}</text>
							</uni-td>
							<uni-td align="center">{{ item.riskStatus }}</uni-td>
							<uni-td align="center">{{ item.createTime }}</uni-td>
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
export default {
	data() {
		return {
			searchForm: {
				deviceId: '',
				brandId: '',
				brandIds: [],
				tradeNo: '',
				merchantUserId: '',
				merchantUserIds: [],
				isActivated: '',
				isActivatedList: [],
				isCashback: '',
				isCashbackList: [],
				releaseAmount: '',
				riskStatus: '',
				riskStatusList: [],
				timeStart: '',
				timeEnd: '',
				tradeType: '',
				tradeTypeList: []
			},
			tradeTypeFilterData: [
				{ text: '虚拟刷卡', value: 'virtual', checked: false },
				{ text: '实际消费', value: 'real', checked: false }
			],
			isActivatedFilterData: [
				{ text: '是', value: '1', checked: false },
				{ text: '否', value: '0', checked: false }
			],
			isCashbackFilterData: [
				{ text: '是', value: '1', checked: false },
				{ text: '否', value: '0', checked: false }
			],
			riskFilterData: [
				{ text: '风控', value: 'risk', checked: false },
				{ text: '解除', value: 'release', checked: false },
				{ text: '否', value: 'no', checked: false }
			],
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
		},
		brandFilterData() {
			return (this.brandList || []).map((b) => ({
				text: b.label,
				value: String(b.value),
				checked: false
			}));
		},
		merchantFilterData() {
			return (this.merchantList || []).map((m) => ({
				text: m.wxUser || m.userId || '-',
				value: String(m.userId),
				checked: false
			}));
		}
	},
	mounted() {
		this.getBrandList();
		this.getMerchantList();
		this.search();
	},
	methods: {
		getBrandList() {
			this.$request('list', { page: 1, pageSize: 1000 }, { functionName: 'brand' }).then((res) => {
				if (res.code === 0 && res.data && res.data.list) {
					this.brandList = res.data.list.map((item) => ({ value: String(item.id), label: item.brandName }));
				}
			});
		},
		getMerchantList() {
			this.$request('list', { page: 1, pageSize: 1000 }, { functionName: 'merchant' }).then((res) => {
				if (res.code === 0 && res.data && res.data.list) {
					this.merchantList = res.data.list.map((m) => ({
						...m,
						userId: String(m.userId)
					}));
				}
			});
		},
		buildListPayload() {
			const sf = this.searchForm;
			return {
				deviceId: sf.deviceId,
				brandId: sf.brandIds.length ? '' : sf.brandId,
				brandIds: sf.brandIds,
				tradeNo: sf.tradeNo,
				merchantUserId: sf.merchantUserIds.length ? '' : sf.merchantUserId,
				merchantUserIds: sf.merchantUserIds,
				isActivated: sf.isActivatedList.length ? '' : sf.isActivated,
				isActivatedList: sf.isActivatedList,
				isCashback: sf.isCashbackList.length ? '' : sf.isCashback,
				isCashbackList: sf.isCashbackList,
				releaseAmount: sf.releaseAmount,
				riskStatus: sf.riskStatusList.length ? '' : sf.riskStatus,
				riskStatusList: sf.riskStatusList,
				timeStart: sf.timeStart,
				timeEnd: sf.timeEnd,
				tradeType: sf.tradeTypeList.length ? '' : sf.tradeType,
				tradeTypeList: sf.tradeTypeList
			};
		},
		search() {
			const form = this.buildListPayload();
			this.loading = true;
			this.$request(
				'cardRecordList',
				{
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					...form
				},
				{ functionName: 'machine' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code === 0) {
						this.list = res.data && res.data.list ? res.data.list : [];
						this.pageInfo.total = (res.data && res.data.total) || 0;
						this.totalAmount = (res.data && res.data.totalAmount) || 0;
					} else {
						uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					}
				})
				.catch(() => {
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
			} else if (field === 'tradeNo' && filterType === 'search') {
				sf.tradeNo = String(filter == null ? '' : filter).slice(0, 50);
			} else if (field === 'releaseAmount' && filterType === 'search') {
				const raw = String(filter == null ? '' : filter).replace(/[^\d.]/g, '');
				const num = parseFloat(raw);
				sf.releaseAmount = raw !== '' && Number.isFinite(num) && num > 0 ? raw : '';
			} else if (field === 'brandId' && filterType === 'select') {
				sf.brandIds = Array.isArray(filter) ? filter.map(String) : [];
				sf.brandId = '';
			} else if (field === 'merchantUserId' && filterType === 'select') {
				sf.merchantUserIds = Array.isArray(filter) ? filter.map(String) : [];
				sf.merchantUserId = '';
			} else if (field === 'isActivated' && filterType === 'select') {
				sf.isActivatedList = Array.isArray(filter) ? filter.map(String) : [];
				sf.isActivated = '';
			} else if (field === 'isCashback' && filterType === 'select') {
				sf.isCashbackList = Array.isArray(filter) ? filter.map(String) : [];
				sf.isCashback = '';
			} else if (field === 'riskStatus' && filterType === 'select') {
				sf.riskStatusList = Array.isArray(filter) ? filter.map(String) : [];
				sf.riskStatus = '';
			} else if (field === 'tradeType' && filterType === 'select') {
				sf.tradeTypeList = Array.isArray(filter) ? filter.map(String) : [];
				sf.tradeType = '';
			} else if (field === 'tradeTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.timeStart = start;
				sf.timeEnd = end;
			}
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
.uni-header .uni-button {
	margin-left: 10px;
}
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
.summary-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
	flex-shrink: 0;
}
.summary-label {
	font-size: 14px;
	color: #606266;
}
.summary-value {
	font-size: 18px;
	font-weight: 700;
	color: #2b6bff;
}
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
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
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
.cell-user {
	white-space: pre-line;
}
.amount-inline {
	color: #2b6bff;
	font-weight: 600;
	margin-right: 6px;
}
.type-inline {
	font-size: 12px;
	color: #909399;
}
.money {
	color: #2b6bff;
	font-weight: 600;
}
.ratio-suffix {
	font-size: 12px;
	color: #606266;
	margin-left: 4px;
}
.time-suffix {
	font-size: 12px;
	color: #909399;
	margin-left: 4px;
	display: block;
}
.company-main {
	display: block;
}
.company-sub {
	font-size: 12px;
	color: #2b6bff;
	display: block;
}
</style>
