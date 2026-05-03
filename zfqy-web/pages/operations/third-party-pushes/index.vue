<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" type="primary" :loading="loading" @click="search">刷新</button>
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
							<uni-th width="142" filter-type="search" @filter-change="headerFilterChange($event, 'firstagentid')">代理商编号</uni-th>
							<!-- <uni-th width="130" filter-type="search" @filter-change="headerFilterChange($event, 'logno')">流水号</uni-th> -->
							<uni-th width="124" filter-type="search" @filter-change="headerFilterChange($event, 'mercid')">商户号</uni-th>
							<uni-th width="132" filter-type="search" @filter-change="headerFilterChange($event, 'termphyno')">码牌号</uni-th>
							<uni-th width="92">交易日期</uni-th>
							<uni-th width="88">交易时间</uni-th>
							<uni-th
								width="122"
								filter-type="select"
								:filter-data="paychannelFilterData"
								@filter-change="headerFilterChange($event, 'paychannel')"
							>支付方式</uni-th>
							<uni-th width="92">交易金额</uni-th>
							<uni-th
								width="108"
								filter-type="select"
								:filter-data="refundFilterData"
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
							<uni-th width="130" filter-type="search" @filter-change="headerFilterChange($event, 'firstagentid')">代理商编号</uni-th>
							<uni-th width="110" filter-type="search" @filter-change="headerFilterChange($event, 'mercid')">商户号</uni-th>
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
							<uni-th width="130" filter-type="search" @filter-change="headerFilterChange($event, 'firstagentid')">代理商编号</uni-th>
							<uni-th width="100" filter-type="search" @filter-change="headerFilterChange($event, 'termno')">终端号</uni-th>
							<uni-th width="140" filter-type="search" @filter-change="headerFilterChange($event, 'termphyno')">终端机身号</uni-th>
							<uni-th width="110" filter-type="search" @filter-change="headerFilterChange($event, 'mercid')">绑定商户号</uni-th>
							<uni-th width="72">政策ID</uni-th>
							<uni-th
								width="100"
								filter-type="select"
								:filter-data="equiptypeFilterData"
								@filter-change="headerFilterChange($event, 'equiptype')"
							>设备类型</uni-th>
							<uni-th
								width="96"
								filter-type="select"
								:filter-data="allinoneFilterData"
								@filter-change="headerFilterChange($event, 'allinone')"
							>是否一体机</uni-th>
							<uni-th width="88">绑定日期</uni-th>
							<uni-th width="72">绑定时间</uni-th>
							<uni-th width="120" filter-type="search" @filter-change="headerFilterChange($event, 'spno')">绑定音箱号</uni-th>
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
							<uni-th width="130" filter-type="search" @filter-change="headerFilterChange($event, 'firstagentid')">一级代理商编号</uni-th>
							<!-- <uni-th width="120">id</uni-th> -->
							<uni-th width="110" filter-type="search" @filter-change="headerFilterChange($event, 'mercid')">商户号</uni-th>
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
			filters: {
				firstagentid: '',
				mercid: '',
				logno: '',
				termphyno: '',
				termno: '',
				spno: '',
				equiptype: '',
				allinone: '',
				refund: '',
				paychannel: ''
			},
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
			detailJson: null
		};
	},
	computed: {
		detailPretty() {
			try {
				return JSON.stringify(this.detailJson || {}, null, 2);
			} catch (e) {
				return '';
			}
		}
	},
	mounted() {
		this.search();
	},
	methods: {
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
			this.tableKey += 1;
			this.search();
		},
		headerFilterChange(e, field) {
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
					this.filters[field] = String(filter == null ? '' : filter).trim();
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
				const arr = Array.isArray(filter) ? filter.map(String) : [];
				this.filters[field] = arr.length ? arr[0] : '';
				this.pageInfo.currentPage = 1;
				this.search();
				return;
			}
		},
		buildPayload() {
			const r = this.range;
			let timeStart = '';
			let timeEnd = '';
			if (Array.isArray(r) && r.length >= 2 && r[0] && r[1]) {
				timeStart = Number(r[0]);
				timeEnd = Number(r[1]);
			}
			return {
				type: this.activeType,
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				firstagentid: this.filters.firstagentid,
				mercid: this.filters.mercid,
				logno: this.activeType === 'TYY0001' ? this.filters.logno : '',
				termphyno:
					this.activeType === 'TYY0001' || this.activeType === 'TYY0003' ? this.filters.termphyno : '',
				termno: this.activeType === 'TYY0003' ? this.filters.termno : '',
				spno: this.activeType === 'TYY0003' ? this.filters.spno : '',
				equiptype: this.activeType === 'TYY0003' ? this.filters.equiptype : '',
				allinone: this.activeType === 'TYY0003' ? this.filters.allinone : '',
				refund: this.activeType === 'TYY0001' ? this.filters.refund : '',
				paychannel: this.activeType === 'TYY0001' ? this.filters.paychannel : '',
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
					this.list = d.list || [];
					this.pageInfo.total = Number(d.total) || 0;
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
		}
	}
};
</script>

<style scoped>
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
}
.push-table-wrap ::v-deep .uni-table-th-content {
	white-space: nowrap;
	flex-wrap: nowrap;
}
.push-table-wrap ::v-deep .uni-table-th-row {
	flex-wrap: nowrap;
	align-items: center;
}
/* TYY0001：支付方式列 — uni-th 内标题区 flex:1 会把「文字」与「筛选图标」中间拉出大块空白 */
.push-table-wrap ::v-deep .tyy0001-table-wrap tr:first-child > th:nth-child(7) .uni-table-th-content {
	flex: 0 1 auto;
	min-width: 0;
}
.push-table-wrap ::v-deep .tyy0001-table-wrap tr:first-child > th:nth-child(7) .uni-table-th-row {
	justify-content: flex-start;
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
