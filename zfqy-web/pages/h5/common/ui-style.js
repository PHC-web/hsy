/**
 * H5 UI 风格：A=紫色深色（默认），B=明亮亮色
 * 管理后台「参数配置」字段 h5UiStyle 可切换
 * 注意：仅作用于商户 H5，不可污染 /admin 后台
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

/** 是否当前处于商户 H5（非管理后台） */
export function isH5MerchantUiContext() {
	// #ifdef H5
	try {
		if (typeof window !== 'undefined') {
			const pathname = (window.location && window.location.pathname) || '/';
			if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
		}
		const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
		const cur = pages.length ? pages[pages.length - 1] : null;
		const route = String((cur && (cur.route || (cur.$page && cur.$page.fullPath))) || '');
		if (route.indexOf('pages/h5/') !== -1) return true;
		if (typeof window !== 'undefined') {
			const hash = (window.location && window.location.hash) || '';
			if (hash.indexOf('/pages/h5/') !== -1) return true;
		}
		return false;
	} catch (e) {
		return false;
	}
	// #endif
	// #ifndef H5
	return false;
	// #endif
}

/** 清除 html/body 上的 H5 主题 class，避免误伤后台 */
export function clearH5UiStyle() {
	// #ifdef H5
	if (typeof document === 'undefined') return;
	[document.documentElement, document.body].forEach((el) => {
		if (!el || !el.classList) return;
		el.classList.remove('h5-ui-a', 'h5-ui-b');
	});
	try {
		document.documentElement.style.backgroundColor = '';
		if (document.body) document.body.style.backgroundColor = '';
	} catch (e) {}
	// #endif
}

export function applyH5UiStyle(value) {
	const style = normalizeH5UiStyle(value);
	try {
		uni.setStorageSync(STORAGE_KEY, style);
	} catch (e) {}
	// #ifdef H5
	if (typeof document !== 'undefined') {
		// 后台入口绝不挂载 h5-ui-*，防止菜单/标题被染成白色
		if (!isH5MerchantUiContext()) {
			clearH5UiStyle();
			return style;
		}
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
