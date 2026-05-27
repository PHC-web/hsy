'use strict';

/**
 * 运维：查询 H5 为商户生成的积分红包记录（hsy-income-packets），只读。
 */

const db = uniCloud.database();
const _ = db.command;
const incomePacketCollection = db.collection('hsy-income-packets');
const merchantCollection = db.collection('hsy-merchant-users');
const operationLogCollection = db.collection('hsy-operation-logs');

const MEMBER_UPGRADE_POINTS_CLEAR_ACTION = 'member_upgrade_points_clear';

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function escapeReg(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTimeRangeWhere(field, timeStart, timeEnd) {
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

function subsidyKindLabel(k) {
	const map = {
		recharge_vesting: '充值用户分期',
		non_recharge_lump: '非充值5万档',
		non_recharge_extra: '非充值每满1万',
		coupon_reward: '优惠券达标奖励',
		release_pool_history: '历史池分期返还'
	};
	const key = safeText(k, 48);
	return map[key] || key || '-';
}

function displayStatus(row, nowTs) {
	if (row.status === 'claimed') return { key: 'claimed', label: '已领取' };
	if (row.status === 'expired') return { key: 'expired', label: '过期未领取' };
	if (row.status === 'pending') {
		if (row.expire_time && row.expire_time < nowTs) return { key: 'expired', label: '过期未领取' };
		if (!Number(row.claim_open_time || 0)) return { key: 'pending_locked', label: '待开放' };
		if (row.claim_open_time > nowTs) return { key: 'pending_locked', label: '未到领取时间' };
		if (Number(row.amount || 0) < 0.01) return { key: 'empty', label: '无效金额' };
		return { key: 'pending_ready', label: '待领取' };
	}
	return { key: 'other', label: row.status || '-' };
}

async function opsIncomePacketsList(data = {}) {
	const page = Math.max(1, Number(data.page) || 1);
	// 与 uniCloud 单次 get 上限一致；须与前端 uni-pagination 可选条数对齐，避免 UI 按 500 算页、服务端仍按 100 查
	const pageSize = Math.min(1000, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const statusFilter = safeText(data.statusFilter, 28) || 'all';
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;
	const now = Date.now();

	const whereParts = [_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])];

	const tr = buildTimeRangeWhere('create_time', timeStart, timeEnd);
	if (tr) whereParts.push(tr);

	if (keyword) {
		const r = new RegExp(escapeReg(keyword), 'i');
		const orParts = [
			{ merchant_user_id: r },
			{ title: r },
			{ month_no: r },
			{ subsidy_kind: r },
			{ dedup_key: r },
			{ coupon_instance_id: keyword.length >= 10 ? keyword : r }
		];
		if (keyword.length >= 16) {
			orParts.push({ _id: keyword });
		}
		whereParts.push(_.or(orParts));
	}

	if (statusFilter === 'claimed') {
		whereParts.push({ status: 'claimed' });
	} else if (statusFilter === 'expired') {
		whereParts.push({ status: 'expired' });
	} else if (statusFilter === 'pending_ready') {
		whereParts.push({ status: 'pending' });
		whereParts.push({ claim_open_time: _.lte(now) });
		whereParts.push({ claim_open_time: _.gt(0) });
		whereParts.push(_.or([{ expire_time: _.exists(false) }, { expire_time: null }, { expire_time: _.gte(now) }]));
		whereParts.push({ amount: _.gte(0.01) });
	} else if (statusFilter === 'pending_locked') {
		whereParts.push({ status: 'pending' });
		whereParts.push(
			_.or([
				{ claim_open_time: _.gt(now) },
				{ claim_open_time: _.lte(0) },
				{ claim_open_time: _.exists(false) }
			])
		);
	} else if (statusFilter === 'pending') {
		whereParts.push({ status: 'pending' });
	}

	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	let total = 0;
	try {
		const countRes = await incomePacketCollection.where(where).count();
		total = countRes.total || 0;
	} catch (e) {
		console.error('opsIncomePacketsList count', e);
	}

	const skip = (page - 1) * pageSize;
	let rows = [];
	try {
		const listRes = await incomePacketCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(pageSize)
			.get();
		rows = listRes.data || [];
	} catch (e) {
		console.error('opsIncomePacketsList get', e);
		return { code: 500, message: e.message || '查询失败' };
	}

	const userIds = [...new Set(rows.map((x) => String(x.merchant_user_id || '')).filter(Boolean))];
	const merchantMap = new Map();
	if (userIds.length) {
		try {
			const mr = await merchantCollection
				.where({ user_id: _.in(userIds) })
				.field({ user_id: true, wx_nickname: true, mobile: true })
				.get();
			(mr.data || []).forEach((m) => {
				merchantMap.set(String(m.user_id || ''), m);
			});
		} catch (e) {
			console.error('opsIncomePacketsList merchants', e);
		}
	}

	const list = rows.map((row) => {
		const mid = String(row.merchant_user_id || '');
		const m = merchantMap.get(mid) || {};
		const st = displayStatus(row, now);
		return {
			_id: row._id,
			merchant_user_id: mid,
			merchant_name: String(m.wx_nickname || '').trim() || '-',
			merchant_mobile: String(m.mobile || '').trim() || '-',
			title: row.title || '-',
			amount: Number(row.amount || 0),
			amountText: Number(row.amount || 0).toFixed(2),
			month_no: row.month_no || '-',
			subsidy_kind: row.subsidy_kind || '',
			subsidy_kind_label: subsidyKindLabel(row.subsidy_kind),
			status: row.status,
			display_status: st.label,
			display_status_key: st.key,
			claim_open_time: row.claim_open_time || null,
			expire_time: row.expire_time || null,
			claimed_time: row.claimed_time || null,
			create_time: row.create_time || null,
			coupon_instance_id: row.coupon_instance_id || '',
			subsidy_flow_month: row.subsidy_flow_month || '',
			installment_index: row.installment_index != null ? row.installment_index : ''
		};
	});

	return {
		code: 0,
		message: 'ok',
		data: { list, total, page, pageSize, statusFilter }
	};
}

function upgradeKindLabel(kind) {
	const map = {
		exchange_code_silver: '兑换码→白银',
		paid_recharge: '付费→充值会员'
	};
	return map[String(kind || '')] || String(kind || '-');
}

async function opsMemberUpgradeClearLogsList(data = {}) {
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(1000, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;

	const whereParts = [{ action: MEMBER_UPGRADE_POINTS_CLEAR_ACTION }];
	const tr = buildTimeRangeWhere('create_time', timeStart, timeEnd);
	if (tr) whereParts.push(tr);
	if (keyword) {
		const r = new RegExp(escapeReg(keyword), 'i');
		whereParts.push(
			_.or([
				{ user_id: r },
				{ user_name: r },
				{ target_id: r },
				{ target_name: r },
				{ content: r },
				{ target_membership_name: r },
				{ platform_no: r }
			])
		);
	}
	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	let total = 0;
	try {
		const countRes = await operationLogCollection.where(where).count();
		total = countRes.total || 0;
	} catch (e) {
		console.error('opsMemberUpgradeClearLogsList count', e);
	}

	const skip = (page - 1) * pageSize;
	let rows = [];
	try {
		const listRes = await operationLogCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(pageSize)
			.get();
		rows = listRes.data || [];
	} catch (e) {
		console.error('opsMemberUpgradeClearLogsList get', e);
		return { code: 500, message: e.message || '查询失败' };
	}

	const userIds = [...new Set(rows.map((x) => String(x.user_id || '')).filter(Boolean))];
	const merchantMap = new Map();
	if (userIds.length) {
		try {
			const mr = await merchantCollection
				.where({ user_id: _.in(userIds) })
				.field({ user_id: true, wx_nickname: true, mobile: true })
				.get();
			(mr.data || []).forEach((m) => {
				merchantMap.set(String(m.user_id || ''), m);
			});
		} catch (e) {
			console.error('opsMemberUpgradeClearLogsList merchants', e);
		}
	}

	const list = rows.map((row) => {
		const mid = String(row.user_id || '');
		const m = merchantMap.get(mid) || {};
		const clearedAp = Number(row.cleared_account_points != null ? row.cleared_account_points : 0);
		const clearedFrozen = Number(row.cleared_frozen_amount != null ? row.cleared_frozen_amount : 0);
		return {
			_id: row._id,
			merchant_user_id: mid,
			merchant_name: String(m.wx_nickname || row.user_name || '').trim() || '-',
			merchant_mobile: String(m.mobile || '').trim() || '-',
			upgrade_kind: row.upgrade_kind || '',
			upgrade_kind_label: upgradeKindLabel(row.upgrade_kind),
			target_membership_name: row.target_membership_name || '-',
			cleared_account_points: clearedAp,
			cleared_account_points_text: clearedAp.toFixed(2),
			cleared_frozen_amount: clearedFrozen,
			cleared_frozen_amount_text: clearedFrozen.toFixed(2),
			platform_no: row.platform_no || '',
			content: row.content || '',
			operator_source: row.operator_source || '',
			create_time: row.create_time || null
		};
	});

	return {
		code: 0,
		message: 'ok',
		data: { list, total, page, pageSize }
	};
}

async function opsIncomePacketDetail(data = {}) {
	const id = safeText(data.id, 80);
	if (!id) return { code: 400, message: '缺少 id' };
	try {
		const r = await incomePacketCollection.doc(id).get();
		const row = r.data && r.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		let merchant = null;
		const uid = String(row.merchant_user_id || '');
		if (uid) {
			const mr = await merchantCollection.where({ user_id: uid }).limit(1).get();
			merchant = (mr.data && mr.data[0]) || null;
		}
		const now = Date.now();
		const st = displayStatus(row, now);
		return {
			code: 0,
			message: 'ok',
			data: {
				row,
				merchant: merchant
					? {
							user_id: merchant.user_id,
							wx_nickname: merchant.wx_nickname,
							mobile: merchant.mobile
					  }
					: null,
				display_status: st.label,
				display_status_key: st.key,
				subsidy_kind_label: subsidyKindLabel(row.subsidy_kind)
			}
		};
	} catch (e) {
		console.error('opsIncomePacketDetail', e);
		return { code: 500, message: e.message || '加载失败' };
	}
}

exports.main = async (event) => {
	const { action, params, data } = event || {};
	const actualData = data || params || {};
	switch (action) {
		case 'opsIncomePacketsList':
			return await opsIncomePacketsList(actualData);
		case 'opsIncomePacketDetail':
			return await opsIncomePacketDetail(actualData);
		case 'opsMemberUpgradeClearLogsList':
			return await opsMemberUpgradeClearLogsList(actualData);
		default:
			return { code: 400, message: '无效操作' };
	}
};
