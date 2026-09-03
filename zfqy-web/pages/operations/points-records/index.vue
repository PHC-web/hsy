<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button class="uni-button export-trigger" size="mini" @click="toggleExportMenu">
							<text class="bi bi-download export-icon"></text>
							<text>导出</text>
							<text class="bi bi-chevron-down export-caret"></text>
						</button>
						<view v-if="showExportMenu" class="export-menu">
							<view
								v-for="opt in exportTypeOptions"
								:key="opt.value"
								class="export-menu-item"
								@click="selectAndExport(opt.value)"
							>
								{{ opt.text }}
							</view>
						</view>
					</view>
					<button size="mini" type="primary" :loading="loading" @click="search">刷新</button>
				</view>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<view class="intro">
				<text v-if="activeTab === 'packets'">
					汇总 H5 为商户生成的积分红包（手续费补贴等，数据表 hsy-income-packets）。金额与 H5「账号积分」同口径（元）。「冻结金额」仅流水首期有值：领取首期后进入后四期的待返合计（如刷 1 万领 7.6，冻结 30.4）。
				</text>
				<text v-else-if="activeTab === 'points_log'">
					请根据机具号进行搜索。领取首期：流水 ≥300 时冻结增加「整笔返现−首期」（刷 5 万领 38，冻结 +152）；300 以下冻结 +0。
				</text>
				<text v-else>
					普通会员通过兑换码升级白银、或付费升级黄金/白金/钻石时，系统清除其已领取的账号积分（待提现）与冻结金额的操作记录。
				</text>
				
			</view>

			<view class="tab-bar">
				<text :class="['tab-item', activeTab === 'packets' ? 'tab-active' : '']" @click="switchTab('packets')">积分红包</text>
				<text :class="['tab-item', activeTab === 'upgrade_clear' ? 'tab-active' : '']" @click="switchTab('upgrade_clear')">升级清除日志</text>
				<text :class="['tab-item', activeTab === 'points_log' ? 'tab-active' : '']" @click="switchTab('points_log')">积分日志</text>
			</view>

			<view class="search-card">
				<view class="row">
					<text class="label">{{ timeRangeLabel }}</text>
					<uni-datetime-picker
						v-model="range"
						type="datetimerange"
						return-type="timestamp"
						@change="onRangeChange"
					/>
				</view>
				<view class="row">
					<text class="label">关键词</text>
					<uni-easyinput
						v-model.trim="keyword"
						:placeholder="keywordPlaceholder"
						@confirm="onSearchClick"
					/>
					<button size="mini" type="primary" :loading="loading" @click="onSearchClick">搜索</button>
				</view>
				<view v-if="activeTab === 'points_log' && logMerchant" class="log-merchant">
					<view>当前商户：{{ logMerchant.wx_nickname }}　{{ logMerchant.user_id }}　{{ logMerchant.mobile }}</view>
					<view v-if="logMerchant.list_pending_text != null">
						商户列表当前：待提现 {{ logMerchant.list_pending_text }}　冻结 {{ logMerchant.list_frozen_text }}
					</view>
				</view>
			</view>

			<view v-if="activeTab === 'packets'" class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll points-table-wrap">
					<uni-table :key="'pkt-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="152">创建时间</uni-th>
							<uni-th width="120">商户</uni-th>
							<uni-th width="104">手机</uni-th>
							<uni-th width="72">积分(元)</uni-th>
							<uni-th width="88">冻结金额</uni-th>
							<uni-th
								width="132"
								filter-type="select"
								:filter-data="statusHeaderFilterData"
								@filter-change="headerFilterChange($event, 'status')"
							>展示状态</uni-th>
							<uni-th
								width="140"
								filter-type="select"
								:filter-data="kindHeaderFilterData"
								@filter-change="headerFilterChange($event, 'kind')"
							>类型</uni-th>
							<uni-th width="88">归属月</uni-th>
							<uni-th width="148">标题</uni-th>
							<uni-th width="152">可领 / 过期 / 领取</uni-th>
							<uni-th width="88">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.create_time) }}</uni-td>
							<uni-td class="cell-ellipsis" :title="item.merchant_user_id">{{
								item.merchant_name !== '-' ? item.merchant_name : item.merchant_user_id || '-'
							}}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.merchant_mobile }}</uni-td>
							<uni-td>{{ item.amountText }}</uni-td>
							<uni-td>{{ item.frozenAmountText != null ? item.frozenAmountText : '-' }}</uni-td>
							<uni-td>
								<text :class="statusClass(item.display_status_key)">{{ item.display_status }}</text>
							</uni-td>
							<uni-td class="cell-tiny">{{ item.subsidy_kind_label }}</uni-td>
							<uni-td>{{ item.month_no }}</uni-td>
							<uni-td class="cell-title" :title="item.title">{{ item.title }}</uni-td>
							<uni-td class="cell-time-stack">
								<view>开：{{ fmtTs(item.claim_open_time) }}</view>
								<view>过：{{ fmtTs(item.expire_time) }}</view>
								<view>领：{{ fmtTs(item.claimed_time) }}</view>
							</uni-td>
							<uni-td>
								<view class="op-cell">
									<button class="btn-detail" size="mini" type="primary" plain @click="openDetail(item._id)">
										查看
									</button>
								</view>
							</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>

			<view v-else-if="activeTab === 'points_log'" class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll">
					<uni-table border stripe :loading="loading" :empty-text="logEmptyText">
						<uni-tr>
							<uni-th width="160">时间</uni-th>
							<uni-th width="120">类型</uni-th>
							<uni-th width="220">说明</uni-th>
							<uni-th width="100">待提现</uni-th>
							<uni-th width="100">冻结金额</uni-th>
							<uni-th width="88">锚定流水</uni-th>
						</uni-tr>
						<uni-tr v-for="item in balanceLogList" :key="item._id">
							<uni-td>{{ fmtTs(item.event_time) }}</uni-td>
							<uni-td class="cell-tiny">{{ item.event_type_label }}</uni-td>
							<uni-td class="cell-content" :title="item.title">{{ item.title }}</uni-td>
							<uni-td>
								<view class="log-amt">
									<text :class="'log-delta-' + item.pendingDeltaSign">{{ item.pendingDeltaText }}</text>
									<text class="log-amt-after">{{ item.pendingAfterText }}</text>
								</view>
							</uni-td>
							<uni-td>
								<view class="log-amt">
									<text :class="'log-delta-' + item.frozenDeltaSign">{{ item.frozenDeltaText }}</text>
									<text class="log-amt-after">{{ item.frozenAfterText }}</text>
								</view>
							</uni-td>
							<uni-td>{{ item.anchorFlowText }}</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>

			<view v-else class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll">
					<uni-table border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="152">操作时间</uni-th>
							<uni-th width="120">商户</uni-th>
							<uni-th width="104">手机</uni-th>
							<uni-th width="108">升级方式</uni-th>
							<uni-th width="96">目标会员</uni-th>
							<uni-th width="88">清除积分(元)</uni-th>
							<uni-th width="88">清除冻结(元)</uni-th>
							<uni-th>说明</uni-th>
						</uni-tr>
						<uni-tr v-for="item in upgradeClearList" :key="item._id">
							<uni-td>{{ fmtTs(item.create_time) }}</uni-td>
							<uni-td class="cell-ellipsis" :title="item.merchant_user_id">{{
								item.merchant_name !== '-' ? item.merchant_name : item.merchant_user_id || '-'
							}}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.merchant_mobile }}</uni-td>
							<uni-td class="cell-tiny">{{ item.upgrade_kind_label }}</uni-td>
							<uni-td>{{ item.target_membership_name }}</uni-td>
							<uni-td>{{ item.cleared_account_points_text }}</uni-td>
							<uni-td>{{ item.cleared_frozen_amount_text }}</uni-td>
							<uni-td class="cell-content">{{ item.content }}</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>

			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination
					show-icon
					show-page-size
					:page-size="currentPageInfo.pageSize"
					v-model="currentPageInfo.currentPage"
					:total="currentPageInfo.total"
					@change="onPageChanged"
					@pageSizeChange="onPageSizeChange"
				/>
			</view>
		</view>

		<uni-popup ref="detailPopup" type="center">
			<view class="detail-dialog">
				<view class="detail-head">
					<text class="detail-title">积分记录详情</text>
					<text class="detail-close" @click="closeDetail">关闭</text>
				</view>
				<scroll-view scroll-y class="detail-body">
					<text class="json-block">{{ detailPretty }}</text>
				</scroll-view>
			</view>
		</uni-popup>

		<!-- #ifndef H5 --><fix-window /><!-- #endif -->
	</view>
</template>

<script>
import { syncOpsListPageSize } from '../utils/sync-page-size.js';

function defaultRange() {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 30);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	return [start.getTime(), end.getTime()];
}

const STATUS_FILTER_OPTIONS = [
	{ text: '全部状态', value: 'all' },
	{ text: '待领取', value: 'pending_ready' },
	{ text: '未到时间 / 待开放', value: 'pending_locked' },
	{ text: '已领取', value: 'claimed' },
	{ text: '过期未领取', value: 'expired' },
	{ text: '全部待处理 (pending)', value: 'pending' }
];

const KIND_FILTER_OPTIONS = [
	{ text: '全部类型', value: '' },
	{ text: '流水首期补贴', value: 'trade_first' },
	{ text: '历史池分期返还', value: 'release_pool_history' },
	{ text: '优惠券达标奖励', value: 'coupon_reward' },
	{ text: '充值用户分期', value: 'recharge_vesting' },
	{ text: '非充值5万档', value: 'non_recharge_lump' },
	{ text: '非充值每满1万', value: 'non_recharge_extra' }
];

export default {
	data() {
		return {
			activeTab: 'packets',
			loading: false,
			list: [],
			upgradeClearList: [],
			balanceLogList: [],
			logMerchant: null,
			keyword: '',
			range: defaultRange(),
			statusFilter: 'all',
			kindFilter: '',
			tableKey: 0,
			pageInfo: {
				currentPage: 1,
				pageSize: 15,
				total: 0
			},
			clearPageInfo: {
				currentPage: 1,
				pageSize: 15,
				total: 0
			},
			detailJson: null,
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
		currentPageInfo() {
			return this.activeTab === 'upgrade_clear' ? this.clearPageInfo : this.pageInfo;
		},
		timeRangeLabel() {
			return this.activeTab === 'points_log' ? '事件时间' : '创建时间';
		},
		logEmptyText() {
			return this.keyword ? '暂无数据' : '请先搜索商户';
		},
		keywordPlaceholder() {
			if (this.activeTab === 'upgrade_clear') return '商户 user_id / 昵称 / 手机号 / 说明';
			if (this.activeTab === 'points_log') return '商户 user_id / 手机号 / 机具号（必填）';
			return '商户 user_id / 手机号片段 / 标题 / 记录 id';
		},
		detailPretty() {
			try {
				return JSON.stringify(this.detailJson || {}, null, 2);
			} catch (e) {
				return '';
			}
		},
		exportFilePrefix() {
			if (this.activeTab === 'upgrade_clear') return '升级清除日志';
			if (this.activeTab === 'points_log') return '积分日志';
			return '积分红包';
		},
		statusHeaderFilterData() {
			return this.mergeSelectFilterChecked(STATUS_FILTER_OPTIONS, this.statusFilter);
		},
		kindHeaderFilterData() {
			return this.mergeSelectFilterChecked(KIND_FILTER_OPTIONS, this.kindFilter);
		}
	},
	mounted() {
		this.search();
	},
	methods: {
		mergeSelectFilterChecked(baseList, selectedVal) {
			const sel = String(selectedVal == null ? '' : selectedVal).trim();
			return (baseList || []).map((item) => ({
				text: item.text,
				value: item.value,
				checked: String(item.value) === sel
			}));
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			if (filterType !== 'select') return;
			const arr = Array.isArray(filter) ? filter.map(String) : [];
			const picked = arr.length ? String(arr[0]).trim() : '';
			if (field === 'status') {
				const next = picked || 'all';
				if (this.statusFilter === next) return;
				this.statusFilter = next;
			} else if (field === 'kind') {
				if (this.kindFilter === picked) return;
				this.kindFilter = picked;
			} else {
				return;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		switchTab(tab) {
			if (this.activeTab === tab) return;
			this.activeTab = tab;
			this.keyword = '';
			this.logMerchant = null;
			this.balanceLogList = [];
			this.showExportMenu = false;
			this.pageInfo.currentPage = 1;
			this.clearPageInfo.currentPage = 1;
			this.search();
		},
		statusClass(key) {
			if (key === 'claimed') return 'st-ok';
			if (key === 'expired') return 'st-warn';
			if (key === 'pending_ready') return 'st-pending';
			if (key === 'pending_locked') return 'st-muted';
			return '';
		},
		fmtTs(ts) {
			if (ts == null || ts === '') return '-';
			const n = Number(ts);
			if (!n) return '-';
			const d = new Date(n);
			const p = (x) => String(x).padStart(2, '0');
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
				d.getMinutes()
			)}:${p(d.getSeconds())}`;
		},
		onRangeChange() {
			this.pageInfo.currentPage = 1;
			this.clearPageInfo.currentPage = 1;
			this.search();
		},
		onSearchClick() {
			this.pageInfo.currentPage = 1;
			this.clearPageInfo.currentPage = 1;
			this.search(true);
		},
		listAction() {
			if (this.activeTab === 'upgrade_clear') return 'opsMemberUpgradeClearLogsList';
			if (this.activeTab === 'points_log') return 'opsPointsBalanceLog';
			return 'opsIncomePacketsList';
		},
		buildTimeRange() {
			const r = this.range;
			let timeStart = '';
			let timeEnd = '';
			if (Array.isArray(r) && r.length >= 2 && r[0] != null && r[1] != null && r[0] !== '' && r[1] !== '') {
				timeStart = Number(r[0]);
				timeEnd = Number(r[1]);
			}
			return { timeStart, timeEnd };
		},
		buildPayload(pageOverride, pageSizeOverride) {
			const { timeStart, timeEnd } = this.buildTimeRange();
			if (this.activeTab === 'upgrade_clear') {
				return {
					page: pageOverride != null ? pageOverride : this.clearPageInfo.currentPage,
					pageSize: pageSizeOverride != null ? pageSizeOverride : this.clearPageInfo.pageSize,
					keyword: this.keyword,
					timeStart,
					timeEnd
				};
			}
			if (this.activeTab === 'points_log') {
				return {
					page: pageOverride != null ? pageOverride : this.pageInfo.currentPage,
					pageSize: pageSizeOverride != null ? pageSizeOverride : this.pageInfo.pageSize,
					keyword: this.keyword,
					timeStart,
					timeEnd
				};
			}
			return {
				page: pageOverride != null ? pageOverride : this.pageInfo.currentPage,
				pageSize: pageSizeOverride != null ? pageSizeOverride : this.pageInfo.pageSize,
				keyword: this.keyword,
				timeStart,
				timeEnd,
				statusFilter: this.statusFilter,
				subsidyKindFilter: this.kindFilter
			};
		},
		search(fromUser) {
			if (this.activeTab === 'points_log' && !String(this.keyword || '').trim()) {
				this.balanceLogList = [];
				this.logMerchant = null;
				this.pageInfo.total = 0;
				this.loading = false;
				if (fromUser) uni.showToast({ title: '请先搜索商户', icon: 'none' });
				return;
			}
			this.loading = true;
			const action = this.listAction();
			this.$request(action, this.buildPayload(), { functionName: 'ops-points-admin' })
				.then((res) => {
					this.loading = false;
					if (res.code !== 0) {
						uni.showToast({ title: res.message || '加载失败', icon: 'none' });
						if (this.activeTab === 'upgrade_clear') {
							this.upgradeClearList = [];
							this.clearPageInfo.total = 0;
						} else if (this.activeTab === 'points_log') {
							this.balanceLogList = [];
							this.logMerchant = null;
							this.pageInfo.total = 0;
						} else {
							this.list = [];
							this.pageInfo.total = 0;
						}
						return;
					}
					const d = res.data || {};
					if (this.activeTab === 'upgrade_clear') {
						this.upgradeClearList = d.list || [];
						this.clearPageInfo.total = Number(d.total) || 0;
						syncOpsListPageSize(this.clearPageInfo, d);
					} else if (this.activeTab === 'points_log') {
						this.balanceLogList = d.list || [];
						this.logMerchant = d.merchant || null;
						this.pageInfo.total = Number(d.total) || 0;
						syncOpsListPageSize(this.pageInfo, d);
					} else {
						this.list = d.list || [];
						this.pageInfo.total = Number(d.total) || 0;
						syncOpsListPageSize(this.pageInfo, d);
					}
				})
				.catch(() => {
					this.loading = false;
					if (this.activeTab === 'upgrade_clear') {
						this.upgradeClearList = [];
					} else if (this.activeTab === 'points_log') {
						this.balanceLogList = [];
					} else {
						this.list = [];
					}
				});
		},
		onPageChanged() {
			this.search();
		},
		onPageSizeChange(e) {
			const size = e.pageSize || e;
			if (this.activeTab === 'upgrade_clear') {
				this.clearPageInfo.pageSize = size;
				this.clearPageInfo.currentPage = 1;
			} else {
				this.pageInfo.pageSize = size;
				this.pageInfo.currentPage = 1;
			}
			this.search();
		},
		openDetail(id) {
			if (!id) return;
			this.$request('opsIncomePacketDetail', { id }, { functionName: 'ops-points-admin' }).then((res) => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.detailJson = res.data || {};
				this.$refs.detailPopup.open();
			});
		},
		closeDetail() {
			this.$refs.detailPopup.close();
			this.detailJson = null;
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},
		mapPacketExportRow(item) {
			return {
				创建时间: this.fmtTs(item.create_time),
				商户昵称: item.merchant_name || '-',
				商户ID: item.merchant_user_id || '',
				手机: item.merchant_mobile || '-',
				积分元: item.amountText != null ? item.amountText : item.amount,
				冻结金额: item.frozenAmountText != null ? item.frozenAmountText : '-',
				展示状态: item.display_status || '',
				类型: item.subsidy_kind_label || item.subsidy_kind || '',
				归属月: item.month_no || '',
				标题: item.title || '',
				可领时间: this.fmtTs(item.claim_open_time),
				过期时间: this.fmtTs(item.expire_time),
				领取时间: this.fmtTs(item.claimed_time),
				记录ID: item._id || ''
			};
		},
		mapUpgradeClearExportRow(item) {
			return {
				操作时间: this.fmtTs(item.create_time),
				商户昵称: item.merchant_name || '-',
				商户ID: item.merchant_user_id || '',
				手机: item.merchant_mobile || '-',
				升级方式: item.upgrade_kind_label || '',
				目标会员: item.target_membership_name || '',
				清除积分元: item.cleared_account_points_text || '',
				清除冻结元: item.cleared_frozen_amount_text || '',
				说明: item.content || '',
				记录ID: item._id || ''
			};
		},
		mapBalanceLogExportRow(item) {
			return {
				时间: this.fmtTs(item.event_time),
				类型: item.event_type_label || '',
				说明: item.title || '',
				待提现变化: item.pendingDeltaText || '',
				待提现结果: item.pendingAfterText || '',
				冻结变化: item.frozenDeltaText || '',
				冻结结果: item.frozenAfterText || '',
				锚定流水: item.anchorFlowText || '',
				商户昵称: item.merchant_name || '-',
				商户ID: item.merchant_user_id || '',
				手机: item.merchant_mobile || '-',
				记录ID: item._id || ''
			};
		},
		async fetchExportRows() {
			if (this.activeTab === 'points_log' && !String(this.keyword || '').trim()) {
				throw new Error('请先搜索商户');
			}
			const action = this.listAction();
			const pageSize = 1000;
			const maxRows = 10000;
			const all = [];
			let page = 1;
			let total = Infinity;
			while (all.length < maxRows && all.length < total) {
				const res = await this.$request(
					action,
					this.buildPayload(page, pageSize),
					{ functionName: 'ops-points-admin' }
				);
				if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
				const d = res.data || {};
				const rows = d.list || [];
				total = Number(d.total);
				if (!Number.isFinite(total) || total < 0) total = rows.length;
				all.push(...rows);
				if (!rows.length || rows.length < pageSize) break;
				page += 1;
				if (page > 50) break;
			}
			const truncated = all.length >= maxRows && total > maxRows;
			const slice = all.slice(0, maxRows);
			const mapped =
				this.activeTab === 'upgrade_clear'
					? slice.map((x) => this.mapUpgradeClearExportRow(x))
					: this.activeTab === 'points_log'
						? slice.map((x) => this.mapBalanceLogExportRow(x))
						: slice.map((x) => this.mapPacketExportRow(x));
			return { rows: mapped, truncated };
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
			const esc = (s) =>
				String(s == null ? '' : s)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');
			const root =
				this.activeTab === 'upgrade_clear'
					? 'upgradeClearLogs'
					: this.activeTab === 'points_log'
						? 'pointsBalanceLogs'
						: 'incomePackets';
			const items = rows
				.map((r) => {
					const fields = Object.entries(r)
						.map(([k, v]) => {
							const tag = String(k).replace(/[^\w\u4e00-\u9fa5]/g, '_');
							return `<${tag}>${esc(v)}</${tag}>`;
						})
						.join('');
					return `<item>${fields}</item>`;
				})
				.join('');
			return `<?xml version="1.0" encoding="UTF-8"?><${root}>${items}</${root}>`;
		},
		toHtmlTable(rows) {
			const keys = Object.keys(rows[0] || {});
			const th = keys.map((k) => `<th>${k}</th>`).join('');
			const tr = rows
				.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`)
				.join('');
			return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
		},
		async exportData(type) {
			try {
				uni.showLoading({ title: '导出中...', mask: true });
				const { rows, truncated } = await this.fetchExportRows();
				if (!rows.length) {
					uni.showToast({ title: '暂无可导出数据', icon: 'none' });
					return;
				}
				const ts = Date.now();
				const prefix = this.exportFilePrefix;
				if (type === 'json') {
					this.downloadFile(`${prefix}_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				} else if (type === 'xml') {
					this.downloadFile(`${prefix}_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				} else if (type === 'csv') {
					this.downloadFile(`${prefix}_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				} else if (type === 'txt') {
					this.downloadFile(`${prefix}_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				} else if (type === 'word') {
					this.downloadFile(`${prefix}_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				} else if (type === 'excel') {
					this.downloadFile(`${prefix}_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
				}
				if (truncated) {
					uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
				}
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
.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
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
	z-index: 20;
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
.page-wrap {
	padding-bottom: 24px;
}
.intro {
	font-size: 12px;
	color: #909399;
	margin-bottom: 12px;
	line-height: 1.6;
}
.intro .mono {
	font-family: Menlo, Monaco, Consolas, monospace;
	color: #606266;
}
.tab-bar {
	display: flex;
	gap: 8px;
	margin-bottom: 12px;
}
.tab-item {
	padding: 6px 14px;
	font-size: 13px;
	color: #606266;
	background: #f5f7fa;
	border-radius: 6px;
	cursor: pointer;
}
.tab-active {
	color: #fff;
	background: #409eff;
	font-weight: 600;
}
.search-card {
	background: #fff;
	border-radius: 8px;
	padding: 12px;
	margin-bottom: 12px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.row {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.label {
	flex-shrink: 0;
	color: #606266;
	font-size: 13px;
	min-width: 72px;
}
.table-scroll {
	overflow-x: auto;
}
.points-table-wrap .op-cell {
	white-space: nowrap;
	text-align: center;
}
.points-table-wrap .btn-detail {
	white-space: nowrap !important;
	display: inline-flex !important;
	align-items: center;
	justify-content: center;
	min-width: 56px;
	box-sizing: border-box;
	line-height: 28px !important;
	height: 28px;
	padding: 0 12px !important;
	font-size: 12px;
}
.cell-ellipsis {
	max-width: 120px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.cell-content {
	max-width: 220px;
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
.cell-title {
	max-width: 148px;
	font-size: 12px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.cell-time-stack {
	font-size: 12px;
	line-height: 1.45;
	color: #606266;
	white-space: nowrap;
}
.cell-tiny {
	font-size: 11px;
	line-height: 1.45;
	color: #606266;
}
.log-merchant {
	font-size: 12px;
	color: #606266;
	padding-left: 82px;
}
.log-amt {
	display: flex;
	flex-direction: column;
	line-height: 1.4;
	white-space: nowrap;
}
.log-amt-after {
	color: #303133;
	font-weight: 600;
}
.log-delta-pos {
	color: #67c23a;
}
.log-delta-neg {
	color: #f56c6c;
}
.log-delta-zero {
	color: #909399;
}
.st-ok {
	color: #67c23a;
	font-weight: 600;
}
.st-warn {
	color: #e6a23c;
	font-weight: 600;
}
.st-pending {
	color: #409eff;
	font-weight: 600;
}
.st-muted {
	color: #909399;
}
.detail-dialog {
	width: min(860px, 92vw);
	max-height: 78vh;
	background: #fff;
	border-radius: 10px;
	overflow: hidden;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.detail-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 14px;
	border-bottom: 1px solid #ebeef5;
}
.detail-title {
	font-size: 15px;
	font-weight: 600;
	color: #303133;
}
.detail-close {
	font-size: 13px;
	color: #409eff;
	cursor: pointer;
}
.detail-body {
	max-height: calc(78vh - 52px);
	padding: 12px;
	box-sizing: border-box;
}
.json-block {
	display: block;
	white-space: pre-wrap;
	word-break: break-all;
	font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
	font-size: 12px;
	line-height: 1.55;
	color: #303133;
}
</style>
