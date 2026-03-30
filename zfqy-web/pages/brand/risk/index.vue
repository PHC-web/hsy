<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<text class="header-icon-btn" title="刷新" @click="search">🔄</text>
					<text class="header-icon-btn" title="搜索" @click="runSearchFromHeader">🔍</text>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">用户(昵称/手机)</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'snTrade')">SN/交易单号</uni-th>
							<uni-th align="center" width="120" filter-type="range" @filter-change="headerFilterChange($event, 'amount')" sortable @sort-change="amountSortChange">金额</uni-th>
							<uni-th align="center" width="100">营业执照</uni-th>
							<uni-th align="center" width="100">交易证明</uni-th>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'scenario')">经营场景</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="statusFilterData" @filter-change="headerFilterChange($event, 'status')">状态</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'createTime')">创建时间</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'updateTime')">更新时间</uni-th>
							<uni-th align="center" width="100">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td class="cell-user">{{ item.userDisplay }}</uni-td>
							<uni-td class="cell-sn">{{ item.snTradeDisplay }}</uni-td>
							<uni-td align="right" class="cell-amount">{{ item.amountText }}</uni-td>
							<uni-td align="center">
								<image v-if="item.businessLicense" class="thumb" :src="item.businessLicense" mode="aspectFit" @click="previewImage(item.businessLicense)" />
								<text v-else>-</text>
							</uni-td>
							<uni-td align="center">
								<image v-if="item.tradeProof" class="thumb" :src="item.tradeProof" mode="aspectFit" @click="previewImage(item.tradeProof)" />
								<text v-else>-</text>
							</uni-td>
							<uni-td>{{ item.businessScenario }}</uni-td>
							<uni-td align="center">
								<text :class="statusClass(item.status)">{{ item.statusText }}</text>
							</uni-td>
							<uni-td align="center" class="cell-time">{{ item.createTime }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.updateTime }}</uni-td>
							<uni-td align="center">
								<text class="op-placeholder">—</text>
							</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
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
				userKeyword: '',
				snTradeKeyword: '',
				amountMin: '',
				amountMax: '',
				scenarioKeyword: '',
				status: '',
				statusList: [],
				createTimeStart: '',
				createTimeEnd: '',
				updateTimeStart: '',
				updateTimeEnd: '',
				sortField: '',
				sortOrder: ''
			},
			statusFilterData: [
				{ text: '待审核', value: 'pending', checked: false },
				{ text: '审核通过', value: 'approved', checked: false },
				{ text: '审核驳回', value: 'rejected', checked: false },
				{ text: '审核中', value: 'reviewing', checked: false }
			],
			list: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			}
		};
	},
	mounted() {
		this.search();
	},
	methods: {
		statusClass(status) {
			const s = String(status || '');
			if (s === 'approved') return 'status-ok';
			if (s === 'rejected') return 'status-bad';
			if (s === 'reviewing') return 'status-warn';
			return 'status-pending';
		},

		previewImage(url) {
			if (!url) return;
			uni.previewImage({ urls: [url], current: url });
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

		parseAmountRange(filter) {
			if (!Array.isArray(filter) || filter.length === 0) {
				return { min: '', max: '' };
			}
			const gt = filter[0];
			const lt = filter[1];
			const min = gt === '' || gt === undefined ? '' : Number(gt);
			const max = lt === '' || lt === undefined ? '' : Number(lt);
			return {
				min: min !== '' && Number.isFinite(min) ? min : '',
				max: max !== '' && Number.isFinite(max) ? max : ''
			};
		},

		runSearchFromHeader() {
			this.pageInfo.currentPage = 1;
			this.search();
		},

		search() {
			this.loading = true;
			const sf = this.searchForm;
			this.$request(
				'riskList',
				{
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					userKeyword: sf.userKeyword,
					snTradeKeyword: sf.snTradeKeyword,
					amountMin: sf.amountMin,
					amountMax: sf.amountMax,
					status: sf.statusList.length ? '' : sf.status,
					statusList: sf.statusList,
					createTimeStart: sf.createTimeStart,
					createTimeEnd: sf.createTimeEnd,
					updateTimeStart: sf.updateTimeStart,
					updateTimeEnd: sf.updateTimeEnd,
					scenarioKeyword: sf.scenarioKeyword,
					sortField: sf.sortField,
					sortOrder: sf.sortOrder
				},
				{ functionName: 'machine' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code === 0) {
						this.list = res.data.list || [];
						this.pageInfo.total = res.data.total || 0;
					} else {
						uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					}
				})
				.catch(() => {
					this.loading = false;
				});
		},

		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'userKeyword' && filterType === 'search') {
				sf.userKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'snTrade' && filterType === 'search') {
				sf.snTradeKeyword = String(filter == null ? '' : filter).slice(0, 100);
			} else if (field === 'amount' && filterType === 'range') {
				const { min, max } = this.parseAmountRange(filter);
				sf.amountMin = min === '' ? '' : min;
				sf.amountMax = max === '' ? '' : max;
			} else if (field === 'scenario' && filterType === 'search') {
				sf.scenarioKeyword = String(filter == null ? '' : filter).slice(0, 100);
			} else if (field === 'status' && filterType === 'select') {
				sf.statusList = Array.isArray(filter) ? filter.map(String) : [];
				sf.status = '';
			} else if (field === 'createTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.createTimeStart = start;
				sf.createTimeEnd = end;
			} else if (field === 'updateTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.updateTimeStart = start;
				sf.updateTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},

		amountSortChange(e) {
			const order = e && e.order;
			const sf = this.searchForm;
			if (order === 'ascending') {
				sf.sortField = 'amount';
				sf.sortOrder = 'asc';
			} else if (order === 'descending') {
				sf.sortField = 'amount';
				sf.sortOrder = 'desc';
			} else {
				sf.sortField = '';
				sf.sortOrder = '';
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
.uni-button {
	margin-left: 10px;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.header-icon-btn {
	font-size: 18px;
	cursor: pointer;
	user-select: none;
	opacity: 0.75;
}

.header-icon-btn:active {
	opacity: 1;
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

.cell-user,
.cell-sn {
	white-space: pre-line;
	font-size: 13px;
	line-height: 1.45;
}

.cell-amount {
	font-weight: 600;
	color: #2b6bff;
}

.cell-time {
	font-size: 12px;
	color: #606266;
}

.thumb {
	width: 48px;
	height: 48px;
	border-radius: 4px;
	border: 1px solid #ebeef5;
	cursor: pointer;
	vertical-align: middle;
}

.status-pending {
	color: #e6a23c;
}

.status-warn {
	color: #909399;
}

.status-ok {
	color: #18bc37;
}

.status-bad {
	color: #f56c6c;
}

.op-placeholder {
	color: #c0c4cc;
	font-size: 13px;
}

@media (max-height: 900px) {
	.table-container-wrapper {
		overflow-y: auto;
	}
}
</style>
