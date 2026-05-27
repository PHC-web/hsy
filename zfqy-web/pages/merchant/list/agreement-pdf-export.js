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

function addLongImageToPdf(pdf, img, startY, margin) {
	const format = 'JPEG';
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const printableW = pageWidth - margin * 2;
	const printableH = pageHeight - margin - startY;
	const ratio = printableW / img.width;
	const sliceHeightPx = printableH / ratio;
	let sourceY = 0;
	let pageIndex = 0;
	while (sourceY < img.height) {
		if (pageIndex > 0) {
			pdf.addPage();
			startY = margin;
		}
		const pagePrintableH = pageHeight - margin - startY;
		const sliceH = Math.min(sliceHeightPx, img.height - sourceY);
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = Math.ceil(sliceH);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, sourceY, img.width, sliceH, 0, 0, img.width, sliceH);
		const data = canvas.toDataURL('image/jpeg', 0.92);
		const displayH = sliceH * ratio;
		pdf.addImage(data, format, margin, startY, printableW, Math.min(displayH, pagePrintableH), undefined, 'FAST');
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
