<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" @click="reset">重置</button>
					<button size="mini" type="warn" @click="runDataCorrect">数据矫正</button>
					<button size="mini" type="primary" plain @click="runSyncPendingRechargeFromWx">更新会员状态</button>
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
					<button size="mini" type="warn" @click="openOfflineRecharge">线下首冲额度</button>
					<button size="mini" type="primary" @click="goAdd">模拟商户注册</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" :key="tableKey" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="60">头像</uni-th>
							<uni-th align="center" width="60">协议</uni-th>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具号码</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'wxNickname')">微信用户</uni-th>
							<uni-th align="center" width="140" filter-type="select" :filter-data="membershipLevelFilterData" @filter-change="headerFilterChange($event, 'membershipLevel')">会员级别</uni-th>
							<uni-th align="center" width="90">剩余额度</uni-th>
							<uni-th align="center" width="90">充值金额</uni-th>
							<uni-th align="center" width="90">待提现</uni-th>
							<uni-th align="center" width="90">已提现</uni-th>
							<uni-th align="center" width="90">冻结金额</uni-th>
							<uni-th align="center" width="70">优惠券</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="useStatusFilterData" @filter-change="headerFilterChange($event, 'useStatus')">使用状态</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag1')">1</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag2')">2</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag3')">3</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'loginTime')">登录时间</uni-th>
							<uni-th align="center" width="180">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center">
								<image class="avatar" :src="item.avatar || defaultAvatar" mode="aspectFill" @click="previewImg(item.avatar || defaultAvatar)" />
							</uni-td>
							<uni-td align="center">
								<text
									v-if="item.agreementSigned"
									class="agreement-status agreement-status--signed"
									@click="previewAgreement(item)"
								>已签署</text>
								<text v-else class="agreement-status agreement-status--unsigned">未签署</text>
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ formatDeviceDisplay(item.deviceDisplay) }}</view>
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ formatWxUserDisplay(item.wxUser) }}</view>
							</uni-td>
							<uni-td align="center">
								<view class="member-cell">
									<view>{{ item.membershipLevel || '普通会员' }}</view>
									<view class="member-open-time">{{ item.membershipOpenedAt || '-' }}</view>
								</view>
							</uni-td>
							<uni-td align="center" class="money">{{ item.remainingQuota }}</uni-td>
							<uni-td align="center" class="money">{{ item.rechargeAmount }}</uni-td>
							<uni-td align="center" class="money">{{ item.pendingWithdraw }}</uni-td>
							<uni-td align="center" class="money">{{ item.withdrawn }}</uni-td>
							<uni-td align="center" class="money">{{ item.frozenAmount }}</uni-td>
							<uni-td align="center">{{ item.couponCount }}</uni-td>
							<uni-td align="center">
								<switch :checked="item.status" @change="onSwitch(item, 'status', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag1" @change="onSwitch(item, 'flag1', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag2" @change="onSwitch(item, 'flag2', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag3" @change="onSwitch(item, 'flag3', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">{{ item.loginTime }}</uni-td>
							<uni-td align="center">
								<view class="cell-actions">
									<button size="mini" type="primary" @click="openPointsInsight(item)">积分明细</button>
									<button size="mini" plain @click="openRefundWindow(item)">退款窗口</button>
									<button
										v-if="item.agreementSigned"
										size="mini"
										type="warn"
										plain
										@click="confirmClearAgreement(item)"
									>
										删除协议
									</button>
								</view>
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
					:page-size-range="merchantPageSizeRange"
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
		<uni-popup ref="offlineRechargePopup" type="dialog">
			<view class="offline-popup">
				<view class="offline-title">线下首充额度</view>
				<view class="offline-label required">手机号码</view>
				<input v-model="offlineForm.mobile" class="offline-input" type="number" maxlength="11" placeholder="手机号" />
				<view class="offline-label required">选择套餐</view>
				<scroll-view class="offline-packages" scroll-y>
					<radio-group>
						<label v-for="item in offlinePackages" :key="item.value" class="offline-package-item" @click="offlineForm.packageId = item.value">
							<radio :value="item.value" :checked="offlineForm.packageId === item.value" />
							<view class="offline-package-content">
								<view class="offline-package-main">额度：{{ item.quotaText }}；价格：{{ item.priceText }}元</view>
								<view v-if="item.desc" class="offline-package-desc">{{ item.desc }}</view>
							</view>
						</label>
					</radio-group>
				</scroll-view>
				<view class="offline-actions">
					<button size="mini" @click="closeOfflineRecharge">取消</button>
					<button size="mini" type="primary" :loading="offlineSubmitting" @click="submitOfflineRecharge">提交</button>
				</view>
			</view>
		</uni-popup>
		<uni-popup ref="imgPreviewPopup" type="center">
			<view class="img-preview-modal">
				<view
					ref="previewViewport"
					class="img-preview-viewport"
					@wheel.prevent="onPreviewWheel"
					@mousedown="onPreviewMouseDown"
					@mousemove="onPreviewMouseMove"
					@mouseup="onPreviewMouseUp"
					@mouseleave="onPreviewMouseUp"
				>
					<image
						ref="previewImage"
						class="img-preview-main"
						:src="previewImageUrl"
						mode="widthFix"
						:style="previewImageStyle"
						@load="onPreviewImageLoad"
					/>
				</view>
				<view class="img-preview-tip">
					Ctrl+滚轮或双指捏合缩放（以指针为中心）；双指滑动上下浏览；按住左键拖动平移
				</view>
				<view v-if="agreementPreviewIp || agreementPreviewDevice" class="img-preview-meta">
					<text class="img-preview-meta-line">签署 IP：{{ agreementPreviewIp || '—' }}</text>
					<text class="img-preview-meta-line">设备标识：{{ agreementPreviewDevice || '—' }}</text>
				</view>
				<view class="img-preview-actions" :class="{ 'img-preview-actions--agreement': isAgreementPreview }">
					<button size="mini" @click="resetPreviewTransform">重置</button>
					<button
						v-if="isAgreementPreview"
						size="mini"
						type="primary"
						:loading="agreementPdfExporting"
						:disabled="agreementPdfExporting"
						@click="exportAgreementPdf"
					>
						导出 PDF
					</button>
					<button size="mini" @click="closeImgPreview">关闭</button>
				</view>
			</view>
		</uni-popup>
		<uni-popup ref="pointsInsightPopup" type="center">
			<view class="points-insight-modal">
				<view class="points-insight-title">{{ pointsInsight.title || '商户积分明细' }}</view>
				<scroll-view class="points-insight-scroll" scroll-y>
					<view class="points-rule-tip">
						<text>规则说明：当月每满 1 万有 1 个档位；该档位会对每个来源月独立生效（即每个来源月最多释放当月档位数的分片），未释放分片当月流失不顺延。</text>
					</view>
					<view class="points-section">
						<view class="points-section-hd">A. 月度总览</view>
						<view v-if="pointsInsight.monthlyOverview.length" class="points-table">
							<view class="points-row points-row-hd">
								<text>月份</text><text>生成积分</text><text>当月流水</text><text>当月档位</text><text>应到期片</text><text>已释放片</text><text>流失片</text>
							</view>
							<view v-for="row in pointsInsight.monthlyOverview" :key="`ov_${row.ym}`" class="points-row">
								<text>{{ row.ym }}</text><text>{{ row.generatedPoints }}</text><text>{{ row.flowYuan }}</text><text>{{ row.tiers }}</text><text>{{ row.dueSlices }}</text><text>{{ row.releasedSlices }}</text><text>{{ row.lostSlices }}</text>
							</view>
						</view>
						<view v-else class="points-empty">暂无月度总览数据</view>
					</view>
					<view class="points-section">
						<view class="points-section-hd">B. 片级明细（来源月 -> 目标月）</view>
						<view v-if="pointsInsight.sliceDetails.length" class="points-table">
							<view class="points-row points-row-hd points-row--slice">
								<text>目标月</text><text>来源月</text><text>应到期片</text><text>应到期积分</text><text>已释放片</text><text>已释放积分</text><text>流失片/积分</text>
							</view>
							<view v-for="row in pointsInsight.sliceDetails" :key="`sl_${row.targetYm}_${row.sourceYm}`" class="points-row points-row--slice">
								<text>{{ row.targetYm }}</text><text>{{ row.sourceYm }}</text><text>{{ row.dueSliceCount }}</text><text>{{ row.duePoints }}</text><text>{{ row.releasedSliceCount }}</text><text>{{ row.releasedPoints }}</text><text>{{ row.lostSliceCount }}/{{ row.lostPoints }}</text>
							</view>
							<view v-for="row in pointsInsight.sliceDetails" :key="`slp_${row.targetYm}_${row.sourceYm}`" class="points-source-wrap">
								<view class="points-source-row">
									<text>片积分预览：{{ row.slicePreview && row.slicePreview.length ? row.slicePreview.join(' / ') : '-' }}</text>
								</view>
							</view>
						</view>
						<view v-else class="points-empty">暂无片级明细</view>
					</view>
					<view class="points-section">
						<view class="points-section-hd">C. 交易抽样（最近200笔）</view>
						<view v-if="pointsInsight.tradeSamples.length" class="points-table">
							<view class="points-row points-row-hd points-row--trade">
								<text>时间</text><text>来源月</text><text>金额</text><text>总积分</text><text>首期积分</text><text>单月分期待返</text>
							</view>
							<view v-for="row in pointsInsight.tradeSamples" :key="row.id" class="points-row points-row--trade">
								<text>{{ row.time }}</text><text>{{ row.tradeYm }}</text><text>{{ row.amount }}</text><text>{{ row.totalPoints }}</text><text>{{ row.firstPoints }}</text><text>{{ row.deferredPerMonth }}</text>
							</view>
						</view>
						<view v-else class="points-empty">暂无交易抽样</view>
					</view>
				</scroll-view>
				<view class="points-insight-actions">
					<button size="mini" @click="closePointsInsight">关闭</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import { exportAgreementImageToPdf, sanitizeFileName } from './agreement-pdf-export.js';

export default {
	data() {
		return {
			searchForm: {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				membershipLevel: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			},
			tableKey: 1,
			/** 与 pageInfo.pageSize 初始值一致，避免下拉首项与请求条数不一致 */
			merchantPageSizeRange: [20, 50, 100, 500],
			useStatusFilterData: [
				{ text: '正常', value: '1', checked: false },
				{ text: '异常', value: '0', checked: false }
			],
			flagBoolFilterData: [
				{ text: '禁用', value: '0', checked: false },
				{ text: '启用', value: '1', checked: false }
			],
			membershipLevelFilterData: [],
			list: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				// 须与 uni-pagination 默认 pageSizeRange 首项一致，否则界面显示「20条/页」实际仍按 10 请求
				pageSize: 20,
				total: 0
			},
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			],
			offlineSubmitting: false,
			offlineForm: {
				mobile: '',
				packageId: ''
			},
			previewImageUrl: '',
			agreementPreviewMode: false,
			agreementPreviewMerchant: null,
			agreementPdfExporting: false,
			agreementPreviewIp: '',
			agreementPreviewDevice: '',
			agreementPreviewSignedAt: '',
			previewScale: 1,
			previewOffsetX: 0,
			previewOffsetY: 0,
			previewDragging: false,
			previewDragStartX: 0,
			previewDragStartY: 0,
			previewDragOriginX: 0,
			previewDragOriginY: 0,
			previewPinchBaseScale: 1,
			_previewGestureEl: null,
			_boundGestureStart: null,
			_boundGestureChange: null,
			_boundGestureEnd: null,
			offlinePackages: [],
			defaultAvatar: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M24 24a7 7 0 1 0-7-7 7 7 0 0 0 7 7Zm0 4c-7.18 0-13 3.13-13 7v2h26v-2c0-3.87-5.82-7-13-7Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E'
			,
			pointsInsightLoading: false,
			pointsInsight: {
				title: '',
				monthlyOverview: [],
				sliceDetails: [],
				tradeSamples: []
			}
		};
	},
	computed: {
		isAgreementPreview() {
			return !!this.agreementPreviewMode;
		},
		previewImageStyle() {
			return {
				transform: `translate(${this.previewOffsetX}px, ${this.previewOffsetY}px) scale(${this.previewScale})`
			};
		}
	},
	mounted() {
		this.loadMembershipLevelFilterData();
		this.search();
	},
	beforeDestroy() {
		this.detachPreviewGestureListeners();
	},
	methods: {
		async loadMembershipLevelFilterData() {
			try {
				const ret = await this.$request('quotaList', { page: 1, pageSize: 200 }, { functionName: 'merchant' });
				const names = new Set(['普通会员', '白银会员']);
				if (ret.code === 0) {
					(ret.data?.list || []).forEach((x) => {
						const n = String(x.membershipName || '').trim();
						if (n) names.add(n);
					});
				}
				this.membershipLevelFilterData = Array.from(names).map((x) => ({ text: x, value: x, checked: false }));
			} catch (e) {
				this.membershipLevelFilterData = [
					{ text: '普通会员', value: '普通会员', checked: false },
					{ text: '白银会员', value: '白银会员', checked: false }
				];
			}
		},
		async runSyncPendingRechargeFromWx() {
			const ok = await new Promise((resolve) => {
				uni.showModal({
					title: '更新会员状态',
					content:
						'将对近 7 天内 uni-pay-orders 中 status=0、provider=wxpay 的订单逐笔向微信查单；若微信侧已支付，将补写本地订单并触发额度同步（H5 额度充值会更新会员状态）。单次最多处理 150 条，是否继续？',
					success: (res) => resolve(!!res.confirm)
				});
			});
			if (!ok) return;
			uni.showLoading({ title: '正在向微信查单…', mask: true });
			try {
				const ret = await this.$request('adminSyncPendingRechargeFromWx', {}, { functionName: 'merchant' });
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '同步失败', icon: 'none' });
					return;
				}
				const d = ret.data || {};
				const lines = [
					`扫描：${Number(d.scanned || 0)} 笔`,
					`已补同步：${Number(d.synced || 0)} 笔`,
					`微信仍非成功：${Number(d.stillPending || 0)} 笔`,
					`查单异常：${Number(d.errors || 0)} 笔`,
					d.truncated ? '（已达单次上限，可再次执行）' : ''
				].filter(Boolean);
				uni.showModal({
					title: '查单完成',
					content: lines.join('\n'),
					showCancel: false
				});
				this.search();
			} catch (e) {
				uni.showToast({ title: e?.message || '同步失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async runDataCorrect() {
			const ok = await new Promise((resolve) => {
				uni.showModal({
					title: '确认矫正',
					content: '将执行一次历史重算矫正（冻结金额/已提现），可能耗时较长，是否继续？',
					success: (res) => resolve(!!res.confirm)
				});
			});
			if (!ok) return;
			uni.showLoading({ title: '启动矫正任务...', mask: true });
			try {
				const startRet = await this.$request('merchantDataCorrectStart', {}, { functionName: 'merchant' });
				if (startRet.code !== 0) {
					uni.showToast({ title: startRet.message || '启动矫正失败', icon: 'none' });
					return;
				}
				const taskId = String(startRet.data?.taskId || '').trim();
				if (!taskId) {
					uni.showToast({ title: '启动矫正失败：任务ID为空', icon: 'none' });
					return;
				}
				let d = null;
				for (let i = 0; i < 2000; i += 1) {
					await new Promise((resolve) => setTimeout(resolve, 400));
					const st = await this.$request('merchantDataCorrectStatus', { taskId, chunkSize: 120 }, { functionName: 'merchant' });
					if (st.code !== 0) {
						uni.showToast({ title: st.message || '矫正任务执行失败', icon: 'none' });
						return;
					}
					d = st.data || {};
					const p = Math.max(0, Math.min(100, Number(d.progress || 0)));
					uni.hideLoading();
					uni.showLoading({ title: `矫正中 ${p}%`, mask: true });
					if (d.status === 'done' || d.status === 'failed') break;
				}
				if (!d) {
					uni.showToast({ title: '矫正超时，请稍后查看', icon: 'none' });
					return;
				}
				if (String(d.status || '') === 'failed') {
					uni.showToast({ title: d.errorMessage || '矫正任务失败', icon: 'none' });
					return;
				}
				uni.showModal({
					title: '矫正完成',
					content: `扫描商户：${Number(d.scanned || 0)}\n修正冻结金额：${Number(d.correctedFrozen || 0)}\n修正已提现：${Number(d.correctedWithdrawn || 0)}\n修正基础字段：${Number(d.correctedMerchantBase || 0)}`,
					showCancel: false
				});
				this.search();
			} catch (e) {
				uni.showToast({ title: e?.message || '矫正失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		formatDeviceDisplay(raw) {
			const text = String(raw || '').trim();
			if (!text) return '-';
			const parts = text.split('/');
			if (parts.length < 2) return text;
			return `${parts[0]}\n${parts.slice(1).join('/')}`;
		},
		formatWxUserDisplay(raw) {
			const text = String(raw || '').trim();
			if (!text) return '-';
			const parts = text.split('/');
			if (parts.length < 2) return text;
			return `${parts[0]}\n${parts.slice(1).join('/')}`;
		},
		getMouseClient(e) {
			const evt = e && (e.originalEvent || e);
			let x = evt?.clientX;
			let y = evt?.clientY;
			if ((x == null || y == null) && evt?.changedTouches && evt.changedTouches[0]) {
				x = evt.changedTouches[0].clientX;
				y = evt.changedTouches[0].clientY;
			}
			return {
				x: Number(x || 0),
				y: Number(y || 0)
			};
		},
		normalizeWheelDeltaY(evt) {
			if (!evt) return 0;
			let dy = Number(evt.deltaY) || 0;
			if (evt.deltaMode === 1) dy *= 16;
			else if (evt.deltaMode === 2) dy *= 24;
			return dy;
		},
		getPreviewViewportRect() {
			const ref = this.$refs.previewViewport;
			const el = ref && ref.$el ? ref.$el : ref;
			if (!el || typeof el.getBoundingClientRect !== 'function') return null;
			return el.getBoundingClientRect();
		},
		resetPreviewTransform() {
			this.previewScale = 1;
			this.previewOffsetX = 0;
			this.previewOffsetY = 0;
			this.previewDragging = false;
		},
		previewImg(url, opts = {}) {
			if (!url) return;
			if (!opts.keepAgreementMeta) {
				this.agreementPreviewMode = false;
				this.agreementPreviewMerchant = null;
				this.agreementPreviewIp = '';
				this.agreementPreviewDevice = '';
				this.agreementPreviewSignedAt = '';
			}
			this.resetPreviewTransform();
			this.previewImageUrl = String(url);
			if (this.$refs.imgPreviewPopup) {
				this.$refs.imgPreviewPopup.open();
				this.$nextTick(() => this.attachPreviewGestureListeners());
				return;
			}
			uni.previewImage({ urls: [url], current: url });
		},
		attachPreviewGestureListeners() {
			// #ifdef H5
			this.detachPreviewGestureListeners();
			const ref = this.$refs.previewViewport;
			const el = ref && (ref.$el || ref);
			if (!el || typeof el.addEventListener !== 'function') return;
			this._boundGestureStart = (ev) => this.onPreviewGestureStart(ev);
			this._boundGestureChange = (ev) => this.onPreviewGestureChange(ev);
			this._boundGestureEnd = () => this.onPreviewGestureEnd();
			el.addEventListener('gesturestart', this._boundGestureStart, { passive: false });
			el.addEventListener('gesturechange', this._boundGestureChange, { passive: false });
			el.addEventListener('gestureend', this._boundGestureEnd, false);
			this._previewGestureEl = el;
			// #endif
		},
		detachPreviewGestureListeners() {
			// #ifdef H5
			const el = this._previewGestureEl;
			if (el && this._boundGestureStart) {
				el.removeEventListener('gesturestart', this._boundGestureStart);
				el.removeEventListener('gesturechange', this._boundGestureChange);
				el.removeEventListener('gestureend', this._boundGestureEnd);
			}
			this._previewGestureEl = null;
			this._boundGestureStart = null;
			this._boundGestureChange = null;
			this._boundGestureEnd = null;
			// #endif
		},
		async previewAgreement(item) {
			if (!item || !item.id || !item.agreementSigned) return;
			uni.showLoading({ title: '加载协议图片...', mask: true });
			try {
				const ret = await this.$request(
					'merchantAgreementImage',
					{ merchantId: item.id },
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '加载失败', icon: 'none' });
					return;
				}
				const url = String(ret.data?.agreementImg || '').trim();
				if (!url) {
					uni.showToast({ title: '协议图片不存在', icon: 'none' });
					return;
				}
				this.agreementPreviewMode = true;
				this.agreementPreviewMerchant = {
					id: item.id,
					wxUser: item.wxUser || ''
				};
				this.agreementPreviewIp = String(ret.data?.agreementSignedIp || '').trim();
				this.agreementPreviewDevice = String(ret.data?.agreementSignDevice || '').trim();
				this.agreementPreviewSignedAt = String(ret.data?.agreementSignedAt || '').trim();
				this.previewImg(url, { keepAgreementMeta: true });
			} finally {
				uni.hideLoading();
			}
		},
		confirmClearAgreement(item) {
			if (!item || !item.id || !item.agreementSigned) return;
			uni.showModal({
				title: '删除协议签署',
				content:
					'将清空该商户的协议签名、签署时间及签署设备等信息，删除后对方须在 H5 重新签署《优惠活动计划书》。是否继续？',
				confirmText: '删除',
				cancelText: '取消',
				success: async (res) => {
					if (!res.confirm) return;
					uni.showLoading({ title: '处理中...', mask: true });
					try {
						const ret = await this.$request(
							'merchantAgreementClear',
							{ merchantId: item.id },
							{ functionName: 'merchant' }
						);
						if (ret.code !== 0) {
							uni.showToast({ title: ret.message || '操作失败', icon: 'none' });
							return;
						}
						uni.showToast({ title: ret.message || '已清除', icon: 'success' });
						await this.search();
					} finally {
						uni.hideLoading();
					}
				}
			});
		},
		onPreviewImageLoad() {
			this.resetPreviewTransform();
		},
		onPreviewWheel(e) {
			const rect = this.getPreviewViewportRect();
			if (!rect) return;
			const evt = e && (e.originalEvent || e);
			if (!evt) return;
			const deltaY = this.normalizeWheelDeltaY(evt);
			if (Math.abs(deltaY) < 0.01) return;

			/** Mac 触控板双指滑动为「非 Ctrl」滚轮：上下平移预览；Ctrl+滚轮 / Chrome 捏合为缩放 */
			const zoomIntent = !!(evt.ctrlKey || evt.metaKey);
			if (!zoomIntent) {
				this.previewOffsetY -= deltaY * 0.85;
				return;
			}

			const step = Math.exp(-deltaY * 0.0025);
			const oldScale = this.previewScale;
			const newScale = Math.max(0.2, Math.min(8, Number((oldScale * step).toFixed(5))));
			if (Math.abs(newScale - oldScale) < 1e-6) return;
			const mouse = this.getMouseClient(e);
			const mx = mouse.x - rect.left;
			const my = mouse.y - rect.top;
			const contentX = (mx - this.previewOffsetX) / oldScale;
			const contentY = (my - this.previewOffsetY) / oldScale;
			this.previewScale = newScale;
			this.previewOffsetX = mx - contentX * newScale;
			this.previewOffsetY = my - contentY * newScale;
		},
		onPreviewGestureStart(e) {
			const evt = e && (e.originalEvent || e);
			if (evt && evt.preventDefault) evt.preventDefault();
			this.previewPinchBaseScale = this.previewScale;
		},
		onPreviewGestureChange(e) {
			const evt = e && (e.originalEvent || e);
			if (!evt || evt.scale == null) return;
			if (evt.preventDefault) evt.preventDefault();
			const rect = this.getPreviewViewportRect();
			if (!rect) return;
			const mouse = this.getMouseClient(e);
			const mx = mouse.x - rect.left;
			const my = mouse.y - rect.top;
			const oldScale = this.previewScale;
			const newScale = Math.max(0.2, Math.min(8, Number((this.previewPinchBaseScale * evt.scale).toFixed(5))));
			if (Math.abs(newScale - oldScale) < 1e-6) return;
			const contentX = (mx - this.previewOffsetX) / oldScale;
			const contentY = (my - this.previewOffsetY) / oldScale;
			this.previewScale = newScale;
			this.previewOffsetX = mx - contentX * newScale;
			this.previewOffsetY = my - contentY * newScale;
		},
		onPreviewGestureEnd() {
			this.previewPinchBaseScale = this.previewScale;
		},
		onPreviewMouseDown(e) {
			const evt = e && (e.originalEvent || e);
			if (evt?.button != null && evt.button !== 0) return;
			const mouse = this.getMouseClient(e);
			this.previewDragging = true;
			this.previewDragStartX = mouse.x;
			this.previewDragStartY = mouse.y;
			this.previewDragOriginX = this.previewOffsetX;
			this.previewDragOriginY = this.previewOffsetY;
		},
		onPreviewMouseMove(e) {
			if (!this.previewDragging) return;
			const mouse = this.getMouseClient(e);
			this.previewOffsetX = this.previewDragOriginX + (mouse.x - this.previewDragStartX);
			this.previewOffsetY = this.previewDragOriginY + (mouse.y - this.previewDragStartY);
		},
		onPreviewMouseUp() {
			this.previewDragging = false;
		},
		closeImgPreview() {
			this.detachPreviewGestureListeners();
			if (this.$refs.imgPreviewPopup) this.$refs.imgPreviewPopup.close();
			this.previewImageUrl = '';
			this.agreementPreviewMode = false;
			this.agreementPreviewMerchant = null;
			this.agreementPdfExporting = false;
			this.agreementPreviewIp = '';
			this.agreementPreviewDevice = '';
			this.agreementPreviewSignedAt = '';
			this.resetPreviewTransform();
		},
		formatAgreementExportWxNickname(data) {
			const wx = String(data?.wxNickname || '').trim();
			if (wx) return wx;
			const fromList = String(this.agreementPreviewMerchant?.wxUser || '')
				.split('\n')[0]
				.trim();
			return fromList || '商户';
		},
		formatAgreementExportUserName(data) {
			const wx = this.formatAgreementExportWxNickname(data);
			const mobile = String(data?.mobile || '').trim();
			if (wx && mobile && wx !== '商户') return `${wx}_${mobile}`;
			return wx || mobile || '商户';
		},
		async exportAgreementPdf() {
			if (!this.agreementPreviewMerchant?.id) return;
			// #ifndef H5
			uni.showToast({ title: '请在浏览器管理端导出 PDF', icon: 'none' });
			return;
			// #endif
			if (this.agreementPdfExporting) return;
			this.agreementPdfExporting = true;
			uni.showLoading({ title: '生成 PDF...', mask: true });
			try {
				const previewUrl = String(this.previewImageUrl || '').trim();
				let dataUrl = /^data:image\//i.test(previewUrl) ? previewUrl : '';
				let metaSource = {
					wxNickname: '',
					mobile: '',
					agreementSignedAt: this.agreementPreviewSignedAt,
					agreementSignedIp: this.agreementPreviewIp,
					agreementSignDevice: this.agreementPreviewDevice
				};
				if (!dataUrl) {
					const ret = await this.$request(
						'merchantAgreementImage',
						{ merchantId: this.agreementPreviewMerchant.id, forPdfExport: true },
						{ functionName: 'merchant' }
					);
					if (ret.code !== 0) {
						uni.showToast({ title: ret.message || '导出失败', icon: 'none' });
						return;
					}
					dataUrl = String(ret.data?.agreementImgDataUrl || ret.data?.agreementImg || '').trim();
					metaSource = ret.data || metaSource;
				}
				if (!dataUrl) {
					uni.showToast({ title: '协议图片读取失败', icon: 'none' });
					return;
				}
				const wxNickname = this.formatAgreementExportWxNickname(metaSource);
				const wxUser = this.formatAgreementExportUserName(metaSource);
				await exportAgreementImageToPdf({
					imageDataUrl: dataUrl,
					fileName: sanitizeFileName(`慧收盈协议_${wxNickname}`),
					meta: {
						title: '优惠活动计划书（已签署）',
						wxUser,
						signedAt: metaSource.agreementSignedAt || this.agreementPreviewSignedAt,
						signedIp: metaSource.agreementSignedIp || this.agreementPreviewIp,
						signDevice: metaSource.agreementSignDevice || this.agreementPreviewDevice
					}
				});
				uni.showToast({ title: 'PDF 已下载', icon: 'success' });
			} catch (e) {
				uni.showToast({ title: e?.message || '导出失败', icon: 'none' });
			} finally {
				this.agreementPdfExporting = false;
				uni.hideLoading();
			}
		},
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) return { start: '', end: '' };
			return { start: Number(filter[0]) || '', end: Number(filter[1]) || '' };
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'deviceId' && filterType === 'search') {
				sf.deviceId = String(filter == null ? '' : filter).trim().slice(0, 50);
			} else if (field === 'wxNickname' && filterType === 'search') {
				sf.wxNickname = String(filter == null ? '' : filter).trim().slice(0, 50);
			} else if (['useStatus', 'flag1', 'flag2', 'flag3', 'membershipLevel'].includes(field) && filterType === 'select') {
				sf[field] = Array.isArray(filter) && filter.length ? String(filter[0]) : '';
			} else if (field === 'loginTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.loginTimeStart = start;
				sf.loginTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		search() {
			this.loading = true;
			this.$request('list', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				mobile: this.searchForm.mobile,
				deviceId: this.searchForm.deviceId,
				wxNickname: this.searchForm.wxNickname,
				useStatus: this.searchForm.useStatus,
				flag1: this.searchForm.flag1,
				flag2: this.searchForm.flag2,
				flag3: this.searchForm.flag3,
				membershipLevel: this.searchForm.membershipLevel,
				loginTimeStart: this.searchForm.loginTimeStart,
				loginTimeEnd: this.searchForm.loginTimeEnd
			}, { functionName: 'merchant' }).then(res => {
				this.loading = false;
				if (res.code === 0) {
					this.list = res.data.list;
					this.pageInfo.total = res.data.total;
				} else {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
				}
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				membershipLevel: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			};
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		onPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.search();
		},
		onPageSizeChange(size) {
			// uni-pagination 文档写 e={pageSize}，实际 emit 的是数字（pageSizeRange 中的值）
			let s;
			if (typeof size === 'number' && Number.isFinite(size)) {
				s = size;
			} else if (size && typeof size === 'object') {
				s = Number(size.pageSize != null ? size.pageSize : size.size);
			} else {
				s = Number(size);
			}
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 20;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		goAdd() {
			uni.navigateTo({ url: '/pages/merchant/list/add' });
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},
		async fetchExportRows() {
			const sf = this.searchForm;
			const ret = await this.$request('list', {
				page: 1,
				pageSize: 10000,
				mobile: sf.mobile,
				deviceId: sf.deviceId,
				wxNickname: sf.wxNickname,
				useStatus: sf.useStatus,
				flag1: sf.flag1,
				flag2: sf.flag2,
				flag3: sf.flag3,
				membershipLevel: sf.membershipLevel,
				loginTimeStart: sf.loginTimeStart,
				loginTimeEnd: sf.loginTimeEnd
			}, { functionName: 'merchant' });
			if (ret.code !== 0) throw new Error(ret.message || '导出数据获取失败');
			return (ret.data?.list || []).map((x) => ({
				机具号码: x.deviceNo || '',
				微信用户: x.wxUser || '',
				会员级别: x.membershipLevel || '普通会员',
				开通会员时间: x.membershipOpenedAt || '-',
				剩余额度: x.remainingQuota || '',
				充值金额: x.rechargeAmount || '',
				待提现: x.pendingWithdraw || '',
				已提现: x.withdrawn || '',
				冻结金额: x.frozenAmount || '',
				优惠券: x.couponCount || 0,
				使用状态: x.useStatus || '',
				开关1: x.flag1 ? '启用' : '禁用',
				开关2: x.flag2 ? '启用' : '禁用',
				开关3: x.flag3 ? '启用' : '禁用',
				登录时间: x.loginTime || '',
				协议签署IP: x.agreementSignedIp || '',
				协议设备标识: x.agreementSignDevice || ''
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
			return `<?xml version="1.0" encoding="UTF-8"?><merchants>${items}</merchants>`;
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
				if (type === 'json') this.downloadFile(`商户列表_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`商户列表_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`商户列表_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`商户列表_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`商户列表_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`商户列表_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async openOfflineRecharge() {
			this.offlineForm = { mobile: '', packageId: '' };
			await this.loadOfflinePackages();
			this.$refs.offlineRechargePopup.open();
		},
		closeOfflineRecharge() {
			this.$refs.offlineRechargePopup.close();
		},
		async loadOfflinePackages() {
			try {
				const ret = await this.$request('quotaList', { page: 1, pageSize: 100 }, { functionName: 'merchant' });
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '套餐加载失败', icon: 'none' });
					this.offlinePackages = [];
					return;
				}
				const rows = ret.data?.list || [];
				this.offlinePackages = rows.map((x) => ({
					value: x.packageId || x.id,
					quotaText: Number(x.realQuota || 0).toFixed(0),
					priceText: Number(x.price || 0).toFixed(2),
					desc: x.description || '',
					title: x.title || ''
				}));
				if (this.offlinePackages.length) this.offlineForm.packageId = this.offlinePackages[0].value;
			} catch (e) {
				this.offlinePackages = [];
				uni.showToast({ title: '套餐加载失败', icon: 'none' });
			}
		},
		async submitOfflineRecharge() {
			const mobile = String(this.offlineForm.mobile || '').trim();
			const packageId = String(this.offlineForm.packageId || '').trim();
			if (!/^1\d{10}$/.test(mobile)) {
				uni.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
				return;
			}
			if (!packageId) {
				uni.showToast({ title: '请选择套餐', icon: 'none' });
				return;
			}
			this.offlineSubmitting = true;
			try {
				const ret = await this.$request('offlineFirstRecharge', { mobile, packageId }, { functionName: 'merchant' });
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '提交失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '充值成功', icon: 'success' });
				this.closeOfflineRecharge();
				this.search();
			} catch (e) {
				uni.showToast({ title: '提交失败', icon: 'none' });
			} finally {
				this.offlineSubmitting = false;
			}
		},
		onSwitch(item, field, value) {
			this.$request('updateSwitch', { id: item.id, field, value }, { functionName: 'merchant' }).then(res => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '更新失败', icon: 'none' });
					this.search();
				}
			}).catch(() => {
				uni.showToast({ title: '网络错误', icon: 'none' });
				this.search();
			});
		},
		async openPointsInsight(item) {
			if (!item || !item.userId) return;
			this.pointsInsightLoading = true;
			this.pointsInsight = { title: `${item.wxUser || item.userId} 积分明细`, monthlyOverview: [], sliceDetails: [], tradeSamples: [] };
			this.$refs.pointsInsightPopup.open();
			try {
				const res = await this.$request(
					'merchantPointsMonthlyInsight',
					{ merchantUserId: item.userId },
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.pointsInsight = {
					title: `${(d.merchant && d.merchant.name) || item.wxUser || item.userId} 积分明细`,
					monthlyOverview: d.monthlyOverview || [],
					sliceDetails: d.sliceDetails || [],
					tradeSamples: d.tradeSamples || []
				};
			} finally {
				this.pointsInsightLoading = false;
			}
		},
		closePointsInsight() {
			if (this.$refs.pointsInsightPopup) this.$refs.pointsInsightPopup.close();
		},
		async openRefundWindow(item) {
			if (!item || !item.id) return;
			uni.showLoading({ title: '查询中...', mask: true });
			try {
				const ret = await this.$request(
					'adminMerchantRefundWindow',
					{ merchantId: item.id },
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '查询失败', icon: 'none' });
					return;
				}
				const summary = String((ret.data && ret.data.summary) || '暂无说明').trim();
				uni.showModal({
					title: '退款窗口',
					content: summary,
					showCancel: false
				});
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

.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
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
.export-menu-item:hover { background: #f5f7fa; }

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
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

.avatar {
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: #f3f4f6;
}

.agreement-status {
	font-size: 13px;
	font-weight: 600;
	white-space: nowrap;
	word-break: keep-all;
	display: inline-block;
	min-width: 52px;
}

.agreement-status--unsigned {
	color: #f56c6c;
	cursor: default;
}

.agreement-status--signed {
	color: #409eff;
	cursor: pointer;
}

.cell-multiline {
	white-space: pre-line;
	line-height: 18px;
}

.member-cell {
	line-height: 18px;
}

.member-open-time {
	font-size: 12px;
	color: #909399;
}

.money {
	color: #2b6bff;
	font-weight: 600;
}

.offline-popup {
	width: 520px;
	max-width: 88vw;
	background: #fff;
	border-radius: 8px;
	padding: 16px;
}

.offline-title {
	font-size: 16px;
	font-weight: 700;
	color: #303133;
	margin-bottom: 12px;
}

.offline-label {
	font-size: 13px;
	color: #606266;
	margin: 10px 0 6px;
}

.offline-label.required::before {
	content: '*';
	color: #f56c6c;
	margin-right: 4px;
}

.offline-input {
	height: 36px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	padding: 0 10px;
	font-size: 13px;
}

.offline-packages {
	max-height: 280px;
	border: 1px solid #ebeef5;
	border-radius: 6px;
	padding: 8px 10px;
}

.offline-package-item {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px 0;
}

.offline-package-content {
	flex: 1;
}

.offline-package-main {
	font-size: 14px;
	color: #303133;
}

.offline-package-desc {
	font-size: 12px;
	color: #409eff;
	margin-top: 4px;
	word-break: break-all;
}

.offline-actions {
	margin-top: 14px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.img-preview-modal {
	width: 760px;
	max-width: 92vw;
	max-height: 90vh;
	background: #fff;
	border-radius: 10px;
	padding: 12px;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	min-height: 0;
}

.img-preview-viewport {
	width: 100%;
	height: calc(90vh - 220px);
	max-height: calc(90vh - 220px);
	min-height: 140px;
	background: #f8fafc;
	border-radius: 8px;
	overflow: hidden;
	position: relative;
	cursor: grab;
	user-select: none;
	touch-action: none;
	flex-shrink: 0;
}

.img-preview-viewport:active {
	cursor: grabbing;
}

.img-preview-main {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: auto;
	transform-origin: 0 0;
	will-change: transform;
}

.img-preview-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin-top: 10px;
	flex-shrink: 0;
	width: 100%;
	box-sizing: border-box;
}

.img-preview-actions--agreement {
	grid-template-columns: 1fr 1fr 1fr;
}

.img-preview-actions button {
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
	margin: 0;
}

.img-preview-tip {
	margin-top: 8px;
	font-size: 12px;
	color: #6b7280;
	flex-shrink: 0;
	line-height: 1.45;
}

.img-preview-meta {
	margin-top: 10px;
	padding: 8px 10px;
	max-width: 100%;
	max-height: 96px;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	background: #f8fafc;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	font-size: 12px;
	color: #374151;
	text-align: left;
	box-sizing: border-box;
	flex-shrink: 1;
	min-height: 0;
}

.img-preview-meta-line {
	display: block;
	word-break: break-all;
	line-height: 1.5;
	margin-bottom: 4px;
}

.img-preview-meta-line:last-child {
	margin-bottom: 0;
}

.points-insight-modal {
	width: 1100px;
	max-width: 94vw;
	max-height: 88vh;
	background: #fff;
	border-radius: 10px;
	padding: 12px;
	box-sizing: border-box;
}
.points-insight-title {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 8px;
}
.points-rule-tip {
	background: #f8fafc;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	padding: 8px 10px;
	margin-bottom: 10px;
	font-size: 12px;
	color: #374151;
	line-height: 1.7;
}
.points-insight-scroll {
	height: 72vh;
}
.points-section {
	margin-bottom: 14px;
}
.points-section-hd {
	font-size: 14px;
	font-weight: 600;
	margin-bottom: 6px;
}
.points-table {
	border: 1px solid #ebeef5;
	border-radius: 8px;
	overflow: hidden;
}
.points-row {
	display: grid;
	grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1fr 1fr;
	padding: 8px 10px;
	border-top: 1px solid #f3f4f6;
	font-size: 12px;
}
.points-row--2 {
	grid-template-columns: 1.4fr 1fr 1fr;
}
.points-row--slice {
	grid-template-columns: 1fr 1fr 0.9fr 1fr 0.9fr 1fr 1fr;
}
.points-row--trade {
	grid-template-columns: 1.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr;
}
.points-row-hd {
	background: #f8fafc;
	font-weight: 600;
	border-top: none;
}
.points-source-wrap {
	padding: 4px 10px 8px;
	border-top: 1px dashed #edf2f7;
}
.points-source-row {
	font-size: 12px;
	color: #4b5563;
	line-height: 1.7;
}
.points-empty {
	font-size: 12px;
	color: #9ca3af;
}
.points-insight-actions {
	margin-top: 8px;
	display: flex;
	justify-content: flex-end;
}

.cell-actions {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 8px;
}
</style>

