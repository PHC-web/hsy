<template>
	<view class="page">
		<view class="page-bg" aria-hidden="true">
			<view class="orb orb-a"></view>
			<view class="orb orb-b"></view>
			<view class="orb orb-c"></view>
			<view class="mesh"></view>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="scroll-inner">
				<view class="top-row">
					<text class="page-title">商户中心</text>
					<view class="top-refresh-btn" @click="refreshPage">刷新</view>
				</view>

				<!-- 会员与头像 -->
				<view class="glass hero-card" :class="'tier-' + (membership.tier || 'normal')">
					<view class="hero-shine" aria-hidden="true"></view>
					<view class="hero-row">
						<image class="avatar" :src="avatarUrl" mode="aspectFill" />
						<view class="hero-text">
							<text class="nick">{{ mine.wxNickname || '微信用户' }}</text>
							<text class="mobile">{{ mine.mobile || '手机号未绑定' }}</text>
							<view class="badge-row">
								<view class="member-badge" :style="{ borderColor: (membership.accent || '#94a3b8') + '66', boxShadow: '0 0 20px ' + (membership.accent || '#94a3b8') + '22' }">
									<text class="member-badge-dot" :style="{ color: membership.accent || '#94a3b8' }">●</text>
									<text class="member-badge-txt">{{ membership.name || '普通会员' }}</text>
								</view>
							</view>
						</view>
					</view>
					<view class="hero-foot">
						<text class="hero-foot-txt">{{ mine.brandName || '-' }} · {{ deviceDisplayText }}</text>
					</view>
				</view>

				<view v-if="showSilverTradeStat" class="glass silver-trade-card">
					<text class="silver-trade-title">当月流水统计</text>
					<text class="silver-trade-value">¥{{ silverMonthTradeYuan }}</text>
				</view>

				<!-- 提现统计 -->
				<view class="section-label">
					<text class="section-title">提现累积</text>
					<text class="section-sub">已到账金额（北京时间自然日/月/年）</text>
				</view>
				<view class="glass stat-grid">
					<view class="stat-cell">
						<text class="stat-label">今日</text>
						<text class="stat-value">¥{{ withdraw.today }}</text>
					</view>
					<view class="stat-div"></view>
					<view class="stat-cell">
						<text class="stat-label">本月</text>
						<text class="stat-value">¥{{ withdraw.month }}</text>
					</view>
					<view class="stat-div"></view>
					<view class="stat-cell">
						<text class="stat-label">本年</text>
						<text class="stat-value">¥{{ withdraw.year }}</text>
					</view>
				</view>

				<!-- 待提现 + 剩余额度 -->
				<view class="glass duo-row">
					<view class="duo-block">
						<text class="duo-label">待提现金额</text>
						<text class="duo-value accent-gold">¥{{ pendingWithdraw }}</text>
					</view>
					<view class="duo-v"></view>
					<view class="duo-block">
						<text class="duo-label">剩余提现额度</text>
						<text class="duo-value accent-mint">¥{{ quota.remaining }}</text>
						<text v-if="quota.totalGrantedYuan > 0" class="duo-hint">
							总额度 ¥{{ quotaTotalStr }} · 已用 ¥{{ quota.usedYuan }}
						</text>
					</view>
				</view>

				<view v-if="quota.totalGrantedYuan > 0" class="glass quota-bar-wrap">
					<view class="quota-bar-bg">
						<view class="quota-bar-fill" :style="{ width: quotaBarPercent + '%' }"></view>
					</view>
					<text class="quota-bar-cap">剩余 {{ quotaBarPercent }}%</text>
				</view>
				<view class="glass prestore-card" @click="goPrestore">
					<view class="prestore-main">
						<text class="prestore-title">额度包</text>
						<text class="prestore-sub">快捷进入升级页面，升级档位与额度</text>
						<view class="prestore-packages">
							<view v-for="pkg in prestorePackages" :key="pkg.id || pkg.price" class="prestore-pkg-row">
								<text class="prestore-pkg-tag">{{ pkg.membershipName || '会员' }}</text>
								<text class="prestore-pkg-text">{{ pkg.title }}：{{ pkg.benefitTip || '查看详情请进入额度包' }}</text>
							</view>
							<text v-if="hasGiftPackage" class="prestore-gift">赠送：碰一碰音响或扫码全能POS机（指定档位专享）</text>
						</view>
					</view>
					<text class="prestore-arrow">›</text>
				</view>

				<view v-if="pending" class="loading-hint">
					<text>加载中…</text>
				</view>
				<view class="bottom-spacer"></view>
			</view>
		</scroll-view>

		<view class="tabbar safe-bottom">
			<view class="tab active">首页</view>
			<view class="tab" @click="goIncome">收益</view>
			<view class="tab" @click="goMine">我的</view>
		</view>
		<view v-if="loading" class="loading-mask">
			<view class="loading-card">
				<view class="loading-spinner"></view>
				<text class="loading-text">加载中...</text>
			</view>
		</view>
		<uni-popup ref="agreementPopup" type="bottom">
			<view class="agreement-sheet agreement-sheet--dark">
				<view class="sheet-head">
					<text class="sheet-title">{{ agreement.title || '开户优惠活动计划书签署' }}</text>
				</view>
				<scroll-view
					ref="agreementScrollRef"
					scroll-y
					class="agreement-text"
					@wheel="onAgreementPdfWheel"
				>
					<view v-if="!agreementDocUrl" class="agreement-doc-empty">
						<text class="p">未配置最新协议文件，请在后台协议管理中设置当前协议。</text>
					</view>
					<view v-else-if="agreementPdfLoading" class="agreement-doc-loading">
						<text class="p">正在加载最新协议内容...</text>
					</view>
					<view v-else-if="agreementPdfImages.length" class="agreement-pdf-zoom-wrap">
						<view class="agreement-zoom-inner" :style="agreementZoomStyle">
							<view class="agreement-doc-images">
								<image
									v-for="(src, idx) in agreementPdfImages"
									:key="`home_pdf_img_${idx}`"
									class="agreement-doc-image"
									:src="src"
									mode="widthFix"
								/>
							</view>
						</view>
					</view>
					<view v-else class="agreement-doc-empty">
						<text class="p">{{ agreementPdfError || '协议内容暂时无法在当前环境内预览，请点击下方按钮查看原文件。' }}</text>
					</view>
				</scroll-view>
				<!-- <view v-if="agreementDocUrl" class="agreement-doc-actions">
					<button size="mini" @click="openAgreementFile">查看原始协议文件</button>
				</view> -->
				<signature-pad @signed="onSigned" />
			</view>
		</uni-popup>
	</view>
</template>

<script>
import SignaturePad from '@/pages/h5/components/SignaturePad.vue';
import { h5HomeDashboardCached, h5MineInfoCached, h5SignAgreement } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';
import { trimPdfAgreementPage, agreementPdfPageJoinGapPx } from '@/pages/h5/common/trim-image-whitespace';

export default {
	components: { SignaturePad },
	data() {
		return {
			loading: false,
			pending: false,
			mine: {},
			membership: { tier: 'normal', name: '普通会员', accent: '#94a3b8' },
			withdraw: { today: '0.00', month: '0.00', year: '0.00' },
			withdrawContext: { role: '', silverMonthTradeYuan: 0 },
			pendingWithdraw: '0.00',
			quota: { remaining: '0.00', totalGrantedYuan: 0, usedYuan: '0.00' },
			prestorePackages: [],
			defaultAvatar: H5_APP_LOGO,
			agreement: {
				needSign: false,
				currentVersion: '',
				title: '开户优惠活动计划书',
				pdfFileId: ''
			},
			agreementPdfImages: [],
			agreementPdfLoading: false,
			agreementPdfError: '',
			pdfjsReady: false,
			pdfjsLoading: false,
			prestorePendingOpen: false,
			/** 协议 PDF 预览：Ctrl/Cmd+滚轮缩放（相对指针中心），避免浏览器整页缩放跑偏 */
			agreementPdfZoom: { scale: 1, tx: 0, ty: 0 }
		};
	},
	computed: {
		avatarUrl() {
			const u = String(this.mine.wxAvatar || '').trim();
			return u || this.defaultAvatar;
		},
		quotaTotalStr() {
			const n = Number(this.quota.totalGrantedYuan || 0);
			return Number.isInteger(n) ? String(n) : n.toFixed(2);
		},
		quotaBarPercent() {
			const total = Number(this.quota.totalGrantedYuan || 0);
			const rem = parseFloat(String(this.quota.remaining || '0'));
			if (total <= 0) return 0;
			const p = Math.round((rem / total) * 1000) / 10;
			return Math.min(100, Math.max(0, p));
		},
		deviceDisplayText() {
			const d = this.mine.deviceDisplay || this.mine.deviceId || '未绑定';
			return String(d);
		},
		showSilverTradeStat() {
			return String(this.withdrawContext.role || '') === 'silver_member';
		},
		silverMonthTradeYuan() {
			return Number(this.withdrawContext.silverMonthTradeYuan || 0).toFixed(2);
		},
		hasGiftPackage() {
			return (this.prestorePackages || []).some((x) => x && x.giftChoiceRequired);
		},
		agreementDocUrl() {
			return String(this.agreement.pdfFileId || '').trim();
		},
		agreementZoomStyle() {
			const { scale, tx, ty } = this.agreementPdfZoom || {};
			const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
			const x = Number.isFinite(tx) ? tx : 0;
			const y = Number.isFinite(ty) ? ty : 0;
			return {
				transform: `translate(${x}px, ${y}px) scale(${s})`,
				transformOrigin: '0 0'
			};
		}
	},
	onShow() {
		let force = false;
		try {
			const ts = Number(uni.getStorageSync('h5_refund_success_refresh_ts') || 0);
			const consumed = Number(uni.getStorageSync('h5_refund_success_refresh_ts_home') || 0);
			if (ts > 0 && ts > consumed) {
				force = true;
				uni.setStorageSync('h5_refund_success_refresh_ts_home', ts);
			}
		} catch (e) {}
		this.load(force);
	},
	methods: {
		async load(force = false) {
			this.pending = true;
			const maskTimer = setTimeout(() => {
				this.loading = true;
			}, 320);
			try {
				const res = await h5HomeDashboardCached({ maxAgeMs: 5 * 60 * 1000, force: !!force });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const d = res.data || {};
				this.mine = Object.assign({}, d.merchant || {}, {
					deviceDisplay: d.device?.display || (d.merchant && d.merchant.deviceId) || ''
				});
				this.membership = d.membership || this.membership;
				this.withdrawContext = d.withdrawContext || this.withdrawContext;
				this.withdraw = d.withdraw || this.withdraw;
				this.pendingWithdraw = d.pendingWithdraw || '0.00';
				this.quota = Object.assign({}, this.quota, d.quota || {});
				this.prestorePackages = (d.rechargePackages || []).slice(0, 6);
				if (d.agreement) this.agreement = Object.assign({}, this.agreement, d.agreement || {});
			} finally {
				clearTimeout(maskTimer);
				this.pending = false;
				this.loading = false;
			}
		},
		async refreshPage() {
			if (this.pending || this.loading) return;
			await this.load(true);
			uni.showToast({ title: '已刷新', icon: 'none' });
		},
		goIncome() {
			uni.redirectTo({ url: '/pages/h5/income/index' });
		},
		goMine() {
			uni.redirectTo({ url: '/pages/h5/mine/index' });
		},
		async goPrestore() {
			if (this.pending || this.loading) return;
			const mineRes = await h5MineInfoCached({ force: true, maxAgeMs: 0 });
			if (!mineRes || mineRes.code !== 0) {
				uni.showToast({ title: mineRes?.message || '获取用户信息失败', icon: 'none' });
				return;
			}
			const mData = mineRes.data || {};
			this.mine = Object.assign({}, this.mine, mData.merchant || {});
			const oldPdf = String(this.agreement.pdfFileId || '').trim();
			this.agreement = Object.assign({}, this.agreement, mData.agreement || {});
			const newPdf = String(this.agreement.pdfFileId || '').trim();
			if (newPdf !== oldPdf) {
				this.agreementPdfImages = [];
				this.agreementPdfError = '';
			}
			if (this.agreement.needSign) {
				this.prestorePendingOpen = true;
				this.openAgreementPopup();
				return;
			}
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		},
		async openAgreementPopup() {
			this.agreementPdfZoom = { scale: 1, tx: 0, ty: 0 };
			this.$refs.agreementPopup.open();
			await this.ensureAgreementPreviewReady();
		},
		onAgreementPdfWheel(e) {
			// #ifdef H5
			if (!this.agreementPdfImages.length) return;
			if (!(e.ctrlKey || e.metaKey)) return;
			if (e.cancelable) e.preventDefault();
			const wrap = this.$refs.agreementScrollRef;
			const el = wrap && (wrap.$el || wrap);
			if (!el || typeof el.getBoundingClientRect !== 'function') return;
			const rect = el.getBoundingClientRect();
			const st = el.scrollTop || 0;
			const sl = el.scrollLeft || 0;
			const x = e.clientX - rect.left + sl;
			const y = e.clientY - rect.top + st;
			const z = this.agreementPdfZoom || { scale: 1, tx: 0, ty: 0 };
			const factor = e.deltaY > 0 ? 0.9 : 1.1;
			const newScale = Math.min(3, Math.max(0.35, (Number(z.scale) || 1) * factor));
			const mx = (x - (Number(z.tx) || 0)) / (Number(z.scale) || 1);
			const my = (y - (Number(z.ty) || 0)) / (Number(z.scale) || 1);
			this.agreementPdfZoom = {
				scale: newScale,
				tx: x - mx * newScale,
				ty: y - my * newScale
			};
			// #endif
		},
		async ensurePdfJsReady() {
			// #ifndef H5
			return false;
			// #endif
			// #ifdef H5
			if (this.pdfjsReady) return true;
			if (this.pdfjsLoading) {
				return await new Promise((resolve) => {
					const timer = setInterval(() => {
						if (!this.pdfjsLoading) {
							clearInterval(timer);
							resolve(!!this.pdfjsReady);
						}
					}, 50);
				});
			}
			this.pdfjsLoading = true;
			try {
				if (!(window && window.pdfjsLib)) {
					await new Promise((resolve, reject) => {
						const script = document.createElement('script');
						script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
						script.async = true;
						script.onload = resolve;
						script.onerror = reject;
						document.head.appendChild(script);
					});
				}
				if (window && window.pdfjsLib) {
					window.pdfjsLib.GlobalWorkerOptions.workerSrc =
						'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
					this.pdfjsReady = true;
					return true;
				}
				return false;
			} catch (e) {
				return false;
			} finally {
				this.pdfjsLoading = false;
			}
			// #endif
		},
		async ensureAgreementPreviewReady() {
			const url = String(this.agreementDocUrl || '').trim();
			if (!url || this.agreementPdfLoading || this.agreementPdfImages.length) return;
			this.agreementPdfLoading = true;
			this.agreementPdfError = '';
			try {
				const ok = await this.ensurePdfJsReady();
				if (!ok) {
					this.agreementPdfError = '当前环境不支持内嵌渲染PDF';
					return;
				}
				// #ifdef H5
				const resp = await fetch(url);
				if (!resp.ok) throw new Error(`协议文件加载失败(${resp.status})`);
				const ab = await resp.arrayBuffer();
				const doc = await window.pdfjsLib.getDocument({ data: ab }).promise;
				const pages = [];
				const maxPages = Math.min(doc.numPages || 0, 40);
				for (let i = 1; i <= maxPages; i += 1) {
					const page = await doc.getPage(i);
					const viewport = page.getViewport({ scale: 1.5 });
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');
					canvas.width = Math.ceil(viewport.width);
					canvas.height = Math.ceil(viewport.height);
					await page.render({ canvasContext: ctx, viewport }).promise;
					pages.push(canvas.toDataURL('image/jpeg', 0.9));
				}
				this.agreementPdfImages = pages;
				if (!pages.length) this.agreementPdfError = '协议文件暂无可渲染页面';
				// #endif
			} catch (e) {
				this.agreementPdfError = e?.message || '协议内容渲染失败';
			} finally {
				this.agreementPdfLoading = false;
			}
		},
		loadImageElement(src) {
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => resolve(img);
				img.onerror = (e) => reject(e);
				img.src = src;
			});
		},
		buildAgreementCompositeImage(signatureImage) {
			// #ifndef H5
			return Promise.resolve(signatureImage);
			// #endif
			// #ifdef H5
			return (async () => {
				await this.ensureAgreementPreviewReady();
				const pageImages = (this.agreementPdfImages || []).filter((x) => String(x || '').trim());
				if (!pageImages.length) return signatureImage;
				const loadedPages = [];
				for (let pi = 0; pi < pageImages.length; pi += 1) {
					try {
						const img = await this.loadImageElement(pageImages[pi]);
						loadedPages.push(trimPdfAgreementPage(img, { pageIndex: pi }));
					} catch (e) {}
				}
				if (!loadedPages.length) return signatureImage;
				let signImg = null;
				try {
					signImg = await this.loadImageElement(signatureImage);
				} catch (e) {
					signImg = null;
				}
				const pageMaxWidth = Math.max(...loadedPages.map((x) => Number(x.width || 0)));
				const contentWidth = Math.max(1000, pageMaxWidth);
				const pdfPageGap = agreementPdfPageJoinGapPx(contentWidth);
				const sidePad = 24;
				const signBlockHeight = 220;
				let totalHeight = 0;
				const draws = [];
				for (let pi = 0; pi < loadedPages.length; pi += 1) {
					const img = loadedPages[pi];
					const ratio = contentWidth / Number(img.width || contentWidth);
					const drawH = Math.max(1, Math.round(Number(img.height || 1) * ratio));
					draws.push({ img, y: totalHeight, w: contentWidth, h: drawH });
					totalHeight += drawH;
					if (pi < loadedPages.length - 1) {
						totalHeight += pdfPageGap;
					}
				}
				totalHeight += signBlockHeight;
				const canvas = document.createElement('canvas');
				canvas.width = contentWidth;
				canvas.height = totalHeight;
				const ctx = canvas.getContext('2d');
				if (!ctx) return signatureImage;
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				for (const d of draws) ctx.drawImage(d.img, 0, d.y, d.w, d.h);
				const blockTop = totalHeight - signBlockHeight;
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, blockTop, canvas.width, signBlockHeight);
				ctx.strokeStyle = '#d0d7e2';
				ctx.lineWidth = 2;
				ctx.strokeRect(sidePad, blockTop + 12, canvas.width - sidePad * 2, signBlockHeight - 24);
				ctx.fillStyle = '#0f172a';
				ctx.font = '600 28px sans-serif';
				ctx.fillText('乙方签名确认', sidePad + 20, blockTop + 56);
				ctx.font = '500 22px sans-serif';
				const ds = new Date();
				const dateText = `签署日期：${ds.getFullYear()}-${String(ds.getMonth() + 1).padStart(2, '0')}-${String(ds.getDate()).padStart(2, '0')} ${String(ds.getHours()).padStart(2, '0')}:${String(ds.getMinutes()).padStart(2, '0')}`;
				ctx.fillText(dateText, sidePad + 20, blockTop + signBlockHeight - 36);
				if (signImg) {
					const maxSignW = Math.min(360, Math.floor(canvas.width * 0.36));
					const ratio = maxSignW / Number(signImg.width || maxSignW);
					const signW = maxSignW;
					const signH = Math.max(80, Math.round(Number(signImg.height || 80) * ratio));
					const signX = canvas.width - sidePad - signW - 24;
					const signY = blockTop + 40;
					ctx.drawImage(signImg, signX, signY, signW, signH);
				}
				return canvas.toDataURL('image/jpeg', 0.92);
			})();
			// #endif
		},
		openAgreementFile() {
			const url = String(this.agreementDocUrl || '').trim();
			if (!url) return;
			// #ifdef H5
			window.open(url, '_blank');
			// #endif
			// #ifndef H5
			uni.setClipboardData({
				data: url,
				success: () => uni.showToast({ title: '协议链接已复制', icon: 'none' })
			});
			// #endif
		},
		async onSigned(payload) {
			const signatureImage = payload && (payload.dataUrl || payload.tempFilePath);
			if (!signatureImage) {
				uni.showToast({ title: '签名图生成失败', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '提交签署...', mask: true });
			try {
				const agreementImage = await this.buildAgreementCompositeImage(signatureImage);
				const res = await h5SignAgreement({
					signatureImage: agreementImage,
					agreementVersion: this.agreement.currentVersion || ''
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '签署失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '签署成功', icon: 'success' });
				this.$refs.agreementPopup.close();
				await this.load(true);
				if (this.prestorePendingOpen) {
					this.prestorePendingOpen = false;
					uni.navigateTo({ url: '/pages/h5/recharge/index' });
				}
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	overflow: hidden;
}

.page-bg {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 0;
	background: linear-gradient(160deg, #070b14 0%, #121829 38%, #0b1020 70%, #15102a 100%);
}

.mesh {
	position: absolute;
	inset: 0;
	opacity: 0.35;
	background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
	background-size: 14px 14px;
	pointer-events: none;
}

.orb {
	position: absolute;
	border-radius: 50%;
	filter: blur(72px);
	pointer-events: none;
}
.orb-a {
	width: 220px;
	height: 220px;
	top: -40px;
	right: -30px;
	background: rgba(99, 102, 241, 0.45);
}
.orb-b {
	width: 280px;
	height: 280px;
	top: 28%;
	left: -80px;
	background: rgba(56, 189, 248, 0.28);
}
.orb-c {
	width: 200px;
	height: 200px;
	bottom: 18%;
	right: -40px;
	background: rgba(244, 114, 182, 0.22);
}

.scroll {
	position: relative;
	z-index: 1;
	height: calc(100vh - 56px - env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
}
.scroll-inner {
	padding: 12px 16px 8px;
}

.top-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 14px;
}
.page-title {
	font-size: 22px;
	font-weight: 700;
	color: rgba(248, 250, 252, 0.96);
	letter-spacing: 0.02em;
}
.top-refresh-btn {
	padding: 4px 12px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 600;
	color: #cbd5e1;
	background: rgba(15, 23, 42, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.18);
}

.glass {
	position: relative;
	background: rgba(255, 255, 255, 0.07);
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 22px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(22px);
	-webkit-backdrop-filter: blur(22px);
	overflow: hidden;
}

.hero-card {
	padding: 18px 18px 14px;
	margin-bottom: 16px;
}
.hero-card.tier-diamond {
	border-color: rgba(125, 211, 252, 0.35);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(56, 189, 248, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.hero-card.tier-platinum {
	border-color: rgba(216, 180, 254, 0.35);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(192, 132, 252, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.hero-card.tier-white_gold {
	border-color: rgba(253, 224, 71, 0.28);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(250, 204, 21, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.hero-shine {
	position: absolute;
	top: -40%;
	left: -20%;
	width: 70%;
	height: 80%;
	background: linear-gradient(120deg, rgba(255, 255, 255, 0.14), transparent 55%);
	transform: rotate(-18deg);
	pointer-events: none;
}
.hero-row {
	display: flex;
	align-items: center;
	gap: 14px;
	position: relative;
	z-index: 1;
}
.avatar {
	width: 64px;
	height: 64px;
	border-radius: 20px;
	border: 2px solid rgba(255, 255, 255, 0.2);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
	flex-shrink: 0;
}
.hero-text {
	flex: 1;
	min-width: 0;
}
.nick {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #f8fafc;
}
.mobile {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.65);
}
.badge-row {
	margin-top: 10px;
}
.member-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px 5px 10px;
	border-radius: 999px;
	background: rgba(15, 23, 42, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.2);
}
.member-badge-dot {
	font-size: 8px;
	line-height: 1;
}
.member-badge-txt {
	font-size: 13px;
	font-weight: 600;
	color: rgba(254, 252, 232, 0.95);
	letter-spacing: 0.04em;
}
.hero-foot {
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	position: relative;
	z-index: 1;
}
.hero-foot-txt {
	font-size: 12px;
	color: rgba(203, 213, 225, 0.72);
}

.silver-trade-card {
	margin-bottom: 14px;
	padding: 14px 16px;
}
.silver-trade-title {
	display: block;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}
.silver-trade-value {
	display: block;
	margin-top: 6px;
	font-size: 24px;
	font-weight: 800;
	color: #a7f3d0;
	letter-spacing: 0.02em;
}

.section-label {
	margin: 6px 4px 10px;
}
.section-title {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: rgba(226, 232, 240, 0.88);
}
.section-sub {
	display: block;
	margin-top: 2px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.85);
}

.stat-grid {
	display: flex;
	align-items: stretch;
	margin-bottom: 14px;
	padding: 6px 0;
}
.stat-cell {
	flex: 1;
	padding: 14px 8px;
	text-align: center;
}
.stat-label {
	display: block;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 6px;
}
.stat-value {
	display: block;
	font-size: 17px;
	font-weight: 700;
	color: #f1f5f9;
	letter-spacing: 0.02em;
}
.stat-div {
	width: 1px;
	background: rgba(255, 255, 255, 0.08);
	margin: 12px 0;
}

.duo-row {
	display: flex;
	margin-bottom: 12px;
	padding: 4px 0;
}
.duo-block {
	flex: 1;
	padding: 16px 14px;
}
.duo-v {
	width: 1px;
	background: rgba(255, 255, 255, 0.08);
	margin: 14px 0;
}
.duo-label {
	display: block;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
	margin-bottom: 8px;
}
.duo-value {
	display: block;
	font-size: 22px;
	font-weight: 800;
	letter-spacing: 0.02em;
}
.accent-gold {
	color: #fde68a;
	text-shadow: 0 0 24px rgba(250, 204, 21, 0.25);
}
.accent-mint {
	color: #a7f3d0;
	text-shadow: 0 0 24px rgba(52, 211, 153, 0.2);
}
.duo-hint {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.9);
	line-height: 1.45;
}

.quota-bar-wrap {
	margin-bottom: 14px;
	padding: 14px 16px 16px;
}
.quota-bar-bg {
	height: 8px;
	border-radius: 999px;
	background: rgba(15, 23, 42, 0.45);
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.06);
}
.quota-bar-fill {
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, #34d399, #6ee7b7, #a7f3d0);
	box-shadow: 0 0 16px rgba(52, 211, 153, 0.35);
	transition: width 0.45s ease;
}
.quota-bar-cap {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: rgba(148, 163, 184, 0.9);
	text-align: right;
}
.prestore-card {
	display: flex;
	gap: 10px;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	margin-bottom: 12px;
}
.prestore-main {
	flex: 1;
	min-width: 0;
}
.prestore-title {
	display: block;
	font-size: 15px;
	font-weight: 700;
	color: #e2e8f0;
}
.prestore-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}
.prestore-packages {
	margin-top: 10px;
	padding: 8px 10px;
	border-radius: 12px;
	background: rgba(15, 23, 42, 0.36);
	border: 1px solid rgba(255, 255, 255, 0.1);
}
.prestore-pkg-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	margin-top: 6px;
}
.prestore-pkg-row:first-child {
	margin-top: 0;
}
.prestore-pkg-tag {
	flex-shrink: 0;
	margin-top: 1px;
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 10px;
	font-weight: 700;
	line-height: 1.4;
	color: #fef3c7;
	background: rgba(245, 158, 11, 0.24);
	border: 1px solid rgba(251, 191, 36, 0.35);
}
.prestore-pkg-text {
	flex: 1;
	min-width: 0;
	font-size: 11px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.95);
}
.prestore-gift {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	font-weight: 700;
	line-height: 1.5;
	color: #fbbf24;
}
.prestore-arrow {
	font-size: 20px;
	color: rgba(148, 163, 184, 0.95);
}

.loading-hint {
	text-align: center;
	padding: 8px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.8);
}
.loading-mask {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(2, 6, 23, 0.45);
	backdrop-filter: blur(2px);
	-webkit-backdrop-filter: blur(2px);
}
.loading-card {
	min-width: 120px;
	padding: 16px 18px;
	border-radius: 14px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	background: rgba(15, 23, 42, 0.86);
	border: 1px solid rgba(255, 255, 255, 0.14);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}
.loading-spinner {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid rgba(148, 163, 184, 0.35);
	border-top-color: #a5b4fc;
	animation: h5-spin 0.8s linear infinite;
}
.loading-text {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.95);
}
@keyframes h5-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
.bottom-spacer {
	height: 12px;
}

.tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 10;
	display: flex;
	height: calc(56px + env(safe-area-inset-bottom, 0px));
	padding-bottom: env(safe-area-inset-bottom, 0px);
	box-sizing: border-box;
	align-items: flex-start;
	padding-top: 0;
	background: rgba(15, 23, 42, 0.72);
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.2);
}
.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	color: rgba(148, 163, 184, 0.9);
	font-size: 14px;
}
.tab.active {
	color: #a5b4fc;
	font-weight: 700;
}
.agreement-sheet {
	border-radius: 18px 18px 0 0;
	padding: 12px 12px calc(8px + env(safe-area-inset-bottom));
	max-height: 88vh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-sizing: border-box;
}
.agreement-sheet--dark {
	background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
	color: #e5e7eb;
}
.sheet-head {
	padding: 4px 0 10px;
	text-align: center;
	flex-shrink: 0;
}
.sheet-title {
	font-size: 15px;
	font-weight: 700;
}
.agreement-text {
	flex: 1 1 auto;
	min-height: 0;
	height: calc(88vh - 300px);
	max-height: calc(88vh - 300px);
	background: rgba(15, 23, 42, 0.45);
	border: 1px solid rgba(148, 163, 184, 0.25);
	border-radius: 10px;
	padding: 10px;
	box-sizing: border-box;
}
.agreement-sheet .sign-wrap {
	flex-shrink: 0;
}
.agreement-pdf-zoom-wrap {
	min-height: 100%;
}
.agreement-zoom-inner {
	display: inline-block;
	min-width: 100%;
	vertical-align: top;
	will-change: transform;
}
.agreement-doc-loading,
.agreement-doc-empty {
	padding: 8px 2px;
	color: #cbd5e1;
	font-size: 12px;
	line-height: 1.7;
}
.agreement-doc-images {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.agreement-doc-image {
	width: 100%;
	border-radius: 6px;
	background: #fff;
}
.agreement-doc-actions {
	display: flex;
	justify-content: center;
	margin-top: 10px;
}
</style>
