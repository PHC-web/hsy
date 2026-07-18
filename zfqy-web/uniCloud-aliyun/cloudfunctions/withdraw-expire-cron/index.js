'use strict';

/**
 * 每天北京时间 00:00 自动撤回「未打款」提现：标记为已失效，并返还积分与提现额度。
 * 调用 merchant.withdrawAutoExpireUnpaid（与管理员拒绝返还同一口径）。
 *
 * 不在 package.json 写 triggers，避免上传报错；部署后请在 uniCloud 控制台添加定时触发器：
 * 类型：定时触发器，Cron：0 0 0 * * *（每天 00:00:00，服务端按时区为北京时间）
 * 超时建议：120s～300s；若未打款单很多，可依赖 hasMore 多轮（也可把 Cron 设为 0 0/5 0 * * * 仅在 0 点附近多扫几次）。
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
		errors: []
	};

	try {
		// 多轮处理，避免单次 limit 扫不完
		for (let round = 0; round < 20; round += 1) {
			const ret = await callMerchant('withdrawAutoExpireUnpaid', { limit: 100 });
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
			if (Array.isArray(d.errors) && d.errors.length) {
				summary.errors.push(...d.errors.slice(0, 5));
			}
			console.log('[withdraw-expire-cron] round', round + 1, d);
			if (!d.hasMore || Number(d.expired || 0) + Number(d.skipped || 0) + Number(d.failed || 0) === 0) {
				break;
			}
			// 本轮全是 skip（微信处理中）且 hasMore，继续扫下一批
			if (Number(d.expired || 0) === 0 && Number(d.scanned || 0) < 100) {
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
