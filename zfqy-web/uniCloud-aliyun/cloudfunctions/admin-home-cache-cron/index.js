'use strict';

// 管理端首页统计 Redis 预热。
// 阿里云定时触发器（控制台粘贴整段）：["cron:0 */3 * * * *"]
// 超时建议 ≥ 300s；写入 merchant：preview / summary / withdrawTop / pendingFrozen / trend

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-admin-home-cache'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[admin-home-cache-cron] start', triggerHint);

	const summary = {
		preview: false,
		summary: false,
		withdrawTop: false,
		pendingFrozen: false,
		trends: {}
	};

	try {
		const base = await callMerchant('adminHomeCacheRefresh', {
			parts: ['preview', 'summary', 'withdrawTop', 'pendingFrozen']
		});
		if (!base || base.code !== 0) {
			return {
				code: (base && base.code) || 500,
				message: (base && base.message) || '预览/汇总/提现TOP/待提现冻结刷新失败',
				data: summary
			};
		}
		summary.preview = !!(base.data && base.data.preview);
		summary.summary = !!(base.data && base.data.summary);
		summary.withdrawTop = !!(base.data && base.data.withdrawTop);
		summary.pendingFrozen = !!(base.data && base.data.pendingFrozen);

		const rangeTypes = ['today', 'week', 'month', '30d'];
		for (const rangeType of rangeTypes) {
			const tr = await callMerchant('adminHomeCacheRefresh', {
				parts: ['trend'],
				rangeTypes: [rangeType]
			});
			const ok = !!(tr && tr.code === 0 && tr.data && tr.data.trends && tr.data.trends[rangeType]);
			summary.trends[rangeType] = ok;
			if (!ok) {
				console.error('[admin-home-cache-cron] trend fail', rangeType, tr && tr.message);
			}
		}

		const allTrendOk = rangeTypes.every((t) => summary.trends[t]);
		const ok =
			summary.preview &&
			summary.summary &&
			summary.withdrawTop &&
			summary.pendingFrozen &&
			allTrendOk;
		return {
			code: ok ? 0 : 207,
			message: ok ? 'ok' : 'partial',
			data: summary
		};
	} catch (e) {
		console.error('[admin-home-cache-cron] failed', e);
		return { code: 500, message: e?.message || '首页缓存定时刷新失败', data: summary };
	}
};
