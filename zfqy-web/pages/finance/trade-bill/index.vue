<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" @click="reset">重置</button>
					<button size="mini" type="primary" @click="search">刷新</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button size="mini" class="export-trigger" @click="toggleExportMenu">
							<text class="bi bi-download export-icon"></text>
							<text>导出</text>
							<text class="bi bi-chevron-down export-caret"></text>
						</button>
						<view v-if="showExportMenu" class="export-menu">
							<view v-for="opt in exportTypeOptions" :key="opt.value" class="export-menu-item" @click="selectAndExport(opt.value)">
								{{ opt.text }}
							</view>
						</view>
					</view>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">交易账单</text>
				<text class="page-sub">记录 H5 充值与线下首冲账单数据</text>
			</view>
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table :key="tableKey" border stripe :loading="loading" empty-text="没有找到匹配的记录">
						<uni-tr>
							<uni-th align="center" width="100" filter-type="search" @filter-change="headerFilterChange($event, 'salesmanKeyword')">业务员</uni-th>
							<uni-th align="center" width="80" filter-type="select" :filter-data="firstChargeFilterData" @filter-change="headerFilterChange($event, 'firstCharge')">首充</uni-th>
							<uni-th align="center" width="130" filter-type="search" @filter-change="headerFilterChange($event, 'userKeyword')">交易用户</uni-th>
							<uni-th align="center" width="70">微信头像</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'platformNo')">平台单号</uni-th>
							<uni-th align="center" width="170" filter-type="search" @filter-change="headerFilterChange($event, 'wxTradeNo')">微信交易单号</uni-th>
							<uni-th align="center" width="150">购买商品</uni-th>
							<uni-th align="center" width="100">支付方式</uni-th>
							<uni-th align="center" width="110">实付金额</uni-th>
							<uni-th align="center" width="80" filter-type="select" :filter-data="refundedFilterData" @filter-change="headerFilterChange($event, 'refunded')">已退款</uni-th>
							<uni-th align="center" width="160" filter-type="timestamp" @filter-change="headerFilterChange($event, 'payTime')">支付时间</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.recordKey">
							<uni-td align="center">{{ item.salesman || '-' }}</uni-td>
							<uni-td align="center">
								<text :class="item.firstCharge === '是' ? 'tag-warn' : 'tag-ok'">{{ item.firstCharge }}</text>
							</uni-td>
							<uni-td align="center">{{ item.tradeUser || '-' }}</uni-td>
							<uni-td align="center">
								<image class="avatar" :src="item.avatar || defaultAvatar" mode="aspectFill" />
							</uni-td>
							<uni-td align="center">{{ item.platformNo || '-' }}</uni-td>
							<uni-td align="center">{{ item.wxTradeNo || '-' }}</uni-td>
							<uni-td align="center">{{ item.goodsName || '-' }}</uni-td>
							<uni-td align="center">{{ item.payType || '-' }}</uni-td>
							<uni-td align="right" class="money">{{ item.amountText }}</uni-td>
							<uni-td align="center">
								<text :class="item.refunded === '是' ? 'tag-bad' : 'tag-ok'">{{ item.refunded }}</text>
							</uni-td>
							<uni-td align="center">{{ item.payTime || '-' }}</uni-td>
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
			showExportMenu: false,
			searchForm: {
				salesmanKeyword: '',
				firstCharge: '',
				firstChargeList: [],
				userKeyword: '',
				platformNo: '',
				wxTradeNo: '',
				refunded: '',
				refundedList: [],
				payTimeStart: '',
				payTimeEnd: ''
			},
			firstChargeFilterData: [
				{ text: '否', value: '0', checked: false },
				{ text: '是', value: '1', checked: false }
			],
			refundedFilterData: [
				{ text: '否', value: '0', checked: false },
				{ text: '是', value: '1', checked: false }
			],
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			],
			list: [],
			defaultAvatar: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M24 24a7 7 0 1 0-7-7 7 7 0 0 0 7 7Zm0 4c-7.18 0-13 3.13-13 7v2h26v-2c0-3.87-5.82-7-13-7Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E',
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			}
		}
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
			if (filterType === 'search' && ['salesmanKeyword', 'userKeyword', 'platformNo', 'wxTradeNo'].includes(field)) {
				sf[field] = String(filter == null ? '' : filter).trim();
			} else if (field === 'firstCharge' && filterType === 'select') {
				sf.firstChargeList = Array.isArray(filter) ? filter.map(String) : [];
				sf.firstCharge = sf.firstChargeList.length ? sf.firstChargeList[0] : '';
			} else if (field === 'refunded' && filterType === 'select') {
				sf.refundedList = Array.isArray(filter) ? filter.map(String) : [];
				sf.refunded = sf.refundedList.length ? sf.refundedList[0] : '';
			} else if (field === 'payTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.payTimeStart = start;
				sf.payTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		buildPayload() {
			const sf = this.searchForm;
			return {
				salesmanKeyword: sf.salesmanKeyword,
				firstCharge: sf.firstCharge,
				userKeyword: sf.userKeyword,
				platformNo: sf.platformNo,
				wxTradeNo: sf.wxTradeNo,
				refunded: sf.refunded,
				payTimeStart: sf.payTimeStart,
				payTimeEnd: sf.payTimeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('tradeBillList', {
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
				salesmanKeyword: '',
				firstCharge: '',
				firstChargeList: [],
				userKeyword: '',
				platformNo: '',
				wxTradeNo: '',
				refunded: '',
				refundedList: [],
				payTimeStart: '',
				payTimeEnd: ''
			};
			this.firstChargeFilterData = [
				{ text: '否', value: '0', checked: false },
				{ text: '是', value: '1', checked: false }
			];
			this.refundedFilterData = [
				{ text: '否', value: '0', checked: false },
				{ text: '是', value: '1', checked: false }
			];
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		onPageChanged(page) {
			const p =
				typeof page === 'number'
					? page
					: Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.search();
		},
		onPageSizeChange(size) {
			const s = typeof size === 'number' ? size : Number(size?.pageSize || size?.size || size || 10);
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},
		async fetchExportRows() {
			const res = await this.$request('tradeBillList', {
				page: 1,
				pageSize: 10000,
				...this.buildPayload()
			}, { functionName: 'merchant' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			return (res.data?.list || []).map((x) => ({
				业务员: x.salesman || '',
				首充: x.firstCharge || '',
				交易用户: x.tradeUser || '',
				平台单号: x.platformNo || '',
				微信交易单号: x.wxTradeNo || '',
				购买商品: x.goodsName || '',
				支付方式: x.payType || '',
				实付金额: x.amountText || '',
				已退款: x.refunded || '',
				支付时间: x.payTime || ''
			}));
		},
		downloadFile(filename, content, mimeType) {
			// #ifdef H5
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			// #endif
			// #ifndef H5
			uni.setClipboardData({ data: String(content || '') });
			// #endif
		},
		toCsv(rows) {
			const keys = Object.keys(rows[0] || {});
			const esc = (s) => {
				const t = String(s == null ? '' : s);
				return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
			};
			const lines = [keys.join(',')];
			rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(',')));
			return '\uFEFF' + lines.join('\r\n');
		},
		toTxt(rows) {
			return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n');
		},
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><tradeBills>${items}</tradeBills>`;
		},
		toHtmlTable(rows) {
			const keys = Object.keys(rows[0] || {});
			const th = keys.map((k) => `<th>${k}</th>`).join('');
			const tr = rows.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`).join('');
			return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
		},
		async exportData(type) {
			try {
				uni.showLoading({ title: '导出中...', mask: true });
				const rows = await this.fetchExportRows();
				if (!rows.length) {
					uni.showToast({ title: '暂无可导出数据', icon: 'none' });
					return;
				}
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`交易账单_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`交易账单_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`交易账单_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`交易账单_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`交易账单_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`交易账单_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>
.uni-container {
	padding: 20px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.page-intro {
	margin-bottom: 10px;
}

.page-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #303133;
}

.page-sub {
	display: block;
	font-size: 13px;
	color: #909399;
	margin-top: 2px;
}

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #fff;
	border-radius: 4px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
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

.money {
	color: #c45656;
	font-weight: 600;
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

.avatar {
	width: 28px;
	height: 28px;
	border-radius: 50%;
}

.export-dropdown {
	position: relative;
}

.export-trigger {
	display: flex;
	align-items: center;
	gap: 8px;
}

.export-icon {
	font-size: 12px;
}

.export-caret {
	font-size: 12px;
	opacity: 0.8;
}

.export-menu {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	min-width: 130px;
	background: #fff;
	border: 1px solid #ebeef5;
	border-radius: 8px;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
	z-index: 10;
	padding: 6px;
}

.export-menu-item {
	line-height: 32px;
	padding: 0 10px;
	font-size: 13px;
	color: #303133;
	border-radius: 6px;
	cursor: pointer;
}

.export-menu-item:hover {
	background: #f5f7fa;
}

::v-deep .uni-table-th {
	white-space: nowrap;
}
</style>
