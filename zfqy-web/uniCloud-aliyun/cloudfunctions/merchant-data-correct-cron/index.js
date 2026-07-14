'use strict';

/**
 * 定时执行与后台「商户列表 - 数据矫正」相同的批处理：调用 merchant 云函数的
 * merchantDataCorrectStart + merchantDataCorrectStatus 直至完成。
 * 触发：每天 00:00:00（北京时间）。package.json 须带 `cron:` 前缀（见 uniCloud 阿里云说明），如 cron:0 0 0 * * *。
 *
 * 部署后请在 uniCloud 控制台确认该云函数已关联定时触发器，且超时时间建议 600s。
 */

const db = uniCloud.database();
const dataCorrectTaskCollection = db.collection('hsy-data-correct-tasks');

/** 与商户列表页「数据矫正」请求一致，降低单次 chunk 触发 merchant 超时的概率 */
const CHUNK_SIZE = 120;
const MAX_STEPS = 5000;

async function callMerchant(action, data = {}) {
	const res = await uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			data,
			uid: 'cron-merchant-data-correct'
		}
	});
	return res.result || res;
}

exports.main = async (event) => {
	const triggerHint = event?.Time || event?.triggerTime || event?.triggerName || 'manual';
	console.log('[merchant-data-correct-cron] start', triggerHint);

	try {
		const due = await callMerchant('applyDueRefundClawbackTasks', { limit: 200 });
		console.log('[merchant-data-correct-cron] refund clawback due', due.data || due);
	} catch (e) {
		console.error('[merchant-data-correct-cron] refund clawback due failed', e);
	}

	let taskId = '';

	try {
		const runningRes = await dataCorrectTaskCollection
			.where({ status: 'running' })
			.orderBy('create_time', 'desc')
			.limit(1)
			.get();
		const runningRow = runningRes.data && runningRes.data[0];
		if (runningRow && runningRow._id) {
			taskId = String(runningRow._id);
			console.log('[merchant-data-correct-cron] resume task', taskId);
		} else {
			const start = await callMerchant('merchantDataCorrectStart', {});
			if (start.code !== 0) {
				console.error('[merchant-data-correct-cron] merchantDataCorrectStart failed', start);
				return { ok: false, step: 'start', message: start.message || '启动失败' };
			}
			taskId = String(start.data?.taskId || '').trim();
			if (!taskId) {
				console.error('[merchant-data-correct-cron] empty taskId');
				return { ok: false, step: 'start', message: '任务ID为空' };
			}
			console.log('[merchant-data-correct-cron] new task', taskId, 'total', start.data?.total);
		}

		for (let step = 0; step < MAX_STEPS; step += 1) {
			const st = await callMerchant('merchantDataCorrectStatus', {
				taskId,
				chunkSize: CHUNK_SIZE
			});
			if (st.code !== 0) {
				console.error('[merchant-data-correct-cron] merchantDataCorrectStatus failed', st);
				return { ok: false, step: 'status', taskId, message: st.message || '执行失败' };
			}
			const d = st.data || {};
			const status = String(d.status || '');
			if (status === 'done' || status === 'failed') {
				console.log('[merchant-data-correct-cron] finished', status, {
					scanned: d.scanned,
					correctedFrozen: d.correctedFrozen,
					correctedWithdrawn: d.correctedWithdrawn,
					correctedMerchantBase: d.correctedMerchantBase
				});
				return {
					ok: status === 'done',
					taskId,
					status,
					data: d
				};
			}
		}

		console.error('[merchant-data-correct-cron] exceeded MAX_STEPS', MAX_STEPS);
		return {
			ok: false,
			taskId,
			message: `未在 ${MAX_STEPS} 步内完成，任务可能仍在 running，请稍后人工查看或次日继续`
		};
	} catch (e) {
		console.error('[merchant-data-correct-cron] error', e);
		return { ok: false, message: e.message || String(e) };
	}
};
