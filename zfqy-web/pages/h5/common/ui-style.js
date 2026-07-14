/**
 * H5 UI 风格：A=紫色深色（默认），B=明亮亮色
 * 管理后台「参数配置」字段 h5UiStyle 可切换
 */
const STORAGE_KEY = 'h5_ui_style_v1';

export function normalizeH5UiStyle(value) {
	return String(value || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A';
}

export function getCachedH5UiStyle() {
	try {
		return normalizeH5UiStyle(uni.getStorageSync(STORAGE_KEY) || 'A');
	} catch (e) {
		return 'A';
	}
}

export function applyH5UiStyle(value) {
	const style = normalizeH5UiStyle(value);
	try {
		uni.setStorageSync(STORAGE_KEY, style);
	} catch (e) {}
	// #ifdef H5
	if (typeof document !== 'undefined') {
		const clsA = 'h5-ui-a';
		const clsB = 'h5-ui-b';
		const next = style === 'B' ? clsB : clsA;
		[document.documentElement, document.body].forEach((el) => {
			if (!el || !el.classList) return;
			el.classList.remove(clsA, clsB);
			el.classList.add(next);
		});
		document.documentElement.style.backgroundColor = style === 'B' ? '#f0f9ff' : '#070b14';
		if (document.body) {
			document.body.style.backgroundColor = style === 'B' ? '#f0f9ff' : '#070b14';
		}
	}
	// #endif
	return style;
}

export function syncH5UiStyleFromPayload(payload) {
	if (!payload || typeof payload !== 'object') return getCachedH5UiStyle();
	const raw = payload.h5UiStyle != null ? payload.h5UiStyle : payload.uiStyle;
	if (raw == null || raw === '') return getCachedH5UiStyle();
	return applyH5UiStyle(raw);
}
