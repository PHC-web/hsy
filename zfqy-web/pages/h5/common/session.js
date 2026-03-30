const KEY = 'h5_merchant_session_v1';

export function getSession() {
	return uni.getStorageSync(KEY) || {};
}

export function saveSession(payload) {
	const old = getSession();
	const next = Object.assign({}, old, payload || {});
	uni.setStorageSync(KEY, next);
	return next;
}

export function clearSession() {
	uni.removeStorageSync(KEY);
}

