<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" type="primary" :loading="loading" @click="search">刷新</button>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<view class="intro">
				汇总 H5 为商户生成的积分红包（手续费补贴等，数据表 hsy-income-packets）。金额与 H5「账号积分」同口径（元）。
				部署后请在 uniCloud 上传云函数 <text class="mono">ops-points-admin</text>。
			</view>

			<view class="search-card">
				<view class="row">
					<text class="label">创建时间</text>
					<uni-datetime-picker
						v-model="range"
						type="datetimerange"
						return-type="timestamp"
						@change="onRangeChange"
					/>
				</view>
				<view class="row">
					<text class="label">状态</text>
					<picker mode="selector" :range="statusLabels" :value="statusIndex" @change="onStatusPick">
						<view class="picker-val">{{ statusLabels[statusIndex] }}</view>
					</picker>
				</view>
				<view class="row">
					<text class="label">关键词</text>
					<uni-easyinput
						v-model.trim="keyword"
						placeholder="商户 user_id / 手机号片段 / 标题 / 记录 id"
						@confirm="search"
					/>
					<button size="mini" type="primary" :loading="loading" @click="search">搜索</button>
				</view>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll">
					<uni-table border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="152">创建时间</uni-th>
							<uni-th width="120">商户</uni-th>
							<uni-th width="104">手机</uni-th>
							<uni-th width="72">积分(元)</uni-th>
							<uni-th width="120">展示状态</uni-th>
							<uni-th width="108">类型</uni-th>
							<uni-th width="88">归属月</uni-th>
							<uni-th>标题</uni-th>
							<uni-th width="152">可领 / 过期 / 领取</uni-th>
							<uni-th width="72">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.create_time) }}</uni-td>
							<uni-td class="cell-ellipsis" :title="item.merchant_user_id">{{
								item.merchant_name !== '-' ? item.merchant_name : item.merchant_user_id || '-'
							}}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.merchant_mobile }}</uni-td>
							<uni-td>{{ item.amountText }}</uni-td>
							<uni-td>
								<text :class="statusClass(item.display_status_key)">{{ item.display_status }}</text>
							</uni-td>
							<uni-td class="cell-tiny">{{ item.subsidy_kind_label }}</uni-td>
							<uni-td>{{ item.month_no }}</uni-td>
							<uni-td class="cell-content">{{ item.title }}</uni-td>
							<uni-td class="cell-tiny">
								<view>开：{{ fmtTs(item.claim_open_time) }}</view>
								<view>过：{{ fmtTs(item.expire_time) }}</view>
								<view>领：{{ fmtTs(item.claimed_time) }}</view>
							</uni-td>
							<uni-td>
								<button size="mini" type="primary" plain @click="openDetail(item._id)">查看</button>
							</uni-td>
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
function defaultRange() {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 30);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	return [start.getTime(), end.getTime()];
}

const STATUS_VALUES = ['all', 'pending_ready', 'pending_locked', 'claimed', 'expired', 'pending'];
const STATUS_LABELS = [
	'全部状态',
	'待领取',
	'未到时间 / 待开放',
	'已领取',
	'过期未领取',
	'全部待处理 (pending)'
];

export default {
	data() {
		return {
			loading: false,
			list: [],
			keyword: '',
			range: defaultRange(),
			statusFilter: 'all',
			statusLabels: STATUS_LABELS,
			pageInfo: {
				currentPage: 1,
				pageSize: 15,
				total: 0
			},
			detailJson: null
		};
	},
	computed: {
		statusIndex() {
			const i = STATUS_VALUES.indexOf(this.statusFilter);
			return i >= 0 ? i : 0;
		},
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
			this.search();
		},
		onStatusPick(e) {
			const i = Number(e.detail.value);
			const v = STATUS_VALUES[i];
			if (v && this.statusFilter !== v) {
				this.statusFilter = v;
				this.pageInfo.currentPage = 1;
				this.search();
			}
		},
		buildPayload() {
			const r = this.range;
			let timeStart = '';
			let timeEnd = '';
			if (Array.isArray(r) && r.length >= 2 && r[0] != null && r[1] != null && r[0] !== '' && r[1] !== '') {
				timeStart = Number(r[0]);
				timeEnd = Number(r[1]);
			}
			return {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				keyword: this.keyword,
				timeStart,
				timeEnd,
				statusFilter: this.statusFilter
			};
		},
		search() {
			this.loading = true;
			this.$request('opsIncomePacketsList', this.buildPayload(), { functionName: 'ops-points-admin' })
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
			this.pageInfo.pageSize = e.pageSize || e;
			this.pageInfo.currentPage = 1;
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
		}
	}
};
</script>

<style scoped>
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
.picker-val {
	min-width: 200px;
	padding: 6px 10px;
	background: #f5f7fa;
	border-radius: 4px;
	font-size: 13px;
	color: #303133;
}
.table-scroll {
	overflow-x: auto;
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
.cell-tiny {
	font-size: 11px;
	line-height: 1.45;
	color: #606266;
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
