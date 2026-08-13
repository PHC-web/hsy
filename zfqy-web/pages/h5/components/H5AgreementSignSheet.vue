<template>
	<uni-popup ref="agreementPopup" type="bottom" @change="onPopupChange">
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
								:key="`agr_pdf_${idx}`"
								class="agreement-doc-image"
								:src="src"
								mode="widthFix"
							/>
						</view>
					</view>
				</view>
				<view v-else class="agreement-doc-empty">
					<text class="p">{{ agreementPdfError || '协议内容暂时无法在当前环境内预览，请联系客服。' }}</text>
				</view>
			</scroll-view>
			<signature-pad @signed="onSigned" />
		</view>
	</uni-popup>
</template>

<script>
import SignaturePad from '@/pages/h5/components/SignaturePad.vue';
import { h5MineInfoCached, h5SignAgreement, h5InvalidateHomeCache, h5EnsureAgreementBaseJpeg } from '@/pages/h5/common/api';
import { trimPdfAgreementPage, agreementPdfPageJoinGapPx } from '@/pages/h5/common/trim-image-whitespace';

export default {
	name: 'H5AgreementSignSheet',
	components: { SignaturePad },
	data() {
		return {
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
			agreementPdfZoom: { scale: 1, tx: 0, ty: 0 },
			_pendingResolve: null
		};
	},
	computed: {
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
	methods: {
		/** @returns {Promise<boolean>} 已签署或可继续为 true；取消关闭为 false */
		async ensureSigned() {
			const mineRes = await h5MineInfoCached({ force: true, maxAgeMs: 0 });
			if (!mineRes || mineRes.code !== 0) {
				uni.showToast({ title: mineRes?.message || '获取用户信息失败', icon: 'none' });
				return false;
			}
			const mData = mineRes.data || {};
			const oldPdf = String(this.agreement.pdfFileId || '').trim();
			this.agreement = Object.assign({}, this.agreement, mData.agreement || {});
			const newPdf = String(this.agreement.pdfFileId || '').trim();
			if (newPdf !== oldPdf) {
				this.agreementPdfImages = [];
				this.agreementPdfError = '';
			}
			if (!this.agreement.needSign) return true;
			return await new Promise((resolve) => {
				this._pendingResolve = resolve;
				this.agreementPdfZoom = { scale: 1, tx: 0, ty: 0 };
				this.$refs.agreementPopup.open();
				this.$nextTick(() => {
					this.ensureAgreementPreviewReady();
					// 与 PDF 预览并行预热签署底图，提交时只需盖章
					const agrId = String(this.agreement.agreementId || '').trim();
					h5EnsureAgreementBaseJpeg(agrId ? { agreementId: agrId } : {}).catch(() => {});
				});
			});
		},
		onPopupChange(e) {
			const show = e && e.detail && e.detail.show;
			if (show === false && this._pendingResolve) {
				const fn = this._pendingResolve;
				this._pendingResolve = null;
				fn(false);
			}
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
				img.onerror = (err) => reject(err);
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
		async onSigned(payload) {
			const signatureImage = payload && (payload.dataUrl || payload.tempFilePath);
			if (!signatureImage) {
				uni.showToast({ title: '签名图生成失败', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '提交签署...', mask: true });
			try {
				// 只上传签名小图；服务端将协议 PDF 与签名合成 JPEG 后落库
				const res = await h5SignAgreement({
					signatureImage,
					agreementVersion: this.agreement.currentVersion || '',
					agreementPdfFileId: this.agreement.pdfFileId || ''
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '签署失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '签署成功', icon: 'success' });
				h5InvalidateHomeCache();
				if (this._pendingResolve) {
					const fn = this._pendingResolve;
					this._pendingResolve = null;
					fn(true);
				}
				this.$refs.agreementPopup.close();
				this.$emit('signed');
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>
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
	background: #ffffff;
	color: #0f172a;
	border-top: 1px solid #e2e8f0;
	box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.08);
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
	background: #e2e8f0;
	border: 1px solid rgba(148, 163, 184, 0.25);
	border-radius: 10px;
	padding: 10px;
	box-sizing: border-box;
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
	color: #64748b;
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
</style>
