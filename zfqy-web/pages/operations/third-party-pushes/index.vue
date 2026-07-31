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
		

			<view class="tabs">
				<view
					v-for="tab in tabs"
					:key="tab.key"
					class="tab-item"
					:class="{ active: activeType === tab.key }"
					@click="onTab(tab.key)"
				>{{ tab.name }}</view>
			</view>

			<view class="search-card">
				<view class="row">
					<text class="label">接收时间</text>
					<uni-datetime-picker
						v-model="range"
						type="datetimerange"
						return-type="timestamp"
						@change="onRangeChange"
					/>
				</view>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll push-table-wrap">
					<!-- TYY0001 -->
					<view v-if="activeType === 'TYY0001'" class="tyy0001-table-wrap">
						<uni-table :key="'t1-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">接收时间</uni-th>
							<uni-th
								width="142"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0001.firstagentid"
								@filter-change="headerFilterChange($event, 'firstagentid')"
							>代理商编号</uni-th>
							<!-- <uni-th width="130" filter-type="search" @filter-change="headerFilterChange($event, 'logno')">流水号</uni-th> -->
							<uni-th
								width="124"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0001.mercid"
								@filter-change="headerFilterChange($event, 'mercid')"
							>商户号</uni-th>
							<uni-th
								width="132"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0001.termphyno"
								@filter-change="headerFilterChange($event, 'termphyno')"
							>码牌号</uni-th>
							<uni-th width="92">交易日期</uni-th>
							<uni-th width="88">交易时间</uni-th>
							<uni-th
								width="122"
								filter-type="select"
								:filter-data="tyy0001PaychannelFilterData"
								@filter-change="headerFilterChange($event, 'paychannel')"
							>支付方式</uni-th>
							<uni-th width="92">交易金额</uni-th>
							<uni-th
								width="108"
								filter-type="select"
								:filter-data="tyy0001RefundFilterData"
								@filter-change="headerFilterChange($event, 'refund')"
							>是否退款</uni-th>
							<!-- <uni-th width="56">补贴类型</uni-th> -->
							<!-- <uni-th width="88">补贴</uni-th> -->
							<uni-th width="104">已录入系统</uni-th>
							<uni-th width="88">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td align="center" class="td-receive-time-split">
								<view class="recv-time-stack">
									<text class="recv-time-date">{{ fmtTsDatePart(item.receive_time) }}</text>
									<text class="recv-time-clock">{{ fmtTsTimePart(item.receive_time) }}</text>
								</view>
							</uni-td>
							<uni-td>{{ item.firstagentid || '-' }}</uni-td>
							<!-- <uni-td>{{ item.logno || '-' }}</uni-td> -->
							<uni-td>{{ item.mercid || '-' }}</uni-td>
							<uni-td>{{ item.termphyno || '-' }}</uni-td>
							<uni-td>{{ item.orderdat || '-' }}</uni-td>
							<uni-td>{{ item.ordertime || '-' }}</uni-td>
							<uni-td class="td-paychannel">{{ fmtPaychannelRow(item) }}</uni-td>
							<uni-td align="right">{{ item.txnamt || '-' }}</uni-td>
							<uni-td align="center">{{ fmtRefund(item.refund) }}</uni-td>
							<!-- <uni-td>{{ item.discount_flag || '-' }}</uni-td> -->
							<!-- <uni-td>{{ item.discount_flag_text || '-' }}</uni-td> -->
							<uni-td>{{ item.machine_in_system ? '是' : '否' }}</uni-td>
							<uni-td><view class="op-cell"><button class="btn-detail" size="mini" type="primary" plain @click="openDetail(item)">详情</button></view></uni-td>
						</uni-tr>
						</uni-table>
					</view>

					<!-- TYY0002 -->
					<uni-table v-if="activeType === 'TYY0002'" :key="'t2-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">接收时间</uni-th>
							<uni-th
								width="130"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0002.firstagentid"
								@filter-change="headerFilterChange($event, 'firstagentid')"
							>代理商编号</uni-th>
							<uni-th
								width="110"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0002.mercid"
								@filter-change="headerFilterChange($event, 'mercid')"
							>商户号</uni-th>
							<uni-th width="140">商户名称</uni-th>
							<uni-th width="88">注册日期 </uni-th>
						
							<uni-th width="72">商户状态</uni-th>
							<uni-th width="64">商户类型</uni-th>
							<uni-th width="80">省份</uni-th>
							<uni-th width="80">城市</uni-th>
							<uni-th width="88">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td align="center" class="td-receive-time-split">
								<view class="recv-time-stack">
									<text class="recv-time-date">{{ fmtTsDatePart(item.receive_time) }}</text>
									<text class="recv-time-clock">{{ fmtTsTimePart(item.receive_time) }}</text>
								</view>
							</uni-td>
							<uni-td>{{ item.firstagentid || '-' }}</uni-td>
							<uni-td>{{ item.mercid || '-' }}</uni-td>
							<uni-td>{{ item.mercname || '-' }}</uni-td>
							<uni-td>{{ item.applydat || '-' }}</uni-td>
						
							<uni-td>{{ item.status_text || '-' }}</uni-td>
							<uni-td>{{ item.mertype || '-' }}</uni-td>
							<uni-td>{{ item.provid || '-' }}</uni-td>
							<uni-td>{{ item.cityid || '-' }}</uni-td>
							<uni-td><view class="op-cell"><button class="btn-detail" size="mini" type="primary" plain @click="openDetail(item)">详情</button></view></uni-td>
						</uni-tr>
					</uni-table>

					<!-- TYY0003 -->
					<uni-table v-if="activeType === 'TYY0003'" :key="'t3-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">接收时间</uni-th>
							<uni-th
								width="130"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0003.firstagentid"
								@filter-change="headerFilterChange($event, 'firstagentid')"
							>代理商编号</uni-th>
							<uni-th
								width="100"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0003.termno"
								@filter-change="headerFilterChange($event, 'termno')"
							>终端号</uni-th>
							<uni-th
								width="140"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0003.termphyno"
								@filter-change="headerFilterChange($event, 'termphyno')"
							>终端机身号</uni-th>
							<uni-th
								width="110"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0003.mercid"
								@filter-change="headerFilterChange($event, 'mercid')"
							>绑定商户号</uni-th>
							<uni-th width="72">政策ID</uni-th>
							<uni-th
								width="100"
								filter-type="select"
								:filter-data="tyy0003EquiptypeFilterData"
								@filter-change="headerFilterChange($event, 'equiptype')"
							>设备类型</uni-th>
							<uni-th
								width="96"
								filter-type="select"
								:filter-data="tyy0003AllinoneFilterData"
								@filter-change="headerFilterChange($event, 'allinone')"
							>是否一体机</uni-th>
							<uni-th width="88">绑定日期</uni-th>
							<uni-th width="72">绑定时间</uni-th>
							<uni-th
								width="120"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0003.spno"
								@filter-change="headerFilterChange($event, 'spno')"
							>绑定音箱号</uni-th>
							<uni-th width="88">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td align="center" class="td-receive-time-split">
								<view class="recv-time-stack">
									<text class="recv-time-date">{{ fmtTsDatePart(item.receive_time) }}</text>
									<text class="recv-time-clock">{{ fmtTsTimePart(item.receive_time) }}</text>
								</view>
							</uni-td>
							<uni-td>{{ item.firstagentid || '-' }}</uni-td>
							<uni-td>{{ item.termno || '-' }}</uni-td>
							<uni-td>{{ item.termphyno || '-' }}</uni-td>
							<uni-td>{{ item.mercid || '-' }}</uni-td>
							<uni-td>{{ item.policyid || '-' }}</uni-td>
							<uni-td>{{ fmtTyy0003Equiptype(item) }}</uni-td>
							<uni-td>{{ fmtTyy0003Allinone(item) }}</uni-td>
							<uni-td>{{ item.merextdat || '-' }}</uni-td>
							<uni-td>{{ item.merexttime || '-' }}</uni-td>
							<uni-td>{{ item.spno || '-' }}</uni-td>
							<uni-td><view class="op-cell"><button class="btn-detail" size="mini" type="primary" plain @click="openDetail(item)">详情</button></view></uni-td>
						</uni-tr>
					</uni-table>

					<!-- TYY0004 -->
					<uni-table v-if="activeType === 'TYY0004'" :key="'t4-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">接收时间</uni-th>
							<uni-th
								width="130"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0004.firstagentid"
								@filter-change="headerFilterChange($event, 'firstagentid')"
							>一级代理商编号</uni-th>
							<!-- <uni-th width="120">id</uni-th> -->
							<uni-th
								width="110"
								filter-type="search"
								:filter-default-value="filtersByType.TYY0004.mercid"
								@filter-change="headerFilterChange($event, 'mercid')"
							>商户号</uni-th>
							<uni-th width="88">政策ID</uni-th>
							<uni-th width="88">通讯费ID</uni-th>
							<uni-th width="140">缴费完成时间</uni-th>
							<uni-th width="88">已收取金额</uni-th>
							<uni-th width="110">代理商编号</uni-th>
							<uni-th width="140">终端机身号</uni-th>
							<uni-th width="88">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td align="center" class="td-receive-time-split">
								<view class="recv-time-stack">
									<text class="recv-time-date">{{ fmtTsDatePart(item.receive_time) }}</text>
									<text class="recv-time-clock">{{ fmtTsTimePart(item.receive_time) }}</text>
								</view>
							</uni-td>
							<uni-td>{{ item.firstagentid || '-' }}</uni-td>
							<!-- <uni-td>{{ item.push_id || '-' }}</uni-td> -->
							<uni-td>{{ item.mercid || '-' }}</uni-td>
							<uni-td>{{ item.policyid || '-' }}</uni-td>
							<uni-td>{{ item.feeid || '-' }}</uni-td>
							<uni-td>{{ item.feetime || '-' }}</uni-td>
							<uni-td align="right">{{ item.receivefee != null ? item.receivefee : '-' }}</uni-td>
							<uni-td>{{ item.agentid || '-' }}</uni-td>
							<uni-td>{{ item.sn || '-' }}</uni-td>
							<uni-td><view class="op-cell"><button class="btn-detail" size="mini" type="primary" plain @click="openDetail(item)">详情</button></view></uni-td>
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

		<uni-popup ref="detailPopup" type="center">
			<view class="detail-dialog">
				<view class="detail-head">
					<text class="detail-title">推送详情（{{ activeType }}）</text>
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
import {
	EXPORT_TYPE_OPTIONS,
	fetchPagedExportRows,
	runListExport
} from '../utils/list-export.js';

/** TYY0001 paychannel 展示（与星驿枚举一致） */
const PAYCHANNEL_LABELS = {
	'00': '未知，联系星驿支付排查',
	'01': '支付宝',
	'02': '微信',
	'03': '银联优惠',
	'04': '银联未优惠',
	'05': '标准借记卡',
	'06': '标准贷记卡',
	'11': '冻结款(押金)',
	'12': '数币',
	'31': '京东白条'
};

function normPayCh(raw) {
	const s = String(raw == null ? '' : raw).trim();
	if (!s) return '';
	return s.length === 1 ? `0${s}` : s;
}

function defaultRange() {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 30);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	return [start.getTime(), end.getTime()];
}

/** 各 Tab 独立表头筛选，避免 TYY0001 / TYY0002 等同名列共用一份 filters 导致切换后条件错乱 */
function defaultFiltersByType() {
	return {
		TYY0001: {
			firstagentid: '',
			mercid: '',
			logno: '',
			termphyno: '',
			refund: '',
			paychannel: ''
		},
		TYY0002: {
			firstagentid: '',
			mercid: ''
		},
		TYY0003: {
			firstagentid: '',
			mercid: '',
			termno: '',
			termphyno: '',
			spno: '',
			equiptype: '',
			allinone: ''
		},
		TYY0004: {
			firstagentid: '',
			mercid: ''
		}
	};
}

export default {
	data() {
		return {
			loading: false,
			tableKey: 0,
			activeType: 'TYY0001',
			tabs: [
				{ key: 'TYY0001', name: 'TYY0001 交易流水' },
				{ key: 'TYY0002', name: 'TYY0002 商户信息' },
				{ key: 'TYY0003', name: 'TYY0003 终端绑定' },
				{ key: 'TYY0004', name: 'TYY0004 通讯费' }
			],
			list: [],
			filtersByType: defaultFiltersByType(),
			equiptypeFilterData: [
				{ text: '码牌', value: '1', checked: false },
				{ text: 'POS', value: '2', checked: false },
				{ text: '音箱', value: '3', checked: false }
			],
			allinoneFilterData: [
				{ text: '是', value: '1', checked: false },
				{ text: '否', value: '0', checked: false }
			],
			refundFilterData: [
				{ text: '否 0', value: '0', checked: false },
				{ text: '是 1', value: '1', checked: false }
			],
			paychannelFilterData: [
				{ text: '01 支付宝', value: '01', checked: false },
				{ text: '02 微信', value: '02', checked: false },
				{ text: '03 银联优惠', value: '03', checked: false },
				{ text: '04 银联未优惠', value: '04', checked: false },
				{ text: '05 标准借记卡', value: '05', checked: false },
				{ text: '06 标准贷记卡', value: '06', checked: false },
				{ text: '11 冻结款(押金)', value: '11', checked: false },
				{ text: '12 数币', value: '12', checked: false },
				{ text: '31 京东白条', value: '31', checked: false },
				{ text: '00 未知', value: '00', checked: false }
			],
			range: defaultRange(),
			pageInfo: {
				currentPage: 1,
				pageSize: 15,
				total: 0
			},
			detailJson: null,
			showExportMenu: false,
			exportTypeOptions: EXPORT_TYPE_OPTIONS
		};
	},
	computed: {
		detailPretty() {
			try {
				return JSON.stringify(this.detailJson || {}, null, 2);
			} catch (e) {
				return '';
			}
		},
		/** select 类表头不会读 filterDefaultValue，用 filterData 内 checked 与 filtersByType 对齐 */
		tyy0001PaychannelFilterData() {
			return this.mergeSelectFilterChecked(this.paychannelFilterData, this.filtersByType.TYY0001.paychannel);
		},
		tyy0001RefundFilterData() {
			return this.mergeSelectFilterChecked(this.refundFilterData, this.filtersByType.TYY0001.refund);
		},
		tyy0003EquiptypeFilterData() {
			return this.mergeSelectFilterChecked(this.equiptypeFilterData, this.filtersByType.TYY0003.equiptype);
		},
		tyy0003AllinoneFilterData() {
			return this.mergeSelectFilterChecked(this.allinoneFilterData, this.filtersByType.TYY0003.allinone);
		},
		exportFilePrefix() {
			return `第三方推送_${this.activeType}`;
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
				checked: sel !== '' && String(item.value) === sel
			}));
		},
		fmtTs(ts) {
			if (ts == null || ts === '') return '-';
			const n = Number(ts);
			if (!n) return '-';
			const d = new Date(n);
			const p = (x) => String(x).padStart(2, '0');
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
		},
		/** 接收时间：与 fmtTs 同一时刻，拆成两行（日期 / 时间）展示 */
		fmtTsDatePart(ts) {
			const s = this.fmtTs(ts);
			if (!s || s === '-') return '-';
			const i = s.indexOf(' ');
			return i === -1 ? s : s.slice(0, i);
		},
		fmtTsTimePart(ts) {
			const s = this.fmtTs(ts);
			if (!s || s === '-') return '';
			const i = s.indexOf(' ');
			return i === -1 ? '' : s.slice(i + 1);
		},
		fmtRefund(v) {
			const k = String(v == null ? '' : v).trim();
			if (k === '1') return '是';
			if (k === '0') return '否';
			return k === '' ? '-' : k;
		},
		fmtPaychannelRow(row) {
			const code = normPayCh(row && row.paychannel);
			const textFromRow = row && String(row.paychannel_text || '').trim();
			const label = (code && PAYCHANNEL_LABELS[code]) || textFromRow || '';
			if (!code && !label) return '-';
			if (code && label) return `${code} ${label}`;
			return label || code || '-';
		},
		/** TYY0003 equiptype：1 码牌 2 POS 3 音箱 */
		fmtTyy0003Equiptype(row) {
			const t = row && String(row.equiptype_text || '').trim();
			if (t) return t;
			const k = String(row && row.equiptype != null ? row.equiptype : '').trim();
			const map = { '1': '码牌', '2': 'POS', '3': '音箱' };
			return map[k] || (k ? `未知(${k})` : '-');
		},
		/** TYY0003 allinone：1 为「是」，其余为「否」 */
		fmtTyy0003Allinone(row) {
			const t = row && String(row.allinone_text || '').trim();
			if (t === '是' || t === '否') return t;
			const v = row && row.allinone;
			const s = String(v != null ? v : '').trim();
			if (s === '1' || v === 1) return '是';
			return '否';
		},
		onRangeChange() {
			this.pageInfo.currentPage = 1;
			this.search();
		},
		onTab(key) {
			if (this.activeType === key) return;
			this.activeType = key;
			this.pageInfo.currentPage = 1;
			this.showExportMenu = false;
			this.tableKey += 1;
			this.search();
		},
		headerFilterChange(e, field) {
			const bucket = this.filtersByType[this.activeType];
			if (!bucket) return;
			const { filterType, filter } = e || {};
			if (filterType === 'search') {
				if (
					field === 'mercid' ||
					field === 'termphyno' ||
					field === 'firstagentid' ||
					field === 'logno' ||
					field === 'termno' ||
					field === 'spno'
				) {
					if (Object.prototype.hasOwnProperty.call(bucket, field)) {
						bucket[field] = String(filter == null ? '' : filter).trim();
					}
					this.pageInfo.currentPage = 1;
					this.search();
				}
				return;
			}
			if (
				filterType === 'select' &&
				(field === 'refund' ||
					field === 'paychannel' ||
					field === 'equiptype' ||
					field === 'allinone')
			) {
				if (Object.prototype.hasOwnProperty.call(bucket, field)) {
					const arr = Array.isArray(filter) ? filter.map(String) : [];
					bucket[field] = arr.length ? arr[0] : '';
				}
				this.pageInfo.currentPage = 1;
				this.search();
				return;
			}
		},
		buildPayload(pageOverride, pageSizeOverride) {
			const r = this.range;
			let timeStart = '';
			let timeEnd = '';
			if (Array.isArray(r) && r.length >= 2 && r[0] && r[1]) {
				timeStart = Number(r[0]);
				timeEnd = Number(r[1]);
			}
			const t = this.activeType;
			const f = this.filtersByType[t] || {};
			return {
				type: t,
				page: pageOverride != null ? pageOverride : this.pageInfo.currentPage,
				pageSize: pageSizeOverride != null ? pageSizeOverride : this.pageInfo.pageSize,
				firstagentid: f.firstagentid || '',
				mercid: f.mercid || '',
				logno: t === 'TYY0001' ? f.logno || '' : '',
				termphyno: t === 'TYY0001' || t === 'TYY0003' ? f.termphyno || '' : '',
				termno: t === 'TYY0003' ? f.termno || '' : '',
				spno: t === 'TYY0003' ? f.spno || '' : '',
				equiptype: t === 'TYY0003' ? f.equiptype || '' : '',
				allinone: t === 'TYY0003' ? f.allinone || '' : '',
				refund: t === 'TYY0001' ? f.refund || '' : '',
				paychannel: t === 'TYY0001' ? f.paychannel || '' : '',
				timeStart,
				timeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('thirdPartyPushList', this.buildPayload(), { functionName: 'third-party-push-admin' })
				.then((res) => {
					this.loading = false;
					if (res.code !== 0) {
						uni.showToast({ title: res.message || '加载失败', icon: 'none' });
						this.list = [];
						this.pageInfo.total = 0;
						return;
					}
					const d = res.data || {};
					const total = Number(d.total) || 0;
					this.pageInfo.total = total;
					syncOpsListPageSize(this.pageInfo, d);
					const ps = Math.max(1, Number(this.pageInfo.pageSize) || 15);
					const maxPage = Math.max(1, Math.ceil(total / ps) || 1);
					const cur = Math.max(1, Number(this.pageInfo.currentPage) || 1);
					if (cur > maxPage) {
						this.pageInfo.currentPage = maxPage;
						return this.search();
					}
					this.list = d.list || [];
				})
				.catch(() => {
					this.loading = false;
					this.list = [];
				});
		},
		onPageChanged() {
			this.search();
		},
		onPageSizeChange(e) {
			this.pageInfo.pageSize = e.pageSize;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		openDetail(row) {
			const id = row && row._id;
			if (!id) return;
			this.$request(
				'thirdPartyPushDetail',
				{ type: this.activeType, id },
				{ functionName: 'third-party-push-admin' }
			).then((res) => {
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
		mapExportRow(item) {
			const t = this.activeType;
			if (t === 'TYY0001') {
				return {
					接收时间: this.fmtTs(item.receive_time),
					代理商编号: item.firstagentid || '',
					商户号: item.mercid || '',
					码牌号: item.termphyno || '',
					交易日期: item.orderdat || '',
					交易时间: item.ordertime || '',
					支付方式: this.fmtPaychannelRow(item),
					交易金额: item.txnamt != null ? item.txnamt : '',
					是否退款: this.fmtRefund(item.refund),
					已录入系统: item.machine_in_system ? '是' : '否',
					记录ID: item._id || ''
				};
			}
			if (t === 'TYY0002') {
				return {
					接收时间: this.fmtTs(item.receive_time),
					代理商编号: item.firstagentid || '',
					商户号: item.mercid || '',
					商户名称: item.mercname || '',
					注册日期: item.applydat || '',
					商户状态: item.status_text || '',
					商户类型: item.mertype || '',
					省份: item.provid || '',
					城市: item.cityid || '',
					记录ID: item._id || ''
				};
			}
			if (t === 'TYY0003') {
				return {
					接收时间: this.fmtTs(item.receive_time),
					代理商编号: item.firstagentid || '',
					终端号: item.termno || '',
					终端机身号: item.termphyno || '',
					绑定商户号: item.mercid || '',
					政策ID: item.policyid || '',
					设备类型: this.fmtTyy0003Equiptype(item),
					是否一体机: this.fmtTyy0003Allinone(item),
					绑定日期: item.merextdat || '',
					绑定时间: item.merexttime || '',
					绑定音箱号: item.spno || '',
					记录ID: item._id || ''
				};
			}
			return {
				接收时间: this.fmtTs(item.receive_time),
				一级代理商编号: item.firstagentid || '',
				商户号: item.mercid || '',
				政策ID: item.policyid || '',
				通讯费ID: item.feeid || '',
				缴费完成时间: item.feetime || '',
				已收取金额: item.receivefee != null ? item.receivefee : '',
				代理商编号: item.agentid || '',
				终端机身号: item.sn || '',
				记录ID: item._id || ''
			};
		},
		exportData(type) {
			return runListExport({
				type,
				filenamePrefix: this.exportFilePrefix,
				xmlRoot: this.activeType,
				fetchRows: () =>
					fetchPagedExportRows({
						request: this.$request.bind(this),
						action: 'thirdPartyPushList',
						functionName: 'third-party-push-admin',
						buildPayload: (page, pageSize) => this.buildPayload(page, pageSize),
						mapRow: (item) => this.mapExportRow(item)
					})
			});
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
.page-intro {
	margin-bottom: 12px;
}
.page-title {
	display: block;
	font-size: 18px;
	font-weight: 600;
	color: #303133;
	margin-bottom: 6px;
}
.page-sub {
	display: block;
	font-size: 12px;
	color: #909399;
	line-height: 1.6;
}
.link {
	color: #409eff;
	text-decoration: underline;
	margin: 0 2px;
}
.tabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 12px;
}
.tab-item {
	padding: 6px 12px;
	border-radius: 999px;
	background: #f2f3f5;
	color: #606266;
	font-size: 12px;
	cursor: pointer;
}
.tab-item.active {
	background: #ecf5ff;
	color: #409eff;
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
	min-width: 100px;
}
.table-scroll {
	overflow-x: auto;
}
/* 表头单行；详情按钮不换行、不被压扁 */
.push-table-wrap ::v-deep .uni-table-th {
	white-space: nowrap;
	text-align: center !important;
}
/* 标题与筛选图标作为一组整体居中 */
.push-table-wrap ::v-deep .uni-table-th-content {
	white-space: nowrap;
	flex-wrap: nowrap;
	justify-content: center !important;
	width: 100%;
	box-sizing: border-box;
}
.push-table-wrap ::v-deep .uni-table-th-row {
	flex-wrap: nowrap;
	align-items: center;
	justify-content: center;
	width: 100%;
	box-sizing: border-box;
}
/* 表头筛选浮层：底部「搜索 / 重置」与顶部「刷新」同为 uni mini 按钮规格并居中 */
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area.flex-r {
	justify-content: center;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	box-sizing: border-box;
}
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area .flex-f {
	flex: 0 0 auto;
	min-width: 76px;
}
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area .btn {
	margin: 0 !important;
	min-height: 28px;
	line-height: 28px;
	padding: 0 14px !important;
	font-size: 12px;
	font-weight: 400;
	border-radius: 4px;
	box-sizing: border-box;
	display: inline-flex !important;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}
/* 与 uni.scss $uni-color-primary / 顶部「刷新」主色一致 */
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area .btn-submit {
	background-color: #2563eb !important;
	color: #fff !important;
	border: 1px solid #2563eb !important;
}
/* 对齐默认 mini 描边按钮（重置） */
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area .btn-default:not(.disable) {
	background-color: #fff !important;
	color: #606266 !important;
	border: 1px solid #dcdfe6 !important;
}
.push-table-wrap ::v-deep .uni-filter-dropdown .opera-area .btn-default.disable {
	opacity: 0.5;
	cursor: default;
	border-color: #ebeef5 !important;
	color: #c0c4cc !important;
	background-color: #f5f7fa !important;
}
/* TYY0001：支付方式列 — 限制标题区伸缩，避免与筛选图标间距异常 */
.push-table-wrap ::v-deep .tyy0001-table-wrap tr:first-child > th:nth-child(7) .uni-table-th-content {
	flex: 0 1 auto;
	min-width: 0;
}
.push-table-wrap ::v-deep .tyy0001-table-wrap tr:first-child > th:nth-child(7) .uni-table-th-row {
	justify-content: center;
}
.push-table-wrap ::v-deep .tyy0001-table-wrap td:nth-child(7) {
	white-space: nowrap;
}
/* 接收时间固定两行（日期 / 时间），避免窄列被拆成多行 */
.recv-time-stack {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	line-height: 1.25;
	padding: 2px 0;
	box-sizing: border-box;
}
.recv-time-date,
.recv-time-clock {
	display: block;
	white-space: nowrap;
	font-size: 12px;
	color: #303133;
}
.push-table-wrap .op-cell {
	white-space: nowrap;
	text-align: center;
}
.push-table-wrap .btn-detail {
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
.detail-dialog {
	width: min(920px, 92vw);
	max-height: 80vh;
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
	max-height: calc(80vh - 52px);
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
