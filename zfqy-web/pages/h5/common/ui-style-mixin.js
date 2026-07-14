/**
 * H5 页面 mixin：进入/展示时套用缓存主题，并从接口结果同步风格
 */
import { applyH5UiStyle, getCachedH5UiStyle, syncH5UiStyleFromPayload } from '@/pages/h5/common/ui-style';
import { h5UiStyleGet } from '@/pages/h5/common/api';

let _fetchingUiStyle = false;
let _lastFetchAt = 0;

async function refreshUiStyleFromServer(force = false) {
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

export default {
	onLoad() {
		applyH5UiStyle(getCachedH5UiStyle());
	},
	onShow() {
		applyH5UiStyle(getCachedH5UiStyle());
		refreshUiStyleFromServer(false);
	},
	methods: {
		applyH5UiStyleFromApiData(data) {
			return syncH5UiStyleFromPayload(data || {});
		}
	}
};
