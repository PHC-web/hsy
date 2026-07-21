'use strict';

/**
 * 日间轮询：把微信已 SUCCESS 的提现及时同步为本地已到账（含无需审核、待确认收款后已成功）。
 * 避免只依赖零点任务补记，导致到账时间都落在 00:00。
 *
 * 调用 merchant.withdrawSyncProcessing
 *
 * 不在 package.json 写 triggers；部署后请在控制台添加定时触发器，建议：
 *   0 0/5 * * * *   （每 5 分钟）
 * 超时建议 ≥ 120s
 */

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-withdraw-sync'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[withdraw-sync-cron] start', triggerHint);

	const summary = {
		rounds: 0,
		total: 0,
		success: 0,
		failed: 0,
		processing: 0,
		reconciled: 0
	};

	try {
		for (let round = 0; round < 5; round += 1) {
			const ret = await callMerchant('withdrawSyncProcessing', { limit: 30 });
			if (ret.code !== 0) {
				console.error('[withdraw-sync-cron] merchant error', ret);
				return { ok: false, message: ret.message || '同步失败', result: ret, summary };
			}
			const d = ret.data || {};
			summary.rounds += 1;
			summary.total += Number(d.total || 0);
			summary.success += Number(d.success || 0);
			summary.failed += Number(d.failed || 0);
			summary.processing += Number(d.processing || 0);
			summary.reconciled += Number(d.reconciled || 0);
			console.log('[withdraw-sync-cron] round', round + 1, d);
			if (Number(d.total || 0) < 30) break;
			if (Number(d.success || 0) === 0 && Number(d.failed || 0) === 0) break;
		}
		console.log('[withdraw-sync-cron] done', summary);
		return { ok: true, message: 'ok', summary };
	} catch (e) {
		console.error('[withdraw-sync-cron] failed', e);
		return { ok: false, message: e?.message || 'cron failed', summary };
	}
};
