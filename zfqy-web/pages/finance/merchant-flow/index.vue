<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" @click="reset">重置</button>
					<button size="mini" type="primary" @click="search">刷新</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">交易记录</text>
				<text class="page-sub">仅展示已成功完成的充值、退款、提现记录（不含待审核/处理中/未确认）</text>
			</view>
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table :key="tableKey" border stripe :loading="loading" empty-text="暂无交易记录">
						<uni-tr>
							<uni-th align="center" width="90" filter-type="select" :filter-data="bizTypeFilterData" @filter-change="headerFilterChange($event, 'bizType')">类型</uni-th>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'merchantKeyword')">商户</uni-th>
							<uni-th align="center" width="80">方向</uni-th>
							<uni-th align="center" width="110">账务变动</uni-th>
							<uni-th align="center" width="110">实际出入</uni-th>
							<uni-th align="center" width="170" filter-type="search" @filter-change="headerFilterChange($event, 'orderNo')">单号</uni-th>
							<uni-th align="center" width="180">备注</uni-th>
							<uni-th align="center" width="160" filter-type="timestamp" @filter-change="headerFilterChange($event, 'timeRange')">完成时间</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.recordKey">
							<uni-td align="center">{{ item.bizType }}</uni-td>
							<uni-td align="center"><view class="cell-multiline">{{ item.merchantDisplay }}</view></uni-td>
							<uni-td align="center"><text :class="item.direction === '入账' ? 'tag-in' : 'tag-out'">{{ item.direction }}</text></uni-td>
							<uni-td align="right" class="money">{{ item.changeAmountText }}</uni-td>
							<uni-td align="right" class="money">{{ item.actualAmountText }}</uni-td>
							<uni-td align="center">{{ item.orderNo || '-' }}</uni-td>
							<uni-td align="center">{{ item.remark || '-' }}</uni-td>
							<uni-td align="center">{{ item.finishTime || '-' }}</uni-td>
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
			loading: false,
			tableKey: 1,
			searchForm: {
				bizType: '',
				bizTypeList: [],
				merchantKeyword: '',
				orderNo: '',
				timeStart: '',
				timeEnd: ''
			},
			bizTypeFilterData: [
				{ text: '充值', value: '充值', checked: false },
				{ text: '退款', value: '退款', checked: false },
				{ text: '提现', value: '提现', checked: false }
			],
			list: [],
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
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) return { start: '', end: '' };
			return { start: Number(filter[0]) || '', end: Number(filter[1]) || '' };
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'bizType' && filterType === 'select') {
				sf.bizTypeList = Array.isArray(filter) ? filter.map(String) : [];
				sf.bizType = sf.bizTypeList.length ? sf.bizTypeList[0] : '';
			} else if (field === 'merchantKeyword' && filterType === 'search') {
				sf.merchantKeyword = String(filter == null ? '' : filter).trim();
			} else if (field === 'orderNo' && filterType === 'search') {
				sf.orderNo = String(filter == null ? '' : filter).trim();
			} else if (field === 'timeRange' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.timeStart = start;
				sf.timeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		buildPayload() {
			const sf = this.searchForm;
			return {
				bizType: sf.bizType,
				merchantKeyword: sf.merchantKeyword,
				orderNo: sf.orderNo,
				timeStart: sf.timeStart,
				timeEnd: sf.timeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('financeMerchantFlowList', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				...this.buildPayload()
			}, { functionName: 'merchant' }).then((res) => {
				this.loading = false;
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.list = res.data?.list || [];
				this.pageInfo.total = res.data?.total || 0;
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				bizType: '',
				bizTypeList: [],
				merchantKeyword: '',
				orderNo: '',
				timeStart: '',
				timeEnd: ''
			};
			this.bizTypeFilterData = [
				{ text: '充值', value: '充值', checked: false },
				{ text: '退款', value: '退款', checked: false },
				{ text: '提现', value: '提现', checked: false }
			];
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
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
.uni-container { padding: 20px; display: flex; flex-direction: column; overflow: hidden; }
.header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.page-intro { margin-bottom: 10px; }
.page-title { display: block; font-size: 18px; font-weight: 700; color: #303133; }
.page-sub { display: block; font-size: 13px; color: #909399; margin-top: 2px; }
.table-container-wrapper { flex: 1; overflow: hidden; min-height: 0; }
.table-container { background-color: #fff; border-radius: 4px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08); overflow: hidden; height: 100%; display: flex; flex-direction: column; }
.uni-pagination-box { padding: 12px 16px; text-align: right; flex-shrink: 0; }
.money { color: #2b6bff; font-weight: 600; }
.tag-in { color: #18bc37; }
.tag-out { color: #f56c6c; }
.cell-multiline { white-space: pre-line; line-height: 18px; }
</style>
