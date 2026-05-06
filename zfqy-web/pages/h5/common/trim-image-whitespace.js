/**
 * 协议 PDF 页裁边（不裁左右，宽度与 pdf.js 一致）：
 * - 第 0 页：只裁底部留白，顶边距与 PDF 第一页一致。
 * - 第 1 页起：裁掉页眉（顶留白）与页脚（底留白），由页间 agreementPdfPageJoinGapPx 体现约 1.5 倍行距。
 * 仅在 H5 + canvas 环境可用；失败时返回原图引用。
 * @param {object} [options]
 * @param {number} [options.pageIndex=0] 从 0 起的页序
 */
export function trimPdfAgreementPage(img, options = {}) {
	if (typeof document === 'undefined' || !img) return img;
	const threshold = Number(options.threshold) >= 0 ? Number(options.threshold) : 242;
	const minContentPx = Number(options.minContentPx) >= 1 ? Number(options.minContentPx) : 24;
	const pageIndex = Math.max(0, parseInt(String(options.pageIndex), 10) || 0);
	const isFirstPage = pageIndex === 0;

	const w = Number(img.naturalWidth || img.width || 0);
	const h = Number(img.naturalHeight || img.height || 0);
	if (!(w > 0 && h > 0)) return img;

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return img;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, w, h);
	try {
		ctx.drawImage(img, 0, 0);
	} catch (e) {
		return img;
	}

	let imageData;
	try {
		imageData = ctx.getImageData(0, 0, w, h);
	} catch (e) {
		return img;
	}
	const d = imageData.data;

	const isBlankAt = (idx) => {
		const i = idx * 4;
		const a = d[i + 3];
		if (a < 14) return true;
		return d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold;
	};

	const findBottomRow = () => {
		for (let y = h - 1; y >= 0; y -= 1) {
			for (let x = 0; x < w; x += 1) {
				if (!isBlankAt(y * w + x)) {
					return y;
				}
			}
		}
		return -1;
	};

	const findTopRow = () => {
		for (let y = 0; y < h; y += 1) {
			for (let x = 0; x < w; x += 1) {
				if (!isBlankAt(y * w + x)) {
					return y;
				}
			}
		}
		return -1;
	};

	if (isFirstPage) {
		const bottom = findBottomRow();
		if (bottom < 0) {
			return img;
		}
		const newH = bottom + 1;
		if (newH >= h) {
			return img;
		}
		if (newH < minContentPx) {
			return img;
		}
		const out = document.createElement('canvas');
		out.width = w;
		out.height = newH;
		const octx = out.getContext('2d');
		if (!octx) return img;
		try {
			octx.drawImage(canvas, 0, 0, w, newH, 0, 0, w, newH);
		} catch (e) {
			return img;
		}
		return out;
	}

	const top = findTopRow();
	const bottom = findBottomRow();
	if (top < 0 || bottom < 0 || bottom < top) {
		return img;
	}
	const newH = bottom - top + 1;
	if (newH < minContentPx) {
		return img;
	}
	if (top === 0 && bottom === h - 1) {
		return img;
	}
	const out = document.createElement('canvas');
	out.width = w;
	out.height = newH;
	const octx = out.getContext('2d');
	if (!octx) return img;
	try {
		octx.drawImage(canvas, 0, top, w, newH, 0, 0, w, newH);
	} catch (e) {
		return img;
	}
	return out;
}

/**
 * 裁剪图片四周近似纯白/透明边距。
 * 仅在 H5 + canvas 环境可用；失败时返回原图引用。
 */
export function trimImageWhitespace(img, options = {}) {
	if (typeof document === 'undefined' || !img) return img;
	const threshold = Number(options.threshold) >= 0 ? Number(options.threshold) : 242;
	const minContentPx = Number(options.minContentPx) >= 1 ? Number(options.minContentPx) : 24;

	const w = Number(img.naturalWidth || img.width || 0);
	const h = Number(img.naturalHeight || img.height || 0);
	if (!(w > 0 && h > 0)) return img;

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return img;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, w, h);
	try {
		ctx.drawImage(img, 0, 0);
	} catch (e) {
		return img;
	}

	let imageData;
	try {
		imageData = ctx.getImageData(0, 0, w, h);
	} catch (e) {
		return img;
	}
	const d = imageData.data;

	const isBlankAt = (idx) => {
		const i = idx * 4;
		const a = d[i + 3];
		if (a < 14) return true;
		return d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold;
	};

	let top = 0;
	let bottom = h - 1;
	let left = 0;
	let right = w - 1;

	for (let y = 0; y < h; y += 1) {
		let hit = false;
		for (let x = 0; x < w; x += 1) {
			if (!isBlankAt(y * w + x)) {
				hit = true;
				break;
			}
		}
		if (hit) {
			top = y;
			break;
		}
	}

	for (let y = h - 1; y >= top; y -= 1) {
		let hit = false;
		for (let x = 0; x < w; x += 1) {
			if (!isBlankAt(y * w + x)) {
				hit = true;
				break;
			}
		}
		if (hit) {
			bottom = y;
			break;
		}
	}

	for (let x = 0; x < w; x += 1) {
		let hit = false;
		for (let y = top; y <= bottom; y += 1) {
			if (!isBlankAt(y * w + x)) {
				hit = true;
				break;
			}
		}
		if (hit) {
			left = x;
			break;
		}
	}

	for (let x = w - 1; x >= left; x -= 1) {
		let hit = false;
		for (let y = top; y <= bottom; y += 1) {
			if (!isBlankAt(y * w + x)) {
				hit = true;
				break;
			}
		}
		if (hit) {
			right = x;
			break;
		}
	}

	const cw = right - left + 1;
	const ch = bottom - top + 1;
	if (top === 0 && bottom === h - 1 && left === 0 && right === w - 1) {
		return img;
	}
	if (cw < minContentPx || ch < minContentPx) {
		return img;
	}

	const out = document.createElement('canvas');
	out.width = cw;
	out.height = ch;
	const octx = out.getContext('2d');
	if (!octx) return img;
	try {
		octx.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
	} catch (e) {
		return img;
	}
	return out;
}

/**
 * 裁切白边后多页竖拼会变「夹紧」，跨页两行间距小于正文 1.5 倍行距；
 * 在页与页之间插入像素留白，宽度按导出画布缩放，近似恢复原稿行距节奏。
 */
export function agreementPdfPageJoinGapPx(contentWidth) {
	const w = Number(contentWidth) || 1000;
	return Math.round(Math.min(56, Math.max(20, w * 0.034)));
}
