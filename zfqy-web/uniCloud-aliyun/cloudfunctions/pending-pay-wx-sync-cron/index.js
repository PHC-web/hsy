'use strict';

/**
 * 调用 merchant.adminSyncPendingRechargeFromWx：近 7 天 status=0 的微信支付订单向微信查单并补写订单、同步额度（与商户列表「更新会员状态」同源）。
 *
 * 不在 package.json 配置 triggers，避免阿里云 InvalidTimingTriggerConfig 导致上传失败。
 * 部署后请在 uniCloud 控制台为本云函数添加「定时触发器」，周期见项目说明或对话记录。
 */

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-pending-pay-wx-sync'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[pending-pay-wx-sync-cron] start', triggerHint);

	try {
		const ret = await callMerchant('adminSyncPendingRechargeFromWx', {});
		if (ret.code !== 0) {
			console.error('[pending-pay-wx-sync-cron] merchant returned error', ret);
			return { ok: false, message: ret.message || '查单同步失败', result: ret };
		}
		const d = ret.data || {};
		console.log('[pending-pay-wx-sync-cron] done', {
			scanned: d.scanned,
			synced: d.synced,
			stillPending: d.stillPending,
			errors: d.errors,
			truncated: d.truncated,
			limit: d.limit
		});
		return { ok: true, data: d };
	} catch (e) {
		console.error('[pending-pay-wx-sync-cron] error', e);
		return { ok: false, message: e.message || String(e) };
	}
};
