'use strict';

/**
 * 运维：查询 hsy-push-* 表中接收的星驿推送数据（与 merchant 云函数解耦）
 * 调用方式：uniCloud.callFunction({ name: 'third-party-push-admin', data: { action, params } })
 */

const db = uniCloud.database();

const pushTradesCollection = db.collection('hsy-push-trades');
const pushMerchantsCollection = db.collection('hsy-push-merchants');
const pushTerminalsCollection = db.collection('hsy-push-terminals');
const pushCommfeesCollection = db.collection('hsy-push-commfees');

function sanitizeThirdPartyPushRaw(raw) {
	if (!raw || typeof raw !== 'object') return raw;
	try {
		const o = JSON.parse(JSON.stringify(raw));
		if (o.sign) o.sign = '[已省略]';
		if (o.apisign) o.apisign = '[已省略]';
		return o;
	} catch (e) {
		return raw;
	}
}

function stripRawFromPushRow(row) {
	if (!row || typeof row !== 'object') return row;
	const { raw, ...rest } = row;
	return rest;
}

function lightenPushRowForList(row, type) {
	let pts =
		row.push_timestamp != null && row.push_timestamp !== '' ? Number(row.push_timestamp) : null;
	if ((pts == null || Number.isNaN(pts)) && row.raw && row.raw.timestamp != null) {
		const n = Number(row.raw.timestamp);
		pts = Number.isFinite(n) ? Math.floor(n) : null;
	}
	const x = stripRawFromPushRow(row);
	if (pts != null && !Number.isNaN(pts)) {
		x.push_timestamp = pts;
	}
	if (type === 'TYY0002' && x && x.reqdata != null) {
		x.reqdata_omitted = true;
		x.reqdata_len = String(x.reqdata).length;
		delete x.reqdata;
	}
	return x;
}

async function thirdPartyPushList(data = {}) {
	const _ = db.command;
	const type = String(data.type || 'TYY0001').toUpperCase();
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
	const firstagentidKw = String(data.firstagentid || '').trim();
	const mercidKw = String(data.mercid || '').trim();
	const lognoKw = String(data.logno || '').trim();
	const termphynoKw = String(data.termphyno || '').trim();
	const termnoKw = String(data.termno || '').trim();
	const spnoKw = String(data.spno || '').trim();
	const equiptypeFilter = String(data.equiptype || '').trim();
	const allinoneFilter = String(data.allinone || '').trim();
	const refundFilter = String(data.refund || '').trim();
	const paychannelFilter = String(data.paychannel || '').trim();
	const timeStart = data.timeStart != null && data.timeStart !== '' ? Number(data.timeStart) : null;
	const timeEnd = data.timeEnd != null && data.timeEnd !== '' ? Number(data.timeEnd) : null;
	const pushTsStartMs =
		data.pushTimestampStart != null && data.pushTimestampStart !== ''
			? Number(data.pushTimestampStart)
			: null;
	const pushTsEndMs =
		data.pushTimestampEnd != null && data.pushTimestampEnd !== ''
			? Number(data.pushTimestampEnd)
			: null;

	const colMap = {
		TYY0001: pushTradesCollection,
		TYY0002: pushMerchantsCollection,
		TYY0003: pushTerminalsCollection,
		TYY0004: pushCommfeesCollection
	};
	const col = colMap[type];
	if (!col) {
		return { code: 400, message: 'type 须为 TYY0001 | TYY0002 | TYY0003 | TYY0004' };
	}

	const whereParts = [];
	if (firstagentidKw) {
		whereParts.push({
			firstagentid: new RegExp(firstagentidKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
		});
	}
	if (mercidKw) {
		whereParts.push({ mercid: new RegExp(mercidKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
	}
	if (type === 'TYY0001' && lognoKw) {
		whereParts.push({ logno: new RegExp(lognoKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
	}
	if (termphynoKw && (type === 'TYY0001' || type === 'TYY0003')) {
		whereParts.push({ termphyno: new RegExp(termphynoKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
	}
	if (type === 'TYY0003' && termnoKw) {
		whereParts.push({ termno: new RegExp(termnoKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
	}
	if (type === 'TYY0003' && spnoKw) {
		whereParts.push({ spno: new RegExp(spnoKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
	}
	if (type === 'TYY0003' && (equiptypeFilter === '1' || equiptypeFilter === '2' || equiptypeFilter === '3')) {
		whereParts.push(
			_.or([
				{ equiptype: equiptypeFilter },
				{ equiptype: Number(equiptypeFilter) }
			])
		);
	}
	if (type === 'TYY0003' && allinoneFilter === '1') {
		whereParts.push(_.or([{ allinone: '1' }, { allinone: 1 }]));
	} else if (type === 'TYY0003' && allinoneFilter === '0') {
		// allinone=1 为「是」，其余为「否」（含字段为空）
		whereParts.push(
			_.or([{ allinone: _.exists(false) }, { allinone: _.nin(['1', 1]) }])
		);
	}
	if (type === 'TYY0001' && (refundFilter === '0' || refundFilter === '1')) {
		whereParts.push({ refund: refundFilter });
	}
	if (type === 'TYY0001' && paychannelFilter) {
		const pc =
			paychannelFilter.length === 1 ? `0${paychannelFilter}` : paychannelFilter;
		whereParts.push({ paychannel: pc });
	}
	if (timeStart != null && !Number.isNaN(timeStart) && timeEnd != null && !Number.isNaN(timeEnd)) {
		whereParts.push(
			_.and([{ receive_time: _.gte(timeStart) }, { receive_time: _.lte(timeEnd) }])
		);
	} else if (timeStart != null && !Number.isNaN(timeStart)) {
		whereParts.push({ receive_time: _.gte(timeStart) });
	} else if (timeEnd != null && !Number.isNaN(timeEnd)) {
		whereParts.push({ receive_time: _.lte(timeEnd) });
	}

	/** 第三方请求体 timestamp（秒）：表头区间筛选，毫秒入参→秒级字段 push_timestamp */
	if (
		pushTsStartMs != null &&
		!Number.isNaN(pushTsStartMs) &&
		pushTsEndMs != null &&
		!Number.isNaN(pushTsEndMs)
	) {
		const s = Math.floor(pushTsStartMs / 1000);
		const e = Math.floor(pushTsEndMs / 1000);
		whereParts.push(_.and([{ push_timestamp: _.gte(s) }, { push_timestamp: _.lte(e) }]));
	} else if (pushTsStartMs != null && !Number.isNaN(pushTsStartMs)) {
		whereParts.push({ push_timestamp: _.gte(Math.floor(pushTsStartMs / 1000)) });
	} else if (pushTsEndMs != null && !Number.isNaN(pushTsEndMs)) {
		whereParts.push({ push_timestamp: _.lte(Math.floor(pushTsEndMs / 1000)) });
	}

	const where = whereParts.length === 0 ? {} : whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	try {
		const countRes = await col.where(where).count();
		const total = countRes.total || 0;
		const listRes = await col
			.where(where)
			.orderBy('receive_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (listRes.data || []).map((r) => lightenPushRowForList(r, type));
		return {
			code: 0,
			message: 'ok',
			data: { list, total, page, pageSize, type }
		};
	} catch (e) {
		console.error('thirdPartyPushList failed', e);
		return { code: 500, message: e.message || '查询失败' };
	}
}

async function thirdPartyPushDetail(data = {}) {
	const type = String(data.type || '').toUpperCase();
	const id = data.id;
	if (!id) return { code: 400, message: '缺少记录 id' };

	const colMap = {
		TYY0001: pushTradesCollection,
		TYY0002: pushMerchantsCollection,
		TYY0003: pushTerminalsCollection,
		TYY0004: pushCommfeesCollection
	};
	const col = colMap[type];
	if (!col) return { code: 400, message: 'type 无效' };

	try {
		const r = await col.doc(id).get();
		const row = r.data && r.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		const rawSafe = sanitizeThirdPartyPushRaw(row.raw);
		const base = stripRawFromPushRow(row);
		return {
			code: 0,
			message: 'ok',
			data: Object.assign({}, base, { raw: rawSafe })
		};
	} catch (e) {
		console.error('thirdPartyPushDetail failed', e);
		return { code: 500, message: e.message || '加载失败' };
	}
}

exports.main = async (event) => {
	const { action, data, params } = event || {};
	const actualData = data || params || {};

	switch (action) {
		case 'thirdPartyPushList':
			return await thirdPartyPushList(actualData);
		case 'thirdPartyPushDetail':
			return await thirdPartyPushDetail(actualData);
		default:
			return { code: 400, message: '无效的操作' };
	}
};
