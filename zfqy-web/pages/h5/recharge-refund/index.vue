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
				</view>

				<button class="btn-refund" type="warn" :disabled="loading" @click="refundReset">申请退款并重置权益数据</button>

				<view v-if="loading" class="loading-hint">
					<text>加载中…</text>
				</view>
				</template>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5HomeDashboard, h5MineInfo, h5RefundReset, h5TransferStatus, h5RefundEntryValidate } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			loading: false,
			entryAllowed: false,
			entryError: '',
			refundEntryToken: '',
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
			tickTimer: null
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
		}
	},
	onLoad(options) {
		this.refundEntryToken = String(options?.rt || options?.refundToken || options?.token || '').trim();
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
	},
	onHide() {
		this.clearTick();
	},
	methods: {
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
			} finally {
				this.loading = false;
			}
		},
		async ensureRefundEntryAndLoad() {
			this.entryAllowed = false;
			this.entryError = '';
			if (!this.refundEntryToken) {
				this.entryError = '退款入口无效，请联系在线客服重新发送入口。';
				return;
			}
			this.loading = true;
			try {
				const chk = await h5RefundEntryValidate({ refundEntryToken: this.refundEntryToken });
				if (chk.code !== 0) {
					this.entryError = chk.message || '退款入口校验失败，请联系在线客服。';
					return;
				}
				this.entryAllowed = true;
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
		refundReset() {
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
					uni.showLoading({ title: '处理中...', mask: true });
					try {
						const rawRes = await h5RefundReset({
							reason: '用户在退款与周期页发起退款重置',
							refundEntryToken: this.refundEntryToken
						});
						const res = this.unwrapResult(rawRes);
						if (res.code === 409) {
							const outBillNo = res.data && res.data.outBillNo;
							let latestState = res.data && (res.data.refundState || res.data.transferState || '');
							let failReason = (res.data && res.data.refundItems && res.data.refundItems[0] && res.data.refundItems[0].error) || '';
							if (outBillNo) {
								try {
									const s = await h5TransferStatus(outBillNo);
									const sr = this.unwrapResult(s);
									if (sr.code === 0 && sr.data) {
										latestState = sr.data.state || latestState;
										failReason = sr.data.transferError || failReason;
									}
								} catch (e) {}
							}
							uni.showModal({
								title: '退款处理中',
								content: `当前状态：${latestState || 'PROCESSING'}\n退款单号：${outBillNo || '-'}${failReason ? `\n失败原因：${failReason}` : ''}\n\n退款打款由微信异步处理，稍后可再次进入本页刷新状态。`,
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
						uni.showModal({
							title: '退款已发起',
							content: `退款批次号：${res.data.refundNo}\n原充值金额：¥${res.data.refundAmount}\n违约金：¥${res.data.penaltyAmount}\n预计退款：¥${res.data.finalRefundAmount}\n\n款项将通过商家转账退回，到账时间以微信处理结果为准。`,
							showCancel: false
						});
						await this.load();
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

.btn-refund {
	border-radius: 999px;
	margin-top: 4px;
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
</style>
