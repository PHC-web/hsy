'use strict';

/**
 * 积分优化独立云函数（从 merchant 拆出，避免 merchant 继续膨胀）
 * 业务总开关仍由 merchant.bizConfigGet/Save 维护；本函数只读配置。
 */

const db = uniCloud.database();
const _ = db.command;
const merchantCollection = db.collection('hsy-merchant-users');
const systemSettingCollection = db.collection('hsy-system-settings');
const sliceCol = db.collection('hsy-points-slice-state');

const subsidyEngine = require('./subsidy-engine.js');
const redisH5 = require('./redis-h5.js');
const { formatTimeMs } = require('./format-time-cn.js');
const { createPointsOptimizeApi } = require('./points-optimize.js');

const REDIS_KEY_BIZ = 'hsy:biz:settings';
const BIZ_SETTING_KEY = 'h5_biz_params';
const SLICE_PAGE = 500;

let bizSettingsCache = null;
let bizSettingsCacheAt = 0;

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function floor2(n) {
	const x = Number(n || 0);
	if (!Number.isFinite(x)) return 0;
	return Math.floor(x * 100 + 1e-9) / 100;
}

function effectiveOf(row) {
	if (row == null) return 0;
	if (row.manual_amount != null && row.manual_amount !== '') {
		return floor2(row.manual_amount);
	}
	return floor2(row.system_amount != null ? row.system_amount : row.original_amount);
}

function getOperator(event) {
	const ctx = (event && event.context) || {};
	return (
		(ctx.userInfo && (ctx.userInfo.username || ctx.userInfo.nickname)) ||
		ctx.uid ||
		ctx.OPENID ||
		'system'
	);
}

function formatTime(ts) {
	return formatTimeMs(ts);
}

function pickBizRaw(doc) {
	if (!doc) return null;
	if (doc.value && typeof doc.value === 'object') return doc.value;
	if (doc.settings && typeof doc.settings === 'object') return doc.settings;
	return doc;
}

/**
 * 只取优化相关字段；与 merchant 同源 Redis / DB，避免 callFunction 循环依赖与批跑延迟。
 */
async function getBizSettings() {
	const now = Date.now();
	if (bizSettingsCache && now - bizSettingsCacheAt < 2000) {
		return bizSettingsCache;
	}
	let raw = null;
	try {
		const fromRedis = await redisH5.h5RedisGetJson(REDIS_KEY_BIZ);
		if (fromRedis && typeof fromRedis === 'object') raw = fromRedis;
	} catch (e) {
		console.error('points-optimize-admin getBizSettings redis', e);
	}
	if (!raw) {
		try {
			const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(20).get();
			const rows = r.data || [];
			const doc = rows[0] || null;
			raw = pickBizRaw(doc) || {};
		} catch (e) {
			console.error('points-optimize-admin getBizSettings db', e);
			raw = {};
		}
	}
	const pointsOptimizeLoginEnabled =
		raw.pointsOptimizeLoginEnabled === true ||
		raw.pointsOptimizeLoginEnabled === '1' ||
		raw.pointsOptimizeLoginEnabled === 1;
	const settings = {
		pointsOptimizeLoginEnabled,
		optimizeConfig: raw.optimizeConfig && typeof raw.optimizeConfig === 'object' ? raw.optimizeConfig : {}
	};
	bizSettingsCache = settings;
	bizSettingsCacheAt = now;
	return settings;
}

async function getMerchantByIdOrUserId(key) {
	const val = safeText(key, 120);
	if (!val) return null;
	const res = await merchantCollection
		.where(_.or([{ _id: val }, { user_id: val }]))
		.limit(1)
		.get();
	if (res.data && res.data[0]) return res.data[0];

	// 机具号 → 绑定商户
	try {
		const mRes = await db
			.collection('hsy-machine')
			.where(
				_.and([
					{ device_id: val },
					{ is_deleted: _.neq(true) },
					{ is_bound: 1 },
					{ bind_user_id: _.neq('') }
				])
			)
			.field({ bind_user_id: true })
			.limit(1)
			.get();
		const bindUid = mRes.data && mRes.data[0] && String(mRes.data[0].bind_user_id || '').trim();
		if (bindUid) {
			const res2 = await merchantCollection
				.where(_.or([{ user_id: bindUid }, { _id: bindUid }]))
				.limit(1)
				.get();
			if (res2.data && res2.data[0]) return res2.data[0];
		}
	} catch (e) {
		console.error('getMerchantByIdOrUserId device', e);
	}

	// 兼容商户表上的 device_id 快照
	try {
		const r3 = await merchantCollection.where({ device_id: val }).limit(1).get();
		if (r3.data && r3.data[0]) return r3.data[0];
	} catch (e) {}
	return null;
}

/** 按分片 effective 汇总未来月待返 → frozen_amount（与优化砍额口径一致） */
async function recalcFrozenFromSlices(merchantIdOrUserId) {
	const merchant = await getMerchantByIdOrUserId(merchantIdOrUserId);
	if (!merchant) return { ok: false, reason: 'merchant_not_found' };
	const uid = String(merchant.user_id || merchant._id || '');
	const curYm = subsidyEngine.monthNoFromTs(Date.now());
	const where = _.and([
		{ merchant_user_id: uid },
		{ is_deleted: _.neq(true) },
		{ is_claimed: _.neq(true) },
		{ target_ym: _.gt(String(curYm)) }
	]);
	let frozen = 0;
	let skip = 0;
	for (;;) {
		const r = await sliceCol.where(where).orderBy('target_ym', 'asc').skip(skip).limit(SLICE_PAGE).get();
		const rows = r.data || [];
		for (let i = 0; i < rows.length; i += 1) {
			frozen += effectiveOf(rows[i]);
		}
		if (rows.length < SLICE_PAGE) break;
		skip += SLICE_PAGE;
		if (skip >= 200000) break;
	}
	const next = Number(floor2(frozen).toFixed(4));
	await merchantCollection.doc(merchant._id).update({
		frozen_amount: next,
		update_time: Date.now()
	});
	return { ok: true, frozenAmount: next, merchantId: merchant._id, userId: uid };
}

async function invalidateH5MerchantCaches(merchant) {
	const merchantUserId = String((merchant && (merchant.user_id || merchant._id)) || '');
	if (!merchantUserId) return;
	try {
		await redisH5.h5RedisDel(`hsy:h5:member:hint:${merchantUserId}`);
	} catch (e) {
		console.error('invalidateH5MerchantCaches', e);
	}
}

const pointsOptimizeApi = createPointsOptimizeApi({
	db,
	_,
	merchantCollection,
	subsidyEngine,
	getBizSettings,
	getOperator,
	formatTime,
	recalcFrozen: (uid) => recalcFrozenFromSlices(uid),
	invalidateH5MerchantCaches,
	getMerchantByIdOrUserId
});

exports.main = async (event) => {
	const { action, data, params } = event || {};
	const actualData = data || params || {};

	switch (action) {
		case 'pointsOptimizeLoginPreview':
			return await pointsOptimizeApi.pointsOptimizeLoginPreview(actualData);
		case 'pointsOptimizeLoginRun':
			return await pointsOptimizeApi.pointsOptimizeLoginRun(actualData, event);
		case 'pointsOptimizeLoginSimulateWeek':
			return await pointsOptimizeApi.pointsOptimizeLoginSimulateWeek(actualData, event);
		case 'pointsOptimizeTaskStatus':
			return await pointsOptimizeApi.pointsOptimizeTaskStatus(actualData);
		case 'pointsOptimizeLogsList':
			return await pointsOptimizeApi.pointsOptimizeLogsList(actualData);
		case 'pointsOptimizeWhitelistList':
			return await pointsOptimizeApi.pointsOptimizeWhitelistList(actualData);
		case 'pointsOptimizeWhitelistAdd':
			return await pointsOptimizeApi.pointsOptimizeWhitelistAdd(actualData, event);
		case 'pointsOptimizeWhitelistRemove':
			return await pointsOptimizeApi.pointsOptimizeWhitelistRemove(actualData, event);
		case 'pointsFlowOptimizeWhitelistList':
			return await pointsOptimizeApi.pointsFlowOptimizeWhitelistList(actualData);
		case 'pointsFlowOptimizeWhitelistAdd':
			return await pointsOptimizeApi.pointsFlowOptimizeWhitelistAdd(actualData, event);
		case 'pointsFlowOptimizeWhitelistRemove':
			return await pointsOptimizeApi.pointsFlowOptimizeWhitelistRemove(actualData, event);
		case 'pointsSliceStateList':
			return await pointsOptimizeApi.pointsSliceStateList(actualData);
		case 'pointsSliceManualSet':
			return await pointsOptimizeApi.pointsSliceManualSet(actualData, event);
		case 'pointsSliceReconcile':
			return await pointsOptimizeApi.pointsSliceReconcile(actualData, event);
		default:
			return { code: 400, message: '无效的操作' };
	}
};
