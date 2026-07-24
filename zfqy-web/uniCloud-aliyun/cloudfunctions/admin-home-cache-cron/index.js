'use strict';

/**
 * 管理端首页统计 Redis 预热。
 * 建议定时触发器（阿里云控制台粘贴）：
 *   ["cron:0 */3 * * * *"]
 * 超时建议 ≥ 300s
 *
 * 写入 merchant：preview / summary / trend:{today,week,month,30d}
 */

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
		trends: {}
	};

	try {
		const base = await callMerchant('adminHomeCacheRefresh', {
			parts: ['preview', 'summary']
		});
		if (!base || base.code !== 0) {
			return {
				code: (base && base.code) || 500,
				message: (base && base.message) || '预览/汇总刷新失败',
				data: summary
			};
		}
		summary.preview = !!(base.data && base.data.preview);
		summary.summary = !!(base.data && base.data.summary);

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
		return {
			code: summary.preview && summary.summary && allTrendOk ? 0 : 207,
			message: allTrendOk ? 'ok' : 'partial',
			data: summary
		};
	} catch (e) {
		console.error('[admin-home-cache-cron] failed', e);
		return { code: 500, message: e?.message || '首页缓存定时刷新失败', data: summary };
	}
};
