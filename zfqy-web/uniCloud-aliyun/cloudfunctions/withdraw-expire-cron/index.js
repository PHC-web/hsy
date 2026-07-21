'use strict';

/**
 * 每天北京时间 00:00 自动撤回「未打款」提现：
 * - 无微信处理中：直接已失效并返还积分
 * - 微信处理中（ACCEPTED/PROCESSING/WAIT_USER_CONFIRM）：先调撤销 → 查单确认 CANCELLED/FAIL 后再返还
 * - 若查单已 SUCCESS：按到账结算（不返还）
 * - 待审核（pending / PENDING_AUDIT）不失效，保持待审核
 *
 * 调用 merchant.withdrawAutoExpireUnpaid
 *
 * 不在 package.json 写 triggers；部署后请在控制台添加定时触发器 Cron：0 0 0 * * *
 * 建议超时 300s；0 点后若仍有 cancelPending，可加 0 5 0 * * * / 0 10 0 * * * 再扫两轮。
 */

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-withdraw-expire'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[withdraw-expire-cron] start', triggerHint);

	const summary = {
		rounds: 0,
		scanned: 0,
		expired: 0,
		skipped: 0,
		failed: 0,
		cancelRequested: 0,
		cancelPending: 0,
		settled: 0,
		errors: []
	};

	try {
		// 单轮 limit 不宜过大：含微信撤销短轮询，避免云函数超时
		for (let round = 0; round < 30; round += 1) {
			const ret = await callMerchant('withdrawAutoExpireUnpaid', { limit: 20 });
			if (ret.code !== 0) {
				console.error('[withdraw-expire-cron] merchant error', ret);
				return { ok: false, message: ret.message || '自动失效失败', result: ret, summary };
			}
			const d = ret.data || {};
			summary.rounds += 1;
			summary.scanned += Number(d.scanned || 0);
			summary.expired += Number(d.expired || 0);
			summary.skipped += Number(d.skipped || 0);
			summary.failed += Number(d.failed || 0);
			summary.cancelRequested += Number(d.cancelRequested || 0);
			summary.cancelPending += Number(d.cancelPending || 0);
			summary.settled += Number(d.settled || 0);
			if (Array.isArray(d.errors) && d.errors.length) {
				summary.errors.push(...d.errors.slice(0, 5));
			}
			console.log('[withdraw-expire-cron] round', round + 1, d);
			if (!d.hasMore) break;
			if (
				Number(d.expired || 0) === 0 &&
				Number(d.cancelPending || 0) === 0 &&
				Number(d.settled || 0) === 0 &&
				Number(d.failed || 0) === 0
			) {
				break;
			}
		}
		console.log('[withdraw-expire-cron] done', summary);
		return { ok: true, message: 'ok', summary };
	} catch (e) {
		console.error('[withdraw-expire-cron] failed', e);
		return { ok: false, message: e?.message || 'cron failed', summary };
	}
};
