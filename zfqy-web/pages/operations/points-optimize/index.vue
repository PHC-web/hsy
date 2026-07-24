<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" :disabled="loading" @click="refreshAll">刷新</button>
			</view>
		</view>
		<view class="uni-container page-wrap">
			<!-- 一级：两大优化能力 -->
			<view class="tab-bar mode-bar">
				<text
					:class="['tab-item', mode === 'login' ? 'tab-active' : '']"
					@click="switchMode('login')"
				>按登录时间优化</text>
				<text
					:class="['tab-item', mode === 'flow' ? 'tab-active' : '']"
					@click="switchMode('flow')"
				>按流水优化</text>
			</view>

			<!-- 按登录时间优化：总开关 + 执行 / 白名单 / 任务日志 -->
			<template v-if="mode === 'login'">
				<view class="switch-bar">
					<text>登录周优化总开关：</text>
					<text :class="enabled ? 'on' : 'off'">{{ enabled ? '已开启' : '已关闭' }}</text>
					<button size="mini" type="primary" plain @click="goBizConfig">去参数配置</button>
				</view>

				<view class="tab-bar sub-bar">
					<text
						:class="['tab-item', loginTab === 'run' ? 'tab-active' : '']"
						@click="switchLoginTab('run')"
					>执行</text>
					<text
						:class="['tab-item', loginTab === 'whitelist' ? 'tab-active' : '']"
						@click="switchLoginTab('whitelist')"
					>白名单</text>
					<text
						:class="['tab-item', loginTab === 'logs' ? 'tab-active' : '']"
						@click="switchLoginTab('logs')"
					>任务日志</text>
				</view>

				<view v-if="loginTab === 'run'" class="card">
					<view class="row">
						<input v-model.trim="runForm.merchantUserId" class="input" placeholder="搜索：商户编号 / 机具号" />
						<button size="mini" :loading="loading" @click="preview({ resetPage: true })">预览</button>
						<button size="mini" type="warn" :loading="running" :disabled="!enabled" @click="runOnce">执行</button>
						<button size="mini" type="primary" :loading="running" :disabled="!enabled" @click="runAll">执行全体(续跑)</button>
						<button size="mini" type="warn" :loading="running" @click="batchSimulate">批量模拟</button>
					</view>
					<view v-if="taskHint" class="hint">{{ taskHint }}</view>
					<uni-table border stripe :loading="loading" empty-text="暂无预览数据">
						<uni-tr>
							<uni-th width="48" align="center">
								<checkbox :checked="previewAllChecked" @click.stop.prevent="toggleSelectAllPreview" />
							</uni-th>
							<uni-th width="120">商户</uni-th>
							<uni-th width="160">商户编号</uni-th>
							<uni-th width="70">白名单</uni-th>
							<uni-th width="70">闲置天</uni-th>
							<uni-th width="70">应达周</uni-th>
							<uni-th width="70">已执行</uni-th>
							<uni-th width="90">预览动作</uni-th>
							<uni-th width="80">预估砍额</uni-th>
							<uni-th width="260">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in previewList" :key="item.id">
							<uni-td align="center">
								<checkbox
									:checked="isPreviewSelected(item)"
									@click.stop.prevent="togglePreviewSelect(item)"
								/>
							</uni-td>
							<uni-td>{{ item.name }}</uni-td>
							<uni-td class="tiny">{{ item.userId || item.id || '-' }}</uni-td>
							<uni-td>{{ item.whitelist ? '是' : '否' }}</uni-td>
							<uni-td>{{ item.idleDays }}</uni-td>
							<uni-td>{{ item.dueWeeks }}</uni-td>
							<uni-td>{{ item.applied }}</uni-td>
							<uni-td>{{ item.previewAction }}</uni-td>
							<uni-td>{{ Number(item.previewCut || 0).toFixed(2) }}</uni-td>
							<uni-td>
								<view class="op-btns">
									<button size="mini" @click="openSlices(item)">积分调整</button>
									<button size="mini" type="warn" :loading="running" @click="simulateWeek(item)">模拟</button>
									<button
										size="mini"
										:type="item.whitelist ? 'default' : 'warn'"
										plain
										@click="toggleWhitelist(item)"
									>
										{{ item.whitelist ? '移出白名单' : '加白名单' }}
									</button>
								</view>
							</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
						<uni-pagination
							show-icon
							show-page-size
							:page-size="previewPage.pageSize"
							:page-size-range="previewPageSizeRange"
							v-model="previewPage.currentPage"
							:total="previewPage.total"
							@change="onPreviewPageChanged"
							@pageSizeChange="onPreviewPageSizeChange"
						/>
					</view>
				</view>

				<view v-else-if="loginTab === 'whitelist'" class="card">
					<view class="hint">加入后不受「按登录时间优化」规则影响；已砍金额不恢复。与流水优化白名单相互独立（后者待上线）。</view>
					<view class="row">
						<input v-model.trim="wlForm.keyword" class="input" placeholder="搜索：商户编号 / 机具号" />
						<button size="mini" :loading="loading" @click="searchWhitelist">搜索</button>
						<button size="mini" :loading="loading" @click="resetWhitelistSearch">清空搜索</button>
					</view>
					<view class="row">
						<input v-model.trim="wlForm.ids" class="input flex" placeholder="加入白名单：商户编号 / 机具号，多个用逗号或换行" />
						<input v-model.trim="wlForm.remark" class="input" placeholder="备注" />
						<button size="mini" type="primary" :loading="loading" @click="addWhitelist">加入</button>
						<button size="mini" :loading="loading" @click="loadWhitelist">刷新列表</button>
					</view>
					<uni-table border stripe :loading="loading" empty-text="暂无白名单">
						<uni-tr>
							<uni-th width="120">商户</uni-th>
							<uni-th width="110">手机</uni-th>
							<uni-th width="140">商户编号</uni-th>
							<uni-th width="140">加入时间</uni-th>
							<uni-th width="80">操作人</uni-th>
							<uni-th>备注</uni-th>
							<uni-th width="80">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in wlList" :key="item.id">
							<uni-td>{{ item.name }}</uni-td>
							<uni-td>{{ item.mobile || '-' }}</uni-td>
							<uni-td class="tiny">{{ item.userId }}</uni-td>
							<uni-td>{{ item.at || '-' }}</uni-td>
							<uni-td>{{ item.by || '-' }}</uni-td>
							<uni-td>{{ item.remark || '-' }}</uni-td>
							<uni-td>
								<button size="mini" type="warn" plain @click="removeWhitelist(item)">移出</button>
							</uni-td>
						</uni-tr>
					</uni-table>
					<view class="uni-pagination-box">
						<uni-pagination
							show-icon
							:page-size="wlPage.pageSize"
							v-model="wlPage.currentPage"
							:total="wlPage.total"
							@change="loadWhitelist"
						/>
					</view>
				</view>

				<view v-else class="card">
					<view class="hint">仅记录：登录周优化执行/模拟、人工改片、白名单增删。对账原始片等不记入。</view>
					<button size="mini" :loading="loading" @click="loadLogs">刷新日志</button>
					<uni-table border stripe :loading="loading" empty-text="暂无日志">
						<uni-tr>
							<uni-th width="150">时间</uni-th>
							<uni-th width="120">动作</uni-th>
							<uni-th width="140">商户编号</uni-th>
							<uni-th width="80">砍额</uni-th>
							<uni-th width="80">周</uni-th>
							<uni-th>备注</uni-th>
						</uni-tr>
					<uni-tr v-for="item in logList" :key="item._id">
						<uni-td>{{ fmtTs(item.create_time) }}</uni-td>
						<uni-td>{{ logActionLabel(item.action) }}</uni-td>
						<uni-td class="tiny">{{ item.merchant_user_id || '-' }}</uni-td>
						<uni-td>{{ formatLogAmount(item) }}</uni-td>
						<uni-td>{{ formatLogWeek(item) }}</uni-td>
						<uni-td class="tiny">{{ item.remark || item.batch_id || '' }}</uni-td>
					</uni-tr>
					</uni-table>
				</view>
			</template>

			<!-- 按流水优化：独立能力，后续自带总开关 / 白名单 / 任务日志 -->
			<view v-else class="card flow-placeholder">
				<view class="flow-title">按流水优化</view>
				<view class="intro">
					与「按登录时间优化」相互独立。后续将单独提供总开关、白名单、任务日志与执行能力，不与登录周共用。
				</view>
				<view class="hint">功能待设计，敬请期待。</view>
			</view>
		</view>

		<uni-popup ref="slicePopup" type="center">
			<view class="slice-modal">
				<view class="slice-title">积分调整 · {{ sliceMerchant.name || sliceMerchant.userId }}</view>
				<view class="hint">
					白名单：{{ sliceMerchant.whitelist ? '是' : '否' }} · 已执行={{ sliceMerchant.applied }} ·
					应达周={{ sliceMerchant.dueWeeks }}
				</view>
				<scroll-view scroll-y class="slice-scroll">
					<view v-for="group in sliceGroupsByMonth" :key="group.targetYm" class="slice-month-block">
						<view class="slice-month-head">
							<text class="slice-month-title">待返月份 {{ group.targetYmLabel }}</text>
							<text class="slice-month-sum">
								共 {{ group.slices.length }} 片 · 生效合计 {{ group.effectiveSum }}
							</text>
						</view>
						<view v-for="s in group.slices" :key="s.id" class="slice-row">
							<text class="slice-meta">
								来源 {{ s.sourceYm }} · 第 {{ Number(s.sliceIndex) + 1 }} 档（#{{ s.sliceIndex }}）
								{{ s.isClaimed ? '（已领）' : '' }}
								{{ s.optSkip ? ' · 后续不优化' : '' }}
							</text>
							<text>原始 {{ s.original }} / 系统 {{ s.system }} / 生效 {{ s.effective }}</text>
							<view v-if="!s.isClaimed" class="slice-edit">
								<input v-model="s._edit" class="input slice-amt" type="digit" placeholder="人工金额" />
								<button size="mini" type="primary" @click="saveSlice(s)">保存</button>
								<label class="opt-skip-label" @click.stop.prevent="toggleOptSkip(s)">
									<checkbox :checked="!!s.optSkip" />
									<text>后续不优化</text>
								</label>
							</view>
						</view>
					</view>
					<view v-if="!sliceList.length" class="hint">暂无分片（可先点对账）</view>
				</scroll-view>
				<view class="row end">
					<button size="mini" @click="reconcileSlices">对账原始片</button>
					<button size="mini" @click="closeSlices">关闭</button>
				</view>
			</view>
		</uni-popup>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
import { syncOpsListPageSize } from '@/pages/operations/utils/sync-page-size.js';

export default {
	data() {
		return {
			/** 一级：login=按登录时间优化，flow=按流水优化 */
			mode: 'login',
			/** 登录时间优化下二级：run / whitelist / logs */
			loginTab: 'run',
			loading: false,
			running: false,
			enabled: false,
			previewList: [],
			previewSelected: {},
			previewPage: { currentPage: 1, pageSize: 5, total: 0 },
			previewPageSizeRange: [5, 10],
			runForm: { merchantUserId: '' },
			taskHint: '',
			batchId: '',
			wlForm: { ids: '', remark: '', keyword: '' },
			wlList: [],
			wlPage: { currentPage: 1, pageSize: 20, total: 0 },
			logList: [],
			sliceMerchant: {},
			sliceList: []
		};
	},
	onLoad(query) {
		const uid = query && query.merchantUserId ? decodeURIComponent(String(query.merchantUserId)) : '';
		if (uid) {
			this.runForm.merchantUserId = uid;
			this.$nextTick(() => {
				this.preview().then(() => {
					if (String(query.openSlices || '') === '1') {
						this.openSlices({ userId: uid, id: uid });
					}
				});
			});
		}
	},
	mounted() {
		if (!this.runForm.merchantUserId) this.refreshAll();
		else this.loadEnabled();
	},
	computed: {
		previewAllChecked() {
			const list = this.previewList || [];
			if (!list.length) return false;
			return list.every((item) => this.isPreviewSelected(item));
		},
		previewSelectedIds() {
			return Object.keys(this.previewSelected || {}).filter((k) => this.previewSelected[k]);
		},
		/** 按目标待返月分组，便于一眼区分月份 */
		sliceGroupsByMonth() {
			const map = new Map();
			for (const s of this.sliceList || []) {
				const ym = String(s.targetYm || '').trim() || '未知';
				if (!map.has(ym)) map.set(ym, []);
				map.get(ym).push(s);
			}
			const yms = [...map.keys()].sort((a, b) => String(a).localeCompare(String(b)));
			return yms.map((ym) => {
				const slices = map.get(ym) || [];
				let sum = 0;
				for (const s of slices) sum += Number(s.effective || 0);
				const [ys, ms] = String(ym).split('-');
				const m = Number(ms);
				const label =
					ys && Number.isFinite(m) ? `${ys}年${m}月` : ym;
				return {
					targetYm: ym,
					targetYmLabel: label,
					slices,
					effectiveSum: Number(sum.toFixed(2))
				};
			});
		}
	},
	methods: {
		fmtTs(ts) {
			const n = Number(ts || 0);
			if (!n) return '-';
			const d = new Date(n);
			const p = (x) => String(x).padStart(2, '0');
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(
				d.getSeconds()
			)}`;
		},
		logActionLabel(action) {
			const map = {
				login_week_up: '登录周优化',
				login_week_sim: '模拟砍一周',
				skip_disabled: '总开关关闭跳过',
				manual_set: '人工改片',
				manual_clear: '清人工/恢复系统',
				slice_opt_skip: '标记后续不优化',
				slice_opt_unskip: '取消后续不优化',
				whitelist_add: '加入白名单',
				whitelist_remove: '移出白名单'
			};
			return map[action] || action || '-';
		},
		formatLogAmount(item) {
			if (!item) return '-';
			if (item.action === 'manual_set' || item.action === 'manual_clear') {
				const b = Number(item.before_total);
				const a = Number(item.after_total);
				if (Number.isFinite(b) && Number.isFinite(a)) return `${b.toFixed(2)}→${a.toFixed(2)}`;
			}
			return Number(item.cut_total || 0).toFixed(2);
		},
		formatLogWeek(item) {
			if (!item) return '-';
			if (item.before_week == null && item.after_week == null) return '-';
			return `${item.before_week ?? ''}→${item.after_week ?? ''}`;
		},
		goBizConfig() {
			uni.navigateTo({ url: '/pages/system/biz-config/index' });
		},
		async refreshAll() {
			if (this.mode !== 'login') return;
			await this.loadEnabled();
			if (this.loginTab === 'run') await this.preview();
			else if (this.loginTab === 'whitelist') await this.loadWhitelist();
			else await this.loadLogs();
		},
		switchMode(m) {
			if (m === this.mode) return;
			this.mode = m;
			if (m === 'login') this.refreshAll();
		},
		switchLoginTab(t) {
			this.loginTab = t;
			if (t === 'run') this.preview();
			if (t === 'whitelist') this.loadWhitelist();
			if (t === 'logs') this.loadLogs();
		},
		async loadEnabled() {
			try {
				const res = await this.$request('bizConfigGet', {}, { functionName: 'merchant' });
				if (res.code === 0) this.enabled = !!(res.data && res.data.pointsOptimizeLoginEnabled);
			} catch (e) {}
		},
		async preview(options = {}) {
			const resetPage = !!(options && options.resetPage);
			if (resetPage) this.previewPage.currentPage = 1;
			this.loading = true;
			try {
				const kw = this.runForm.merchantUserId || undefined;
				const res = await this.$request(
					'pointsOptimizeLoginPreview',
					{
						merchantUserId: kw,
						page: kw ? 1 : this.previewPage.currentPage,
						pageSize: kw ? 1 : this.previewPage.pageSize
					},
					{ functionName: 'points-optimize-admin' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '预览失败', icon: 'none' });
					return;
				}
				this.enabled = !!(res.data && res.data.enabled);
				this.previewList = (res.data && res.data.list) || [];
				this.previewPage.total = Number((res.data && res.data.total) || 0);
				if (kw) {
					this.previewPage.currentPage = 1;
					this.previewPage.total = this.previewList.length;
				} else {
					syncOpsListPageSize(this.previewPage, res.data);
				}
				this.previewSelected = {};
			} finally {
				this.loading = false;
			}
		},
		onPreviewPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.previewPage.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.preview();
		},
		onPreviewPageSizeChange(size) {
			let s = 20;
			if (typeof size === 'number' && Number.isFinite(size)) s = size;
			else if (size && typeof size === 'object') {
				s = Number(size.pageSize != null ? size.pageSize : size.size);
			} else {
				s = Number(size);
			}
			this.previewPage.pageSize = Number.isFinite(s) && s > 0 ? Math.min(10, s) : 5;
			this.previewPage.currentPage = 1;
			this.preview();
		},
		previewRowKey(item) {
			return String((item && (item.userId || item.id)) || '');
		},
		isPreviewSelected(item) {
			const k = this.previewRowKey(item);
			return !!(k && this.previewSelected[k]);
		},
		togglePreviewSelect(item) {
			const k = this.previewRowKey(item);
			if (!k) return;
			this.previewSelected = { ...this.previewSelected, [k]: !this.previewSelected[k] };
		},
		toggleSelectAllPreview() {
			const list = this.previewList || [];
			const allOn = list.length && list.every((item) => this.isPreviewSelected(item));
			const next = {};
			if (!allOn) {
				for (const item of list) {
					const k = this.previewRowKey(item);
					if (k) next[k] = true;
				}
			}
			this.previewSelected = next;
		},
		async runOnce() {
			const ok = await this.confirmRun('对当前条件执行一次优化？');
			if (!ok) return;
			this.running = true;
			try {
				const res = await this.$request(
					'pointsOptimizeLoginRun',
					{ merchantUserId: this.runForm.merchantUserId || undefined },
					{ functionName: 'points-optimize-admin' }
				);
				uni.showToast({ title: res.message || (res.code === 0 ? '完成' : '失败'), icon: 'none' });
				await this.preview();
			} finally {
				this.running = false;
			}
		},
		async simulateWeek(item) {
			const uid = item && (item.userId || item.id);
			if (!uid) {
				uni.showToast({ title: '请指定商户', icon: 'none' });
				return;
			}
			const ok = await this.confirmRun(`对商户 ${uid} 模拟砍一周（各未领自动片 ×0.75）？白名单会跳过。`);
			if (!ok) return;
			this.running = true;
			try {
				const res = await this.$request(
					'pointsOptimizeLoginSimulateWeek',
					{ merchantUserId: uid },
					{ functionName: 'points-optimize-admin' }
				);
				uni.showToast({ title: res.message || (res.code === 0 ? '完成' : '失败'), icon: 'none' });
				this.runForm.merchantUserId = String(uid);
				await this.preview();
			} finally {
				this.running = false;
			}
		},
		async batchSimulate() {
			const ids = this.previewSelectedIds;
			if (!ids.length) {
				uni.showToast({ title: '请先勾选商户', icon: 'none' });
				return;
			}
			const ok = await this.confirmRun(`对已选 ${ids.length} 个商户各模拟砍一周？白名单会跳过，金额真实落库。`);
			if (!ok) return;
			this.running = true;
			try {
				let okN = 0;
				let skipN = 0;
				let failN = 0;
				for (const uid of ids) {
					const res = await this.$request(
						'pointsOptimizeLoginSimulateWeek',
						{ merchantUserId: uid },
						{ functionName: 'points-optimize-admin' }
					);
					if (res.code !== 0) {
						failN += 1;
						continue;
					}
					const action = res.data && res.data.action;
					if (action === 'skip_whitelist' || action === 'skip_empty') skipN += 1;
					else okN += 1;
				}
				uni.showToast({
					title: `完成：成功${okN} 跳过${skipN} 失败${failN}`,
					icon: 'none',
					duration: 2500
				});
				await this.preview();
			} finally {
				this.running = false;
			}
		},
		async runAll() {
			const ok = await this.confirmRun('将按 _id 游标分批执行全体商户优化，确认？');
			if (!ok) return;
			this.running = true;
			this.batchId = '';
			try {
				let guard = 0;
				let cursor = '';
				let batchId = '';
				for (;;) {
					guard += 1;
					if (guard > 5000) break;
					const res = await this.$request(
						'pointsOptimizeLoginRun',
						{ batchId: batchId || undefined, cursor: cursor || undefined, chunkSize: 15 },
						{ functionName: 'points-optimize-admin' }
					);
					if (res.code !== 0) {
						uni.showToast({ title: res.message || '执行失败', icon: 'none' });
						break;
					}
					const d = res.data || {};
					batchId = d.batchId || batchId;
					this.batchId = batchId;
					cursor = d.nextCursor || '';
					this.taskHint = `batch=${batchId} scanned=${d.scanned} upgraded=${d.upgraded} wlSkip=${d.skippedWhitelist} cut=${d.cutTotal}`;
					if (d.done) break;
				}
				uni.showToast({ title: '全体任务结束', icon: 'success' });
			} finally {
				this.running = false;
			}
		},
		confirmRun(content) {
			return new Promise((resolve) => {
				uni.showModal({
					title: '确认',
					content,
					success: (r) => resolve(!!r.confirm)
				});
			});
		},
		async loadWhitelist() {
			this.loading = true;
			try {
				const res = await this.$request(
					'pointsOptimizeWhitelistList',
					{
						page: this.wlPage.currentPage,
						pageSize: this.wlPage.pageSize,
						keyword: this.wlForm.keyword || undefined
					},
					{ functionName: 'points-optimize-admin' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.wlList = (res.data && res.data.list) || [];
				this.wlPage.total = Number((res.data && res.data.total) || 0);
				syncOpsListPageSize(this.wlPage, res.data);
			} finally {
				this.loading = false;
			}
		},
		searchWhitelist() {
			this.wlPage.currentPage = 1;
			return this.loadWhitelist();
		},
		resetWhitelistSearch() {
			this.wlForm.keyword = '';
			this.wlPage.currentPage = 1;
			return this.loadWhitelist();
		},
		async addWhitelist() {
			const raw = String(this.wlForm.ids || '')
				.split(/[\n,，;\s]+/)
				.map((x) => x.trim())
				.filter(Boolean);
			if (!raw.length) {
				uni.showToast({ title: '请输入商户编号', icon: 'none' });
				return;
			}
			this.loading = true;
			try {
				const res = await this.$request(
					'pointsOptimizeWhitelistAdd',
					{ merchantUserIds: raw, remark: this.wlForm.remark },
					{ functionName: 'points-optimize-admin' }
				);
				uni.showToast({ title: res.message || '完成', icon: 'none' });
				this.wlForm.ids = '';
				await this.loadWhitelist();
			} finally {
				this.loading = false;
			}
		},
		async removeWhitelist(item) {
			const ok = await this.confirmRun(`移出白名单：${item.name || item.userId}？`);
			if (!ok) return;
			const res = await this.$request(
				'pointsOptimizeWhitelistRemove',
				{ merchantUserId: item.userId || item.id },
				{ functionName: 'points-optimize-admin' }
			);
			uni.showToast({ title: res.message || '完成', icon: 'none' });
			await this.loadWhitelist();
		},
		async toggleWhitelist(item) {
			if (item.whitelist) await this.removeWhitelist(item);
			else {
				const res = await this.$request(
					'pointsOptimizeWhitelistAdd',
					{ merchantUserId: item.userId || item.id },
					{ functionName: 'points-optimize-admin' }
				);
				uni.showToast({ title: res.message || '完成', icon: 'none' });
				await this.preview();
			}
		},
		async loadLogs() {
			this.loading = true;
			try {
				const res = await this.$request(
					'pointsOptimizeLogsList',
					{ page: 1, pageSize: 50 },
					{ functionName: 'points-optimize-admin' }
				);
				this.logList = (res.data && res.data.list) || [];
			} finally {
				this.loading = false;
			}
		},
		async openSlices(item) {
			const uid = item.userId || item.id;
			this.loading = true;
			try {
				const res = await this.$request('pointsSliceStateList', { merchantUserId: uid }, { functionName: 'points-optimize-admin' });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.sliceMerchant = (res.data && res.data.merchant) || {};
				this.sliceList = ((res.data && res.data.list) || []).map((s) => ({
					...s,
					optSkip: !!s.optSkip,
					_edit: s.manual != null ? String(s.manual) : String(s.effective)
				}));
				this.$refs.slicePopup && this.$refs.slicePopup.open();
			} finally {
				this.loading = false;
			}
		},
		closeSlices() {
			this.$refs.slicePopup && this.$refs.slicePopup.close();
		},
		async reconcileSlices() {
			const uid = this.sliceMerchant.userId;
			if (!uid) return;
			const res = await this.$request('pointsSliceReconcile', { merchantUserId: uid }, { functionName: 'points-optimize-admin' });
			uni.showToast({
				title: res.code === 0 ? '对账成功' : res.message || '对账失败',
				icon: 'none'
			});
			await this.openSlices({ userId: uid });
		},
		async saveSlice(s) {
			const payload = { sliceId: s.id, amount: s._edit };
			const res = await this.$request('pointsSliceManualSet', payload, { functionName: 'points-optimize-admin' });
			uni.showToast({ title: res.message || '保存成功', icon: 'none' });
			await this.openSlices({ userId: this.sliceMerchant.userId });
		},
		async toggleOptSkip(s) {
			if (!s || s.isClaimed) return;
			const next = !s.optSkip;
			const res = await this.$request(
				'pointsSliceManualSet',
				{ sliceId: s.id, optSkip: next },
				{ functionName: 'points-optimize-admin' }
			);
			if (res.code !== 0) {
				uni.showToast({ title: res.message || '设置失败', icon: 'none' });
				return;
			}
			s.optSkip = next;
			uni.showToast({ title: res.message || '已更新', icon: 'none' });
		}
	}
};
</script>

<style scoped>
.page-wrap {
	padding: 16px;
}
.intro {
	font-size: 12px;
	color: #606266;
	line-height: 1.6;
	margin-bottom: 10px;
}
.switch-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 12px;
	font-size: 13px;
}
.switch-bar .on {
	color: #67c23a;
	font-weight: 700;
}
.switch-bar .off {
	color: #f56c6c;
	font-weight: 700;
}
.tab-bar {
	display: flex;
	gap: 16px;
	margin-bottom: 12px;
}
.mode-bar {
	border-bottom: 1px solid #ebeef5;
	padding-bottom: 8px;
	margin-bottom: 14px;
}
.mode-bar .tab-item {
	font-size: 15px;
}
.sub-bar {
	gap: 14px;
	margin-bottom: 10px;
}
.sub-bar .tab-item {
	font-size: 13px;
}
.tab-item {
	font-size: 14px;
	color: #606266;
	padding-bottom: 4px;
	cursor: pointer;
}
.tab-active {
	color: #2979ff;
	border-bottom: 2px solid #2979ff;
	font-weight: 600;
}
.flow-placeholder {
	min-height: 160px;
}
.flow-title {
	font-size: 15px;
	font-weight: 700;
	color: #303133;
	margin-bottom: 8px;
}
.card {
	background: #fff;
	border: 1px solid #ebeef5;
	border-radius: 8px;
	padding: 12px;
}
.row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	margin-bottom: 10px;
}
.row.end {
	justify-content: flex-end;
	margin-top: 8px;
}
.input {
	height: 32px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	padding: 0 8px;
	min-width: 180px;
	font-size: 13px;
}
.input.flex {
	flex: 1;
	min-width: 240px;
}
.hint {
	font-size: 12px;
	color: #909399;
	margin: 6px 0;
}
.tiny {
	font-size: 12px;
	word-break: break-all;
}
.slice-modal {
	width: 720px;
	max-width: 94vw;
	max-height: 86vh;
	background: #fff;
	border-radius: 10px;
	padding: 14px;
}
.slice-title {
	font-size: 16px;
	font-weight: 700;
}
.slice-scroll {
	height: 56vh;
	margin-top: 8px;
}
.slice-month-block {
	margin-bottom: 12px;
	border: 1px solid #dcdfe6;
	border-radius: 8px;
	background: #fafbfc;
	overflow: hidden;
}
.slice-month-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
	padding: 10px 12px;
	background: #eef3fb;
	border-bottom: 1px solid #d9e4f5;
}
.slice-month-title {
	font-size: 14px;
	font-weight: 700;
	color: #1f2d3d;
}
.slice-month-sum {
	font-size: 12px;
	color: #606266;
}
.slice-row {
	border-bottom: 1px solid #ebeef5;
	padding: 8px 12px;
	font-size: 12px;
	color: #606266;
	background: #fff;
}
.slice-month-block .slice-row:last-child {
	border-bottom: none;
}
.slice-meta {
	display: block;
	font-weight: 600;
	color: #303133;
	margin-bottom: 4px;
}
.slice-edit {
	display: flex;
	gap: 6px;
	margin-top: 6px;
	align-items: center;
	flex-wrap: wrap;
}
.slice-amt {
	min-width: 100px;
	width: 110px;
}
.opt-skip-label {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	color: #606266;
	margin-left: 4px;
	cursor: pointer;
}
.op-btns {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.op-btns button {
	margin: 0;
}
</style>
