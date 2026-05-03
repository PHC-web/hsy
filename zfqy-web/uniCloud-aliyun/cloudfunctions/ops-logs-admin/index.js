'use strict';

/**
 * 运维：汇总查询系统内多类日志（只读）
 * hsy-operation-logs / hsy-push-logs / hsy-robot-push-logs
 */

const db = uniCloud.database();
const operationLogCollection = db.collection('hsy-operation-logs');
const pushLogCollection = db.collection('hsy-push-logs');
const robotLogCollection = db.collection('hsy-robot-push-logs');

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function escapeReg(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTimeRangeWhere(field, timeStart, timeEnd, _) {
	if (
		timeStart != null &&
		!Number.isNaN(Number(timeStart)) &&
		timeEnd != null &&
		!Number.isNaN(Number(timeEnd))
	) {
		return _.and([{ [field]: _.gte(Number(timeStart)) }, { [field]: _.lte(Number(timeEnd)) }]);
	}
	if (timeStart != null && !Number.isNaN(Number(timeStart))) {
		return { [field]: _.gte(Number(timeStart)) };
	}
	if (timeEnd != null && !Number.isNaN(Number(timeEnd))) {
		return { [field]: _.lte(Number(timeEnd)) };
	}
	return null;
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

exports.main = async (event) => {
	const { action, params, data } = event || {};
	const actualData = data || params || {};
	switch (action) {
		case 'opsLogsList':
			return await opsLogsList(actualData);
		case 'opsLogsDetail':
			return await opsLogsDetail(actualData);
		default:
			return { code: 400, message: '无效操作' };
	}
};
