/**
 * H5 管理端：将已签署协议图片导出为 PDF（动态加载 jspdf，无 npm 依赖）。
 */

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

let jsPdfReady = false;
let jsPdfLoading = false;

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('脚本加载失败'));
		document.head.appendChild(script);
	});
}

export async function ensureJsPdfReady() {
	// #ifndef H5
	return false;
	// #endif
	// #ifdef H5
	if (jsPdfReady && window.jspdf && window.jspdf.jsPDF) return true;
	if (jsPdfLoading) {
		return await new Promise((resolve) => {
			const timer = setInterval(() => {
				if (!jsPdfLoading) {
					clearInterval(timer);
					resolve(!!(jsPdfReady && window.jspdf && window.jspdf.jsPDF));
				}
			}, 50);
		});
	}
	jsPdfLoading = true;
	try {
		if (!(window.jspdf && window.jspdf.jsPDF)) {
			await loadScript(JSPDF_CDN);
		}
		jsPdfReady = !!(window.jspdf && window.jspdf.jsPDF);
		return jsPdfReady;
	} catch (e) {
		return false;
	} finally {
		jsPdfLoading = false;
	}
	// #endif
}

function loadImageElement(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('协议图片加载失败'));
		img.src = src;
	});
}

function rasterizeToJpegDataUrl(img, quality = 0.92) {
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, 0, 0);
	return canvas.toDataURL('image/jpeg', quality);
}

function addMetaHeader(pdf, meta, margin) {
	const lines = [];
	if (meta.title) lines.push(String(meta.title));
	if (meta.wxUser) lines.push(`商户：${meta.wxUser}`);
	if (meta.signedAt) lines.push(`签署时间：${meta.signedAt}`);
	if (meta.signedIp) lines.push(`签署 IP：${meta.signedIp}`);
	if (meta.signDevice) lines.push(`设备标识：${meta.signDevice}`);
	if (!lines.length) return margin;
	pdf.setFontSize(10);
	pdf.setTextColor(80, 80, 80);
	let y = margin;
	lines.forEach((line, i) => {
		const chunk = pdf.splitTextToSize(line, pdf.internal.pageSize.getWidth() - margin * 2);
		chunk.forEach((row) => {
			pdf.text(row, margin, y);
			y += i === 0 && meta.title ? 16 : 13;
		});
	});
	pdf.setTextColor(0, 0, 0);
	return y + 8;
}

/**
 * 采样一行的「非白」像素占比（越低越适合作为分页切缝）。
 */
function rowInkRatio(data, width, y, threshold = 245) {
	const rowStart = y * width * 4;
	const step = Math.max(1, Math.floor(width / 240));
	let dark = 0;
	let samples = 0;
	for (let x = 0; x < width; x += step) {
		const i = rowStart + x * 4;
		const a = data[i + 3];
		if (a < 16) {
			samples += 1;
			continue;
		}
		if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) dark += 1;
		samples += 1;
	}
	return samples > 0 ? dark / samples : 0;
}

/**
 * 在理想切点上方扫描行距空白，返回相对 sourceY 的安全切片高度。
 * 只读取搜索窗口像素，避免整图 getImageData。
 */
function findSafeSliceHeight(img, sourceY, maxSliceH) {
	const imgHeight = img.height;
	const width = img.width;
	const idealEnd = Math.min(imgHeight, sourceY + Math.floor(maxSliceH));
	if (idealEnd <= sourceY) return Math.max(1, idealEnd - sourceY);
	if (idealEnd >= imgHeight) return imgHeight - sourceY;

	const minKeep = sourceY + Math.max(Math.floor(maxSliceH * 0.55), 80);
	const searchBack = Math.min(
		Math.floor(maxSliceH * 0.22),
		Math.max(64, Math.floor(width * 0.06))
	);
	const searchFrom = Math.max(minKeep, idealEnd - searchBack);
	const bandH = idealEnd - searchFrom;
	if (bandH < 4) return idealEnd - sourceY;

	let bandData;
	try {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = bandH;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, bandH);
		ctx.drawImage(img, 0, searchFrom, width, bandH, 0, 0, width, bandH);
		bandData = ctx.getImageData(0, 0, width, bandH).data;
	} catch (e) {
		return idealEnd - sourceY;
	}

	const whiteInkMax = 0.012;
	const minGapPx = Math.max(2, Math.round(width * 0.0015));
	let bestCut = -1;
	let bestScore = -1;
	let gapStart = -1;

	const scoreGap = (g0, g1) => {
		const gapH = g1 - g0 + 1;
		if (gapH < minGapPx) return;
		const cut = Math.min(idealEnd, g1 + 1);
		if (cut <= sourceY) return;
		const proximity = 1 - (idealEnd - cut) / Math.max(1, idealEnd - searchFrom);
		const score = gapH * 8 + proximity * 120;
		if (score > bestScore) {
			bestScore = score;
			bestCut = cut;
		}
	};

	for (let y = 0; y < bandH; y += 1) {
		const ink = rowInkRatio(bandData, width, y);
		const absY = searchFrom + y;
		if (ink <= whiteInkMax) {
			if (gapStart < 0) gapStart = absY;
		} else if (gapStart >= 0) {
			scoreGap(gapStart, absY - 1);
			gapStart = -1;
		}
	}
	if (gapStart >= 0) scoreGap(gapStart, idealEnd - 1);

	if (bestCut > sourceY) {
		return bestCut - sourceY;
	}

	let minInk = Infinity;
	let minInkY = idealEnd - 1;
	for (let y = 0; y < bandH; y += 1) {
		const ink = rowInkRatio(bandData, width, y);
		if (ink < minInk) {
			minInk = ink;
			minInkY = searchFrom + y;
		}
	}
	let cut = minInkY + 1;
	while (cut < idealEnd) {
		const localY = cut - searchFrom;
		if (localY < 0 || localY >= bandH) break;
		const ink = rowInkRatio(bandData, width, localY);
		if (ink > Math.max(whiteInkMax, minInk * 1.5)) break;
		cut += 1;
	}
	return Math.max(1, Math.min(idealEnd, cut) - sourceY);
}

function addLongImageToPdf(pdf, img, startY, margin) {
	const format = 'JPEG';
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const printableW = pageWidth - margin * 2;
	const ratio = printableW / img.width;

	let sourceY = 0;
	let pageIndex = 0;
	let pageStartY = startY;

	while (sourceY < img.height) {
		if (pageIndex > 0) {
			pdf.addPage();
			pageStartY = margin;
		}
		const pagePrintableH = pageHeight - margin - pageStartY;
		const maxSliceH = pagePrintableH / ratio;
		let sliceH;
		if (sourceY + maxSliceH >= img.height - 0.5) {
			sliceH = img.height - sourceY;
		} else {
			sliceH = findSafeSliceHeight(img, sourceY, maxSliceH);
		}
		sliceH = Math.max(1, Math.min(Math.ceil(sliceH), img.height - sourceY));

		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = sliceH;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, sourceY, img.width, sliceH, 0, 0, img.width, sliceH);
		const data = canvas.toDataURL('image/jpeg', 0.92);
		const displayH = sliceH * ratio;
		pdf.addImage(
			data,
			format,
			margin,
			pageStartY,
			printableW,
			Math.min(displayH, pagePrintableH),
			undefined,
			'FAST'
		);
		sourceY += sliceH;
		pageIndex += 1;
	}
}

/**
 * @param {Object} options
 * @param {string} options.imageDataUrl - data:image/... 或 https 图片地址
 * @param {string} [options.fileName]
 * @param {Object} [options.meta]
 */
export async function exportAgreementImageToPdf(options = {}) {
	// #ifndef H5
	throw new Error('请在浏览器管理端使用 PDF 导出');
	// #endif
	// #ifdef H5
	const imageDataUrl = String(options.imageDataUrl || '').trim();
	if (!imageDataUrl) throw new Error('缺少协议图片');
	const ok = await ensureJsPdfReady();
	if (!ok) throw new Error('PDF 组件加载失败，请检查网络后重试');
	let img = await loadImageElement(imageDataUrl);
	try {
		const jpegUrl = rasterizeToJpegDataUrl(img);
		img = await loadImageElement(jpegUrl);
	} catch (e) {}
	const JsPDF = window.jspdf.jsPDF;
	const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
	const margin = 28;
	const meta = options.meta || {};
	const headerEndY = addMetaHeader(pdf, meta, margin);
	addLongImageToPdf(pdf, img, headerEndY, margin);
	const name = sanitizeFileName(options.fileName || '慧收盈协议_商户');
	pdf.save(`${name}.pdf`);
	// #endif
}

export function sanitizeFileName(name) {
	return String(name || '慧收盈协议_商户')
		.replace(/[\\/:*?"<>|]+/g, '_')
		.replace(/_+/g, '_')
		.slice(0, 80) || '慧收盈协议_商户';
}
