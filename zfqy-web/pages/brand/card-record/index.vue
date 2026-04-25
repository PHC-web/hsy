<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button class="uni-button" type="default" size="mini" @click="reset">重置</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button class="uni-button export-trigger" size="mini" @click="toggleExportMenu">
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
					<button class="uni-button" type="primary" size="mini" @click="search">刷新</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="intro">
				<text class="intro-desc">
					展示已绑定商户后的机具流水（实际消费/虚拟刷卡）；未绑定机具时的第三方流水仅落库、不参与本页统计与补贴。标准贷记卡/京东白条等待审核的流水请在「风险管理」处理，通过后才会出现在此列表。
				</text>
				<view class="intro-rules">
					<text class="intro-item">· 刷卡激活：新卡本后台必须先机具入库处于未激活状态、单次刷卡金额必须大于设置的激活额度方可有效</text>
					<text class="intro-item">· 自动返邮：彩卡的必须先通过下单码或者由业务员在后台协助下单成功后方可有效</text>
					<text class="intro-item">· 补贴与权益规则见项目根目录 RULES.md</text>
				</view>
			</view>

			<view class="summary-bar">
				<text class="summary-label">交易额</text>
				<text class="summary-value">¥{{ totalAmountText }}</text>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" :key="tableKey" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具编号</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="brandFilterData" @filter-change="headerFilterChange($event, 'brandId')">品牌</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'tradeNo')">交易单号</uni-th>
							<uni-th align="center" width="140" filter-type="select" :filter-data="merchantFilterData" @filter-change="headerFilterChange($event, 'merchantUserId')">交易用户</uni-th>
							<uni-th align="center" width="110" filter-type="select" :filter-data="tradeTypeFilterData" @filter-change="headerFilterChange($event, 'tradeType')">交易类型</uni-th>
							<uni-th align="center" width="100">支付渠道</uni-th>
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
							<uni-td align="center">{{ item.paychannelText || '-' }}</uni-td>
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
				</view>
			</view>
			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
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
			},
			tableKey: 1,
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			]
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
		reset() {
			this.searchForm = {
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
			};
			this.tradeTypeFilterData = [
				{ text: '虚拟刷卡', value: 'virtual', checked: false },
				{ text: '实际消费', value: 'real', checked: false }
			];
			this.isActivatedFilterData = [
				{ text: '是', value: '1', checked: false },
				{ text: '否', value: '0', checked: false }
			];
			this.isCashbackFilterData = [
				{ text: '是', value: '1', checked: false },
				{ text: '否', value: '0', checked: false }
			];
			this.riskFilterData = [
				{ text: '风控', value: 'risk', checked: false },
				{ text: '解除', value: 'release', checked: false },
				{ text: '否', value: 'no', checked: false }
			];
			this.tableKey += 1;
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
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
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
			const form = this.buildListPayload();
			const res = await this.$request('cardRecordList', { page: 1, pageSize: 10000, ...form }, { functionName: 'machine' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			return (res.data?.list || []).map((x) => ({
				机具编号: x.devicePlain || x.deviceId || '',
				品牌: x.brandName || '',
				交易单号: x.tradeNo || '',
				交易用户: x.userInfo || '',
				交易类型: x.tradeTypeText || '',
				支付渠道: x.paychannelText || '',
				交易金额: x.amountText || '',
				是否激活: x.isActivatedText || '',
				累计交易: x.totalTransactionText || '',
				是否返现: x.cashbackText || '-',
				本次释放: x.releaseAmountText || '-',
				风控状态: x.riskStatus || '',
				交易时间: x.createTime || '',
				业务员: x.salesman || '',
				分公司: x.company || ''
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
		toTxt(rows) { return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n'); },
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><cardRecords>${items}</cardRecords>`;
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
				if (!rows.length) return uni.showToast({ title: '暂无可导出数据', icon: 'none' });
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`刷卡记录_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`刷卡记录_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`刷卡记录_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`刷卡记录_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`刷卡记录_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`刷卡记录_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
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
.uni-header .uni-button {
	margin-left: 10px;
}
.header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
.export-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 130px; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.12); z-index: 10; padding: 6px; }
.export-menu-item { line-height: 32px; padding: 0 10px; font-size: 13px; color: #303133; border-radius: 6px; cursor: pointer; }
.export-menu-item:hover { background: #f5f7fa; }
.uni-container {
	padding: 20px;
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
