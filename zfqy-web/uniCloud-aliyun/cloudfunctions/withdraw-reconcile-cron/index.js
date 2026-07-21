'use strict';

/**
 * 每天北京时间 00:00：复核「最近 30 天」内本地未到账、但微信已 SUCCESS 的提现并同步。
 * 调用 merchant.withdrawReconcileArrivalFromWx（withinDays=30）
 *
 * 不在 package.json 写 triggers；部署后请在控制台添加定时触发器 Cron：
 *   0 0 0 * * *
 * 若与 withdraw-expire-cron 同刻冲突，可改为 0 15 0 * * *
 * 建议超时 ≥ 180s
 */

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-withdraw-reconcile'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[withdraw-reconcile-cron] start', triggerHint);

	const summary = {
		rounds: 0,
		scanned: 0,
		settled: 0,
		alreadyOk: 0,
		stillPending: 0,
		failedTerminal: 0,
		notFound: 0,
		errors: []
	};

	try {
		for (let round = 0; round < 20; round += 1) {
			const ret = await callMerchant('withdrawReconcileArrivalFromWx', { limit: 25, withinDays: 30 });
			if (ret.code !== 0) {
				console.error('[withdraw-reconcile-cron] merchant error', ret);
				return { ok: false, message: ret.message || '复核失败', result: ret, summary };
			}
			const d = ret.data || {};
			summary.rounds += 1;
			summary.scanned += Number(d.scanned || 0);
			summary.settled += Number(d.settled || 0);
			summary.alreadyOk += Number(d.alreadyOk || 0);
			summary.stillPending += Number(d.stillPending || 0);
			summary.failedTerminal += Number(d.failedTerminal || 0);
			summary.notFound += Number(d.notFound || 0);
			if (Array.isArray(d.errors) && d.errors.length) {
				summary.errors.push(...d.errors.slice(0, 5));
			}
			console.log('[withdraw-reconcile-cron] round', round + 1, d);
			if (!d.hasMore) break;
			if (Number(d.settled || 0) === 0 && Number(d.scanned || 0) < 25) break;
		}
		console.log('[withdraw-reconcile-cron] done', summary);
		return { ok: true, message: 'ok', summary };
	} catch (e) {
		console.error('[withdraw-reconcile-cron] failed', e);
		return { ok: false, message: e?.message || 'cron failed', summary };
	}
};
