<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" type="primary" :loading="loading" @click="search">刷新</button>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<view class="intro">汇总后台操作、星驿推送接收、企业微信机器人等日志，仅只读查询。</view>

			<view class="tabs">
				<view
					v-for="tab in tabs"
					:key="tab.key"
					class="tab-item"
					:class="{ active: source === tab.key }"
					@click="onTab(tab.key)"
				>{{ tab.name }}</view>
			</view>

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
					<uni-easyinput v-model.trim="keyword" :placeholder="keywordPlaceholder" @confirm="search" />
					<button size="mini" type="primary" :loading="loading" @click="search">搜索</button>
				</view>
			</view>

			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container table-scroll">
					<!-- 后台操作 -->
					<uni-table v-if="source === 'operation'" :key="'op-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">时间</uni-th>
							<uni-th width="100">用户</uni-th>
							<uni-th width="80">模块</uni-th>
							<uni-th width="80">操作</uni-th>
							<uni-th width="100">目标</uni-th>
							<uni-th>内容</uni-th>
							<uni-th width="120">IP</uni-th>
							<uni-th width="80">来源</uni-th>
							<uni-th width="72">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.time) }}</uni-td>
							<uni-td>{{ item.userName || '-' }}</uni-td>
							<uni-td>{{ item.module || '-' }}</uni-td>
							<uni-td>{{ item.action || '-' }}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.targetName || item.targetId || '-' }}</uni-td>
							<uni-td class="cell-content">{{ preview(item.content) }}</uni-td>
							<uni-td>{{ item.ip || '-' }}</uni-td>
							<uni-td>{{ item.operatorSource || '-' }}</uni-td>
							<uni-td><button size="mini" type="primary" plain @click="openDetail('operation', item._id)">查看</button></uni-td>
						</uni-tr>
					</uni-table>

					<!-- 星驿推送接收 -->
					<uni-table v-if="source === 'push'" :key="'pu-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">接收时间</uni-th>
							<uni-th width="88">类型</uni-th>
							<uni-th width="72">成功</uni-th>
							<uni-th width="120">代理商</uni-th>
							<uni-th>摘要</uni-th>
							<uni-th width="160">失败原因</uni-th>
							<uni-th width="72">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.time) }}</uni-td>
							<uni-td>{{ item.pushType || '-' }}</uni-td>
							<uni-td>{{ item.success ? '是' : '否' }}</uni-td>
							<uni-td>{{ item.firstagentid || '-' }}</uni-td>
							<uni-td class="cell-content">{{ item.summary || '-' }}</uni-td>
							<uni-td class="cell-content">{{ item.errorMsg || '-' }}</uni-td>
							<uni-td><button size="mini" type="primary" plain @click="openDetail('push', item._id)">查看</button></uni-td>
						</uni-tr>
					</uni-table>

					<!-- 机器人推送 -->
					<uni-table v-if="source === 'robot'" :key="'ro-' + tableKey" border stripe :loading="loading" empty-text="暂无数据">
						<uni-tr>
							<uni-th width="150">时间</uni-th>
							<uni-th width="110">通道</uni-th>
							<uni-th width="72">成功</uni-th>
							<uni-th width="140">Webhook</uni-th>
							<uni-th>内容摘要</uni-th>
							<uni-th width="140">错误</uni-th>
							<uni-th width="72">详情</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item._id">
							<uni-td>{{ fmtTs(item.time) }}</uni-td>
							<uni-td>{{ item.channel || '-' }}</uni-td>
							<uni-td>{{ item.success ? '是' : '否' }}</uni-td>
							<uni-td class="cell-ellipsis">{{ item.webhookMasked || '-' }}</uni-td>
							<uni-td class="cell-content">{{ item.contentPreview || '-' }}</uni-td>
							<uni-td class="cell-content">{{ item.errmsg || '-' }}</uni-td>
							<uni-td><button size="mini" type="primary" plain @click="openDetail('robot', item._id)">查看</button></uni-td>
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
import { syncOpsListPageSize } from '../utils/sync-page-size.js';

function defaultRange() {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 7);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	return [start.getTime(), end.getTime()];
}

export default {
	data() {
		return {
			loading: false,
			tableKey: 0,
			source: 'operation',
			tabs: [
				{ key: 'operation', name: '后台操作' },
				{ key: 'push', name: '星驿推送接收' },
				{ key: 'robot', name: '机器人推送' }
			],
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
		keywordPlaceholder() {
			if (this.source === 'operation') return '模块/操作/用户/内容…';
			if (this.source === 'push') return '推送类型/摘要/代理商…';
			return '通道/内容/错误…';
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
			if (t.length <= 120) return t || '-';
			return t.slice(0, 120) + '…';
		},
		onTab(key) {
			if (this.source === key) return;
			this.source = key;
			this.pageInfo.currentPage = 1;
			this.keyword = '';
			this.tableKey += 1;
			this.search();
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
				timeStart = Number(r[0]);
				timeEnd = Number(r[1]);
			}
			return {
				source: this.source,
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				keyword: this.keyword,
				timeStart,
				timeEnd
			};
		},
		search() {
			this.loading = true;
			this.$request('opsLogsList', this.buildPayload(), { functionName: 'ops-logs-admin' })
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
					syncOpsListPageSize(this.pageInfo, d);
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
		openDetail(source, id) {
			if (!id) return;
			this.$request('opsLogsDetail', { source, id }, { functionName: 'ops-logs-admin' }).then((res) => {
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
	min-width: 72px;
}
.table-scroll {
	overflow-x: auto;
}
.cell-ellipsis {
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
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
