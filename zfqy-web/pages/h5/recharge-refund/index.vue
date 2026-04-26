<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<text class="nav-back" @click="goBack">‹ 返回</text>
			<text class="nav-title">退款与周期</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="inner">
				<view v-if="!entryAllowed" class="rule-card h5-glass-panel">
					<text class="rule-title">退款入口不可用</text>
					<text class="rule-item">{{ entryError || '正在校验退款入口…' }}</text>
				</view>
				<template v-else>
					<view v-if="silver.active" class="rule-card h5-glass-panel">
						<text class="rule-title">白银会员有效期</text>
						<text class="rule-item">{{ silverCountdownText }}</text>
					</view>
					<view class="countdown-card h5-glass-panel">
						<view class="cd-head">
							<text class="cd-title">退款窗口倒计时</text>
							<view
								v-if="countdown.phase === 'none'"
								class="cd-badge cd-badge--action"
								@click="goRecharge"
							>
								<text class="cd-badge-action-txt">额度充值</text>
								<text class="cd-badge-action-arrow">›</text>
							</view>
							<text v-else class="cd-badge">{{ countdownPhaseLabel }}</text>
						</view>
						<text class="cd-desc">{{ countdownDesc }}</text>
						<view v-if="countdownDigits" class="cd-digits">
							<view v-for="(p, i) in countdownDigits" :key="i" class="cd-seg">
								<text class="cd-num">{{ p.num }}</text>
								<text class="cd-unit">{{ p.unit }}</text>
							</view>
						</view>
						<text v-else class="cd-idle">{{ countdownIdleText }}</text>
					</view>

					<view class="rule-card h5-glass-panel">
						<text class="rule-title">退款规则说明</text>
						<text class="rule-item">1）重置后 {{ refundCycleDays }} 天内无法退款。</text>
						<text class="rule-item">2）满 {{ refundCycleDays }} 天后，系统会自动给客户 {{ refundWindowDays }} 天提取时间；若客户在窗口期内未提取，额度将自动预存并顺延，系统继续配置对应额度，以此类推。</text>
						<text class="rule-item">3）如客户执意在 {{ refundCycleDays }} 天内退款，将扣除 50% 违约金后返还剩余款项。</text>
						<text class="rule-link" @click="onViewAgreement">查看协议</text>
					</view>

					<button
						class="btn-refund"
						:class="refundButtonClass"
						:type="refundButtonType"
						:disabled="refundButtonDisabled"
						@click="onRefundMainAction"
					>
						{{ refundButtonLabel }}
					</button>

					<view v-if="loading" class="loading-hint">
						<text>加载中…</text>
					</view>
				</template>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>
		<uni-popup ref="agreementViewPopup" type="bottom">
			<view class="agreement-view-sheet agreement-sheet--dark">
				<view class="sheet-head">
					<text class="sheet-title">我的协议</text>
				</view>
				<scroll-view scroll-y class="agreement-view-scroll">
					<image
						v-if="agreementImageUrl"
						class="agreement-preview-image"
						:src="agreementImageUrl"
						mode="widthFix"
						@click="previewAgreementImage"
					/>
					<view v-else class="agreement-empty">
						<text>暂未签署协议</text>
					</view>
				</scroll-view>
				<view class="agreement-view-actions">
					<button class="agreement-view-btn agreement-view-btn--only" type="primary" size="mini" @click="closeAgreementViewer">关闭</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import {
	h5HomeDashboard,
	h5MineInfo,
	h5RefundReset,
	h5TransferStatus,
	h5RefundEntryValidate,
	h5RefundConfirmPackage,
	h5RefreshHomeCache
} from '@/pages/h5/common/api';

function defaultRefundUi() {
	return {
		phase: 'idle',
		outBillNo: '',
		refundNo: '',
		wxItemState: '',
		batchState: '',
		needRefundAudit: false,
		refundable: true,
		refundAmount: '0.00',
		penaltyAmount: '0.00',
		finalRefundAmount: '0.00'
	};
}

export default {
	data() {
		return {
			loading: false,
			entryAllowed: false,
			entryError: '',
			refundEntryToken: '',
			fromFeedbackEntry: true,
			refundUi: defaultRefundUi(),
			mineMerchant: {},
			silver: {
				active: false,
				expireAt: 0,
				remainingSec: 0
			},
			serverSkew: 0,
			countdown: {
				phase: 'none',
				days180Left: 0,
				refundDaysLeft: 0,
				windowStartMs: 0,
				windowEndMs: 0,
				cycleAnchorStartMs: 0
			},
			refundCycleDays: 180,
			refundWindowDays: 3,
			tick: 0,
			tickTimer: null,
			statusPollTimer: null
		};
	},
	computed: {
		effectiveNow() {
			void this.tick;
			return Date.now() + (this.serverSkew || 0);
		},
		countdownTargetMs() {
			const c = this.countdown;
			if (!c) return 0;
			if (c.phase === 'lock') return Number(c.windowStartMs || 0);
			if (c.phase === 'window') return Number(c.windowEndMs || 0);
			return 0;
		},
		countdownRemainingMs() {
			const end = this.countdownTargetMs;
			if (!end || this.countdown.phase === 'none') return 0;
			return Math.max(0, end - this.effectiveNow);
		},
		countdownDigits() {
			const ms = this.countdownRemainingMs;
			if (!ms || this.countdown.phase === 'none') return null;
			const sec = Math.floor(ms / 1000);
			const d = Math.floor(sec / 86400);
			const h = Math.floor((sec % 86400) / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = sec % 60;
			const parts = [];
			if (d > 0) parts.push({ num: String(d), unit: '天' });
			parts.push({ num: String(h).padStart(2, '0'), unit: '时' });
			parts.push({ num: String(m).padStart(2, '0'), unit: '分' });
			parts.push({ num: String(s).padStart(2, '0'), unit: '秒' });
			return parts;
		},
		countdownPhaseLabel() {
			const p = this.countdown.phase;
			if (p === 'window') return '开放窗口';
			if (p === 'lock') return '锁定周期';
			return '未开始';
		},
		countdownDesc() {
			const p = this.countdown.phase;
			if (p === 'window') {
				return '当前处于权益处理开放窗口（含退款申请等），距窗口结束还剩：';
			}
			if (p === 'lock') {
				return `下一开放窗口开始前为锁定周期，倒计时结束后可进入 ${this.refundWindowDays} 天处理窗口：`;
			}
			return '您尚未充值';
		},
		countdownIdleText() {
			if (this.countdown.phase === 'none') return '';
			if (this.countdownRemainingMs <= 0) return '正在刷新…';
			return '';
		},
		refundButtonLabel() {
			const p = this.refundUi && this.refundUi.phase;
			if (p === 'auditing') return '审核中';
			if (p === 'processing') return '加载中';
			if (p === 'failed') return '退款失败，请联系客服';
			if (p === 'confirm_transfer') return '审核通过，点击提取';
			if (p === 'done') return '退款已完成';
			return '申请退款并重置权益数据';
		},
		refundButtonDisabled() {
			if (this.loading) return true;
			const p = this.refundUi && this.refundUi.phase;
			if (p === 'auditing' || p === 'processing' || p === 'done' || p === 'failed') return true;
			if (!this.refundUi.refundable && p === 'idle') return true;
			return false;
		},
		refundButtonType() {
			const p = this.refundUi && this.refundUi.phase;
			if (p === 'confirm_transfer') return 'primary';
			if (p === 'auditing' || p === 'processing' || p === 'done' || p === 'failed') return 'default';
			return 'warn';
		},
		refundButtonClass() {
			const p = this.refundUi && this.refundUi.phase;
			if (p === 'confirm_transfer') return 'btn-refund btn-refund--primary';
			if (p === 'auditing' || p === 'processing' || p === 'done' || p === 'failed') return 'btn-refund btn-refund--muted';
			return 'btn-refund';
		},
		silverCountdownText() {
			if (!this.silver.active) return '未处于白银会员有效期';
			const left = Math.max(0, Number(this.silver.expireAt || 0) - this.effectiveNow);
			if (left <= 0) return '白银会员已到期';
			const sec = Math.floor(left / 1000);
			const d = Math.floor(sec / 86400);
			const h = Math.floor((sec % 86400) / 3600);
			const m = Math.floor((sec % 3600) / 60);
			return `距离到期：${d}天 ${String(h).padStart(2, '0')}时 ${String(m).padStart(2, '0')}分`;
		},
		agreementImageUrl() {
			return String(this.mineMerchant && this.mineMerchant.agreementImg ? this.mineMerchant.agreementImg : '').trim();
		}
	},
	onLoad(options) {
		this.refundEntryToken = String(options?.rt || options?.refundToken || options?.token || '').trim();
		// 关闭“退款入口无效”拦截：退款页默认允许进入并可发起退款流程
		this.fromFeedbackEntry = true;
	},
	onShow() {
		this.ensureRefundEntryAndLoad();
		if (!this.tickTimer) {
			this.tickTimer = setInterval(() => {
				this.tick += 1;
			}, 1000);
		}
	},
	onUnload() {
		this.clearTick();
		this.stopStatusPoll();
	},
	onHide() {
		this.clearTick();
		this.stopStatusPoll();
	},
	methods: {
		markNeedRefreshHomeMine() {
			try {
				uni.setStorageSync('h5_refund_success_refresh_ts', Date.now());
			} catch (e) {}
		},
		unwrapResult(payload) {
			if (payload && typeof payload === 'object' && payload.success === true && payload.data && typeof payload.data === 'object') {
				return payload.data;
			}
			return payload || {};
		},
		extractErrorMessage(err, fallback = '操作失败') {
			try {
				const raw = typeof err === 'string' ? err : err?.message || '';
				if (raw) {
					const parsed = JSON.parse(raw);
					if (parsed?.data?.message) return String(parsed.data.message);
					if (parsed?.message) return String(parsed.message);
				}
			} catch (e) {}
			if (err?.data?.message) return String(err.data.message);
			const nestedReason = err?.data?.refundItems?.[0]?.error || err?.data?.transferError || '';
			if (nestedReason) return String(nestedReason);
			if (err?.message) return String(err.message);
			return fallback;
		},
		clearTick() {
			if (this.tickTimer) {
				clearInterval(this.tickTimer);
				this.tickTimer = null;
			}
		},
		stopStatusPoll() {
			if (this.statusPollTimer) {
				clearInterval(this.statusPollTimer);
				this.statusPollTimer = null;
			}
		},
		applyRefundUiFromPayload(raw) {
			const d = (raw && raw.refundUi) || {};
			this.refundUi = Object.assign(defaultRefundUi(), d);
			this.syncStatusPoll();
		},
		normalizeRefundStateToPhase(state) {
			const s = String(state || '').toUpperCase();
			if (!s) return '';
			if (s === 'PENDING_AUDIT') return 'auditing';
			if (s === 'WAIT_USER_CONFIRM') return 'confirm_transfer';
			if (s === 'SUCCESS') return 'done';
			if (s === 'FAIL' || s === 'FAILED' || s === 'CLOSED' || s === 'REVOKED') return 'failed';
			if (s === 'PROCESSING' || s === 'ACCEPTED' || s === 'WAITING') return 'processing';
			return '';
		},
		syncStatusPoll() {
			this.stopStatusPoll();
			const u = this.refundUi || {};
			const bill = String(u.outBillNo || u.refundNo || '').trim();
			if (u.phase !== 'processing' || !bill) return;
			const tick = async () => {
				try {
					const raw = await h5TransferStatus(bill);
					const sr = this.unwrapResult(raw);
					if (sr.code !== 0 || !sr.data) return;
					const wxSt = String(sr.data.wxItemState || sr.data.state || '');
					if (wxSt === 'WAIT_USER_CONFIRM') {
						this.refundUi = Object.assign({}, this.refundUi, { phase: 'confirm_transfer', wxItemState: wxSt });
						this.stopStatusPoll();
						return;
					}
					if (wxSt === 'FAIL' || wxSt === 'FAILED' || wxSt === 'CLOSED' || wxSt === 'REVOKED') {
						this.refundUi = Object.assign({}, this.refundUi, { phase: 'failed', wxItemState: wxSt });
						this.stopStatusPoll();
						return;
					}
					if (wxSt === 'SUCCESS' || String(sr.data.refundState || '') === 'SUCCESS') {
						await this.refreshRefundUiOnly();
						this.markNeedRefreshHomeMine();
						this.stopStatusPoll();
					}
				} catch (e) {}
			};
			tick();
			this.statusPollTimer = setInterval(tick, 4000);
		},
		async refreshRefundUiOnly() {
			try {
				const raw = await h5RefundEntryValidate({
					refundEntryToken: this.refundEntryToken,
					entrySource: 'feedback'
				});
				const chk = this.unwrapResult(raw);
				if (chk.code === 0 && chk.data && chk.data.refundUi) {
					this.applyRefundUiFromPayload(chk.data);
				}
			} catch (e) {}
		},
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/feedback/index' }) });
		},
		async load() {
			this.loading = true;
			try {
				const res = await h5HomeDashboard();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = this.unwrapResult(res).data || this.unwrapResult(res) || {};
				if (typeof d.serverTime === 'number') {
					this.serverSkew = d.serverTime - Date.now();
				}
				this.countdown = Object.assign({}, this.countdown, d.countdown || {});
				this.refundCycleDays = Number(d.refundCycle?.cycleDays || 180);
				this.refundWindowDays = Number(d.refundCycle?.windowDays || 3);
				const mineRaw = await h5MineInfo();
				const mineRes = this.unwrapResult(mineRaw);
				if (mineRes.code === 0) {
					this.silver = Object.assign({}, this.silver, mineRes.data?.silver || {});
					this.mineMerchant = Object.assign({}, mineRes.data?.merchant || {});
				}
			} finally {
				this.loading = false;
			}
		},
		onViewAgreement() {
			if (!this.agreementImageUrl) {
				uni.showToast({ title: '暂未签署协议', icon: 'none' });
				return;
			}
			this.$refs.agreementViewPopup.open();
		},
		previewAgreementImage() {
			const src = String(this.agreementImageUrl || '').trim();
			if (!src) return;
			uni.previewImage({ urls: [src], current: src });
		},
		closeAgreementViewer() {
			this.$refs.agreementViewPopup.close();
		},
		async ensureRefundEntryAndLoad() {
			this.entryAllowed = false;
			this.entryError = '';
			this.stopStatusPoll();
			this.loading = true;
			try {
				const raw = await h5RefundEntryValidate({
					refundEntryToken: this.refundEntryToken,
					entrySource: 'feedback'
				});
				const chk = this.unwrapResult(raw);
				// 关闭入口无效拦截：即便校验失败也允许进入页面
				this.entryAllowed = true;
				if (chk.code === 0 && chk.data && chk.data.refundUi) {
					this.applyRefundUiFromPayload(chk.data);
				} else {
					this.applyRefundUiFromPayload({});
				}
				await this.load();
			} finally {
				this.loading = false;
			}
		},
		async goRecharge() {
			const mine = await h5MineInfo();
			const mineRes = this.unwrapResult(mine);
			if (mineRes.code !== 0) {
				uni.showToast({ title: mineRes.message || '获取用户信息失败', icon: 'none' });
				return;
			}
			const m = mineRes.data && mineRes.data.merchant;
			if (!m || !String(m.agreementImg || '').trim()) {
				uni.showToast({ title: '请先在「我的」中签署优惠活动计划书', icon: 'none' });
				uni.navigateTo({ url: '/pages/h5/mine/index' });
				return;
			}
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		},
		onRefundMainAction() {
			const p = this.refundUi && this.refundUi.phase;
			if (p === 'confirm_transfer') {
				this.confirmRefundTransfer();
				return;
			}
			this.refundApply();
		},
		async confirmRefundTransfer() {
			const no = String(this.refundUi.refundNo || this.refundUi.outBillNo || '').trim();
			if (!no) {
				uni.showToast({ title: '缺少退款单号', icon: 'none' });
				return;
			}
			try {
				const pre = await h5TransferStatus(no);
				const preRes = this.unwrapResult(pre);
				if (preRes.code === 0 && preRes.data) {
					const s = String(preRes.data.wxItemState || preRes.data.state || preRes.data.refundState || '').toUpperCase();
					if (s === 'FAIL' || s === 'FAILED' || s === 'CLOSED' || s === 'REVOKED') {
						const failReason = String(preRes.data.transferError || preRes.data.error || '当前状态为 FAIL，请联系管理员');
						this.refundUi = Object.assign({}, this.refundUi, { phase: 'failed', wxItemState: s });
						uni.showModal({
							title: '退款失败',
							content: failReason,
							showCancel: false
						});
						return;
					}
				}
			} catch (e) {}
			if (typeof window === 'undefined' || !window.WeixinJSBridge || !window.WeixinJSBridge.invoke) {
				uni.showToast({ title: '请在微信内打开后再确认收款', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '拉起中...', mask: true });
			try {
				const raw = await h5RefundConfirmPackage({
					refundNo: no,
					outBillNo: no,
					refundEntryToken: this.refundEntryToken,
					entrySource: 'feedback'
				});
				const res = this.unwrapResult(raw);
				if (res.code !== 0) {
					const detail = String(res?.data?.detail || '').trim();
					uni.showModal({
						title: '暂无法拉起确认收款',
						content: detail ? `${res.message || '获取确认参数失败'}\n\n真实报错：${detail}` : (res.message || '获取确认参数失败'),
						showCancel: false
					});
					return;
				}
				const data = res.data || {};
				await new Promise((resolve) => {
					window.WeixinJSBridge.invoke(
						'requestMerchantTransfer',
						{
							mchId: String(data.mchId || ''),
							appId: String(data.appId || ''),
							package: String(data.package || '')
						},
						(r) => {
							const msg = String((r && r.err_msg) || '');
							if (msg.indexOf('ok') >= 0) {
								this.markNeedRefreshHomeMine();
								uni.showToast({ title: '确认成功，正在返回首页', icon: 'none' });
								setTimeout(() => {
									uni.redirectTo({ url: '/pages/h5/home/index' });
								}, 350);
							} else if (msg.indexOf('cancel') >= 0) {
								uni.showToast({ title: '你已取消确认收款', icon: 'none' });
							} else {
								uni.showToast({ title: msg || '拉起失败', icon: 'none' });
							}
							resolve();
						}
					);
				});
				await this.refreshRefundUiOnly();
				if (String(this.refundUi?.phase || '') === 'done') {
					this.markNeedRefreshHomeMine();
				}
			} finally {
				uni.hideLoading();
			}
		},
		refundApply() {
			const isWindow = this.countdown.phase === 'window';
			const content = isWindow
				? '退款后将不享有会员权益，确认退款？'
				: `充值后${this.refundCycleDays}天内无法进行全额退款，现在退款需收取50%违约金，是否要进行退款？`;
			uni.showModal({
				title: '确认退款重置',
				content,
				success: async (r) => {
					if (!r.confirm) return;
					this.loading = true;
					this.refundUi = Object.assign({}, this.refundUi, { phase: 'processing' });
					uni.showLoading({ title: '处理中...', mask: true });
					try {
						const rawRes = await h5RefundReset({
							reason: '用户在退款与周期页发起退款重置',
							refundEntryToken: this.refundEntryToken,
							entrySource: 'feedback'
						});
						const res = this.unwrapResult(rawRes);
						await this.refreshRefundUiOnly();
						if (res.code === 409) {
							const rs = res.data && res.data.refundState;
							if (rs === 'PENDING_AUDIT') {
								this.refundUi = Object.assign({}, this.refundUi, { phase: 'auditing' });
								uni.showToast({ title: '退款申请已提交，请等待审核', icon: 'none' });
								return;
							}
							const outBillNo = res.data && res.data.outBillNo;
							let latestState = res.data && (res.data.refundState || res.data.transferState || '');
							let failReason =
								(res.data && res.data.refundItems && res.data.refundItems[0] && res.data.refundItems[0].error) || '';
							if (outBillNo) {
								try {
									const s = await h5TransferStatus(outBillNo);
									const sr = this.unwrapResult(s);
									if (sr.code === 0 && sr.data) {
										latestState = sr.data.wxItemState || sr.data.state || latestState;
										failReason = sr.data.transferError || failReason;
									}
								} catch (e) {}
							}
							uni.showModal({
								title: '退款处理中',
								content: `当前状态：${latestState || 'PROCESSING'}\n退款单号：${outBillNo || '-'}${failReason ? `\n失败原因：${failReason}` : ''}\n\n微信处理完成后，请点击「审核通过，点击提取」完成收款确认。`,
								showCancel: false
							});
							return;
						}
						if (res.code !== 0) {
							const reason = this.extractErrorMessage(res, res.message || '操作失败');
							uni.showModal({
								title: '退款失败',
								content: `失败原因：${reason}`,
								showCancel: false
							});
							return;
						}
						const msg = String(res.message || '');
						if (msg.indexOf('待管理员审核') >= 0 || (res.data && res.data.refundState === 'PENDING_AUDIT')) {
							await h5RefreshHomeCache();
							this.refundUi = Object.assign({}, this.refundUi, { phase: 'auditing' });
							uni.showToast({ title: '已提交审核', icon: 'none' });
							return;
						}
						const nextPhase = this.normalizeRefundStateToPhase(res.data && (res.data.refundState || res.data.transferState));
						if (nextPhase) {
							this.refundUi = Object.assign({}, this.refundUi, { phase: nextPhase });
							if (nextPhase === 'done') this.markNeedRefreshHomeMine();
						} else {
							this.refundUi = Object.assign({}, this.refundUi, { phase: 'processing' });
						}
						uni.showModal({
							title: '退款已发起',
							content: `退款批次号：${res.data.refundNo}\n原充值金额：¥${res.data.refundAmount}\n违约金：¥${res.data.penaltyAmount}\n预计退款：¥${res.data.finalRefundAmount}\n\n款项将通过商家转账退回；若微信要求确认收款，请在本页点击「审核通过，点击提取」。`,
							showCancel: false
						});
						await h5RefreshHomeCache();
					} catch (e) {
						uni.showToast({ title: this.extractErrorMessage(e, '操作失败'), icon: 'none' });
					} finally {
						this.loading = false;
						uni.hideLoading();
					}
				}
			});
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
	display: flex;
	flex-direction: column;
}

.nav-bar {
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 8px;
}
.nav-back {
	color: rgba(226, 232, 240, 0.95);
	font-size: 15px;
	min-width: 64px;
}
.nav-title {
	color: #f8fafc;
	font-size: 17px;
	font-weight: 700;
}
.nav-placeholder {
	min-width: 64px;
}

.scroll {
	flex: 1;
	min-height: 0;
	position: relative;
	z-index: 1;
	box-sizing: border-box;
}
.inner {
	padding: 0 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.countdown-card {
	padding: 16px 18px 18px;
	margin-bottom: 16px;
}
.cd-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 8px;
}
.cd-title {
	font-size: 15px;
	font-weight: 700;
	color: #f8fafc;
}
.cd-badge {
	font-size: 11px;
	padding: 4px 10px;
	border-radius: 999px;
	background: rgba(99, 102, 241, 0.25);
	color: #c7d2fe;
	border: 1px solid rgba(129, 140, 248, 0.35);
	flex-shrink: 0;
}
.cd-badge--action {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 6px 12px;
	background: rgba(255, 255, 255, 0.12);
	border: 1px solid rgba(199, 210, 254, 0.45);
	color: #e0e7ff;
}
.cd-badge-action-txt {
	font-size: 12px;
	font-weight: 600;
	color: #e0e7ff;
}
.cd-badge-action-arrow {
	font-size: 14px;
	color: rgba(199, 210, 254, 0.95);
	line-height: 1;
}
.cd-desc {
	display: block;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.92);
	line-height: 1.55;
	margin-bottom: 14px;
}
.cd-digits {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 10px 14px;
}
.cd-seg {
	min-width: 52px;
	padding: 10px 12px;
	border-radius: 14px;
	background: rgba(15, 23, 42, 0.4);
	border: 1px solid rgba(255, 255, 255, 0.1);
	text-align: center;
}
.cd-num {
	display: block;
	font-size: 20px;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	color: #e0e7ff;
	letter-spacing: 0.04em;
}
.cd-unit {
	display: block;
	margin-top: 2px;
	font-size: 10px;
	color: rgba(148, 163, 184, 0.95);
}
.cd-idle {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.85);
}

.rule-card {
	padding: 16px;
	margin-bottom: 18px;
	border-color: rgba(251, 191, 36, 0.28);
	box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.12), 0 12px 40px rgba(0, 0, 0, 0.2);
}
.rule-title {
	display: block;
	font-size: 14px;
	font-weight: 700;
	color: #fde68a;
	margin-bottom: 8px;
}
.rule-item {
	display: block;
	font-size: 12px;
	line-height: 1.65;
	color: rgba(254, 243, 199, 0.88);
	margin-top: 6px;
}
.rule-link {
	display: inline-block;
	margin-top: 10px;
	font-size: 12px;
	color: #93c5fd;
	text-decoration: underline;
}

.btn-refund {
	border-radius: 999px;
	margin-top: 4px;
}
.btn-refund--primary {
	opacity: 1;
}
.btn-refund--muted {
	opacity: 0.65;
}

.loading-hint {
	text-align: center;
	padding: 12px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.85);
}
.bottom-spacer {
	height: 20px;
}

.agreement-sheet--dark {
	background: rgba(15, 23, 42, 0.92);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-bottom: none;
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
}
.agreement-view-sheet {
	border-radius: 20px 20px 0 0;
	padding: 16px 16px 12px;
	margin: 0;
	max-height: 88vh;
	box-sizing: border-box;
}
.sheet-title {
	font-size: 16px;
	font-weight: 700;
	color: #f8fafc;
}
.agreement-view-scroll {
	max-height: 62vh;
	margin-top: 10px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 10px;
	box-sizing: border-box;
	background: rgba(0, 0, 0, 0.2);
}
.agreement-preview-image {
	display: block;
	width: 100%;
	border-radius: 8px;
	background: #fff;
}
.agreement-empty {
	min-height: 120px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: rgba(203, 213, 225, 0.85);
	font-size: 12px;
}
.agreement-view-actions {
	display: flex;
	justify-content: center;
	gap: 10px;
	margin-top: 12px;
}
.agreement-view-btn {
	margin: 0;
}
.agreement-view-btn--only {
	min-width: 120px;
}
</style>
