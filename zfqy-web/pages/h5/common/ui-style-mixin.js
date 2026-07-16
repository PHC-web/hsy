/**
 * H5 页面 mixin：仅商户 H5 套用主题；后台页面主动清除，避免白字污染菜单
 */
import {
	applyH5UiStyle,
	clearH5UiStyle,
	getCachedH5UiStyle,
	isH5MerchantUiContext,
	syncH5UiStyleFromPayload
} from '@/pages/h5/common/ui-style';
import { h5UiStyleGet } from '@/pages/h5/common/api';

let _fetchingUiStyle = false;
let _lastFetchAt = 0;

async function refreshUiStyleFromServer(force = false) {
	if (!isH5MerchantUiContext()) return;
	const now = Date.now();
	if (!force && now - _lastFetchAt < 30 * 1000) return;
	if (_fetchingUiStyle) return;
	_fetchingUiStyle = true;
	try {
		const res = await h5UiStyleGet();
		_lastFetchAt = Date.now();
		if (res && res.code === 0) {
			syncH5UiStyleFromPayload(res.data || {});
		}
	} catch (e) {
		// ignore
	} finally {
		_fetchingUiStyle = false;
	}
}

function syncPageUiStyle() {
	if (isH5MerchantUiContext()) {
		applyH5UiStyle(getCachedH5UiStyle());
	} else {
		clearH5UiStyle();
	}
}

export default {
	onLoad() {
		syncPageUiStyle();
	},
	onShow() {
		syncPageUiStyle();
		refreshUiStyleFromServer(false);
	},
	methods: {
		applyH5UiStyleFromApiData(data) {
			if (!isH5MerchantUiContext()) return getCachedH5UiStyle();
			return syncH5UiStyleFromPayload(data || {});
		}
	}
};
