<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<text class="header-icon-btn" title="刷新" @click="search">🔄</text>
					<text class="header-icon-btn" title="导出 CSV" @click="exportCsv">⬇</text>
					<text class="header-icon-btn" title="搜索" @click="runSearchFromHeader">🔍</text>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">提现列表</text>
				<text class="page-sub">支持提供给管理员进行代理提现审批</text>
			</view>

			<view class="summary-bar">
				<text class="sum-item sum-main">总提现：¥ {{ summaryText.totalWithdraw }}</text>
				<text class="sum-item sum-main">总手续费+税费：¥ {{ summaryText.totalFeeTax }}</text>
				<text class="sum-item sum-main">总付款：¥ {{ summaryText.totalPayable }}</text>
			</view>

			<view class="table-container-wrapper">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">提现用户</uni-th>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'companyKeyword')">分公司</uni-th>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'salesmanKeyword')">业务员</uni-th>
							<uni-th align="center" width="110" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具号</uni-th>
							<uni-th align="center" width="140" filter-type="search" @filter-change="headerFilterChange($event, 'withdrawNo')">提现单号</uni-th>
							<uni-th align="center" width="100">提现金额(元)</uni-th>
							<uni-th align="center" width="110">税费+手续费(元)</uni-th>
							<uni-th align="center" width="100">应付金额</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'payTime')">打款时间</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="paidFilterData" @filter-change="headerFilterChange($event, 'isPaid')">是否打款</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'arrivalTime')">到账时间</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="arrivalFilterData" @filter-change="headerFilterChange($event, 'arrivalStatus')">是否到账</uni-th>
							<uni-th align="center" width="100">管理员操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in list" :key="item.id || idx" v-if="item">
							<uni-td class="cell-user">{{ item.userDisplay }}</uni-td>
							<uni-td align="center">{{ item.company }}</uni-td>
							<uni-td align="center">{{ item.salesman }}</uni-td>
							<uni-td align="center">{{ item.deviceId }}</uni-td>
							<uni-td align="center">{{ item.withdrawNo }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.amountText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.feeTaxText }}</uni-td>
							<uni-td align="right" class="cell-money">{{ item.payableText }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.payTime || '-' }}</uni-td>
							<uni-td align="center">
								<text :class="item.isPaid ? 'tag-paid' : 'tag-unpaid'">{{ item.isPaidText }}</text>
							</uni-td>
							<uni-td align="center" class="cell-time">{{ item.arrivalTime || '-' }}</uni-td>
							<uni-td align="center">
								<text :class="arrivalClass(item.arrivalStatus)">{{ item.arrivalStatusText }}</text>
							</uni-td>
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
				companyKeyword: '',
				salesmanKeyword: '',
				deviceId: '',
				withdrawNo: '',
				isPaid: '',
				isPaidList: [],
				payTimeStart: '',
				payTimeEnd: '',
				arrivalStatus: '',
				arrivalStatusList: [],
				arrivalTimeStart: '',
				arrivalTimeEnd: ''
			},
			paidFilterData: [
				{ text: '未打款', value: '0', checked: false },
				{ text: '已打款', value: '1', checked: false }
			],
			arrivalFilterData: [
				{ text: '未到账', value: 'pending', checked: false },
				{ text: '已到账', value: 'received', checked: false },
				{ text: '已退回', value: 'returned', checked: false },
				{ text: '已过期', value: 'expired', checked: false }
			],
			list: [],
			loading: false,
			summary: {
				totalWithdraw: 0,
				totalFeeTax: 0,
				totalPayable: 0
			},
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			}
		};
	},
	computed: {
		summaryText() {
			const s = this.summary || {};
			return {
				totalWithdraw: Number(s.totalWithdraw || 0).toFixed(4),
				totalFeeTax: Number(s.totalFeeTax || 0).toFixed(4),
				totalPayable: Number(s.totalPayable || 0).toFixed(4)
			};
		}
	},
	mounted() {
		this.search();
	},
	methods: {
		arrivalClass(status) {
			const s = String(status || '');
			if (s === 'received') return 'tag-ok';
			if (s === 'returned' || s === 'expired') return 'tag-bad';
			return 'tag-warn';
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

		buildPayload() {
			const sf = this.searchForm;
			return {
				userKeyword: sf.userKeyword,
				companyKeyword: sf.companyKeyword,
				salesmanKeyword: sf.salesmanKeyword,
				deviceId: sf.deviceId,
				withdrawNo: sf.withdrawNo,
				isPaid: sf.isPaidList.length ? '' : sf.isPaid,
				isPaidList: sf.isPaidList,
				payTimeStart: sf.payTimeStart,
				payTimeEnd: sf.payTimeEnd,
				arrivalStatus: sf.arrivalStatusList.length ? '' : sf.arrivalStatus,
				arrivalStatusList: sf.arrivalStatusList,
				arrivalTimeStart: sf.arrivalTimeStart,
				arrivalTimeEnd: sf.arrivalTimeEnd
			};
		},

		runSearchFromHeader() {
			this.pageInfo.currentPage = 1;
			this.search();
		},

		search() {
			this.loading = true;
			this.$request(
				'withdrawList',
				{
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					...this.buildPayload()
				},
				{ functionName: 'merchant' }
			)
				.then((res) => {
					this.loading = false;
					if (res.code === 0) {
						this.list = res.data.list || [];
						this.pageInfo.total = res.data.total || 0;
						const su = res.data.summary;
						if (su) {
							this.summary = {
								totalWithdraw: su.totalWithdraw,
								totalFeeTax: su.totalFeeTax,
								totalPayable: su.totalPayable
							};
						}
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
			} else if (field === 'companyKeyword' && filterType === 'search') {
				sf.companyKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'salesmanKeyword' && filterType === 'search') {
				sf.salesmanKeyword = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'deviceId' && filterType === 'search') {
				sf.deviceId = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'withdrawNo' && filterType === 'search') {
				sf.withdrawNo = String(filter == null ? '' : filter).slice(0, 80);
			} else if (field === 'isPaid' && filterType === 'select') {
				sf.isPaidList = Array.isArray(filter) ? filter.map(String) : [];
				sf.isPaid = '';
			} else if (field === 'payTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.payTimeStart = start;
				sf.payTimeEnd = end;
			} else if (field === 'arrivalTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.arrivalTimeStart = start;
				sf.arrivalTimeEnd = end;
			} else if (field === 'arrivalStatus' && filterType === 'select') {
				sf.arrivalStatusList = Array.isArray(filter) ? filter.map(String) : [];
				sf.arrivalStatus = '';
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},

		async exportCsv() {
			uni.showLoading({ title: '导出中...', mask: true });
			try {
				const res = await this.$request(
					'withdrawExportCsv',
					{
						...this.buildPayload()
					},
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '导出失败', icon: 'none' });
					return;
				}
				const { csv, total, truncated } = res.data || {};
				// #ifdef H5
				const blob = new Blob(['\uFEFF' + (csv || '')], { type: 'text/csv;charset=utf-8;' });
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = `提现列表_${Date.now()}.csv`;
				a.click();
				URL.revokeObjectURL(a.href);
				if (truncated) {
					uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
				}
				// #endif
				// #ifndef H5
				const text = csv || '';
				if (text.length > 8000) {
					uni.showModal({
						content: '当前环境请使用浏览器访问后台以导出完整 CSV。',
						showCancel: false
					});
				} else {
					uni.setClipboardData({
						data: text,
						success: () => {
							uni.showToast({ title: '已复制到剪贴板', icon: 'none' });
						}
					});
				}
				if (truncated) {
					uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
				}
				// #endif
			} catch (err) {
				uni.showToast({ title: err?.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
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

.page-intro {
	margin-bottom: 12px;
	flex-shrink: 0;
}

.page-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #303133;
	margin-bottom: 4px;
}

.page-sub {
	display: block;
	font-size: 13px;
	color: #909399;
}

.summary-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 20px;
	margin-bottom: 12px;
	padding: 10px 12px;
	background: #fafafa;
	border-radius: 6px;
	border: 1px solid #ebeef5;
	flex-shrink: 0;
}

.sum-item {
	font-size: 14px;
	font-weight: 600;
}

.sum-main {
	color: #f56c6c;
}

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
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
	font-size: 13px;
	line-height: 1.45;
}

.cell-money {
	font-family: ui-monospace, monospace;
	font-size: 13px;
	color: #303133;
}

.cell-time {
	font-size: 12px;
	color: #606266;
}

.tag-paid {
	color: #18bc37;
	font-weight: 600;
}

.tag-unpaid {
	color: #909399;
}

.tag-ok {
	color: #18bc37;
}

.tag-warn {
	color: #e6a23c;
}

.tag-bad {
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
