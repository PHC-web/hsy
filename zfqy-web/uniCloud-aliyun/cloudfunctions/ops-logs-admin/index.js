'use strict';

/**
 * 运维：汇总查询系统内多类日志（只读）
 * hsy-operation-logs / hsy-push-logs / hsy-robot-push-logs / hsy-transfer-logs（资金流水）
 */

const db = uniCloud.database();
const operationLogCollection = db.collection('hsy-operation-logs');
const pushLogCollection = db.collection('hsy-push-logs');
const robotLogCollection = db.collection('hsy-robot-push-logs');
const transferLogCollection = db.collection('hsy-transfer-logs');

/** 提现链路 stage（与 merchant.writeTransferLog 约定一致） */
const WITHDRAW_FLOW_STAGES = [
	'withdraw_apply_create',
	'withdraw_auto_transfer_request',
	'withdraw_auto_transfer_error',
	'withdraw_auto_transfer_query',
	'approve_click',
	'approve_precheck',
	'approve_transfer_create',
	'approve_query',
	'approve_processing',
	'approve_failed',
	'auto_poll_query',
	'auto_poll_error',
	'h5_confirm_package_query_error',
	'h5_confirm_package_ready',
	'transfer_notify_received',
	'transfer_notify_verify_fail',
	'transfer_notify_error',
	'withdraw_arrival_settled'
];
const WITHDRAW_STAGES_EXCEPT_NOTIFY = WITHDRAW_FLOW_STAGES.filter((s) => s !== 'transfer_notify_received');

/** 退款链路 stage */
const REFUND_FLOW_STAGES = [
	'refund_auto_poll_query',
	'refund_auto_poll_error',
	'refund_admin_force_fail',
	'refund_admin_approve',
	'refund_admin_fix_rejected_processing',
	'refund_admin_revoke_approve_dev',
	'h5_refund_confirm_query_error',
	'refund_wx_pay_refund_notify',
	'refund_merchant_transfer_slice'
];

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function escapeReg(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 前端 uni-datetime-picker 等可能传「秒」或「毫秒」；业务库 create_time 等为毫秒。
 * 将 < 1e11 的数值视为秒并 *1000，避免 lte 上界过小导致列表几乎为空。
 */
function normalizeUnixTimeParam(v) {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return null;
	if (n < 1e11) return Math.round(n * 1000);
	return Math.round(n);
}

function buildTimeRangeWhere(field, timeStart, timeEnd, _) {
	const ts = normalizeUnixTimeParam(timeStart);
	const te = normalizeUnixTimeParam(timeEnd);
	if (ts != null && te != null) {
		return _.and([{ [field]: _.gte(ts) }, { [field]: _.lte(te) }]);
	}
	if (ts != null) {
		return { [field]: _.gte(ts) };
	}
	if (te != null) {
		return { [field]: _.lte(te) };
	}
	return null;
}

/** 资金流水表：按 create_time 或 create_date（与写入保持一致）做时间范围，避免只命中一半字段导致列表为空 */
function buildTransferLogTimeWhere(timeStart, timeEnd, _) {
	const ts = normalizeUnixTimeParam(timeStart);
	const te = normalizeUnixTimeParam(timeEnd);
	const onField = (field) => {
		if (ts != null && te != null) {
			return _.and([{ [field]: _.gte(ts) }, { [field]: _.lte(te) }]);
		}
		if (ts != null) return { [field]: _.gte(ts) };
		if (te != null) return { [field]: _.lte(te) };
		return null;
	};
	const wTime = onField('create_time');
	const wDate = onField('create_date');
	if (!wTime && !wDate) return null;
	if (wTime && wDate) return _.or([wTime, wDate]);
	return wTime || wDate;
}

/** 列表行：机器人推送 webhook 脱敏 */
function maskWebhook(w) {
	const s = String(w || '').trim();
	if (!s) return '';
	if (s.length <= 24) return s.slice(0, 6) + '…';
	return s.slice(0, 12) + '…' + s.slice(-6);
}

async function opsLogsList(data = {}) {
	const _ = db.command;
	const source = safeText(data.source, 24) || 'operation';
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;

	let col;
	let timeField;
	const whereParts = [];

	if (source === 'operation') {
		col = operationLogCollection;
		timeField = 'create_time';
		whereParts.push(_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }]));
		if (keyword) {
			const r = new RegExp(escapeReg(keyword), 'i');
			whereParts.push(
				_.or([
					{ content: r },
					{ module: r },
					{ action: r },
					{ user_name: r },
					{ target_id: r },
					{ target_name: r },
					{ operator_source: r }
				])
			);
		}
	} else if (source === 'push') {
		col = pushLogCollection;
		timeField = 'receive_time';
		if (keyword) {
			const r = new RegExp(escapeReg(keyword), 'i');
			whereParts.push(
				_.or([
					{ push_type: r },
					{ summary: r },
					{ firstagentid: r },
					{ data_id: r },
					{ error_msg: r }
				])
			);
		}
	} else if (source === 'robot') {
		col = robotLogCollection;
		timeField = 'create_time';
		whereParts.push(_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }]));
		if (keyword) {
			const r = new RegExp(escapeReg(keyword), 'i');
			whereParts.push(
				_.or([{ channel: r }, { content: r }, { errmsg: r }, { webhook: r }])
			);
		}
	} else {
		return { code: 400, message: 'source 须为 operation | push | robot' };
	}

	const tr = buildTimeRangeWhere(timeField, timeStart, timeEnd, _);
	if (tr) whereParts.push(tr);

	const where = whereParts.length === 0 ? {} : whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	try {
		const countRes = await col.where(where).count();
		const total = Number(countRes.total || 0);
		const listRes = await col
			.where(where)
			.orderBy(timeField, 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const raw = listRes.data || [];
		const list = raw.map((row) => {
			if (source === 'operation') {
				return {
					_id: row._id,
					source: 'operation',
					time: row.create_time,
					userName: row.user_name || '',
					userId: row.user_id || '',
					module: row.module || '',
					action: row.action || '',
					targetId: row.target_id || '',
					targetName: row.target_name || '',
					content: row.content || '',
					operatorSource: row.operator_source || '',
					ip: row.ip || '',
					reason: row.reason || ''
				};
			}
			if (source === 'push') {
				return {
					_id: row._id,
					source: 'push',
					time: row.receive_time,
					pushType: row.push_type || '',
					success: !!row.success,
					summary: row.summary || '',
					firstagentid: row.firstagentid || '',
					dataId: row.data_id || '',
					errorMsg: row.error_msg || ''
				};
			}
			return {
				_id: row._id,
				source: 'robot',
				time: row.create_time,
				channel: row.channel || '',
				webhookMasked: maskWebhook(row.webhook),
				contentPreview: safeText(row.content, 200),
				success: !!row.success,
				errmsg: row.errmsg || ''
			};
		});
		return {
			code: 0,
			message: 'ok',
			data: { list, total, page, pageSize, source }
		};
	} catch (e) {
		console.error('opsLogsList failed', e);
		return { code: 500, message: e.message || '查询失败' };
	}
}

async function opsLogsDetail(data = {}) {
	const source = safeText(data.source, 24);
	const id = safeText(data.id, 80);
	if (!id) return { code: 400, message: '缺少 id' };
	if (!['operation', 'push', 'robot'].includes(source)) {
		return { code: 400, message: 'source 无效' };
	}
	try {
		let col;
		if (source === 'operation') col = operationLogCollection;
		else if (source === 'push') col = pushLogCollection;
		else col = robotLogCollection;
		const r = await col.doc(id).get();
		const row = r.data && r.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		if (source === 'robot' && row.webhook) {
			row.webhook_display = maskWebhook(row.webhook);
		}
		return { code: 0, message: 'ok', data: { source, row } };
	} catch (e) {
		console.error('opsLogsDetail failed', e);
		return { code: 500, message: e.message || '加载失败' };
	}
}

/** 运维：充值 / 退款 / 提现 资金流水日志（hsy-transfer-logs，只读） */
async function opsFinanceFlowList(data = {}) {
	const _ = db.command;
	const flowType = safeText(data.flowType, 16) || 'recharge';
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;

	const whereParts = [{ is_deleted: _.neq(true) }];
	const tr = buildTransferLogTimeWhere(timeStart, timeEnd, _);
	if (tr) whereParts.push(tr);

	if (flowType === 'recharge') {
		// 仅用 scene，避免 _.or + RegExp 在部分运行环境下表现异常；与 merchant.writeTransferLog 约定一致
		whereParts.push({ scene: 'recharge' });
	} else if (flowType === 'refund') {
		whereParts.push(
			_.or([
				{ scene: 'refund' },
				{ stage: _.in(REFUND_FLOW_STAGES) },
				_.and([{ stage: 'transfer_notify_received' }, { scene: 'refund' }])
			])
		);
	} else if (flowType === 'withdraw') {
		whereParts.push(
			_.or([
				{ stage: _.in(WITHDRAW_STAGES_EXCEPT_NOTIFY) },
				_.and([{ stage: 'transfer_notify_received' }, { scene: _.neq('refund') }])
			])
		);
		whereParts.push({ scene: _.neq('recharge') });
		whereParts.push({ scene: _.neq('refund') });
	} else {
		return { code: 400, message: 'flowType 须为 recharge | refund | withdraw' };
	}

	if (keyword) {
		const r = new RegExp(escapeReg(keyword), 'i');
		whereParts.push(
			_.or([
				{ message: r },
				{ stage: r },
				{ withdraw_no: r },
				{ merchant_user_id: r },
				{ out_bill_no: r },
				{ log_no: r }
			])
		);
	}

	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	try {
		const countRes = await transferLogCollection.where(where).count();
		const total = Number(countRes.total || 0);
		const listRes = await transferLogCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const raw = listRes.data || [];
		const list = raw.map((row) => ({
			_id: row._id,
			time: row.create_time,
			scene: row.scene || 'withdraw',
			stage: row.stage || '',
			level: row.level || 'info',
			withdrawNo: row.withdraw_no || '',
			outBillNo: row.out_bill_no || '',
			merchantUserId: row.merchant_user_id || '',
			transferState: row.transfer_state || '',
			message: row.message || '',
			logNo: row.log_no || ''
		}));
		return {
			code: 0,
			message: 'ok',
			data: { list, total, page, pageSize, flowType }
		};
	} catch (e) {
		console.error('opsFinanceFlowList failed', e);
		return { code: 500, message: e.message || '查询失败' };
	}
}

async function opsFinanceFlowDetail(data = {}) {
	const id = safeText(data.id, 80);
	if (!id) return { code: 400, message: '缺少 id' };
	try {
		const r = await transferLogCollection.doc(id).get();
		const row = r.data && r.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		return { code: 0, message: 'ok', data: { row } };
	} catch (e) {
		console.error('opsFinanceFlowDetail failed', e);
		return { code: 500, message: e.message || '加载失败' };
	}
}

exports.main = async (event) => {
	const { action, params, data } = event || {};
	const actualData = data || params || {};
	switch (action) {
		case 'opsLogsList':
			return await opsLogsList(actualData);
		case 'opsLogsDetail':
			return await opsLogsDetail(actualData);
		case 'opsFinanceFlowList':
			return await opsFinanceFlowList(actualData);
		case 'opsFinanceFlowDetail':
			return await opsFinanceFlowDetail(actualData);
		default:
			return { code: 400, message: '无效操作' };
	}
};
