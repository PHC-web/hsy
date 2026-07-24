/**
 * 积分优化定时任务：按 _id 游标分批续跑登录周优化
 * 建议云函数定时触发：每天 01:30
 * 总开关关闭时直接返回，不改数据
 * 每轮 chunkSize=15；admin 侧只查闲置≥7天商户
 */
'use strict';

exports.main = async () => {
	let batchId = '';
	let guard = 0;
	const summary = { scanned: 0, upgraded: 0, skippedWhitelist: 0, cutTotal: 0, rounds: 0 };
	for (;;) {
		guard += 1;
		if (guard > 2000) break;
		const res = await uniCloud.callFunction({
			name: 'points-optimize-admin',
			data: {
				action: 'pointsOptimizeLoginRun',
				params: {
					batchId: batchId || undefined,
					chunkSize: 15
				}
			}
		});
		const body = (res && res.result) || {};
		if (body.code !== 0) {
			return { code: body.code || 500, message: body.message || '优化任务失败', data: summary };
		}
		const d = body.data || {};
		if (d.skipped && d.enabled === false) {
			return { code: 0, message: '总开关已关闭', data: d };
		}
		batchId = d.batchId || batchId;
		summary.scanned = d.scanned || summary.scanned;
		summary.upgraded = d.upgraded || summary.upgraded;
		summary.skippedWhitelist = d.skippedWhitelist || summary.skippedWhitelist;
		summary.cutTotal = d.cutTotal || summary.cutTotal;
		summary.rounds += 1;
		if (d.done) break;
	}
	return { code: 0, message: 'ok', data: { batchId, ...summary } };
};
