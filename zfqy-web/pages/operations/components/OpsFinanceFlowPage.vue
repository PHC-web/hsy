<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" type="primary" :loading="loading" @click="search">刷新</button>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<view class="intro">{{ intro }}</view>
			<view class="search-card">
				<view class="row">
					<text class="label">时间范围</text>
					<uni-datetime-picker
						v-model="range"
						type="datetimerange"
						return-type="timestamp"
						@change="onRangeChange"
					/>
				</view>
				<view class="row">
					<text class="label">关键词</text>
					<uni-easyinput v-model.trim="keyword" placeholder="单号 / 商户 userId / stage / 说明…" @confirm="search" />
					<button size="mini" type="primary" :loading="loading" @click="search">搜索</button>
				</view>
			</view>
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll">
					<uni-table border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="152">时间</uni-th>
							<uni-th width="72">场景</uni-th>
							<uni-th width="200">环节</uni-th>
							<uni-th width="120">商户 userId</uni-th>
							<uni-th width="140">单号</uni-th>
							<uni-th width="100">转账状态</uni-th>
							<uni-th>说明</uni-th>
							<uni-th width="72">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.time) }}</uni-td>
							<uni-td>{{ item.scene || '-' }}</uni-td>
							<uni-td class="cell-mono">{{ item.stage || '-' }}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.merchantUserId || '-' }}</uni-td>
							<uni-td class="cell-mono cell-ellipsis">{{ item.withdrawNo || item.outBillNo || '-' }}</uni-td>
							<uni-td>{{ item.transferState || '-' }}</uni-td>
							<uni-td class="cell-content">{{ preview(item.message) }}</uni-td>
							<uni-td><button size="mini" type="primary" plain @click="openDetail(item._id)">查看</button></uni-td>
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
					<text class="detail-title">日志详情</text>
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

/** 与 ops-logs-admin.buildTimeRangeWhere 一致：秒级时间戳转为毫秒 */
function normalizeUnixTimeParam(v) {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return null;
	if (n < 1e11) return Math.round(n * 1000);
	return Math.round(n);
}

const INTROS = {
	recharge:
		'记录 H5 拉起充值、微信支付异步回调、前端轮询/主动查单（h5RechargeConfirm）、管理端或定时批量查单补同步等（数据来自 hsy-transfer-logs）。环节含 recharge_h5_order_pre_wx（已生成单号、即将请求微信）、recharge_h5_order_created（已落库待支付单）、recharge_wx_notify_decrypted_ok（回调已验签解密）等。若长期只有「管理端/定时…查单」、本地订单仍大量待支付：请核对微信商户平台「支付回调 URL」是否指向本项目 common 云函数暴露的 /pay/wechat/notify（见 merchant 内 WX_PAY_NOTIFY_URL）。',
	refund:
		'记录退款审核、商家转账子单查询/发起、自动轮询、微信转账结果通知、支付退款回调等（hsy-transfer-logs）。',
	withdraw:
		'记录商户发起提现、管理员审核与同意打款、自动/手动轮询微信、用户确认收款、到账回调与本地到账确认等（hsy-transfer-logs）。'
};

export default {
	name: 'OpsFinanceFlowPage',
	props: {
		flowType: {
			type: String,
			required: true,
			validator: (v) => ['recharge', 'refund', 'withdraw'].includes(v)
		}
	},
	data() {
		return {
			loading: false,
			list: [],
			keyword: '',
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
		intro() {
			return INTROS[this.flowType] || '';
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
		fmtTs(ts) {
			if (ts == null || ts === '') return '-';
			const n = Number(ts);
			if (!n) return '-';
			const d = new Date(n);
			const p = (x) => String(x).padStart(2, '0');
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
		},
		preview(s) {
			const t = String(s || '').trim();
			if (t.length <= 160) return t || '-';
			return t.slice(0, 160) + '…';
		},
		onRangeChange() {
			this.pageInfo.currentPage = 1;
			this.search();
		},
		buildPayload() {
			const r = this.range;
			let timeStart = '';
			let timeEnd = '';
			if (Array.isArray(r) && r.length >= 2 && r[0] != null && r[1] != null && r[0] !== '' && r[1] !== '') {
				const ts = normalizeUnixTimeParam(r[0]);
				const te = normalizeUnixTimeParam(r[1]);
				if (ts != null) timeStart = ts;
				if (te != null) timeEnd = te;
			}
			return {
				flowType: this.flowType,
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				keyword: this.keyword,
				timeStart,
				timeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('opsFinanceFlowList', this.buildPayload(), { functionName: 'ops-logs-admin' })
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
			this.$request('opsFinanceFlowDetail', { id }, { functionName: 'ops-logs-admin' }).then((res) => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.detailJson = res.data?.row || res.data || {};
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
.cell-ellipsis {
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.cell-mono {
	font-size: 12px;
	font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
}
.cell-content {
	max-width: 280px;
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
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
