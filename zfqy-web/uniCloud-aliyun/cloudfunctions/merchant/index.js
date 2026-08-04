'use strict';

const db = uniCloud.database();
const merchantCollection = db.collection('hsy-merchant-users');
const withdrawCollection = db.collection('hsy-withdraw-records');
const couponCollection = db.collection('hsy-coupons');
const productCollection = db.collection('hsy-products');
const couponInstanceCollection = db.collection('hsy-coupon-instances');
const quotaCollection = db.collection('hsy-quota-packages');
const machineCollection = db.collection('hsy-machine');
const operationLogCollection = db.collection('hsy-operation-logs');
const incomePacketCollection = db.collection('hsy-income-packets');
const machineTradeCollection = db.collection('hsy-machine-trades');
const uniPayOrderCollection = db.collection('uni-pay-orders');
const mobileCodeCollection = db.collection('hsy-h5-mobile-codes');
const feedbackTicketCollection = db.collection('hsy-h5-feedback');
const feedbackMessageCollection = db.collection('hsy-h5-feedback-messages');
const rechargeGiftShipmentCollection = db.collection('hsy-recharge-gift-shipments');
const systemSettingCollection = db.collection('hsy-system-settings');
const periodLimitsCollection = db.collection('hsy-biz-period-limits');
const PERIOD_LIMITS_DOC_KEY = 'default';
/** 用于后台校验是否已部署带日周限额的云函数版本 */
const MERCHANT_CF_BUILD = 'PERIOD_V4_20260715';
const agreementCollection = db.collection('hsy-agreements');
const transferOrderCollection = db.collection('hsy-transfer-orders');
const exchangeCouponCollection = db.collection('hsy-exchange-coupons');
const transferLogCollection = db.collection('hsy-transfer-logs');
const robotPushLogCollection = db.collection('hsy-robot-push-logs');
const refundEntryTokenCollection = db.collection('hsy-refund-entry-tokens');
const dataCorrectTaskCollection = db.collection('hsy-data-correct-tasks');
const adminUserCollection = db.collection('uni-id-users');
const zlib = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const { formatTimeMs: formatTime, shanghaiYearMonthFromTs } = require('./format-time-cn.js');
const subsidyEngine = require('./subsidy-engine.js');
const refundClawback = require('./refund-clawback.js');
const redisH5 = require('./redis-h5.js');
const { tradeMemberBucketForMerchant } = require('./trade-member-bucket.js');
/** Redis 键：与云函数多实例共享热点，未开通 Redis 时自动跳过 */
const REDIS_KEY_QUOTA_PKGS = 'hsy:h5:quota:pkgs';
const REDIS_KEY_PRODUCTS = 'hsy:products:list';
const REDIS_KEY_BIZ = 'hsy:biz:settings';
/** 参数配置最近一次写入 Redis 的时间（无 TTL，供后台展示） */
const REDIS_KEY_BIZ_META = 'hsy:biz:settings:meta';
const REDIS_KEY_AGR = 'hsy:h5:agreement:current';
const REDIS_EX_QUOTA_SEC = 90;
const REDIS_EX_PRODUCTS_SEC = 90;
const REDIS_EX_BIZ_SEC = 55;
const REDIS_EX_AGR_SEC = 40;
const REDIS_EX_WD_SUM_SEC = 28;
const REDIS_EX_H5_HOME_DASH_SEC = 15;
const REDIS_EX_H5_SILVER_TRADE_SEC = 45;
const REDIS_EX_H5_RECHARGE_HINT_SEC = 25;
/** 管理端交易账单列表缓存（秒），减轻重复筛选下的云函数+DB 压力 */
const REDIS_EX_TRADE_BILL_SEC = 22;
const REDIS_KEY_ADMIN_HOME_SUMMARY = 'hsy:admin:home:summary:v4';
const REDIS_KEY_ADMIN_HOME_SUMMARY_LAST = 'hsy:admin:home:summary:v4:last';
const REDIS_KEY_ADMIN_HOME_PREVIEW = 'hsy:admin:home:preview:v1';
const REDIS_KEY_ADMIN_HOME_PREVIEW_LAST = 'hsy:admin:home:preview:v1:last';
const REDIS_KEY_ADMIN_HOME_META = 'hsy:admin:home:meta:v1';
const REDIS_KEY_ADMIN_HOME_META_LAST = 'hsy:admin:home:meta:v1:last';
const REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP = 'hsy:admin:home:withdrawTop20:v1';
const REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP_LAST = 'hsy:admin:home:withdrawTop20:v1:last';
const REDIS_KEY_ADMIN_HOME_PENDING_FROZEN = 'hsy:admin:home:pendingFrozen:v1';
const REDIS_KEY_ADMIN_HOME_PENDING_FROZEN_LAST = 'hsy:admin:home:pendingFrozen:v1:last';
const REDIS_KEY_ADMIN_MEMBERSHIP_TIER = 'hsy:admin:membership:tier:counts:v1';
/** 定时每 3 分钟预热；正式 key TTL 覆盖多轮 cron；last 长留作刷新空窗回退 */
const REDIS_EX_ADMIN_HOME_SUMMARY_SEC = 1800;
const REDIS_EX_ADMIN_HOME_PREVIEW_SEC = 1800;
const REDIS_EX_ADMIN_HOME_TREND_SEC = 1800;
const REDIS_EX_ADMIN_HOME_META_SEC = 1800;
const REDIS_EX_ADMIN_HOME_WITHDRAW_TOP_SEC = 1800;
const REDIS_EX_ADMIN_HOME_PENDING_FROZEN_SEC = 1800;
const REDIS_EX_ADMIN_HOME_LAST_SEC = 7 * 24 * 3600;
const REDIS_EX_ADMIN_MEMBERSHIP_TIER_SEC = 1800;
const ADMIN_HOME_SUMMARY_CACHE_MS = 45000;
const ADMIN_MEMBERSHIP_TIER_CACHE_MS = 180000;
const ADMIN_HOME_TREND_RANGE_TYPES = ['today', 'week', 'month', '30d'];

function redisKeyAdminHomeTrend(rangeType) {
	const t = String(rangeType || '30d').trim() || '30d';
	return `hsy:admin:home:trend:v1:${t}`;
}

function redisKeyAdminHomeTrendLast(rangeType) {
	return `${redisKeyAdminHomeTrend(rangeType)}:last`;
}

/** 读正式 key，miss 则回退 last（刷新/过期空窗仍可返回旧数据） */
function isAdminHomePreviewPayload(p) {
	return !!(
		p &&
		typeof p === 'object' &&
		!Array.isArray(p) &&
		('brandCount' in p || 'userCount' in p || 'machineCount' in p || 'boundCount' in p)
	);
}

function isAdminHomeSummaryPayload(s) {
	return !!(s && typeof s === 'object' && !Array.isArray(s) && s.membershipCounts);
}

function isAdminHomeTrendPayload(t) {
	return !!(t && typeof t === 'object' && Array.isArray(t.categories));
}

function isAdminHomeWithdrawTopPayload(p) {
	return !!(p && typeof p === 'object' && Array.isArray(p.list));
}

function isAdminHomePendingFrozenPayload(p) {
	return !!(
		p &&
		typeof p === 'object' &&
		Array.isArray(p.frozenMonths) &&
		(p.pendingWithdrawTotal != null || p.pendingWithdrawTotal === 0)
	);
}

async function adminHomeRedisGetLiveOrLast(liveKey, lastKey, isValid) {
	const check = typeof isValid === 'function' ? isValid : (x) => x != null;
	const live = await redisH5.h5RedisGetJson(liveKey);
	if (check(live)) return { data: live, from: 'live' };
	const last = await redisH5.h5RedisGetJson(lastKey);
	if (check(last)) return { data: last, from: 'last' };
	return { data: null, from: 'miss' };
}

/** 成功算出新数据后同时写 live + last；计算过程中不删旧 key，前端一直可读旧值 */
async function adminHomeRedisSetLiveAndLast(liveKey, lastKey, obj, liveExSec) {
	const okLive = await redisH5.h5RedisSetJson(liveKey, obj, liveExSec);
	await redisH5.h5RedisSetJson(lastKey, obj, REDIS_EX_ADMIN_HOME_LAST_SEC);
	return okLive;
}
/** 0.2 元测试套餐 id：权益与 1000 元档一致，用于测赠品选择/发货 */
const H5_RECHARGE_TEST_AS_1000_PKG_ID = 'pkg_0_2';

/**
 * H5 首页/我的：可选 gzip+base64 减小 callFunction 响应体。需 params.cmp=1 且体量大，否则不压缩。
 * 回包中 _cmp=1 时 payload 在 _b（base64），整体 JSON.parse 后即为原 { code, message, data }。
 */
async function applyH5GzipIfRequested(res, params) {
	if (!res || res.code !== 0) return res;
	if (!params || (params.cmp !== 1 && params.cmp !== true && params.compress !== 1)) {
		return res;
	}
	const raw = JSON.stringify(res);
	if (raw.length < 1600) return res;
	try {
		const buf = await gzipAsync(Buffer.from(raw, 'utf8'), { level: zlib.constants.Z_BEST_SPEED });
		const b64 = buf.toString('base64');
		if (b64.length + 80 >= raw.length) return res;
		return { _cmp: 1, _b: b64, _h5: 1 };
	} catch (e) {
		console.error('applyH5GzipIfRequested', e);
		return res;
	}
}

function loadWechatLocalConfig() {
	try {
		return require('./wechat.config.json');
	} catch (e) {
		return {};
	}
}

const wechatLocal = loadWechatLocalConfig();
function loadPayLocalConfig() {
	try {
		return require('./pay.config.json');
	} catch (e) {
		return {};
	}
}
const payLocal = loadPayLocalConfig();
function pickWxSecret(envKey, localVal, maxLen) {
	const v = String(process.env[envKey] != null ? process.env[envKey] : localVal || '')
		.trim()
		.slice(0, maxLen);
	return v;
}
/** 公众号（服务号）网页授权 — AppSecret：优先云函数环境变量 WX_MP_APPSECRET，其次同目录 wechat.config.json（已 .gitignore） */
const WX_MP_APPID = pickWxSecret('WX_MP_APPID', wechatLocal.WX_MP_APPID, 80) || 'wxeeb5a3a25894c4e1';
const WX_MP_APPSECRET = pickWxSecret('WX_MP_APPSECRET', wechatLocal.WX_MP_APPSECRET, 120);
const WX_PAY_MCH_ID = pickWxSecret('WX_PAY_MCH_ID', payLocal.WX_PAY_MCH_ID, 40);
const WX_PAY_APPID = pickWxSecret('WX_PAY_APPID', payLocal.WX_PAY_APPID, 80) || WX_MP_APPID;
const WX_PAY_MCH_API_V3_KEY = pickWxSecret('WX_PAY_MCH_API_V3_KEY', payLocal.WX_PAY_MCH_API_V3_KEY, 120);
const WX_PAY_MCH_SERIAL_NO = pickWxSecret('WX_PAY_MCH_SERIAL_NO', payLocal.WX_PAY_MCH_SERIAL_NO, 80);
const WX_PAY_PRIVATE_KEY = String(process.env.WX_PAY_PRIVATE_KEY || payLocal.WX_PAY_PRIVATE_KEY || '').trim();
const WX_PAY_PLATFORM_CERT = String(process.env.WX_PAY_PLATFORM_CERT || payLocal.WX_PAY_PLATFORM_CERT || '').trim();
const H5_PAY_NOTIFY_URL = pickWxSecret('WX_PAY_NOTIFY_URL', payLocal.WX_PAY_NOTIFY_URL, 500);
const H5_REFUND_NOTIFY_URL = pickWxSecret('WX_PAY_REFUND_NOTIFY_URL', payLocal.WX_PAY_REFUND_NOTIFY_URL, 500);
/** 额度充值 JSAPI / 充值退款 / 支付回调：独立微信商户号。各字段未配置时回退到下方 WX_PAY_*（便于渐进迁移）。提现/打款仅使用 WX_PAY_*。 */
const WX_PAY_RECHARGE_MCH_ID = pickWxSecret('WX_PAY_RECHARGE_MCH_ID', payLocal.WX_PAY_RECHARGE_MCH_ID, 40) || WX_PAY_MCH_ID;
const WX_PAY_RECHARGE_APPID =
	pickWxSecret('WX_PAY_RECHARGE_APPID', payLocal.WX_PAY_RECHARGE_APPID, 80) || WX_PAY_APPID;
const WX_PAY_RECHARGE_MCH_API_V3_KEY =
	pickWxSecret('WX_PAY_RECHARGE_MCH_API_V3_KEY', payLocal.WX_PAY_RECHARGE_MCH_API_V3_KEY, 120) || WX_PAY_MCH_API_V3_KEY;
const WX_PAY_RECHARGE_MCH_SERIAL_NO =
	pickWxSecret('WX_PAY_RECHARGE_MCH_SERIAL_NO', payLocal.WX_PAY_RECHARGE_MCH_SERIAL_NO, 80) || WX_PAY_MCH_SERIAL_NO;
const WX_PAY_RECHARGE_PRIVATE_KEY = String(
	process.env.WX_PAY_RECHARGE_PRIVATE_KEY || payLocal.WX_PAY_RECHARGE_PRIVATE_KEY || ''
).trim() || WX_PAY_PRIVATE_KEY;
const WX_PAY_RECHARGE_PLATFORM_CERT = String(
	process.env.WX_PAY_RECHARGE_PLATFORM_CERT || payLocal.WX_PAY_RECHARGE_PLATFORM_CERT || ''
).trim() || WX_PAY_PLATFORM_CERT;
const SMS_KEY = process.env.DCLOUD_SMS_KEY || process.env.SMS_KEY || '';
const SMS_SECRET = process.env.DCLOUD_SMS_SECRET || process.env.SMS_SECRET || '';
const SMS_TEMPLATE_ID = process.env.H5_BIND_MOBILE_TEMPLATE_ID || '';
const SMS_NAME = process.env.H5_SMS_NAME || '慧收盈';
const MOBILE_CODE_TTL_MS = 5 * 60 * 1000;
const WX_TRANSFER_SCENE_ID = pickWxSecret('WX_TRANSFER_SCENE_ID', payLocal.WX_TRANSFER_SCENE_ID, 20) || '1000';
const WX_TRANSFER_NOTIFY_URL = pickWxSecret('WX_TRANSFER_NOTIFY_URL', payLocal.WX_TRANSFER_NOTIFY_URL, 500);
const H5_REFUND_ENTRY_BASE_URL = pickWxSecret('H5_REFUND_ENTRY_BASE_URL', payLocal.H5_REFUND_ENTRY_BASE_URL, 500);
const REFUND_ENTRY_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
const WECOM_ROBOT_WEBHOOK = String(
	process.env.WECOM_ROBOT_WEBHOOK || payLocal.WECOM_ROBOT_WEBHOOK || 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=3f69eeb7-e0bc-4ec9-afea-028566bda416'
).trim();

/** 业务参数内存缓存（与 Redis key REDIS_KEY_BIZ 一致），需在文件中早于 getRefundTransferSliceMaxYuan 声明 */
let bizSettingsCache = null;
let bizSettingsCacheAt = 0;

/**
 * H5 充值退款拆单单笔上限（元）。
 * 优先级：参数配置（Redis/DB，经 getBizSettings 缓存）> 环境变量 REFUND_TRANSFER_SLICE_MAX_YUAN > 默认 200。
 */
function getRefundTransferSliceMaxYuan() {
	let n;
	if (bizSettingsCache && bizSettingsCache.refundTransferSliceMaxYuan != null && bizSettingsCache.refundTransferSliceMaxYuan !== '') {
		n = Number(bizSettingsCache.refundTransferSliceMaxYuan);
	}
	if (!Number.isFinite(n)) {
		const raw = process.env.REFUND_TRANSFER_SLICE_MAX_YUAN;
		n = raw != null && raw !== '' ? Number(raw) : 200;
	}
	if (!Number.isFinite(n) || n <= 0) n = 200;
	return Math.min(500, Math.max(0.01, n));
}
function buildRefundTransferSlicesFromFen(totalFen, maxYuanPerSlice) {
	const maxFen = Math.max(1, Math.round(Number(maxYuanPerSlice) * 100));
	const total = Math.max(0, Math.round(Number(totalFen) || 0));
	if (!total) return [];
	const slices = [];
	let left = total;
	while (left > 0) {
		const chunk = Math.min(left, maxFen);
		slices.push(chunk);
		left -= chunk;
	}
	return slices;
}
/**
 * 微信商家转账：商户单号仅允许字母与数字。拆分子单在母单号后接 S1、S2…（不再使用下划线，避免 V3 报「商户单号」规则失败）
 */
function makeRefundSliceOutBillNo(baseRefundNo, sliceIndex0Based, maxLen = 64) {
	const idx = Number(sliceIndex0Based);
	const n = Number.isFinite(idx) && idx >= 0 ? idx + 1 : 1;
	const suf = `S${n}`;
	const alnum = String(baseRefundNo || '').replace(/[^A-Za-z0-9]/g, '');
	const room = Math.max(1, maxLen - suf.length);
	const head = (alnum.slice(0, room) || 'RF') + suf;
	return safeText(head, maxLen);
}
function sortTransferItemsBySlice(items) {
	const arr = Array.isArray(items) ? items.map((x) => ({ ...x })) : [];
	arr.sort((a, b) => Number(a.slice_index ?? 0) - Number(b.slice_index ?? 0));
	return arr;
}
function findActiveRefundSliceIndex(items) {
	const arr = sortTransferItemsBySlice(items);
	for (let i = 0; i < arr.length; i++) {
		if (normalizeTransferState(arr[i].state || '') !== 'SUCCESS') return i;
	}
	return -1;
}
function allRefundSlicesSucceeded(items) {
	const arr = Array.isArray(items) ? items : [];
	if (!arr.length) return false;
	return arr.every((it) => normalizeTransferState(it.state || '') === 'SUCCESS');
}
function countRefundSlicesSucceeded(items) {
	return (Array.isArray(items) ? items : []).filter((it) => normalizeTransferState(it.state || '') === 'SUCCESS').length;
}
function computeMerchantRefundBatchState(items) {
	const arr = sortTransferItemsBySlice(items);
	for (const it of arr) {
		const s = normalizeTransferState(it.state || '');
		if (['FAIL', 'FAILED', 'CANCELLED'].includes(s)) return 'FAILED';
	}
	if (arr.length && arr.every((it) => normalizeTransferState(it.state || '') === 'SUCCESS')) return 'SUCCESS';
	return 'PROCESSING';
}
/**
 * 历史单笔 transfer_items 且金额超限时拆成多笔；仅当仅有一条且为 INIT 时升级
 */
function ensureMultiRefundSlicesOnOrder(transferOrder, refundNo, finalFen) {
	const maxYuan = getRefundTransferSliceMaxYuan();
	const targetFen = Math.round(Number(finalFen != null ? finalFen : transferOrder.final_refund_fen || 0));
	let items = sortTransferItemsBySlice(transferOrder.transfer_items);
	if (items.length > 1 || targetFen <= Math.round(maxYuan * 100)) {
		return {
			items,
			transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			changed: false
		};
	}
	const one = items[0] || {};
	const st0 = normalizeTransferState(one.state || '');
	if (st0 && st0 !== 'INIT') {
		return { items, transfer_slice_ids: [safeText(one.out_bill_no, 64)].filter(Boolean), changed: false };
	}
	if (Number(one.transfer_amount_fen || 0) !== targetFen) {
		return { items, transfer_slice_ids: [safeText(one.out_bill_no, 64)].filter(Boolean), changed: false };
	}
	const chunks = buildRefundTransferSlicesFromFen(targetFen, maxYuan);
	if (chunks.length <= 1) {
		return { items, transfer_slice_ids: [safeText(one.out_bill_no, 64)].filter(Boolean), changed: false };
	}
	const base = safeText(refundNo, 48);
	items = chunks.map((fen, idx) => ({
		slice_index: idx,
		out_bill_no: makeRefundSliceOutBillNo(base, idx, 64),
		transfer_amount_fen: fen,
		state: 'INIT',
		transfer_bill_no: '',
		last_error: ''
	}));
	return {
		items,
		transfer_slice_ids: items.map((x) => x.out_bill_no),
		changed: true
	};
}
async function findRefundTransferOrderByBillNo(outBillNo) {
	const b = safeText(outBillNo, 64);
	if (!b) return null;
	let r = await transferOrderCollection.where({ out_bill_no: b, is_deleted: false, refund_mode: 'merchant_transfer' }).limit(1).get();
	if (r.data && r.data[0]) return r.data[0];
	r = await transferOrderCollection.where({ refund_no: b, is_deleted: false, refund_mode: 'merchant_transfer' }).limit(1).get();
	if (r.data && r.data[0]) return r.data[0];
	r = await transferOrderCollection.where({ transfer_slice_ids: b, is_deleted: false, refund_mode: 'merchant_transfer' }).limit(1).get();
	if (r.data && r.data[0]) return r.data[0];
	return null;
}
async function findRefundTransferOrderForMerchant(merchantId, bill) {
	const mid = safeText(merchantId, 80);
	const b = safeText(bill, 64);
	if (!mid || !b) return null;
	let r = await transferOrderCollection
		.where({ merchant_id: mid, out_bill_no: b, is_deleted: false, refund_mode: 'merchant_transfer' })
		.limit(1)
		.get();
	if (r.data && r.data[0]) return r.data[0];
	r = await transferOrderCollection
		.where({ merchant_id: mid, refund_no: b, is_deleted: false, refund_mode: 'merchant_transfer' })
		.limit(1)
		.get();
	if (r.data && r.data[0]) return r.data[0];
	r = await transferOrderCollection
		.where({ merchant_id: mid, transfer_slice_ids: b, is_deleted: false, refund_mode: 'merchant_transfer' })
		.limit(1)
		.get();
	if (r.data && r.data[0]) return r.data[0];
	return null;
}

function getOperator(event) {
	const ctx = event?.context || {};
	return (
		ctx?.userInfo?.username ||
		ctx?.userInfo?.nickname ||
		ctx?.uid ||
		ctx?.OPENID ||
		'system'
	);
}

function normalizeFeedbackAdminName(raw) {
	const n = safeText(raw, 80);
	if (!n || n === 'system') return '';
	return n;
}

async function lookupUniIdUserDisplayName(uid) {
	const id = safeText(uid, 80);
	if (!id) return '';
	try {
		const r = await adminUserCollection.doc(id).field({ nickname: true, username: true }).get();
		const row = r.data && r.data[0];
		return safeText(row?.nickname || row?.username || '', 80);
	} catch (e) {
		return '';
	}
}

/** 后台客服回复展示名：优先 uniIdToken 对应用户昵称，其次请求体 adminDisplayName */
async function getAdminDisplayName(event = {}, context = {}, data = {}) {
	try {
		const ctx = context && typeof context === 'object' ? context : {};
		const passed = normalizeFeedbackAdminName(
			data?.adminDisplayName || event?.adminDisplayName || event?.params?.adminDisplayName || ''
		);
		const token = safeText(
			event?.uniIdToken || event?.args?.uniIdToken || ctx?.uniIdToken || '',
			4000
		);
		if (token) {
			try {
				const uniID = require('uni-id-common');
				const uniIDIns = uniID.createInstance({ context: ctx });
				const tr = await uniIDIns.checkToken(token);
				if (tr && tr.errCode === 0) {
					const fromUid = await lookupUniIdUserDisplayName(tr.uid);
					if (fromUid) return fromUid;
				}
			} catch (e) {
				console.error('getAdminDisplayName checkToken', e);
			}
		}
		if (passed) return passed;
		const nick = safeText(ctx?.userInfo?.nickname || '', 80);
		if (nick) return nick;
		const uid = safeText(ctx?.uid || ctx?.userInfo?._id || '', 80);
		if (uid) {
			const fromUid = await lookupUniIdUserDisplayName(uid);
			if (fromUid) return fromUid;
		}
		const uname = safeText(ctx?.userInfo?.username || '', 80);
		if (uname) {
			const ru = await adminUserCollection.where({ username: uname }).limit(1).get();
			const rowU = ru.data && ru.data[0];
			if (rowU) {
				const n = safeText(rowU.nickname || rowU.username || '', 80);
				if (n) return n;
			}
			return uname;
		}
		return '管理员';
	} catch (e) {
		console.error('getAdminDisplayName', e);
		return normalizeFeedbackAdminName(data?.adminDisplayName || '') || '管理员';
	}
}

function toMoney(amount) {
	const num = Number(amount || 0);
	return `￥${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}

function safeJson(obj, maxLen = 2000) {
	try {
		return safeText(JSON.stringify(obj || {}), maxLen);
	} catch (e) {
		return safeText(String(obj || ''), maxLen);
	}
}

async function writeTransferLog(entry) {
	try {
		const now = nowTs();
		await transferLogCollection.add({
			log_no: `TL${now}${randomStr(6)}`,
			scene: safeText(entry?.scene || 'withdraw', 32),
			stage: safeText(entry?.stage || 'unknown', 40),
			level: safeText(entry?.level || 'info', 12),
			withdraw_id: safeText(entry?.withdrawId || '', 80),
			withdraw_no: safeText(entry?.withdrawNo || '', 80),
			merchant_user_id: safeText(entry?.merchantUserId || '', 80),
			openid: safeText(entry?.openid || '', 128),
			device_id: safeText(entry?.deviceId || '', 80),
			out_bill_no: safeText(entry?.outBillNo || '', 80),
			transfer_state: safeText(entry?.transferState || '', 40),
			message: safeText(entry?.message || '', 300),
			payload: safeJson(entry?.payload || {}, 4000),
			create_time: now,
			// 与 uni-pay-orders 等表对齐，便于运维按 create_date 做时间筛选或控制台排查
			create_date: now,
			is_deleted: false
		});
	} catch (e) {
		console.error(
			'writeTransferLog failed',
			safeText(entry?.stage, 40),
			safeText(entry?.scene, 20),
			e && e.message,
			e
		);
	}
}

async function sendWecomRobotText(content) {
	const text = safeText(content, 1800);
	if (!WECOM_ROBOT_WEBHOOK || !text) return;
	const now = nowTs();
	let ok = false;
	let respData = null;
	let errMsg = '';
	const payload = {
		msgtype: 'text',
		text: { content: text }
	};
	try {
		const resp = await uniCloud.httpclient.request(WECOM_ROBOT_WEBHOOK, {
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify(payload),
			timeout: 3000
		});
		respData = resp?.data || null;
		if (typeof respData === 'string') {
			try {
				respData = JSON.parse(respData);
			} catch (e) {}
		}
		ok = Number(respData?.errcode || 0) === 0;
		if (!ok) {
			errMsg = safeText(respData?.errmsg || `errcode=${respData?.errcode}`, 300);
		}
	} catch (e) {
		errMsg = safeText(e?.message || 'request failed', 300);
		console.error('sendWecomRobotText failed', e);
	} finally {
		try {
			await robotPushLogCollection.add({
				channel: 'wecom_robot',
				webhook: safeText(WECOM_ROBOT_WEBHOOK, 500),
				content: text,
				success: !!ok,
				errmsg: errMsg,
				request: safeJson(payload, 2000),
				response: safeJson(respData || {}, 4000),
				create_time: now,
				is_deleted: false
			});
		} catch (logErr) {
			console.error('robotPushLogCollection.add failed', logErr);
		}
	}
}

function maybeMerchantDisplayName(merchant) {
	return (
		safeText(merchant?.wx_nickname, 80) ||
		safeText(merchant?.mobile, 30) ||
		safeText(merchant?.user_id, 80) ||
		safeText(merchant?._id, 80) ||
		'未知商户'
	);
}

const WX_OPERATING_ACCOUNT_INSUFFICIENT_HINT =
	'商户运营账户资金不足，充值后可以原单号发起重试，请勿更换商户单号';

function extractWxPayErrorText(errOrText) {
	if (typeof errOrText === 'string') return safeText(errOrText, 500);
	if (!errOrText) return '';
	if (errOrText.name === 'WxPayRequestError' && errOrText.wxBody) {
		const body = errOrText.wxBody;
		return safeText(body.message || body.err_code_des || body.detail || body.code || errOrText.message, 500);
	}
	return safeText(errOrText.message || '', 500);
}

/** 微信商家转账：运营账户/可用余额不足（含「原单号重试」类文案） */
function isWxBalanceInsufficientError(errOrText) {
	const txt = extractWxPayErrorText(errOrText).toLowerCase();
	if (!txt) return false;
	const keys = [
		'商户运营账户资金不足',
		'运营账户资金不足',
		'商户号运营账户余额不足',
		'余额不足',
		'账户余额不足',
		'可用余额不足',
		'原单号发起重试',
		'请勿更换商户单号',
		'insufficient',
		'not enough',
		'balance not enough'
	];
	return keys.some((k) => txt.includes(String(k).toLowerCase()));
}

async function notifyWxOperatingAccountInsufficientWecom(ctx = {}, wxDetail = '') {
	const scene = safeText(ctx.scene || '打款', 20);
	const outBillNo = safeText(ctx.outBillNo || ctx.withdrawNo || ctx.refundNo || '', 64);
	const merchantName = safeText(ctx.merchantName || '', 80);
	const detail = safeText(wxDetail || ctx.detail || '', 400);
	const lines = [
		`【${scene}】${WX_OPERATING_ACCOUNT_INSUFFICIENT_HINT}`,
		outBillNo ? `单号：${outBillNo}` : '',
		merchantName ? `商户：${merchantName}` : '',
		detail && !detail.includes('商户运营账户资金不足') ? `微信返回：${detail}` : ''
	].filter(Boolean);
	await sendWecomRobotText(lines.join('\n'));
}

async function maybeNotifyWxOperatingAccountInsufficientWecom(errOrText, ctx = {}) {
	if (!isWxBalanceInsufficientError(errOrText)) return false;
	await notifyWxOperatingAccountInsufficientWecom(ctx, extractWxPayErrorText(errOrText));
	return true;
}

function buildRefundEntryPath(token) {
	return `/pages/h5/recharge-refund/index?rt=${encodeURIComponent(String(token || ''))}`;
}

function buildRefundEntryUrl(token) {
	const path = buildRefundEntryPath(token);
	const base = String(H5_REFUND_ENTRY_BASE_URL || '').trim();
	if (!base) return path;
	if (base.includes('#')) {
		return `${base.replace(/\/+$/, '')}${path}`;
	}
	return `${base.replace(/\/+$/, '')}/#${path}`;
}

function pickRefundEntryToken(data = {}) {
	return safeText(data?.refundEntryToken || data?.refundToken || data?.rt || data?.token || '', 120);
}

function parseRefundPercentInput(raw) {
	if (raw == null || raw === '') return NaN;
	const s = String(raw).trim().replace(/%/g, '');
	const n = Number(s);
	if (!Number.isFinite(n)) return NaN;
	return Number(n.toFixed(4));
}

function resolveRefundEntryPolicy(tokenRow) {
	if (!tokenRow || safeText(tokenRow.refund_entry_type, 24) !== 'proportional') {
		return { entryType: 'full', refundPercent: null, bypassRefundWindow: false };
	}
	const pctRaw = Number(tokenRow.refund_percent);
	const refundPercent = Number.isFinite(pctRaw) ? Math.min(100, Math.max(1, Number(pctRaw.toFixed(4)))) : 100;
	return {
		entryType: 'proportional',
		refundPercent,
		bypassRefundWindow: tokenRow.bypass_refund_window !== false
	};
}

function shouldBypassRefundEntryToken(data = {}) {
	return false;
}

async function validateRefundEntryToken(merchantId, token) {
	const mid = safeText(merchantId, 80);
	const tk = safeText(token, 120);
	if (!mid || !tk) return { ok: false, code: 403, message: '退款入口无效，请联系在线客服重新发送入口。' };
	const r = await refundEntryTokenCollection.where({
		merchant_id: mid,
		token: tk,
		is_deleted: false
	}).limit(1).get();
	const row = r.data && r.data[0];
	if (!row) return { ok: false, code: 403, message: '退款入口无效，请联系在线客服重新发送入口。' };
	if (safeText(row.status, 20) !== 'active') {
		return { ok: false, code: 403, message: '退款入口已失效，请联系在线客服重新发送入口。' };
	}
	const now = nowTs();
	const exp = Number(row.expire_time || 0);
	if (exp > 0 && now > exp) {
		try {
			await refundEntryTokenCollection.doc(row._id).update({ status: 'expired', update_time: now });
		} catch (e) {}
		return { ok: false, code: 403, message: '退款入口已过期，请联系在线客服重新发送入口。' };
	}
	let needRefundAudit = false;
	try {
		const mRes = await merchantCollection.doc(mid).get();
		const merchant = mRes.data && mRes.data[0];
		if (merchant) {
			const biz = await getBizSettings();
			const rechargePackages = await loadRechargePackagesFromQuota();
			const membership = h5MembershipInfo(merchant, rechargePackages);
			const rtc = biz?.refundTransferAudit || {};
			needRefundAudit = membership.tier !== 'normal' ? !!rtc.memberRequired : !!rtc.nonMemberRequired;
		}
	} catch (e) {}
	// 新规则：仅当“退款需审核”开启时入口可进入；一旦关闭，历史入口立即全部失效
	if (!needRefundAudit) {
		try {
			await refundEntryTokenCollection.where({
				merchant_id: mid,
				status: 'active',
				is_deleted: false
			}).update({ status: 'expired', update_time: now });
		} catch (e) {}
		return { ok: false, code: 403, message: '当前未开启退款审核，请联系在线客服。' };
	}
	try {
		await refundEntryTokenCollection.doc(row._id).update({ last_access_time: now, update_time: now });
	} catch (e) {}
	return { ok: true, row };
}

/** 完整机具号走等值（可走索引）；短关键词仍用模糊正则 */
function isLikelyExactDeviceId(kw) {
	return /^[A-Za-z0-9][A-Za-z0-9_-]{6,48}$/.test(String(kw || ''));
}

/** 机具号字段条件：完整号等值，否则不区分大小写模糊 */
function buildDeviceIdFieldCond(deviceKeyword) {
	const kw = safeText(deviceKeyword, 50);
	if (!kw) return null;
	if (isLikelyExactDeviceId(kw)) return { device_id: kw };
	return { device_id: new RegExp(escapeReg(kw), 'i') };
}

/** 按机具号关键词查 hsy-machine，返回对应 bind_user_id（含非主快照机具） */
async function listBindUserIdsByBoundDeviceKeyword(deviceKeyword) {
	const deviceCond = buildDeviceIdFieldCond(deviceKeyword);
	if (!deviceCond) return [];
	const userSet = new Set();
	let skip = 0;
	const PAGE = 1000;
	for (;;) {
		const res = await machineCollection
			.where({
				is_deleted: false,
				is_bound: 1,
				bind_user_id: db.command.neq(''),
				...deviceCond
			})
			.field({ bind_user_id: true })
			.skip(skip)
			.limit(PAGE)
			.get();
		const rows = res.data || [];
		for (const row of rows) {
			const uid = String(row.bind_user_id || '').trim();
			if (uid) userSet.add(uid);
		}
		if (rows.length < PAGE) break;
		skip += PAGE;
		if (skip > 20000) break;
	}
	return [...userSet];
}

/**
 * 商户列表机具号条件：
 * - 机具表已解析出 bind_user_id 时，只用 user_id/_id $in（避免与 device_id 正则 $or 导致全表扫）
 * - 未命中时再回退到商户文档上的 device_id（兼容旧数据）
 */
function buildMerchantListDeviceIdWhere(deviceKeyword, bindUserIds) {
	const kw = safeText(deviceKeyword, 50);
	if (!kw) return null;
	const ids = [
		...new Set(
			(Array.isArray(bindUserIds) ? bindUserIds : [])
				.map((x) => String(x || '').trim())
				.filter(Boolean)
		)
	];
	if (ids.length) {
		const orParts = [];
		const CHUNK = 450;
		for (let i = 0; i < ids.length; i += CHUNK) {
			const part = ids.slice(i, i + CHUNK);
			orParts.push({ user_id: db.command.in(part) });
			orParts.push({ _id: db.command.in(part) });
		}
		return orParts.length === 1 ? orParts[0] : db.command.or(orParts);
	}
	return buildDeviceIdFieldCond(kw);
}

async function listMerchants(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			mobile = '',
			deviceId = '',
			wxNickname = '',
			useStatus = '',
			flag1 = '',
			flag2 = '',
			flag3 = '',
			membershipLevel = '',
			microMerchant = '',
			loginTimeStart = '',
			loginTimeEnd = ''
		} = data || {};

		const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
		const forExport = !!(data && (data.forExport === true || data.forExport === '1' || data.forExport === 1));
		const maxPageSize = forExport ? 1000 : 500;
		const pageSizeNum = Math.min(maxPageSize, Math.max(1, parseInt(String(pageSize), 10) || 10));
		const skip = (pageNum - 1) * pageSizeNum;
		if (!Number.isFinite(skip) || skip < 0) {
			return { code: 400, message: '分页参数无效' };
		}

		/**
		 * 按 login_time 排序在无索引时会触发 MongoDB 内存排序上限（约 32MB）导致 Error 96。
		 * 默认按 _id 降序（必有索引，等价于大致「新建/写入顺序」从新到旧）。
		 * 若已在 hsy-merchant-users 上为 login_time 建降序索引，可在云函数环境变量设置：
		 * MERCHANT_LIST_SORT_BY = login_time
		 */
		const listSortField =
			String(process.env.MERCHANT_LIST_SORT_BY || '').trim().toLowerCase() === 'login_time'
				? 'login_time'
				: '_id';

		const where = {};
		const whereParts = [];
		if (mobile) where.mobile = new RegExp(String(mobile));
		if (wxNickname) where.wx_nickname = new RegExp(String(wxNickname));
		if (useStatus !== '' && useStatus !== undefined) where.use_status = Number(useStatus);

		const boolFilter = (val) => {
			if (val === '' || val === undefined) return undefined;
			if (val === '1' || val === 1 || val === true) return true;
			if (val === '0' || val === 0 || val === false) return false;
			return undefined;
		};

		const f1 = boolFilter(flag1);
		const f2 = boolFilter(flag2);
		const f3 = boolFilter(flag3);
		const fm = boolFilter(microMerchant);
		if (f1 !== undefined) where.flag1 = f1;
		if (f2 !== undefined) where.flag2 = f2;
		if (f3 !== undefined) where.flag3 = f3;
		if (fm !== undefined) where.micro_merchant = fm;

		const rechargePackages = await loadRechargePackagesFromQuota();
		const membershipLevelText = safeText(membershipLevel, 40);
		if (membershipLevelText) {
			const memWhere = buildMerchantMembershipWhereForAdmin(membershipLevelText, rechargePackages);
			if (memWhere) whereParts.push(memWhere);
		}

		if (loginTimeStart) where.login_time = db.command.gte(Number(loginTimeStart));
		if (loginTimeEnd) {
			where.login_time = where.login_time
				? db.command.and([where.login_time, db.command.lte(Number(loginTimeEnd))])
				: db.command.lte(Number(loginTimeEnd));
		}

		if (deviceId) {
			const bindUserIds = await listBindUserIdsByBoundDeviceKeyword(deviceId);
			const deviceWhere = buildMerchantListDeviceIdWhere(deviceId, bindUserIds);
			if (deviceWhere) whereParts.push(deviceWhere);
		}

		whereParts.unshift(where);
		const finalWhere = whereParts.length > 1 ? db.command.and(whereParts) : where;

		// count 与分页查询不可共用同一 query 链并行执行，否则会触发运行时冲突导致「获取失败」
		const [countRes, res, biz] = await Promise.all([
			merchantCollection.where(finalWhere).count(),
			merchantCollection
				.where(finalWhere)
				.orderBy(listSortField, 'desc')
				.skip(skip)
				.limit(pageSizeNum)
				.field({
					user_id: true,
					wx_avatar: true,
					agreement_signed_at: true,
					device_id: true,
					brand_name: true,
					wx_nickname: true,
					mobile: true,
					account_points: true,
					withdrawn: true,
					coupon_count: true,
					status: true,
					flag1: true,
					flag2: true,
					flag3: true,
					micro_merchant: true,
					use_status: true,
					login_time: true,
					recharge_package_id: true,
					recharge_package_price: true,
					recharge_cycle_start: true,
					recharge_update_time: true,
					silver_member: true,
					silver_member_start_at: true,
					silver_member_end_at: true,
					membership_name: true,
					agreement_version: true,
					recharge_package_quota: true,
					recharge_package_reward: true,
					estimated_free_quota: true,
					recharge_total_yuan: true,
					recharge_amount: true,
					frozen_amount: true,
					available_reward: true,
					withdraw_quota_balance: true,
					withdraw_pending_balance: true,
					agreement_signed_ip: true,
					agreement_sign_device: true,
					points_opt_whitelist: true
				})
				.get(),
			getBizSettings()
		]);
		const total = countRes.total;
		const rows = res.data || [];
		// 已提现口径：提现记录里“已到账(arrival_status=received)”的历史累计（与 H5 已到账统计同源）
		const [withdrawnByUid, frozenByUid] = await Promise.all([
			batchComputeReceivedWithdrawAmountForMerchants(rows),
			batchComputeFutureDeferredFrozenForMerchants(rows, nowTs())
		]);
		const bindUserIds = rows
			.flatMap((item) => [String(item.user_id || '').trim(), String(item._id || '').trim()])
			.filter(Boolean);
		const machinesByBindUser = await batchListBoundMachinesByBindUserIds(bindUserIds);

		// pendingWithdraw：与 H5 待提现金额/账号积分一致 = account_points（已领取未发起提现扣减的积分，1:1 元）
		const list = await Promise.all(
			rows.map(async (item) => {
			const uid = String(item.user_id || item._id || '');
			const boundMachines = collectBoundMachinesForMerchant(item, machinesByBindUser);
			const deviceDisplay = merchantDeviceDisplayText(item, machinesByBindUser);
			const deviceNo = boundMachines.length
				? boundMachines.map((m) => safeText(m.device_id, 80)).filter(Boolean).join('、')
				: safeText(item.device_id, 80) || '-';
			// 冻结：未来月未领待返合计；有分片账本用 effective（含积分优化），否则回退流水理论
			const frozenYuan = Number(frozenByUid.has(uid) ? frozenByUid.get(uid) : item.frozen_amount || 0) || 0;
			const curFrozen = Number(Number(item.frozen_amount || 0).toFixed(4));
			if (Math.abs(frozenYuan - curFrozen) > 0.0001 && item._id) {
				try {
					await merchantCollection.doc(item._id).update({
						frozen_amount: Number(frozenYuan.toFixed(4)),
						update_time: nowTs()
					});
				} catch (e) {
					console.error('listMerchants persist frozen', e);
				}
			}
			const withdrawnYuan = Number(
				(withdrawnByUid.has(uid) ? withdrawnByUid.get(uid) : Number(item.withdrawn || 0)) || 0
			);
			// 后台商户列表「剩余额度」：DB 真实剩余（随提现扣减），与 H5 充值会员展示口径一致。
			const remainingQuotaYuan = normalizeAdminRemainingQuota(item);
			const membership = resolveMerchantMembershipForAdmin(item, rechargePackages);
			return {
			id: item._id,
			userId: item.user_id || item._id,
			avatar: item.wx_avatar || '',
			agreementSigned: !!(item.agreement_signed_at || item.agreement_version),
			deviceNo,
			boundDeviceCount: boundMachines.length,
			deviceDisplay,
			wxUser: `${item.wx_nickname || '-'}\n${item.mobile || '-'}`,
			remainingQuota: toMoney(remainingQuotaYuan),
			rechargeAmount: toMoney(Number(item.recharge_amount || item.recharge_total_yuan || 0)),
			pendingWithdraw: toMoney(normalizePendingBalance(item)),
			withdrawn: toMoney(withdrawnYuan),
			frozenAmount: toMoney(frozenYuan),
			couponCount: item.coupon_count || 0,
			membershipLevel: membership.level,
			membershipOpenedAt: membership.openedAt ? formatTime(membership.openedAt) : '-',
			status: !!item.status,
			flag1: !!item.flag1,
			flag2: !!item.flag2,
			flag3: !!item.flag3,
			microMerchant: !!item.micro_merchant,
			useStatus: item.use_status === 1 ? '正常' : '异常',
			loginTime: formatTime(item.login_time),
			agreementSignedIp: safeText(item.agreement_signed_ip, 80) || '',
			agreementSignDevice: safeText(item.agreement_sign_device, 320) || '',
			pointsOptWhitelist: !!item.points_opt_whitelist
			};
		})
		);

		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page: pageNum, pageSize: pageSizeNum }
		};
	} catch (error) {
		console.error('获取商户列表失败:', error?.message || error, error && error.stack);
		return { code: 500, message: '获取失败' };
	}
}

/** 协议图是否为内嵌 base64（会把商户文档撑到数 MB，导致批量查询慢） */
function isAgreementImgInlineData(raw) {
	const s = String(raw || '').trim();
	if (!s) return false;
	if (/^data:image\//i.test(s)) return true;
	// 无 data: 前缀的超长 base64（极少见，迁移兜底）
	if (s.length > 4096 && !/^https?:\/\//i.test(s) && !s.startsWith('cloud://') && /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 200))) {
		return true;
	}
	return false;
}

function isAgreementImgCloudFileId(raw) {
	return String(raw || '')
		.trim()
		.startsWith('cloud://');
}

function isAgreementImgHttpUrl(raw) {
	return /^https?:\/\//i.test(String(raw || '').trim());
}

/**
 * 解析签署图入参：data URL / 纯 base64 → buffer；cloud:// 或 http(s) → 引用不落库再传。
 */
function parseAgreementImageInput(raw) {
	const s = String(raw || '').trim();
	if (!s) return { ok: false, message: '协议图片为空' };
	if (isAgreementImgCloudFileId(s) || isAgreementImgHttpUrl(s)) {
		return { ok: true, kind: 'ref', ref: s };
	}
	let mime = 'image/jpeg';
	let b64 = '';
	const dataMatch = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
	if (dataMatch) {
		mime = dataMatch[1] || mime;
		b64 = dataMatch[2] || '';
	} else if (isAgreementImgInlineData(s)) {
		b64 = s.replace(/\s+/g, '');
		mime = 'image/jpeg';
	} else {
		return { ok: false, message: '协议图片格式无效，请使用 data URL、云文件或 https 链接' };
	}
	b64 = String(b64 || '').replace(/\s+/g, '');
	if (!b64) return { ok: false, message: '协议图片内容为空' };
	let buffer;
	try {
		buffer = Buffer.from(b64, 'base64');
	} catch (e) {
		return { ok: false, message: '协议图片 base64 解码失败' };
	}
	if (!buffer || !buffer.length) return { ok: false, message: '协议图片内容为空' };
	// 防滥用：约 8MB
	if (buffer.length > 8 * 1024 * 1024) {
		return { ok: false, message: '协议图片过大（超过 8MB）' };
	}
	let ext = 'jpg';
	if (/png/i.test(mime)) ext = 'png';
	else if (/webp/i.test(mime)) ext = 'webp';
	else if (/gif/i.test(mime)) ext = 'gif';
	return { ok: true, kind: 'buffer', buffer, mime, ext };
}

async function safeDeleteAgreementCloudFile(fileId) {
	const id = String(fileId || '').trim();
	if (!isAgreementImgCloudFileId(id)) return;
	try {
		await uniCloud.deleteFile({ fileList: [id] });
	} catch (e) {
		console.error('safeDeleteAgreementCloudFile failed', id, e);
	}
}

/**
 * 将签署图落到云存储，库内只存 cloud://fileID（或已有 http(s) URL）。
 * 避免 agreement_img 内嵌 base64 导致 hsy-merchant-users 文档过大、慢查询。
 */
async function persistAgreementImageRef(merchantId, rawImage) {
	const parsed = parseAgreementImageInput(rawImage);
	if (!parsed.ok) return { ok: false, message: parsed.message };
	if (parsed.kind === 'ref') {
		return { ok: true, ref: parsed.ref, uploaded: false };
	}
	const mid = safeText(merchantId, 80) || 'm';
	const cloudPath = `hsy/agreement/${mid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
	try {
		const up = await uniCloud.uploadFile({
			cloudPath,
			fileContent: parsed.buffer
		});
		const fileID = String(up.fileID || up.fileId || '').trim();
		if (!fileID) return { ok: false, message: '协议图片上传失败（无 fileID）' };
		return { ok: true, ref: fileID, uploaded: true };
	} catch (e) {
		console.error('persistAgreementImageRef upload failed', e);
		return { ok: false, message: safeText(e?.message || '协议图片上传失败', 160) };
	}
}

/** 读路径：cloud:// → 临时 https；data URL / http(s) 原样返回 */
async function resolveAgreementImgDisplayUrl(raw) {
	const s = String(raw || '').trim();
	if (!s) return '';
	if (/^data:image\//i.test(s) || isAgreementImgHttpUrl(s)) return s;
	if (!isAgreementImgCloudFileId(s)) return s;
	try {
		const tempRes = await uniCloud.getTempFileURL({ fileList: [s] });
		const item = tempRes.fileList && tempRes.fileList[0];
		const url = String((item && (item.tempFileURL || item.url)) || '').trim();
		return url || s;
	} catch (e) {
		console.error('resolveAgreementImgDisplayUrl failed', e);
		return s;
	}
}

async function resolveAgreementImgDisplayUrlBatch(rawList) {
	const list = Array.isArray(rawList) ? rawList : [];
	const map = new Map();
	const cloudIds = [];
	for (const raw of list) {
		const s = String(raw || '').trim();
		if (!s) {
			map.set(raw, '');
			continue;
		}
		if (/^data:image\//i.test(s) || isAgreementImgHttpUrl(s)) {
			map.set(s, s);
		} else if (isAgreementImgCloudFileId(s)) {
			cloudIds.push(s);
		} else {
			map.set(s, s);
		}
	}
	const uniq = [...new Set(cloudIds)];
	for (let i = 0; i < uniq.length; i += 50) {
		const part = uniq.slice(i, i + 50);
		try {
			const tempRes = await uniCloud.getTempFileURL({ fileList: part });
			for (const item of tempRes.fileList || []) {
				const fid = String(item.fileID || '').trim();
				const url = String(item.tempFileURL || item.url || '').trim();
				if (fid) map.set(fid, url || fid);
			}
		} catch (e) {
			console.error('resolveAgreementImgDisplayUrlBatch failed', e);
			part.forEach((id) => {
				if (!map.has(id)) map.set(id, id);
			});
		}
	}
	return map;
}

async function fetchAgreementImageDataUrl(imgUrl) {
	const url = String(imgUrl || '').trim();
	if (!url) return { ok: false, message: '协议图片地址为空' };
	// H5 签署结果多为 data:image/...;base64,...，不能走 httpclient（会报 Invalid URL）
	if (/^data:image\//i.test(url)) {
		const mime = (url.match(/^data:(image\/[^;]+)/i) || [])[1] || 'image/jpeg';
		return { ok: true, dataUrl: url, mime };
	}
	let fetchUrl = url;
	if (fetchUrl.startsWith('cloud://')) {
		try {
			const tempRes = await uniCloud.getTempFileURL({ fileList: [fetchUrl] });
			const item = tempRes.fileList && tempRes.fileList[0];
			if (!item || !item.tempFileURL) {
				return { ok: false, message: '云存储协议图片临时链接获取失败' };
			}
			fetchUrl = String(item.tempFileURL || '').trim();
		} catch (e) {
			console.error('getTempFileURL agreement failed', e);
			return { ok: false, message: '云存储协议图片链接解析失败' };
		}
	}
	if (!/^https?:\/\//i.test(fetchUrl)) {
		return { ok: false, message: '协议图片地址格式无效，仅支持 https 链接、云文件或签署图 data URL' };
	}
	try {
		const resp = await uniCloud.httpclient.request(fetchUrl, {
			method: 'GET',
			dataType: 'arraybuffer',
			timeout: 90000
		});
		const status = Number(resp.status || resp.statusCode || 0);
		if (status && status !== 200) {
			return { ok: false, message: `读取协议图片失败(${status})` };
		}
		const buf = resp.data;
		if (!buf || !(buf.byteLength || buf.length)) {
			return { ok: false, message: '协议图片内容为空' };
		}
		const lower = fetchUrl.toLowerCase();
		let mime = 'image/jpeg';
		if (lower.includes('.png')) mime = 'image/png';
		else if (lower.includes('.webp')) mime = 'image/webp';
		const b64 = Buffer.from(buf).toString('base64');
		return { ok: true, dataUrl: `data:${mime};base64,${b64}`, mime };
	} catch (e) {
		console.error('fetchAgreementImageDataUrl failed', e);
		return { ok: false, message: safeText(e?.message || '读取协议图片失败', 120) };
	}
}

async function merchantAgreementImage(data = {}) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId || data?.id;
		const merchant = await getMerchantByIdOrUserId(merchantKey, { includeAgreementImg: true });
		if (!merchant) return { code: 404, message: '商户不存在' };
		const img = String(merchant.agreement_img || '').trim();
		if (!img) return { code: 404, message: '该商户未签署协议或签署图片不存在' };
		const displayUrl = await resolveAgreementImgDisplayUrl(img);
		const base = {
			merchantId: merchant._id,
			wxNickname: safeText(merchant.wx_nickname || '', 60),
			mobile: safeText(merchant.mobile || '', 20),
			agreementImg: displayUrl || img,
			agreementSignedAt: formatTime(merchant.agreement_signed_at),
			agreementSignedIp: safeText(merchant.agreement_signed_ip, 80) || '',
			agreementSignDevice: safeText(merchant.agreement_sign_device, 320) || ''
		};
		if (data?.forPdfExport === true || data?.forPdfExport === '1' || data?.forPdfExport === 1) {
			const fetched = await fetchAgreementImageDataUrl(img);
			if (!fetched.ok) return { code: 500, message: fetched.message || '读取协议图片失败' };
			return {
				code: 0,
				message: 'ok',
				data: {
					...base,
					agreementImgDataUrl: fetched.dataUrl
				}
			};
		}
		return {
			code: 0,
			message: 'ok',
			data: base
		};
	} catch (e) {
		console.error('merchantAgreementImage failed', e);
		return { code: 500, message: '加载协议图片失败' };
	}
}

/**
 * 管理端：清除商户协议签署记录（签名图、版本、签署时间与 IP/设备等），商户需在 H5 重新签署。
 */
async function merchantAgreementClear(data = {}, event = {}) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId || data?.id;
		const merchant = await getMerchantByIdOrUserId(merchantKey, { includeAgreementImg: true });
		if (!merchant) return { code: 404, message: '商户不存在' };
		const now = nowTs();
		const prevImg = String(merchant.agreement_img || '').trim();
		await merchantCollection.doc(merchant._id).update({
			agreement_img: '',
			agreement_signed_at: null,
			agreement_version: '',
			agreement_signed_ip: '',
			agreement_sign_device: '',
			update_time: now
		});
		await safeDeleteAgreementCloudFile(prevImg);
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || '商户',
			action: 'merchant_agreement_clear',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: '管理员清除协议签署记录，需重新签署',
			operator_source: 'admin',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});
		return { code: 0, message: '已删除协议记录，该商户需重新签署' };
	} catch (e) {
		console.error('merchantAgreementClear failed', e);
		return { code: 500, message: safeText(e?.message || '操作失败', 180) };
	}
}

/**
 * 商户列表批量：按账号 user_id 汇总“已到账提现”历史累计金额。
 * 口径与 H5 首页已到账统计一致（hsy-withdraw-records.arrival_status=received 的 amount 求和）。
 * 优先用聚合一次算清；旧版 skip 分页在提现笔数极大时会触发超时/扫描上限，导致列表后几页 500。
 */
async function batchComputeReceivedWithdrawAmountForMerchants(merchantDocs) {
	const amountByUid = new Map();
	const rows = Array.isArray(merchantDocs) ? merchantDocs : [];
	if (!rows.length) return amountByUid;
	const uids = [...new Set(rows.map((m) => String(m.user_id || m._id || '')).filter(Boolean))];
	if (!uids.length) return amountByUid;

	for (const uid of uids) amountByUid.set(uid, 0);
	const _ = db.command;
	const $ = db.command.aggregate;

	const finalizeMap = () => {
		for (const [uid, sum] of amountByUid.entries()) {
			amountByUid.set(uid, Number(Number(sum || 0).toFixed(2)));
		}
		return amountByUid;
	};

	try {
		const agg = await withdrawCollection
			.aggregate()
			.match(
				_.and([
					{ is_deleted: false },
					{ merchant_user_id: _.in(uids) },
					{ arrival_status: 'received' }
				])
			)
			.group({
				_id: '$merchant_user_id',
				total: $.sum('$amount')
			})
			.end();
		for (const row of agg.data || []) {
			const uid = row._id != null && row._id !== '' ? String(row._id) : '';
			if (!uid) continue;
			amountByUid.set(uid, Number(Number(row.total || 0).toFixed(2)));
		}
		return finalizeMap();
	} catch (e) {
		console.error('batchComputeReceivedWithdrawAmountForMerchants aggregate failed, fallback scan', e);
	}

	const pageSize = 5000;
	let skip = 0;
	let guard = 0;
	while (guard < 40) {
		const ret = await withdrawCollection
			.where(
				_.and([
					{ is_deleted: false },
					{ merchant_user_id: _.in(uids) },
					{ arrival_status: 'received' }
				])
			)
			.field({ merchant_user_id: true, amount: true })
			.skip(skip)
			.limit(pageSize)
			.get();
		const list = ret.data || [];
		if (!list.length) break;
		for (const row of list) {
			const uid = String(row.merchant_user_id || '');
			if (!uid) continue;
			const prev = Number(amountByUid.get(uid) || 0);
			amountByUid.set(uid, Number((prev + Number(row.amount || 0)).toFixed(4)));
		}
		if (list.length < pageSize) break;
		skip += pageSize;
		guard += 1;
	}

	return finalizeMap();
}

function buildMerchantMembershipWhereForAdmin(levelText, rechargePackages = []) {
	const _ = db.command;
	const lvl = String(levelText || '').trim();
	if (!lvl) return null;
	const now = nowTs();
	if (lvl === '白银会员') {
		return _.or([
			{ membership_name: lvl },
			_.and([
			{ silver_member: true },
			_.or([{ silver_member_end_at: _.gt(now) }, { silver_member_end_at: 0 }, { silver_member_end_at: _.exists(false) }])
			])
		]);
	}
	if (lvl === '普通会员') {
		return _.and([
			_.or([{ membership_name: lvl }, { membership_name: _.exists(false) }, { membership_name: '' }, { membership_name: null }]),
			_.or([{ silver_member: _.neq(true) }, { silver_member: _.exists(false) }]),
			_.or([{ recharge_package_price: _.lte(0) }, { recharge_package_price: _.exists(false) }, { recharge_package_price: null }]),
			_.or([{ recharge_package_id: '' }, { recharge_package_id: _.exists(false) }, { recharge_package_id: null }])
		]);
	}
	const packages = Array.isArray(rechargePackages) ? rechargePackages : [];
	const ids = [...new Set(packages.filter((x) => String(x?.membershipName || '').trim() === lvl).map((x) => String(x.id || '').trim()).filter(Boolean))];
	const prices = [...new Set(packages.filter((x) => String(x?.membershipName || '').trim() === lvl).map((x) => Number(x.price || 0)).filter((n) => Number.isFinite(n) && n > 0))];
	if (!ids.length && !prices.length) {
		return { membership_name: lvl };
	}
	const orParts = [];
	orParts.push({ membership_name: lvl });
	if (ids.length) orParts.push({ recharge_package_id: _.in(ids) });
	if (prices.length) orParts.push({ recharge_package_price: _.in(prices) });
	return _.or(orParts);
}

function resolveMerchantMembershipForAdmin(merchant, rechargePackages = null) {
	const now = nowTs();
	const silverStartAt = Number(merchant?.silver_member_start_at || 0);
	const silverEndAt = Number(merchant?.silver_member_end_at || 0);
	const hasRechargeMembership = merchantHasRechargeMembership(merchant);
	if (hasRechargeMembership) {
		const directName = String(merchant?.membership_name || '').trim();
		if (directName) {
			return {
				level: directName,
				openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0)
			};
		}
		const tag = String(merchant?.member_tier || merchant?.membership_tier || merchant?.h5_member_tier || '').toLowerCase();
		if (tag === 'diamond') {
			return { level: '钻石会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
		if (tag === 'platinum') {
			return { level: '铂金会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
		if (tag === 'white_gold' || tag === 'gold' || tag === 'whitegold') {
			return { level: '白金会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
		const m = h5MembershipInfo(merchant, Array.isArray(rechargePackages) && rechargePackages.length ? rechargePackages : null);
		if (m && m.tier && m.tier !== 'normal') {
			return {
				level: String(m.name || '会员'),
				openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0)
			};
		}
		const reward = Number(merchant?.recharge_package_reward || 0);
		const quota = Number(merchant?.estimated_free_quota || merchant?.recharge_package_quota || 0);
		if (reward >= 7600 || quota >= 2000000) {
			return { level: '钻石会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
		if (reward >= 5700 || quota >= 1500000) {
			return { level: '铂金会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
		if (reward >= 3800 || quota >= 1000000) {
			return { level: '白金会员', openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0) };
		}
	}
	if (merchant?.silver_member === true && (!silverEndAt || silverEndAt > now)) {
		return { level: '白银会员', openedAt: silverStartAt };
	}
	const directName = String(merchant?.membership_name || '').trim();
	if (directName && directName !== '普通会员') {
		return {
			level: directName,
			openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0)
		};
	}
	const m = h5MembershipInfo(merchant, Array.isArray(rechargePackages) && rechargePackages.length ? rechargePackages : null);
	if (m && m.tier && m.tier !== 'normal') {
		return {
			level: String(m.name || '会员'),
			openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0)
		};
	}
	return { level: '普通会员', openedAt: 0 };
}

async function updateSwitch(data) {
	try {
		const { id, field, value } = data || {};
		const allowFields = ['status', 'flag1', 'flag2', 'flag3', 'micro_merchant'];
		if (!id || !allowFields.includes(field)) {
			return { code: 400, message: '参数错误' };
		}
		const boolValue = !!value;
		const result = await merchantCollection.doc(id).update({ [field]: boolValue });
		return { code: 0, message: '更新成功', data: result };
	} catch (error) {
		console.error('更新商户开关失败:', error);
		return { code: 500, message: '更新失败' };
	}
}

/** 按领取自然月汇总已领积分：首期与分期待返分开，分期待返与 B 片级明细同口径（目标月+来源月） */
function buildMonthlyClaimedSummaryFromPackets(packets) {
	const byClaimYm = {};
	for (const p of packets || []) {
		if (String(p.status || '') !== 'claimed') continue;
		const amt = Number(p.amount || 0);
		if (!(amt > 0)) continue;
		const claimTs = Number(p.claimed_time || p.update_time || 0);
		if (!claimTs) continue;
		const claimYm = subsidyEngine.monthNoFromTs(claimTs);
		const sourceYm = String(p.subsidy_flow_month || p.month_no || claimYm).trim();
		const targetYm = String(p.month_no || sourceYm).trim();
		const kind = String(p.subsidy_kind || '').trim();
		if (!claimYm || !sourceYm) continue;
		if (!byClaimYm[claimYm]) {
			byClaimYm[claimYm] = { firstBySource: {}, deferredByTargetSource: {} };
		}
		const row = byClaimYm[claimYm];
		if (kind === 'release_pool_history') {
			const key = `${targetYm}|${sourceYm}`;
			row.deferredByTargetSource[key] = Number(((row.deferredByTargetSource[key] || 0) + amt).toFixed(4));
		} else {
			row.firstBySource[sourceYm] = Number(((row.firstBySource[sourceYm] || 0) + amt).toFixed(4));
		}
	}
	return Object.keys(byClaimYm)
		.sort((a, b) => String(a).localeCompare(String(b)))
		.map((ym) => {
			const row = byClaimYm[ym] || {};
			const firstSourceBreakdown = Object.keys(row.firstBySource || {})
				.sort((a, b) => String(a).localeCompare(String(b)))
				.map((sourceYm) => ({
					sourceYm,
					points: Number(Number(row.firstBySource[sourceYm] || 0).toFixed(4))
				}));
			const deferredItems = Object.keys(row.deferredByTargetSource || {})
				.sort((a, b) => String(a).localeCompare(String(b)))
				.map((key) => {
					const [targetYm, sourceYm] = String(key).split('|');
					return {
						targetYm,
						sourceYm,
						points: Number(Number(row.deferredByTargetSource[key] || 0).toFixed(4))
					};
				});
			const firstTotal = Number(firstSourceBreakdown.reduce((s, x) => s + Number(x.points || 0), 0).toFixed(4));
			const deferredTotal = Number(deferredItems.reduce((s, x) => s + Number(x.points || 0), 0).toFixed(4));
			const totalPoints = Number((firstTotal + deferredTotal).toFixed(4));
			return {
				ym,
				totalPoints,
				firstRelease: {
					totalPoints: firstTotal,
					sourceBreakdown: firstSourceBreakdown
				},
				deferredRelease: {
					totalPoints: deferredTotal,
					items: deferredItems
				}
			};
		});
}

async function merchantPointsMonthlyInsight(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const uid = String(merchant.user_id || merchant._id || '');
		if (!uid) return { code: 400, message: '商户标识无效' };
		const now = nowTs();
		const curYm = subsidyEngine.monthNoFromTs(now);
		const bizInsight = await getBizSettings();
		const optimizeConfig = bizInsight.optimizeConfig;
		const tRes = await machineTradeCollection
			.where({ user_id: uid, trade_type: db.command.in(['real', 'virtual']), amount: db.command.gt(0) })
			.field({ amount: true, cashback: true, release_amount: true, release_ratio: true, create_time: true })
			.orderBy('create_time', 'asc')
			.limit(20000)
			.get();
		const trades = tRes.data || [];
		const flowByYm = {};
		for (const t of trades) {
			const amount = Number(t.amount || 0);
			if (!(amount > 0)) continue;
			const tradeYm = subsidyEngine.monthNoFromTs(Number(t.create_time || now));
			flowByYm[tradeYm] = Number(((flowByYm[tradeYm] || 0) + amount).toFixed(2));
		}
		const sourceSlicesByYm = subsidyEngine.buildDeferredSlicesByMonth(trades, now, 10000, optimizeConfig);
		const dueSlicesByTargetSource = {};
		Object.keys(sourceSlicesByYm).forEach((srcYm) => {
			const slices = sourceSlicesByYm[srcYm] || [];
			for (let k = 1; k <= 4; k += 1) {
				const targetYm = addCalendarMonthsYm(srcYm, k);
				if (!dueSlicesByTargetSource[targetYm]) dueSlicesByTargetSource[targetYm] = {};
				dueSlicesByTargetSource[targetYm][srcYm] = slices.slice();
			}
		});
		// 按规则模拟“档位释放分片”（0分片也会占档位）
		const releasedSlotsByTargetSource = {};
		const releasedPointsByTargetSource = {};
		Object.keys(flowByYm)
			.sort((a, b) => String(a).localeCompare(String(b)))
			.forEach((targetYm) => {
				const tiers = Math.floor(Number(flowByYm[targetYm] || 0) / 10000);
				if (tiers <= 0) return;
				const srcMap = dueSlicesByTargetSource[targetYm] || {};
				const srcMonths = Object.keys(srcMap).sort((a, b) => String(a).localeCompare(String(b)));
				for (const srcYm of srcMonths) {
					const slices = Array.isArray(srcMap[srcYm]) ? srcMap[srcYm] : [];
					// 与引擎保持一致：每个来源月都可独立使用当月档位数量
					const canGrant = Math.min(slices.length, tiers);
					if (canGrant <= 0) continue;
					if (!releasedSlotsByTargetSource[targetYm]) releasedSlotsByTargetSource[targetYm] = {};
					if (!releasedPointsByTargetSource[targetYm]) releasedPointsByTargetSource[targetYm] = {};
					releasedSlotsByTargetSource[targetYm][srcYm] = Number(
						(releasedSlotsByTargetSource[targetYm][srcYm] || 0) + canGrant
					);
					let pts = 0;
					for (let i = 0; i < canGrant; i += 1) pts += Number(slices[i] || 0);
					releasedPointsByTargetSource[targetYm][srcYm] = Number(
						((releasedPointsByTargetSource[targetYm][srcYm] || 0) + pts).toFixed(4)
					);
				}
			});
		const packetRes = await incomePacketCollection
			.where({ merchant_user_id: uid, is_deleted: false })
			.field({
				month_no: true,
				subsidy_flow_month: true,
				subsidy_kind: true,
				amount: true,
				status: true,
				expire_time: true,
				claimed_time: true,
				update_time: true
			})
			.limit(20000)
			.get();
		const packets = packetRes.data || [];
		const monthlyClaimedSummary = buildMonthlyClaimedSummaryFromPackets(packets);
		// 「生成积分」= 实际已领取（status=claimed），按领取自然月；过期/未领不计
		const claimedGenByYm = {};
		for (const p of packets) {
			if (String(p.status || '') !== 'claimed') continue;
			const amt = Number(Number(p.amount || 0).toFixed(4));
			if (!(amt >= 0.01)) continue;
			const claimTs = Number(p.claimed_time || p.update_time || 0);
			if (!claimTs) continue;
			const claimYm = subsidyEngine.monthNoFromTs(claimTs);
			if (!claimYm) continue;
			claimedGenByYm[claimYm] = Number(((claimedGenByYm[claimYm] || 0) + amt).toFixed(4));
		}
		const pendingByTargetSource = {};
		for (const p of packets) {
			const targetYm = String(p.month_no || '');
			const sourceYm = String(p.subsidy_flow_month || targetYm || '');
			if (!targetYm) continue;
			if (String(p.status || '') === 'pending') {
				if (!pendingByTargetSource[targetYm]) pendingByTargetSource[targetYm] = {};
				pendingByTargetSource[targetYm][sourceYm] = Number(
					((pendingByTargetSource[targetYm][sourceYm] || 0) + Number(p.amount || 0)).toFixed(4)
				);
			}
		}
		// 分片生效值（积分优化后）：片积分预览优先用 effective_amount
		const sliceEffByKey = new Map();
		try {
			const sliceRows = await subsidyEngine.fetchAllQueryPages(
				db,
				'hsy-points-slice-state',
				{ merchant_user_id: uid, is_deleted: db.command.neq(true) },
				{
					field: {
						target_ym: true,
						source_ym: true,
						slice_index: true,
						effective_amount: true,
						manual_amount: true,
						system_amount: true,
						original_amount: true
					}
				}
			);
			for (const row of sliceRows || []) {
				const targetYm = String(row.target_ym || '').trim();
				const sourceYm = String(row.source_ym || '').trim();
				const idx = Number(row.slice_index);
				if (!targetYm || !sourceYm || !Number.isFinite(idx) || idx < 0) continue;
				let eff = Number(row.effective_amount);
				if (!Number.isFinite(eff)) {
					if (row.manual_amount != null && row.manual_amount !== '') {
						eff = Number(row.manual_amount);
					} else {
						eff = Number(row.system_amount != null ? row.system_amount : row.original_amount || 0);
					}
				}
				sliceEffByKey.set(`${targetYm}|${sourceYm}|${idx}`, Number(Number(eff || 0).toFixed(4)));
			}
		} catch (eSlice) {
			console.error('merchantPointsMonthlyInsight load slices', eSlice);
		}
		const resolveSlicePreview = (targetYm, sourceYm, theorySlices) => {
			const slices = Array.isArray(theorySlices) ? theorySlices : [];
			return slices.slice(0, 12).map((x, i) => {
				const key = `${targetYm}|${sourceYm}|${i}`;
				if (sliceEffByKey.has(key)) return sliceEffByKey.get(key);
				return Number(Number(x || 0).toFixed(4));
			});
		};
		const historyYmSet = new Set([
			...Object.keys(claimedGenByYm),
			...Object.keys(dueSlicesByTargetSource),
			...Object.keys(releasedSlotsByTargetSource)
		]);
		const history = [...historyYmSet]
			.sort((a, b) => String(a).localeCompare(String(b)))
			.map((ym) => {
				const flow = Number(flowByYm[ym] || 0);
				const tiers = Math.floor(flow / 10000);
				const dueMap = dueSlicesByTargetSource[ym] || {};
				const relMap = releasedSlotsByTargetSource[ym] || {};
				const relPtsMap = releasedPointsByTargetSource[ym] || {};
				const monthEnded = String(ym).localeCompare(String(curYm)) < 0;
				const sourceBreakdown = Object.keys(dueMap)
					.sort((a, b) => String(a).localeCompare(String(b)))
					.map((sourceYm) => {
						const slices = Array.isArray(dueMap[sourceYm]) ? dueMap[sourceYm] : [];
						const duePoints = Number(slices.reduce((s, x) => s + Number(x || 0), 0).toFixed(4));
						const dueBlocks = slices.length;
						const releasedBlocks = Number(relMap[sourceYm] || 0);
						const releasedPoints = Number(Number(relPtsMap[sourceYm] || 0).toFixed(4));
						// 仅已过去月份才允许统计“流失”；当前月和未来月只能是“未到期/待释放”
						const lostBlocks = monthEnded ? Math.max(0, dueBlocks - releasedBlocks) : 0;
						const lostPoints = monthEnded ? Number(Math.max(0, duePoints - releasedPoints).toFixed(4)) : 0;
						return {
							sourceYm,
							duePoints: Number(duePoints.toFixed(4)),
							dueBlocks,
							releasedBlocks,
							releasedPoints,
							lostBlocks,
							lostPoints
						};
					});
				const duePointsTotal = sourceBreakdown.reduce((s, x) => s + Number(x.duePoints || 0), 0);
				const dueBlocksTotal = sourceBreakdown.reduce((s, x) => s + Number(x.dueBlocks || 0), 0);
				const releasedBlocksTotal = sourceBreakdown.reduce((s, x) => s + Number(x.releasedBlocks || 0), 0);
				const releasedPointsTotal = sourceBreakdown.reduce((s, x) => s + Number(x.releasedPoints || 0), 0);
				const lostBlocksTotal = sourceBreakdown.reduce((s, x) => s + Number(x.lostBlocks || 0), 0);
				const lostPointsTotal = sourceBreakdown.reduce((s, x) => s + Number(x.lostPoints || 0), 0);
				return {
					ym,
					flowYuan: Number(flow.toFixed(2)),
					generatedPoints: Number(Number(claimedGenByYm[ym] || 0).toFixed(4)),
					flowTiers: tiers,
					monthEnded,
					duePointsTotal: Number(duePointsTotal.toFixed(4)),
					dueBlocksTotal,
					releasedPointsTotal: Number(releasedPointsTotal.toFixed(4)),
					releasedBlocksTotal,
					lostBlocksTotal,
					lostPoints: Number(lostPointsTotal.toFixed(4)),
					sourceBreakdown
				};
			});
		const futureYmSet = new Set([
			...Object.keys(dueSlicesByTargetSource).filter((ym) => String(ym).localeCompare(String(curYm)) >= 0),
			...Object.keys(pendingByTargetSource).filter((ym) => String(ym).localeCompare(String(curYm)) >= 0)
		]);
		const future = [...futureYmSet]
			.sort((a, b) => String(a).localeCompare(String(b)))
			.map((ym) => {
				const dueSrc = dueSlicesByTargetSource[ym] || {};
				const pendingSrc = pendingByTargetSource[ym] || {};
				const srcYmSet = new Set([...Object.keys(dueSrc), ...Object.keys(pendingSrc)]);
				const sourceBreakdown = [...srcYmSet]
					.sort((a, b) => String(a).localeCompare(String(b)))
					.map((sourceYm) => {
						const slices = Array.isArray(dueSrc[sourceYm]) ? dueSrc[sourceYm] : [];
						const duePoints = Number(slices.reduce((s, x) => s + Number(x || 0), 0).toFixed(4));
						return {
							sourceYm,
							duePoints,
							dueBlocks: slices.length,
							packetPendingPoints: Number(Number(pendingSrc[sourceYm] || 0).toFixed(4))
						};
					});
				const duePointsTotal = sourceBreakdown.reduce((s, x) => s + Number(x.duePoints || 0), 0);
				const packetPendingPointsTotal = sourceBreakdown.reduce((s, x) => s + Number(x.packetPendingPoints || 0), 0);
				return {
					ym,
					duePointsTotal: Number(duePointsTotal.toFixed(4)),
					packetPendingPointsTotal: Number(packetPendingPointsTotal.toFixed(4)),
					sourceBreakdown
				};
			});
		const overviewYmSet = new Set([
			...Object.keys(claimedGenByYm),
			...Object.keys(flowByYm),
			...Object.keys(dueSlicesByTargetSource),
			...Object.keys(releasedSlotsByTargetSource),
			...Object.keys(pendingByTargetSource)
		]);
		const monthlyOverview = [...overviewYmSet]
			.sort((a, b) => String(a).localeCompare(String(b)))
			.map((ym) => {
				const dueSrc = dueSlicesByTargetSource[ym] || {};
				const relSlotsSrc = releasedSlotsByTargetSource[ym] || {};
				const relPtsSrc = releasedPointsByTargetSource[ym] || {};
				const pendingSrc = pendingByTargetSource[ym] || {};
				const dueSlices = Object.values(dueSrc).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
				const duePoints = Object.values(dueSrc).reduce(
					(s, arr) => s + (Array.isArray(arr) ? arr.reduce((x, y) => x + Number(y || 0), 0) : 0),
					0
				);
				const releasedSlices = Object.values(relSlotsSrc).reduce((s, x) => s + Number(x || 0), 0);
				const releasedPoints = Object.values(relPtsSrc).reduce((s, x) => s + Number(x || 0), 0);
				const pendingPoints = Object.values(pendingSrc).reduce((s, x) => s + Number(x || 0), 0);
				const monthEnded = String(ym).localeCompare(String(curYm)) < 0;
				const lostSlices = monthEnded ? Math.max(0, dueSlices - releasedSlices) : 0;
				const lostPoints = monthEnded ? Math.max(0, Number((duePoints - releasedPoints).toFixed(4))) : 0;
				return {
					ym,
					generatedPoints: Number(Number(claimedGenByYm[ym] || 0).toFixed(4)),
					flowYuan: Number(Number(flowByYm[ym] || 0).toFixed(2)),
					tiers: Math.floor(Number(flowByYm[ym] || 0) / 10000),
					dueSlices,
					releasedSlices,
					lostSlices,
					releasedPoints: Number(releasedPoints.toFixed(4)),
					lostPoints: Number(lostPoints.toFixed(4)),
					pendingPoints: Number(pendingPoints.toFixed(4))
				};
			});
		const sliceDetails = [];
		Object.keys(dueSlicesByTargetSource)
			.sort((a, b) => String(a).localeCompare(String(b)))
			.forEach((targetYm) => {
				const dueSrc = dueSlicesByTargetSource[targetYm] || {};
				const relSlotsSrc = releasedSlotsByTargetSource[targetYm] || {};
				const relPtsSrc = releasedPointsByTargetSource[targetYm] || {};
				const monthEnded = String(targetYm).localeCompare(String(curYm)) < 0;
				Object.keys(dueSrc)
					.sort((a, b) => String(a).localeCompare(String(b)))
					.forEach((sourceYm) => {
						const slices = Array.isArray(dueSrc[sourceYm]) ? dueSrc[sourceYm] : [];
						const dueSliceCount = slices.length;
						const preview = resolveSlicePreview(targetYm, sourceYm, slices);
						const duePoints = Number(
							slices
								.reduce((s, x, i) => {
									const key = `${targetYm}|${sourceYm}|${i}`;
									const v = sliceEffByKey.has(key) ? sliceEffByKey.get(key) : Number(x || 0);
									return s + Number(v || 0);
								}, 0)
								.toFixed(4)
						);
						const releasedSliceCount = Number(relSlotsSrc[sourceYm] || 0);
						const releasedPoints = Number(relPtsSrc[sourceYm] || 0);
						const lostSliceCount = monthEnded ? Math.max(0, dueSliceCount - releasedSliceCount) : 0;
						const lostPoints = monthEnded ? Math.max(0, Number((duePoints - releasedPoints).toFixed(4))) : 0;
						sliceDetails.push({
							targetYm,
							sourceYm,
							dueSliceCount,
							duePoints,
							releasedSliceCount,
							releasedPoints: Number(releasedPoints.toFixed(4)),
							lostSliceCount,
							lostPoints: Number(lostPoints.toFixed(4)),
							slicePreview: preview
						});
					});
			});
		const tradeSamples = (trades || []).slice(-200).map((t, idx) => {
			const amount = Number(t.amount || 0);
			const total = Number((amount * 0.0038).toFixed(4));
			const first = Number(t.release_amount != null ? t.release_amount : total);
			const deferred = Number((total - first).toFixed(4));
			return {
				id: `${t._id || 't'}_${idx}`,
				tradeYm: subsidyEngine.monthNoFromTs(Number(t.create_time || now)),
				time: formatTime(Number(t.create_time || 0)),
				amount: Number(amount.toFixed(2)),
				totalPoints: total,
				firstPoints: Number(first.toFixed(4)),
				deferredPerMonth: Number(deferred.toFixed(4))
			};
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: {
					id: merchant._id,
					userId: uid,
					name: String(merchant.wx_nickname || merchant.mobile || uid)
				},
				currentYm: curYm,
				monthlyOverview,
				monthlyClaimedSummary,
				sliceDetails,
				tradeSamples,
				history,
				future
			}
		};
	} catch (e) {
		console.error('merchantPointsMonthlyInsight failed', e);
		return { code: 500, message: '获取积分月度分析失败' };
	}
}

/**
 * 模拟商户注册（H5 未开发时用于生成测试数据）
 * 入参：device_id（必填）、mobile、wx_nickname、wx_avatar、agreement_img、brand_name
 */
async function simulateRegister(data) {
	try {
		const {
			device_id,
			mobile = '',
			wx_nickname = '',
			wx_avatar = '',
			agreement_img = '',
			brand_name = ''
		} = data || {};

		const deviceId = String(device_id || '').trim();
		if (!deviceId) {
			return { code: 400, message: '请填写机具号' };
		}

		// 同一机具号已存在则不允许重复模拟注册
		const exist = await merchantCollection.where({ device_id: deviceId }).get();
		if (exist.data && exist.data.length > 0) {
			return { code: 400, message: '该机具号已绑定商户，请勿重复注册' };
		}

		const simMobile = String(mobile || '').trim();
		if (isValidCnMobile(simMobile)) {
			const mDup = await merchantCollection.where({ mobile: simMobile }).limit(1).get();
			if (mDup.data && mDup.data.length) {
				return { code: 400, message: '该手机号已被系统内其他商户使用，请更换' };
			}
		}

		let brandName = brand_name || '';
		if (!brandName) {
			const machineRes = await db.collection('hsy-machine').where({ device_id: deviceId }).get();
			if (machineRes.data && machineRes.data.length > 0) {
				brandName = machineRes.data[0].brand_name || '';
			}
		}

		const userId = 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
		const now = Date.now();

		let agreementImgRef = String(agreement_img || '').trim();
		if (agreementImgRef && isAgreementImgInlineData(agreementImgRef)) {
			const persisted = await persistAgreementImageRef(userId, agreementImgRef);
			if (!persisted.ok) return { code: 500, message: persisted.message || '协议图片上传失败' };
			agreementImgRef = persisted.ref;
		}

		const doc = {
			user_id: userId,
			device_id: deviceId,
			mobile: String(mobile || '').trim(),
			wx_nickname: String(wx_nickname || '').trim() || '模拟用户',
			wx_avatar: String(wx_avatar || '').trim(),
			agreement_img: agreementImgRef,
			brand_name: brandName,
			remaining_quota: 0,
			pending_withdraw: 0,
			withdrawn: 0,
			frozen_amount: 0,
			coupon_count: 0,
			use_status: 1,
			status: true,
			flag1: false,
			flag2: false,
			flag3: false,
			micro_merchant: false,
			login_time: now
		};

		const addRes = await merchantCollection.add(doc);

		// 将机具管理中对应机具的「是否绑定」更新为已绑定
		const machineCollection = db.collection('hsy-machine');
		await machineCollection
			.where({ device_id: deviceId, is_deleted: false })
			.update({
				is_bound: 1,
				bind_time: now,
				bind_user_id: userId,
				bind_user_name: doc.wx_nickname
			});

		return {
			code: 0,
			message: '模拟注册成功',
			data: { id: addRes.id }
		};
	} catch (error) {
		console.error('模拟商户注册失败:', error);
		return { code: 500, message: '模拟注册失败' };
	}
}

async function resolveMerchantByBoundDeviceId(deviceId) {
	const id = safeText(deviceId, 80);
	if (!id) return { code: 400, message: '请输入机具编号' };
	const machineRes = await machineCollection.where({ device_id: id, is_deleted: false }).limit(1).get();
	if (!machineRes.data || !machineRes.data.length) {
		return { code: 404, message: '机具不存在' };
	}
	const machine = machineRes.data[0];
	if (machine.is_bound !== 1 || !machine.bind_user_id) {
		return { code: 400, message: '该机具未绑定商户' };
	}
	const merchant = await getMerchantByIdOrUserId(machine.bind_user_id);
	if (!merchant) {
		return { code: 404, message: '未找到机具绑定的商户' };
	}
	return { code: 0, machine, merchant };
}

async function offlineFirstRechargeLookup(data) {
	try {
		const resolved = await resolveMerchantByBoundDeviceId(data?.deviceId || data?.device_id);
		if (resolved.code !== 0) return resolved;
		const { machine, merchant } = resolved;
		const hasRecharge = merchantHasRechargeMembership(merchant);
		return {
			code: 0,
			message: 'ok',
			data: {
				deviceId: machine.device_id,
				brandName: machine.brand_name || '',
				bindUserName: machine.bind_user_name || merchant.wx_nickname || '',
				merchantId: merchant._id,
				merchantUserId: merchant.user_id || merchant._id,
				wxNickname: merchant.wx_nickname || '',
				mobile: merchant.mobile || '',
				membershipName: merchant.membership_name || '普通会员',
				hasRechargeMembership: hasRecharge,
				canOfflineFirstRecharge: !hasRecharge
			}
		};
	} catch (error) {
		console.error('offlineFirstRechargeLookup failed:', error);
		return { code: 500, message: '查询失败' };
	}
}

async function offlineFirstRecharge(data, event) {
	try {
		const deviceId = safeText(data?.deviceId || data?.device_id, 80);
		const packageId = safeText(data?.packageId, 80);
		const rechargeGiftType = safeText(data?.rechargeGiftType || data?.giftType, 20);
		if (!deviceId) return { code: 400, message: '请输入机具编号' };
		if (!packageId) return { code: 400, message: '请选择套餐' };

		const resolved = await resolveMerchantByBoundDeviceId(deviceId);
		if (resolved.code !== 0) return resolved;
		const { machine, merchant } = resolved;

		const rechargePackages = await loadRechargePackagesFromQuota();
		const pkg = pickRechargePackage(packageId, rechargePackages);
		if (!pkg) return { code: 404, message: '套餐不存在或已下架' };

		const giftRequired = Boolean(pkg.giftChoiceRequired) || Number(pkg.price) === RECHARGE_GIFT_PRICE;
		let rechargeGiftLabel = '';
		if (giftRequired) {
			if (rechargeGiftType !== 'speaker' && rechargeGiftType !== 'scan_pos') {
				return { code: 400, message: '该套餐需选择赠品：蓝牙音响或扫码POS机' };
			}
			rechargeGiftLabel = (RECHARGE_GIFT_OPTIONS.find((x) => x.value === rechargeGiftType) || {}).label || '';
		}

		if (merchantHasRechargeMembership(merchant)) {
			return { code: 400, message: '该商户已有充值会员档位，请通过 H5 补差价升级' };
		}

		const payAmount = Number(pkg.price || 0);
		const addQuota = Number(pkg.quota || 0);
		if (!(payAmount > 0)) return { code: 400, message: '套餐价格无效' };

		const now = nowTs();
		const orderNo = `OFF${now}${randomStr(6).toUpperCase()}`.slice(0, 28);
		const payFeeFen = Math.round(payAmount * 100);
		const orderCustom = {
			merchant_id: merchant._id,
			package_id: pkg.id,
			package_title: pkg.title,
			target_membership_name: safeText(pkg.membershipName || '', 40),
			target_price: Number(pkg.price || 0),
			before_price: 0,
			target_quota: Number(pkg.quota || 0),
			target_reward: Number(pkg.rewardYuan || 0),
			add_quota: addQuota,
			before_reward: 0,
			paid_amount: payAmount,
			offline_recharge: true,
			offline_device_id: deviceId,
			operator_source: 'admin',
			operator: getOperator(event),
			log_content: `线下首充额度: 机具 ${deviceId}（${machine.brand_name || ''}），套餐 ${pkg.title || ''}，权益与 H5 微信充值一致`,
			...(giftRequired ? { recharge_gift_type: rechargeGiftType, recharge_gift_label: rechargeGiftLabel } : {})
		};

		const addPayRes = await uniPayOrderCollection.add({
			provider: 'offline',
			provider_pay_type: 'admin',
			uni_platform: 'web',
			status: 1,
			type: 'h5_quota_recharge',
			order_no: orderNo,
			out_trade_no: orderNo,
			user_id: merchant.user_id || merchant._id,
			nickname: merchant.wx_nickname || '商户',
			client_ip: event?.context?.CLIENTIP || '',
			description: `线下首充额度-${pkg.title}`,
			total_fee: payFeeFen,
			user_order_success: true,
			pay_date: now,
			create_date: now,
			custom: orderCustom,
			is_deleted: false
		});

		const orderDoc = {
			_id: addPayRes.id,
			out_trade_no: orderNo,
			order_no: orderNo,
			user_id: merchant.user_id || merchant._id,
			custom: orderCustom
		};
		await applyRechargeByOrder(orderDoc);
		const fresh = await getMerchantByIdOrUserId(merchant._id);

		return {
			code: 0,
			message: '充值成功',
			data: {
				merchantId: merchant._id,
				deviceId,
				brandName: machine.brand_name || '',
				merchantName: merchant.wx_nickname || '',
				mobile: merchant.mobile || '',
				packageId: pkg.id,
				orderNo,
				packageTitle: pkg.title || '',
				membershipName: fresh?.membership_name || pkg.membershipName || '',
				paidAmount: payAmount,
				addQuota,
				availableReward: Number(fresh?.available_reward || 0),
				estimatedFreeQuota: Number(fresh?.estimated_free_quota || 0),
				remainingQuota: Number(fresh?.remaining_quota || 0)
			}
		};
	} catch (error) {
		console.error('offlineFirstRecharge failed:', error);
		return { code: 500, message: safeText(error?.message || '充值失败', 180) };
	}
}

/** 交易账单：未选手动时间时默认查询跨度（宜与索引、limit 配合以控制耗时） */
const TRADE_BILL_DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 带单号搜索但未选时间时，向前多查一段（仍有限） */
const TRADE_BILL_KEYWORD_RANGE_MS = 180 * 24 * 60 * 60 * 1000;
/** 单侧集合默认最大拉取条数（列表）；导出可通过 perSourceLimit 临时提高（有上限） */
const TRADE_BILL_PER_SOURCE_LIMIT = 500;
const TRADE_BILL_PER_SOURCE_LIMIT_MAX = 2500;
const TRADE_BILL_PAY_FIELDS = {
	user_id: true,
	pay_date: true,
	create_date: true,
	total_fee: true,
	transaction_id: true,
	out_trade_no: true,
	order_no: true,
	nickname: true,
	description: true,
	type: true,
	provider: true,
	status: true
};
const TRADE_BILL_LOG_FIELDS = {
	action: true,
	create_time: true,
	target_id: true,
	target_name: true,
	platform_no: true,
	offline_order_no: true,
	package_title: true,
	package_price: true,
	package_quota: true,
	refund_final_amount: true,
	refund_amount: true,
	refund_penalty_amount: true,
	refunded: true
};
const TRADE_BILL_MERCHANT_FIELDS = {
	_id: true,
	salesman: true,
	wx_nickname: true,
	wx_avatar: true,
	mobile: true,
	user_id: true,
	device_id: true
};

async function batchListBoundDeviceIdsByBindUserIds(bindUserIds) {
	const machinesByBindUser = await batchListBoundMachinesByBindUserIds(bindUserIds);
	const map = {};
	Object.keys(machinesByBindUser).forEach((uid) => {
		map[uid] = (machinesByBindUser[uid] || []).map((m) => safeText(m.device_id, 80)).filter(Boolean);
	});
	return map;
}

/** bind_user_id => [{ device_id, brand_name }] */
async function batchListBoundMachinesByBindUserIds(bindUserIds) {
	const uniq = [...new Set((Array.isArray(bindUserIds) ? bindUserIds : []).map((x) => String(x || '').trim()).filter(Boolean))];
	const map = {};
	if (!uniq.length) return map;
	const CHUNK = 400;
	for (let i = 0; i < uniq.length; i += CHUNK) {
		const part = uniq.slice(i, i + CHUNK);
		const res = await machineCollection
			.where({
				is_deleted: false,
				is_bound: 1,
				bind_user_id: db.command.in(part)
			})
			.field({ device_id: true, brand_name: true, bind_user_id: true, bind_time: true })
			.limit(1000)
			.get();
		for (const row of res.data || []) {
			const uid = String(row.bind_user_id || '').trim();
			const did = safeText(row.device_id, 80);
			if (!uid || !did) continue;
			if (!map[uid]) map[uid] = [];
			if (map[uid].some((x) => x.device_id === did)) continue;
			map[uid].push({
				device_id: did,
				brand_name: safeText(row.brand_name, 80),
				bind_time: Number(row.bind_time || 0)
			});
		}
	}
	Object.keys(map).forEach((uid) => {
		map[uid].sort((a, b) => Number(b.bind_time || 0) - Number(a.bind_time || 0));
	});
	return map;
}

function collectBoundMachinesForMerchant(merchant, machinesByBindUser) {
	if (!merchant) return [];
	const out = [];
	const seen = new Set();
	const addFromUid = (uid) => {
		const arr = machinesByBindUser[String(uid || '').trim()] || [];
		for (const m of arr) {
			const did = safeText(m.device_id, 80);
			if (!did || seen.has(did)) continue;
			seen.add(did);
			out.push(m);
		}
	};
	addFromUid(merchant.user_id);
	addFromUid(merchant._id);
	const primary = safeText(merchant.device_id, 80);
	if (primary && !seen.has(primary)) {
		out.unshift({
			device_id: primary,
			brand_name: safeText(merchant.brand_name, 80),
			bind_time: Number(merchant.bind_time || 0)
		});
	}
	return out;
}

function merchantDeviceNoText(merchant, deviceIdsByBindUser) {
	if (!merchant) return '-';
	const ids = [];
	const seen = new Set();
	const addFromUid = (uid) => {
		const arr = deviceIdsByBindUser[String(uid || '').trim()] || [];
		for (const d of arr) {
			if (!seen.has(d)) {
				seen.add(d);
				ids.push(d);
			}
		}
	};
	addFromUid(merchant.user_id);
	addFromUid(merchant._id);
	const primary = safeText(merchant.device_id, 80);
	if (primary && !seen.has(primary)) ids.unshift(primary);
	return ids.length ? ids.join('、') : '-';
}

function merchantDeviceDisplayText(merchant, machinesByBindUser) {
	const machines = collectBoundMachinesForMerchant(merchant, machinesByBindUser);
	if (!machines.length) return '-';
	return machines
		.map((m) => {
			const did = safeText(m.device_id, 80) || '-';
			const brand = safeText(m.brand_name, 80) || '-';
			return `${did}/${brand}`;
		})
		.join('\n');
}

function tradeBillCacheKey(data) {
	const crypto = require('crypto');
	const payload = {
		page: data?.page,
		pageSize: data?.pageSize,
		perSourceLimit: data?.perSourceLimit,
		salesmanKeyword: data?.salesmanKeyword,
		deviceNo: data?.deviceNo,
		firstCharge: data?.firstCharge,
		userKeyword: data?.userKeyword,
		platformNo: data?.platformNo,
		wxTradeNo: data?.wxTradeNo,
		refunded: data?.refunded,
		payTimeStart: data?.payTimeStart,
		payTimeEnd: data?.payTimeEnd
	};
	return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 40);
}

function normalizeTradeBillTimeRange(data) {
	const now = nowTs();
	let tsStart =
		data?.payTimeStart !== '' && data?.payTimeStart != null ? Number(data.payTimeStart) : 0;
	let tsEnd = data?.payTimeEnd !== '' && data?.payTimeEnd != null ? Number(data.payTimeEnd) : 0;
	if (!Number.isFinite(tsStart) || tsStart < 0) tsStart = 0;
	if (!Number.isFinite(tsEnd) || tsEnd < 0) tsEnd = 0;
	const pNo = safeText(data?.platformNo, 80);
	const wNo = safeText(data?.wxTradeNo, 80);
	const hasKeyword = !!(pNo || wNo);
	const span = hasKeyword ? TRADE_BILL_KEYWORD_RANGE_MS : TRADE_BILL_DEFAULT_RANGE_MS;

	if (!tsStart && !tsEnd) {
		tsEnd = now;
		tsStart = now - span;
	} else if (tsStart && !tsEnd) {
		tsEnd = now;
	} else if (!tsStart && tsEnd) {
		tsStart = tsEnd - span;
	}
	if (tsStart && tsEnd && tsStart > tsEnd) {
		const t = tsStart;
		tsStart = tsEnd;
		tsEnd = t;
	}
	return { tsStart, tsEnd };
}

async function buildTradeBillListData(data) {
	const {
		page = 1,
		pageSize = 10,
		salesmanKeyword = '',
		deviceNo = '',
		firstCharge = '',
		userKeyword = '',
		platformNo = '',
		wxTradeNo = '',
		refunded = '',
		payTimeStart = '',
		payTimeEnd = ''
	} = data || {};

	const { tsStart, tsEnd } = normalizeTradeBillTimeRange({
		...data,
		payTimeStart,
		payTimeEnd,
		platformNo,
		wxTradeNo
	});

	const limRaw = Number(data?.perSourceLimit);
	const perLimit =
		Number.isFinite(limRaw) && limRaw > 0
			? Math.min(TRADE_BILL_PER_SOURCE_LIMIT_MAX, Math.max(80, Math.floor(limRaw)))
			: TRADE_BILL_PER_SOURCE_LIMIT;

	// 仅按 create_date 做时间窗，避免 pay_date/create_date OR 无法有效使用索引；列表排序亦按 create_date
	const payWhereParts = [{ status: db.command.in([1, 2, 3]) }, { is_deleted: db.command.neq(true) }];
	if (platformNo) {
		const r = new RegExp(escapeReg(platformNo), 'i');
		payWhereParts.push(db.command.or([{ out_trade_no: r }, { order_no: r }]));
	}
	if (wxTradeNo) payWhereParts.push({ transaction_id: new RegExp(escapeReg(wxTradeNo), 'i') });
	if (tsStart && tsEnd) {
		payWhereParts.push(db.command.and([{ create_date: db.command.gte(tsStart) }, { create_date: db.command.lte(tsEnd) }]));
	} else if (tsStart) {
		payWhereParts.push({ create_date: db.command.gte(tsStart) });
	} else if (tsEnd) {
		payWhereParts.push({ create_date: db.command.lte(tsEnd) });
	}
	const payWhere = payWhereParts.length === 1 ? payWhereParts[0] : db.command.and(payWhereParts);

	const logWhereParts = [
		{ action: db.command.in(['offline_first_recharge', 'h5_quota_recharge', 'h5_refund_reset']) },
		{ is_deleted: db.command.neq(true) }
	];
	if (platformNo) logWhereParts.push({ target_id: new RegExp(escapeReg(platformNo), 'i') });
	if (tsStart && tsEnd) {
		logWhereParts.push(db.command.and([{ create_time: db.command.gte(tsStart) }, { create_time: db.command.lte(tsEnd) }]));
	} else if (tsStart) {
		logWhereParts.push({ create_time: db.command.gte(tsStart) });
	} else if (tsEnd) {
		logWhereParts.push({ create_time: db.command.lte(tsEnd) });
	}
	const logWhere = logWhereParts.length === 1 ? logWhereParts[0] : db.command.and(logWhereParts);

	const [payRes, logRes] = await Promise.all([
		uniPayOrderCollection
			.where(payWhere)
			.field(TRADE_BILL_PAY_FIELDS)
			.orderBy('create_date', 'desc')
			.limit(perLimit)
			.get(),
		operationLogCollection
			.where(logWhere)
			.field(TRADE_BILL_LOG_FIELDS)
			.orderBy('create_time', 'desc')
			.limit(perLimit)
			.get()
	]);
	const payRows = payRes.data || [];
	const logRows = logRes.data || [];
	const truncated = payRows.length >= perLimit || logRows.length >= perLimit;

	const merchantIds = [...new Set(logRows.map((x) => String(x.target_id || '')).filter(Boolean))];
	const userIds = [...new Set(payRows.map((x) => String(x.user_id || '')).filter(Boolean))];
	const merchantMap = {};
	const chunkInQueryParallel = async (field, values) => {
		const uniq = [...new Set(values.filter(Boolean))];
		const CHUNK = 400;
		const tasks = [];
		for (let i = 0; i < uniq.length; i += CHUNK) {
			const part = uniq.slice(i, i + CHUNK);
			tasks.push(
				merchantCollection
					.where({ [field]: db.command.in(part) })
					.field(TRADE_BILL_MERCHANT_FIELDS)
					.limit(CHUNK)
					.get()
			);
		}
		const parts = await Promise.all(tasks);
		const rows = [];
		parts.forEach((r) => rows.push(...(r.data || [])));
		return rows;
	};
	const [rowsById, rowsByUser] = await Promise.all([
		merchantIds.length ? chunkInQueryParallel('_id', merchantIds) : Promise.resolve([]),
		userIds.length ? chunkInQueryParallel('user_id', userIds) : Promise.resolve([])
	]);
	rowsById.forEach((m) => {
		merchantMap[String(m._id)] = m;
	});
	rowsByUser.forEach((m) => {
		merchantMap[String(m.user_id || '')] = m;
	});
	const merchantRows = [...new Map([...rowsById, ...rowsByUser].map((m) => [String(m._id), m])).values()];
	const bindUserIds = merchantRows.flatMap((m) => [String(m.user_id || '').trim(), String(m._id || '').trim()]).filter(Boolean);
	const deviceIdsByBindUser = await batchListBoundDeviceIdsByBindUserIds(bindUserIds);

	const payList = payRows.map((row) => {
		const merchant = merchantMap[String(row.user_id || '')] || null;
		const ts = Number(row.pay_date || row.create_date || 0);
		const amount = Number(row.total_fee || 0) / 100;
		const platformNo = row.transaction_id || row.out_trade_no || row.order_no || row._id;
		const bizNo = safeText(row.out_trade_no || row.order_no || row.transaction_id || row._id || '', 80);
		return {
			recordKey: `pay:${row._id}`,
			source: 'h5_recharge',
			bizNo,
			salesman: merchant?.salesman || '-',
			deviceNo: merchantDeviceNoText(merchant, deviceIdsByBindUser),
			firstCharge: '否',
			tradeUser: merchant?.wx_nickname || row.nickname || '-',
			avatar: merchant?.wx_avatar || '',
			platformNo: platformNo || '-',
			wxTradeNo: row.transaction_id || '-',
			goodsName: row.description || row.type || 'H5充值',
			payType: row.provider || '-',
			amount,
			amountText: `CNY￥${amount.toFixed(4)}`,
			refunded: row.status === 2 || row.status === 3 ? '是' : '否',
			payTime: formatTime(ts),
			_ts: ts
		};
	});

	const offlineList = logRows.map((row) => {
		const merchant = merchantMap[String(row.target_id || '')] || null;
		const ts = Number(row.create_time || 0);
		if (row.action === 'h5_refund_reset') {
			const amount = Number(row.refund_final_amount || row.refund_amount || 0);
			const refundNo = safeText(row.platform_no || '', 60) || `RF${String(row._id || '').slice(-12)}`;
			return {
				recordKey: `refund:${row._id}`,
				source: 'h5_refund_reset',
				bizNo: refundNo,
				salesman: merchant?.salesman || '-',
				deviceNo: merchantDeviceNoText(merchant, deviceIdsByBindUser),
				firstCharge: '否',
				tradeUser: merchant?.wx_nickname || row.target_name || '-',
				avatar: merchant?.wx_avatar || '',
				platformNo: refundNo,
				wxTradeNo: '-',
				goodsName: '退款重置',
				payType: 'H5退款',
				amount,
				amountText: `CNY￥${amount.toFixed(4)}`,
				refunded: '是',
				payTime: formatTime(ts),
				_ts: ts
			};
		}
		if (row.action === 'h5_quota_recharge') {
			const amount = Number(row.package_price || 0);
			const title = row.package_title || '额度充值';
			const quota = Number(row.package_quota || 0);
			const rechargeNo = safeText(row.platform_no || '', 60) || `RC${String(row._id || '').slice(-12)}`;
			return {
				recordKey: `recharge:${row._id}`,
				source: 'h5_quota_recharge',
				bizNo: rechargeNo,
				salesman: merchant?.salesman || '-',
				deviceNo: merchantDeviceNoText(merchant, deviceIdsByBindUser),
				firstCharge: '否',
				tradeUser: merchant?.wx_nickname || row.target_name || '-',
				avatar: merchant?.wx_avatar || '',
				platformNo: rechargeNo,
				wxTradeNo: '-',
				goodsName: title ? `${title}${quota ? `（额度${quota}）` : ''}` : 'H5额度充值',
				payType: 'H5充值',
				amount,
				amountText: `CNY￥${amount.toFixed(4)}`,
				refunded: row.refunded ? '是' : '否',
				payTime: formatTime(ts),
				_ts: ts
			};
		}
		const amount = Number(row.package_price || 0);
		const title = row.package_title || '';
		const quota = Number(row.package_quota || 0);
		const offlineOrderNo = safeText(row.offline_order_no || '', 60) || `XX${String(row._id || '').slice(-12)}`;
		return {
			recordKey: `offline:${row._id}`,
			source: 'offline_first_recharge',
			bizNo: offlineOrderNo,
			salesman: merchant?.salesman || '-',
			deviceNo: merchantDeviceNoText(merchant, deviceIdsByBindUser),
			firstCharge: '是',
			tradeUser: merchant?.wx_nickname || row.target_name || '-',
			avatar: merchant?.wx_avatar || '',
			platformNo: offlineOrderNo,
			wxTradeNo: '-',
			goodsName: title ? `${title}${quota ? `（额度${quota}）` : ''}` : '线下首冲额度',
			payType: '线下首冲',
			amount,
			amountText: `CNY￥${amount.toFixed(4)}`,
			refunded: '否',
			payTime: formatTime(ts),
			_ts: ts
		};
	});

	let merged = [...payList, ...offlineList];
	// 交易账单展示去重：同一次充值仅保留一条（优先支付订单，其次日志）。
	// 以业务单号 bizNo 为主键，避免同一 out_trade_no 在 uni-pay-orders 与 operation-logs 重复展示。
	const dedupeMap = new Map();
	const sourceRank = { h5_recharge: 3, h5_quota_recharge: 2, offline_first_recharge: 2, h5_refund_reset: 1 };
	for (const item of merged) {
		const key = safeText(item.bizNo || item.platformNo || item.recordKey || '', 120);
		if (!key) continue;
		const old = dedupeMap.get(key);
		if (!old) {
			dedupeMap.set(key, item);
			continue;
		}
		const oldRank = Number(sourceRank[old.source] || 0);
		const newRank = Number(sourceRank[item.source] || 0);
		if (newRank > oldRank || (newRank === oldRank && Number(item._ts || 0) > Number(old._ts || 0))) {
			dedupeMap.set(key, item);
		}
	}
	merged = Array.from(dedupeMap.values());
	if (salesmanKeyword) merged = merged.filter((x) => String(x.salesman || '').toLowerCase().includes(String(salesmanKeyword).toLowerCase()));
	if (deviceNo) merged = merged.filter((x) => String(x.deviceNo || '').toLowerCase().includes(String(deviceNo).toLowerCase()));
	if (firstCharge !== '') merged = merged.filter((x) => x.firstCharge === (String(firstCharge) === '1' ? '是' : '否'));
	if (userKeyword) merged = merged.filter((x) => String(x.tradeUser || '').toLowerCase().includes(String(userKeyword).toLowerCase()));
	if (platformNo) merged = merged.filter((x) => String(x.platformNo || '').toLowerCase().includes(String(platformNo).toLowerCase()));
	if (wxTradeNo) merged = merged.filter((x) => String(x.wxTradeNo || '').toLowerCase().includes(String(wxTradeNo).toLowerCase()));
	if (refunded !== '') merged = merged.filter((x) => x.refunded === (String(refunded) === '1' ? '是' : '否'));
	if (tsStart) merged = merged.filter((x) => Number(x._ts || 0) >= tsStart);
	if (tsEnd) merged = merged.filter((x) => Number(x._ts || 0) <= tsEnd);

	merged.sort((a, b) => Number(b._ts || 0) - Number(a._ts || 0));
	const total = merged.length;
	const s = (Number(page) - 1) * Number(pageSize);
	const e = s + Number(pageSize);
	const list = merged.slice(s, e).map(({ _ts, ...rest }) => rest);
	return {
		list,
		total,
		page: Number(page),
		pageSize: Number(pageSize),
		queryRange: { payTimeStart: tsStart, payTimeEnd: tsEnd },
		truncated,
		perSourceLimit: perLimit
	};
}

async function tradeBillList(data) {
	try {
		const cacheKey = `hsy:admin:tradeBill:v6:${tradeBillCacheKey(data || {})}`;
		const cached = await redisH5.h5RedisGetJson(cacheKey);
		if (cached && cached.code === 0) return cached;
		const result = await buildTradeBillListData(data);
		const out = { code: 0, message: 'ok', data: result };
		await redisH5.h5RedisSetJson(cacheKey, out, REDIS_EX_TRADE_BILL_SEC);
		return out;
	} catch (error) {
		console.error('tradeBillList failed:', error);
		return { code: 500, message: '获取交易账单失败' };
	}
}

async function tradeBillDelete(data, event) {
	try {
		const ids = Array.isArray(data?.recordKeys) ? data.recordKeys.map((x) => safeText(x, 120)).filter(Boolean) : [];
		if (!ids.length) return { code: 400, message: '请选择要删除的记录' };
		const payIds = [];
		const offlineIds = [];
		ids.forEach((k) => {
			if (k.startsWith('pay:')) payIds.push(k.slice(4));
			else if (k.startsWith('offline:')) offlineIds.push(k.slice(8));
			else if (k.startsWith('recharge:')) offlineIds.push(k.slice(9));
			else if (k.startsWith('refund:')) offlineIds.push(k.slice(7));
		});
		const now = nowTs();
		const operator = getOperator(event);
		if (payIds.length) {
			await uniPayOrderCollection.where({ _id: db.command.in(payIds) }).update({
				is_deleted: true,
				delete_time: now,
				delete_user: operator
			});
		}
		if (offlineIds.length) {
			await operationLogCollection.where({ _id: db.command.in(offlineIds), action: db.command.in(['offline_first_recharge', 'h5_quota_recharge', 'h5_refund_reset']) }).update({
				is_deleted: true,
				delete_time: now,
				delete_user: operator
			});
		}
		return { code: 0, message: '删除成功' };
	} catch (error) {
		console.error('tradeBillDelete failed:', error);
		return { code: 500, message: '删除失败' };
	}
}

async function tradeBillMarkManualRefund(data, event) {
	try {
		const recordKey = safeText(data?.recordKey, 120);
		if (!recordKey) return { code: 400, message: '缺少账单记录标识' };
		if (recordKey.startsWith('offline:')) return { code: 400, message: '线下首冲账单不支持此操作' };
		if (recordKey.startsWith('refund:')) return { code: 400, message: '该账单已是退款记录' };

		const now = nowTs();
		const operator = getOperator(event);
		const reason = safeText(data?.reason || '线下人工退款', 200);
		let payDoc = null;
		let logDoc = null;

		if (recordKey.startsWith('pay:')) {
			const id = recordKey.slice(4);
			const res = await uniPayOrderCollection.doc(id).get();
			payDoc = (res.data && res.data[0]) || null;
		} else if (recordKey.startsWith('recharge:')) {
			const id = recordKey.slice(9);
			const res = await operationLogCollection.doc(id).get();
			logDoc = (res.data && res.data[0]) || null;
			if (logDoc && logDoc.action !== 'h5_quota_recharge') {
				return { code: 400, message: '该类型账单不支持人工退款标记' };
			}
		} else {
			return { code: 400, message: '无效的账单记录' };
		}
		if (!payDoc && !logDoc) return { code: 404, message: '账单不存在' };

		if (payDoc) {
			if (payDoc.is_deleted) return { code: 400, message: '账单已删除' };
			if (Number(payDoc.status) === 2 || Number(payDoc.status) === 3) {
				return { code: 400, message: '该账单已标记为已退款' };
			}
			const totalFen = Number(payDoc.total_fee || 0);
			await uniPayOrderCollection.doc(payDoc._id).update({
				status: 3,
				refund_fee: totalFen,
				refund_date: now,
				update_date: now
			});
			const bizNo = safeText(payDoc.out_trade_no || payDoc.order_no, 80);
			if (bizNo) {
				await operationLogCollection
					.where({
						action: 'h5_quota_recharge',
						platform_no: bizNo,
						is_deleted: db.command.neq(true)
					})
					.update({ refunded: true, refund_time: now });
			}
		}

		if (logDoc) {
			if (logDoc.is_deleted) return { code: 400, message: '账单已删除' };
			if (logDoc.refunded) return { code: 400, message: '该账单已标记为已退款' };
			await operationLogCollection.doc(logDoc._id).update({
				refunded: true,
				refund_time: now
			});
			const bizNo = safeText(logDoc.platform_no, 80);
			if (bizNo && !payDoc) {
				const payRes = await uniPayOrderCollection
					.where(db.command.or([{ out_trade_no: bizNo }, { order_no: bizNo }]))
					.limit(1)
					.get();
				payDoc = (payRes.data && payRes.data[0]) || null;
				if (payDoc && Number(payDoc.status) !== 2 && Number(payDoc.status) !== 3) {
					await uniPayOrderCollection.doc(payDoc._id).update({
						status: 3,
						refund_fee: Number(payDoc.total_fee || 0),
						refund_date: now,
						update_date: now
					});
				}
			}
		}

		await operationLogCollection.add({
			user_id: payDoc?.user_id || logDoc?.user_id || '',
			user_name: operator,
			action: 'trade_bill_manual_refund',
			module: 'finance',
			target_id: payDoc?._id || logDoc?._id || '',
			target_name: safeText(payDoc?.out_trade_no || logDoc?.platform_no || recordKey, 80),
			content: `${reason}：交易账单标记已退款（recordKey=${recordKey}）`,
			operator_source: 'admin',
			operator,
			platform_no: safeText(payDoc?.transaction_id || payDoc?.out_trade_no || logDoc?.platform_no, 80),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});

		return {
			code: 0,
			message: '已标记为已退款',
			data: {
				recordKey,
				wxTradeNo: safeText(payDoc?.transaction_id, 80) || '-',
				platformNo: safeText(payDoc?.out_trade_no || logDoc?.platform_no, 80) || '-'
			}
		};
	} catch (error) {
		console.error('tradeBillMarkManualRefund failed:', error);
		return { code: 500, message: safeText(error?.message || '标记失败', 180) };
	}
}

const ADMIN_DASHBOARD_TREND_CACHE_MS = 60000;
let adminDashboardTrendCache = { at: 0, key: '', data: null };
let adminHomeSummaryCache = { at: 0, data: null };
let adminMembershipTierCache = { at: 0, data: null };

function shDayKey(ts) {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return fmt.format(new Date(Number(ts || 0)));
}

function shHourParts(ts) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hour12: false
	}).formatToParts(new Date(Number(ts || 0)));
	let y = '';
	let m = '';
	let d = '';
	let h = '';
	for (const p of parts) {
		if (p.type === 'year') y = p.value;
		else if (p.type === 'month') m = p.value;
		else if (p.type === 'day') d = p.value;
		else if (p.type === 'hour') h = p.value;
	}
	return { dayKey: `${y}-${m}-${d}`, hour: h || '00' };
}

function adminTrendRange(typeRaw) {
	const type = safeText(typeRaw || '30d', 20) || '30d';
	const now = new Date();
	if (type === 'today') {
		const dayKey = shDayKey(now.getTime());
		const startTs = new Date(`${dayKey}T00:00:00+08:00`).getTime();
		const endTs = nowTs();
		const keys = [];
		const labels = [];
		for (let i = 0; i < 24; i += 1) {
			const h = String(i).padStart(2, '0');
			keys.push(`${dayKey} ${h}`);
			labels.push(`${h}:00`);
		}
		return { type, bucket: 'hour', startTs, endTs, keys, labels };
	}
	if (type === 'week') {
		const keys = [];
		const labels = [];
		for (let i = 6; i >= 0; i -= 1) {
			const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
			const day = shDayKey(d.getTime());
			keys.push(day);
			labels.push(day.slice(5));
		}
		return {
			type,
			bucket: 'day',
			startTs: new Date(`${keys[0]}T00:00:00+08:00`).getTime(),
			endTs: nowTs(),
			keys,
			labels
		};
	}
	if (type === 'month') {
		const cur = shDayKey(now.getTime());
		const firstDay = `${cur.slice(0, 8)}01`;
		const keys = [];
		const labels = [];
		let p = new Date(`${firstDay}T00:00:00+08:00`).getTime();
		const nowMs = now.getTime();
		while (p <= nowMs) {
			const dk = shDayKey(p);
			keys.push(dk);
			labels.push(dk.slice(5));
			p += 24 * 60 * 60 * 1000;
		}
		return {
			type,
			bucket: 'day',
			startTs: new Date(`${firstDay}T00:00:00+08:00`).getTime(),
			endTs: nowTs(),
			keys,
			labels
		};
	}
	const keys = [];
	const labels = [];
	for (let i = 29; i >= 0; i -= 1) {
		const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
		const day = shDayKey(d.getTime());
		keys.push(day);
		labels.push(day.slice(5));
	}
	return {
		type: '30d',
		bucket: 'day',
		startTs: new Date(`${keys[0]}T00:00:00+08:00`).getTime(),
		endTs: nowTs(),
		keys,
		labels
	};
}

function bucketKeyByRange(ts, range) {
	if (!range || !range.bucket) return shDayKey(ts);
	if (range.bucket === 'hour') {
		const p = shHourParts(ts);
		return `${p.dayKey} ${p.hour}`;
	}
	return shDayKey(ts);
}

/** 与 machine/getCardRecordList 一致：get() 默认仅 100 条，须分页拉全量已绑定机具 */
const ADMIN_CARD_ALIGN_MACHINE_PAGE = 1000;
/** 单次 $in 机具数（非聚合路径）；聚合改为逐机具，避免大 $in 误选 device_id_trade_no */
const ADMIN_CARD_ALIGN_IN_CHUNK = 80;
/** 分 chunk 查交易时的并发（非聚合） */
const ADMIN_CARD_ALIGN_QUERY_CONCURRENCY = 4;
/** 聚合逐机具并发：单机具等值 + create_time 可稳定走 device_id_create_time */
const ADMIN_CARD_ALIGN_DEVICE_CONCURRENCY = 12;
/**
 * 粉卡对齐优先索引（见 hsy-machine-trades.index.json）。
 * 大 $in 时优化器仍会选 device_id_trade_no（已建 stats_eligible* 索引也一样），
 * 故聚合改为单机具等值并行，不依赖 hint。
 */
const CARD_ALIGN_TRADE_INDEX_HINT = 'stats_eligible_device_id_create_time';
/** null | 'chain' | 'none' */
let _cardAlignTradeHintMode = null;

function adminChunkIdsForIn(arr, chunkSize) {
	const out = [];
	const a = Array.isArray(arr) ? arr : [];
	for (let i = 0; i < a.length; i += chunkSize) out.push(a.slice(i, i + chunkSize));
	return out;
}

/** 仅收集已绑定机具 device_id（首页汇总不再双 $in user_id，避免误走 user_id 索引） */
async function adminFetchAllBoundDeviceIdsForCardAlign(boundMachineWhere) {
	const deviceSet = new Set();
	let skip = 0;
	for (;;) {
		const r = await machineCollection
			.where(boundMachineWhere)
			.field({ device_id: true })
			.skip(skip)
			.limit(ADMIN_CARD_ALIGN_MACHINE_PAGE)
			.get();
		const rows = r.data || [];
		for (const x of rows) {
			const d = String(x.device_id || '').trim();
			if (d) deviceSet.add(d);
		}
		if (rows.length < ADMIN_CARD_ALIGN_MACHINE_PAGE) break;
		skip += ADMIN_CARD_ALIGN_MACHINE_PAGE;
		if (skip > 200000) break;
	}
	return [...deviceSet];
}

/**
 * 粉卡对齐口径：公共条件（不含 device_id）。
 * 顺序刻意把 stats_eligible 放前面，便于走 stats_eligible+device_id+create_time 索引。
 */
function buildCardAlignTradeCommonParts(_) {
	return [
		{ stats_eligible: true },
		{ is_deleted: _.neq(true) },
		_.and([{ user_id: _.neq('') }, { user_id: _.neq(null) }]),
		_.or([{ user_name: _.neq('') }, { user_mobile: _.neq('') }]),
		_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
	];
}

/** create_time 条件进索引前缀 match；其余进第二段过滤 match */
function partitionCardAlignExtras(extraAnd = []) {
	const timeExtras = [];
	const otherExtras = [];
	for (const x of Array.isArray(extraAnd) ? extraAnd : []) {
		if (!x) continue;
		if (typeof x === 'object' && x.create_time != null) timeExtras.push(x);
		else otherExtras.push(x);
	}
	return { timeExtras, otherExtras };
}

/**
 * 索引前缀：$match 第一段。
 * - 单机具：stats_eligible + device_id 等值 + create_time → 走 stats_eligible_device_id_create_time
 * - 多机具 $in：仅作 where/count 兜底（聚合勿用，易误选 device_id_trade_no）
 */
function buildCardAlignedTradePrefixWhere(_, deviceChunk, timeExtras = []) {
	const ids = (Array.isArray(deviceChunk) ? deviceChunk : []).map((x) => String(x || '').trim()).filter(Boolean);
	if (!ids.length) return null;
	const devicePred = ids.length === 1 ? { device_id: ids[0] } : { device_id: _.in(ids) };
	const parts = [{ stats_eligible: true }, devicePred];
	let hasCreateTime = false;
	for (const x of Array.isArray(timeExtras) ? timeExtras : []) {
		if (!x) continue;
		parts.push(x);
		if (x.create_time != null) hasCreateTime = true;
	}
	if (!hasCreateTime) {
		parts.push({ create_time: _.gte(1) });
	}
	return parts.length === 1 ? parts[0] : _.and(parts);
}

/** 残余过滤（不含 stats_eligible / device_id） */
function buildCardAlignedTradeFilterWhere(_, otherExtras = []) {
	const parts = [...buildCardAlignTradeCommonParts(_).slice(1)];
	for (const x of Array.isArray(otherExtras) ? otherExtras : []) {
		if (x) parts.push(x);
	}
	if (!parts.length) return null;
	return parts.length === 1 ? parts[0] : _.and(parts);
}

/** 单 chunk：完整 where（兼容 count/get）；聚合用单机具 + 两段 match */
function buildCardAlignedTradeWhereForChunk(_, deviceChunk, extraAnd = []) {
	const { timeExtras, otherExtras } = partitionCardAlignExtras(extraAnd);
	const prefix = buildCardAlignedTradePrefixWhere(_, deviceChunk, timeExtras);
	if (!prefix) return null;
	const filter = buildCardAlignedTradeFilterWhere(_, otherExtras);
	if (!filter) return prefix;
	return _.and([prefix, filter]);
}

function applyCardAlignTradeHintToQuery(query) {
	if (!query || typeof query.hint !== 'function' || _cardAlignTradeHintMode === 'none') return query;
	try {
		const hinted = query.hint(CARD_ALIGN_TRADE_INDEX_HINT);
		if (_cardAlignTradeHintMode == null) _cardAlignTradeHintMode = 'chain';
		return hinted || query;
	} catch (e) {
		console.warn('[cardAlign] query.hint failed', String(e && e.message ? e.message : e).slice(0, 120));
		return query;
	}
}

/**
 * 粉卡对齐聚合：两段 $match。
 * 调用方应传单机具数组 [deviceId]，避免大 $in。
 */
async function runMachineTradeAggregateCardAligned(deviceChunk, extraAnd, buildStages) {
	const _ = db.command;
	const { timeExtras, otherExtras } = partitionCardAlignExtras(extraAnd);
	const prefix = buildCardAlignedTradePrefixWhere(_, deviceChunk, timeExtras);
	if (!prefix) return { data: [] };
	const filter = buildCardAlignedTradeFilterWhere(_, otherExtras);

	let agg = machineTradeCollection.aggregate().match(prefix);
	if (filter) agg = agg.match(filter);
	if (typeof buildStages === 'function') agg = buildStages(agg) || agg;
	return agg.end();
}

async function adminMapPool(items, worker, concurrency) {
	const list = Array.isArray(items) ? items : [];
	if (!list.length) return [];
	const results = new Array(list.length);
	let cursor = 0;
	const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
	const runners = [];
	for (let c = 0; c < limit; c += 1) {
		runners.push(
			(async () => {
				for (;;) {
					const idx = cursor;
					cursor += 1;
					if (idx >= list.length) break;
					results[idx] = await worker(list[idx], idx);
				}
			})()
		);
	}
	await Promise.all(runners);
	return results;
}

async function adminMapCardAlignDeviceChunks(cardBase, worker, concurrency = ADMIN_CARD_ALIGN_QUERY_CONCURRENCY) {
	const chunks = (cardBase && Array.isArray(cardBase.deviceChunks) ? cardBase.deviceChunks : []).filter(
		(c) => Array.isArray(c) && c.length
	);
	return adminMapPool(chunks, worker, concurrency);
}

/** 展开为单机具列表并并行（聚合专用） */
function adminFlattenCardAlignDeviceIds(cardBase) {
	const out = [];
	const seen = new Set();
	for (const chunk of (cardBase && cardBase.deviceChunks) || []) {
		for (const d of chunk || []) {
			const id = String(d || '').trim();
			if (!id || seen.has(id)) continue;
			seen.add(id);
			out.push(id);
		}
	}
	return out;
}

async function adminMapCardAlignDevices(cardBase, worker, concurrency = ADMIN_CARD_ALIGN_DEVICE_CONCURRENCY) {
	return adminMapPool(adminFlattenCardAlignDeviceIds(cardBase), worker, concurrency);
}

/**
 * 与 cloudfunctions/machine#getCardRecordList 在无额外筛选时的主口径对齐（不含时间）。
 * 返回 deviceChunks，查询时按 chunk 分别执行再合并，禁止巨型 $or+$in。
 */
async function buildCardRecordAlignedTradeBaseWhere(_) {
	try {
		const boundMachineWhere = {
			is_deleted: false,
			is_bound: 1,
			bind_user_id: _.neq('')
		};
		const boundDeviceIds = await adminFetchAllBoundDeviceIdsForCardAlign(boundMachineWhere);
		if (!boundDeviceIds.length) {
			return { ok: false, deviceChunks: [], baseWhere: null };
		}
		const deviceChunks = adminChunkIdsForIn(boundDeviceIds, ADMIN_CARD_ALIGN_IN_CHUNK);
		// 兼容旧调用：仅单 chunk 时提供 baseWhere；多 chunk 必须走分片 helper
		const baseWhere =
			deviceChunks.length === 1 ? buildCardAlignedTradeWhereForChunk(_, deviceChunks[0]) : null;
		return {
			ok: true,
			deviceChunks,
			deviceCount: boundDeviceIds.length,
			baseWhere
		};
	} catch (e) {
		console.error('buildCardRecordAlignedTradeBaseWhere', e);
		return { ok: false, deviceChunks: [], baseWhere: null };
	}
}

async function adminSumTradeAmountCardAligned(cardBase, extraAnd = []) {
	const $ = db.command.aggregate;
	if (!cardBase || !cardBase.ok) return 0;
	const parts = await adminMapCardAlignDevices(cardBase, async (deviceId) => {
		try {
			const agg = await runMachineTradeAggregateCardAligned([deviceId], extraAnd, (pipe) =>
				pipe.group({ _id: null, total: $.sum('$amount') })
			);
			return Number((((agg.data || [])[0] || {}).total || 0));
		} catch (e) {
			console.error('adminSumTradeAmountCardAligned device', deviceId, e);
			return 0;
		}
	});
	const sum = (parts || []).reduce((s, n) => s + Number(n || 0), 0);
	return Number(sum.toFixed(2));
}

async function adminCountTradesCardAligned(cardBase, extraAnd = []) {
	const $ = db.command.aggregate;
	if (!cardBase || !cardBase.ok) return 0;
	const parts = await adminMapCardAlignDevices(cardBase, async (deviceId) => {
		try {
			const agg = await runMachineTradeAggregateCardAligned([deviceId], extraAnd, (pipe) =>
				pipe.group({ _id: null, count: $.sum(1) })
			);
			return Number((((agg.data || [])[0] || {}).count || 0));
		} catch (e) {
			console.error('adminCountTradesCardAligned device', deviceId, e);
			return 0;
		}
	});
	return (parts || []).reduce((s, n) => s + Number(n || 0), 0);
}

/** 按 trade_member_bucket 分桶求和（逐机具聚合后合并） */
async function adminSumTradeAmountByBucketCardAligned(cardBase, extraAnd = []) {
	const $ = db.command.aggregate;
	const byBucket = Object.create(null);
	if (!cardBase || !cardBase.ok) return { total: 0, byBucket, rows: [] };
	const chunkRows = await adminMapCardAlignDevices(cardBase, async (deviceId) => {
		try {
			const agg = await runMachineTradeAggregateCardAligned([deviceId], extraAnd, (pipe) =>
				pipe.group({ _id: '$trade_member_bucket', total: $.sum('$amount') })
			);
			return agg.data || [];
		} catch (e) {
			console.error('adminSumTradeAmountByBucketCardAligned device', deviceId, e);
			return [];
		}
	});
	for (const rows of chunkRows || []) {
		for (const row of rows || []) {
			const key = row._id == null || row._id === '' ? '__empty__' : String(row._id);
			byBucket[key] = Number(((byBucket[key] || 0) + Number(row.total || 0)).toFixed(2));
		}
	}
	const rows = Object.keys(byBucket).map((k) => ({
		_id: k === '__empty__' ? null : k,
		total: byBucket[k]
	}));
	const total = Number(rows.reduce((s, r) => s + Number(r.total || 0), 0).toFixed(2));
	return { total, byBucket, rows };
}

async function adminForEachTradeRowPagedCardAligned(cardBase, field, onBatch, extraAnd = []) {
	const _ = db.command;
	if (!cardBase || !cardBase.ok || typeof onBatch !== 'function') return 0;
	let total = 0;
	// 按机具逐个 + create_time 游标（走 device_id+create_time）；禁止大 $in + skip 深分页
	for (const chunk of cardBase.deviceChunks || []) {
		for (const deviceId of chunk || []) {
			const where = buildCardAlignedTradeWhereForChunk(_, [deviceId], extraAnd);
			if (!where) continue;
			total += await adminForEachTradeRowPaged(where, field, onBatch);
		}
	}
	return total;
}

/** 首页趋势：游标分页拉行（禁止 skip 深分页；单次 get 上限 1000） */
const ADMIN_TREND_TRADE_PAGE = 1000;
const ADMIN_TREND_TRADE_MAX_ROWS = 2000000;

async function adminForEachTradeRowPaged(where, field, onBatch) {
	if (!where || typeof onBatch !== 'function') return 0;
	const _ = db.command;
	let total = 0;
	let cursorTs = null;
	let cursorId = '';
	const fieldWithMeta = Object.assign({ _id: true, create_time: true }, field || {});
	for (;;) {
		const pageWhere =
			cursorTs == null
				? where
				: _.and([
						where,
						_.or([
							{ create_time: _.gt(cursorTs) },
							_.and([{ create_time: cursorTs }, { _id: _.gt(cursorId) }])
						])
					]);
		let q = machineTradeCollection.where(pageWhere).field(fieldWithMeta).orderBy('create_time', 'asc');
		q = applyCardAlignTradeHintToQuery(q);
		const r = await q.limit(ADMIN_TREND_TRADE_PAGE).get();
		const rows = r.data || [];
		if (rows.length) {
			onBatch(rows);
			total += rows.length;
			const last = rows[rows.length - 1];
			cursorTs = Number(last.create_time || 0);
			cursorId = String(last._id || '');
		}
		if (rows.length < ADMIN_TREND_TRADE_PAGE) break;
		if (total >= ADMIN_TREND_TRADE_MAX_ROWS) break;
	}
	return total;
}

/**
 * 按 trade_type + paychannel 聚合（逐机具并行），供首页趋势 allTime / 区间统计。
 * 单机具等值可走 stats_eligible_device_id_create_time；大 $in 即使用该索引也会被优化器丢掉。
 * @returns {{ totalAmount: number, totalCount: number, rows: Array<{trade_type, paychannel, count, amount}> }}
 */
async function adminAggregateTradeTypeStatsCardAligned(cardBase, extraAnd = []) {
	const $ = db.command.aggregate;
	const empty = { totalAmount: 0, totalCount: 0, rows: [] };
	if (!cardBase || !cardBase.ok) return empty;
	const chunkRows = await adminMapCardAlignDevices(cardBase, async (deviceId) => {
		try {
			const agg = await runMachineTradeAggregateCardAligned([deviceId], extraAnd, (pipe) =>
				pipe.group({
					_id: { trade_type: '$trade_type', paychannel: '$paychannel' },
					count: $.sum(1),
					amount: $.sum('$amount')
				})
			);
			return agg.data || [];
		} catch (e) {
			console.error('adminAggregateTradeTypeStatsCardAligned device', deviceId, e);
			return [];
		}
	});
	const merged = new Map();
	for (const rows of chunkRows || []) {
		for (const row of rows || []) {
			const tradeType = row._id && row._id.trade_type != null ? row._id.trade_type : '';
			const paychannel = row._id && row._id.paychannel != null ? row._id.paychannel : '';
			const key = `${tradeType}\0${paychannel}`;
			const prev = merged.get(key) || { trade_type: tradeType, paychannel, count: 0, amount: 0 };
			prev.count += Number(row.count || 0);
			prev.amount = Number((prev.amount + Number(row.amount || 0)).toFixed(4));
			merged.set(key, prev);
		}
	}
	const rows = [...merged.values()];
	const totalCount = rows.reduce((s, r) => s + Number(r.count || 0), 0);
	const totalAmount = Number(rows.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2));
	return { totalAmount, totalCount, rows };
}

function adminTrendBucketTimeBounds(bucketKey, range) {
	const endCap = Number(range && range.endTs != null ? range.endTs : Date.now());
	if (range && range.bucket === 'hour') {
		const m = String(bucketKey || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2})$/);
		if (!m) return null;
		const start = new Date(`${m[1]}T${m[2]}:00:00+08:00`).getTime();
		if (!Number.isFinite(start)) return null;
		return { start, end: Math.min(start + 3600 * 1000 - 1, endCap) };
	}
	const day = String(bucketKey || '').slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
	const start = new Date(`${day}T00:00:00+08:00`).getTime();
	if (!Number.isFinite(start)) return null;
	return { start, end: Math.min(start + 24 * 3600 * 1000 - 1, endCap) };
}

/**
 * 区间趋势：按日/小时桶 + 交易类型聚合，避免大 $in + skip 扫行。
 * 优先整段 match 后 $dateToString 分组；失败则按桶循环聚合。
 */
async function adminAggregateTrendBucketTradeStatsCardAligned(cardBase, range, normalizeTrendTradeType) {
	const _ = db.command;
	const $ = db.command.aggregate;
	const dayFlow = {};
	const dayTradeTypeCount = {};
	const dayTradeTypeAmount = {};
	const rangeTradeTypeStats = {};
	let rangeTradeCount = 0;
	let rangeTradeAmount = 0;
	const keys = Array.isArray(range && range.keys) ? range.keys : [];
	keys.forEach((d) => {
		dayFlow[d] = 0;
		dayTradeTypeCount[d] = {};
		dayTradeTypeAmount[d] = {};
	});
	const applyTypeRow = (bucketKey, row) => {
		if (!(bucketKey in dayFlow)) return;
		const amt = Number(row.amount || 0);
		const cnt = Number(row.count || 0);
		dayFlow[bucketKey] += amt;
		rangeTradeAmount += amt;
		rangeTradeCount += cnt;
		const typeKey = normalizeTrendTradeType(row);
		if (!rangeTradeTypeStats[typeKey]) rangeTradeTypeStats[typeKey] = { count: 0, amount: 0 };
		rangeTradeTypeStats[typeKey].count += cnt;
		rangeTradeTypeStats[typeKey].amount += amt;
		if (!dayTradeTypeCount[bucketKey][typeKey]) dayTradeTypeCount[bucketKey][typeKey] = 0;
		if (!dayTradeTypeAmount[bucketKey][typeKey]) dayTradeTypeAmount[bucketKey][typeKey] = 0;
		dayTradeTypeCount[bucketKey][typeKey] += cnt;
		dayTradeTypeAmount[bucketKey][typeKey] += amt;
	};

	const startTs = Number(range.startTs || 0);
	const endTs = Number(range.endTs || Date.now());
	const rangeExtra = [{ create_time: _.gte(startTs) }, { create_time: _.lte(endTs) }];
	const isHour = range && range.bucket === 'hour';
	const dateFormat = isHour ? '%Y-%m-%d %H' : '%Y-%m-%d';

	let usedDateGroup = false;
	if (cardBase && cardBase.ok && keys.length) {
		try {
			const chunkRows = await adminMapCardAlignDevices(cardBase, async (deviceId) => {
				const agg = await runMachineTradeAggregateCardAligned([deviceId], rangeExtra, (pipe) =>
					pipe.group({
						_id: {
							bucket: $.dateToString({
								format: dateFormat,
								date: $.toDate('$create_time'),
								timezone: 'Asia/Shanghai'
							}),
							trade_type: '$trade_type',
							paychannel: '$paychannel'
						},
						count: $.sum(1),
						amount: $.sum('$amount')
					})
				);
				return agg.data || [];
			});
			for (const rows of chunkRows || []) {
				for (const row of rows || []) {
					const bucketRaw = row._id && row._id.bucket != null ? String(row._id.bucket) : '';
					const bucketKey = isHour ? bucketRaw : bucketRaw.slice(0, 10);
					applyTypeRow(bucketKey, {
						trade_type: row._id && row._id.trade_type,
						paychannel: row._id && row._id.paychannel,
						count: row.count,
						amount: row.amount
					});
				}
			}
			usedDateGroup = true;
		} catch (e) {
			console.error('adminAggregateTrendBucketTradeStatsCardAligned dateGroup', e);
			usedDateGroup = false;
			keys.forEach((d) => {
				dayFlow[d] = 0;
				dayTradeTypeCount[d] = {};
				dayTradeTypeAmount[d] = {};
			});
			rangeTradeCount = 0;
			rangeTradeAmount = 0;
			Object.keys(rangeTradeTypeStats).forEach((k) => delete rangeTradeTypeStats[k]);
		}
	}

	if (!usedDateGroup && cardBase && cardBase.ok) {
		for (const bucketKey of keys) {
			const bounds = adminTrendBucketTimeBounds(bucketKey, range);
			if (!bounds) continue;
			const extra = [{ create_time: _.gte(bounds.start) }, { create_time: _.lte(bounds.end) }];
			const part = await adminAggregateTradeTypeStatsCardAligned(cardBase, extra);
			for (const row of part.rows || []) {
				applyTypeRow(bucketKey, row);
			}
		}
	}

	Object.keys(dayFlow).forEach((d) => {
		dayFlow[d] = Number(Number(dayFlow[d] || 0).toFixed(2));
	});
	Object.keys(dayTradeTypeAmount).forEach((d) => {
		Object.keys(dayTradeTypeAmount[d] || {}).forEach((k) => {
			dayTradeTypeAmount[d][k] = Number(Number(dayTradeTypeAmount[d][k] || 0).toFixed(2));
		});
	});
	Object.keys(rangeTradeTypeStats).forEach((k) => {
		rangeTradeTypeStats[k].amount = Number(Number(rangeTradeTypeStats[k].amount || 0).toFixed(2));
	});
	return {
		dayFlow,
		dayTradeTypeCount,
		dayTradeTypeAmount,
		rangeTradeTypeStats,
		rangeTradeCount,
		rangeTradeAmount: Number(Number(rangeTradeAmount || 0).toFixed(2))
	};
}

async function adminCountTradesWhere(where) {
	if (!where) return 0;
	let q = machineTradeCollection.where(where);
	q = applyCardAlignTradeHintToQuery(q);
	const res = await q.count();
	return Number(res.total || res.result?.total || 0);
}

async function adminSumTradeAmountWhere(where) {
	if (!where) return 0;
	const $ = db.command.aggregate;
	try {
		let agg = machineTradeCollection.aggregate();
		if (typeof agg.hint === 'function' && _cardAlignTradeHintMode !== 'none') {
			try {
				agg = agg.hint(CARD_ALIGN_TRADE_INDEX_HINT);
			} catch (e) {
				/* ignore */
			}
		}
		const aggRes = await agg.match(where).group({ _id: null, total: $.sum('$amount') }).end();
		return Number(Number((((aggRes.data || [])[0] || {}).total || 0)).toFixed(2));
	} catch (e) {
		console.error('adminSumTradeAmountWhere failed', e);
		return 0;
	}
}

async function adminDashboardTrend30d(data = {}) {
	try {
		const now = nowTs();
		const range = adminTrendRange(data?.rangeType);
		const startDay = range.keys[0];
		const endDay = range.keys[range.keys.length - 1];
		const cacheKey = `${range.type}_${startDay}_${endDay}`;
		const redisTrendKey = redisKeyAdminHomeTrend(range.type);
		const cacheOnly = !!(data && (data.cacheOnly === true || data.fromCache === true));
		const forceRefresh = !!(data && data.refresh);

		if (!forceRefresh) {
			if (
				adminDashboardTrendCache.data &&
				adminDashboardTrendCache.key === cacheKey &&
				now - Number(adminDashboardTrendCache.at || 0) < ADMIN_DASHBOARD_TREND_CACHE_MS
			) {
				return { code: 0, message: 'ok', data: adminDashboardTrendCache.data, cache: 'memory' };
			}
			const redisHit = await redisH5.h5RedisGetJson(redisTrendKey);
			if (redisHit && Array.isArray(redisHit.categories)) {
				adminDashboardTrendCache = { at: now, key: cacheKey, data: redisHit };
				return { code: 0, message: 'ok', data: redisHit, cache: 'redis' };
			}
			const lastHit = await redisH5.h5RedisGetJson(redisKeyAdminHomeTrendLast(range.type));
			if (lastHit && Array.isArray(lastHit.categories)) {
				adminDashboardTrendCache = { at: now, key: cacheKey, data: lastHit };
				return { code: 0, message: 'ok', data: lastHit, cache: 'redis_last' };
			}
			if (cacheOnly) {
				return { code: 0, message: 'cache_miss', data: null, cache: 'miss' };
			}
		}
		const startTs = Number(range.startTs || 0);
		const endTs = Number(range.endTs || now);
		const _ = db.command;
		const $ = db.command.aggregate;
		const cardBase = await buildCardRecordAlignedTradeBaseWhere(_);
		/** 只按 bind_time 范围查（走 bind_time 索引）；user_id/device_id 在内存过滤，避免误走 user_id 索引扫大文档 */
		const fetchBoundMerchantsInRange = async () => {
			const pageSize = 1000;
			const all = [];
			let skip = 0;
			for (;;) {
				const r = await merchantCollection
					.where(_.and([{ bind_time: _.gte(startTs) }, { bind_time: _.lte(endTs) }]))
					.field({ _id: true, user_id: true, bind_time: true, device_id: true })
					.orderBy('bind_time', 'asc')
					.skip(skip)
					.limit(pageSize)
					.get();
				const rows = r.data || [];
				for (const m of rows) {
					if (!String(m.user_id || '').trim()) continue;
					if (!String(m.device_id || '').trim()) continue;
					all.push(m);
				}
				if (rows.length < pageSize) break;
				skip += pageSize;
				if (skip >= 50000) break;
			}
			return { data: all };
		};
		const [bindRes, payRes, logRes, wdRes] = await Promise.all([
			fetchBoundMerchantsInRange(),
			uniPayOrderCollection
				.where(
					_.and([
						{ type: 'h5_quota_recharge' },
						{ status: 1 },
						{ user_order_success: true },
						{ is_deleted: _.neq(true) },
						_.or([
							_.and([{ pay_date: _.gte(startTs) }, { pay_date: _.lte(endTs) }]),
							_.and([{ create_date: _.gte(startTs) }, { create_date: _.lte(endTs) }])
						])
					])
				)
				.field({ out_trade_no: true, order_no: true, user_id: true, total_fee: true, pay_date: true, create_date: true })
				.limit(50000)
				.get(),
			operationLogCollection
				.where(
					_.and([
						{ create_time: _.gte(startTs) },
						{ create_time: _.lte(endTs) },
						{ is_deleted: _.neq(true) },
						{ action: 'h5_refund_reset' }
					])
				)
				.field({
					action: true,
					create_time: true,
					refund_final_amount: true,
					refund_amount: true,
					platform_no: true
				})
				.limit(50000)
				.get(),
			withdrawCollection
				.where(
					_.and([
						{ is_deleted: _.neq(true) },
						{ is_paid: true },
						{ arrival_status: 'received' },
						_.or([
							_.and([{ arrival_time: _.gte(startTs) }, { arrival_time: _.lte(endTs) }]),
							_.and([{ pay_time: _.gte(startTs) }, { pay_time: _.lte(endTs) }]),
							_.and([{ create_time: _.gte(startTs) }, { create_time: _.lte(endTs) }])
						])
					])
				)
				.field({ create_time: true, pay_time: true, arrival_time: true, withdraw_no: true, payable: true, amount: true, fee_tax: true })
				.limit(50000)
				.get()
		]);
		let allTimeTotalFlow = 0;
		let allTimeRechargeAmount = 0;
		let allTimeRefundAmount = 0;
		let allTimeBindMerchantCount = 0;
		let allTimeRechargeMerchantCount = 0;
		let allTimeExchangeCount = 0;
		let allTimeExchangeNetAmount = 0;
		let allTimeTradeTypeStats = {};
		const trendTradeTypeDefs = [
			{ key: '06', label: '贷记卡(06)' },
			{ key: '31', label: '白条(31)' },
			{ key: '05', label: '借记卡(05)' },
			{ key: '04', label: '银联未优惠(04)' },
			{ key: '02', label: '微信(02)' },
			{ key: '01', label: '支付宝(01)' },
			{ key: 'other', label: '其他(虚拟的)' }
		];
		const trendTradeTypeKeySet = new Set(trendTradeTypeDefs.map((x) => x.key));
		let allTimeTradeCount = 0;
		const normalizeTrendTradeType = (row = {}) => {
			const isVirtual = String(row.trade_type || '') === 'virtual';
			if (isVirtual) return 'other';
			const code = safeText(row.paychannel || '', 8);
			if (trendTradeTypeKeySet.has(code)) return code;
			return 'other';
		};
		try {
			// 有绑定时间即视为已绑定机具商户，走 bind_time 索引，避免 user_id/device_id $exists 误选索引
			const bindCountRes = await merchantCollection.where({ bind_time: _.gt(0) }).count();
			allTimeBindMerchantCount = Number(bindCountRes.total || bindCountRes.result?.total || 0);
		} catch (eAgg) {
			allTimeBindMerchantCount = 0;
		}
		try {
			const rechargeAgg = await uniPayOrderCollection
				.aggregate()
				.match(
					_.and([
						{ type: 'h5_quota_recharge' },
						{ status: 1 },
						{ user_order_success: true },
						{ is_deleted: _.neq(true) },
						{ out_trade_no: _.exists(true) },
						{ out_trade_no: _.neq('') }
					])
				)
				.group({
					_id: '$out_trade_no',
					amount: $.max('$total_fee')
				})
				.group({
					_id: null,
					total: $.sum('$amount')
				})
				.end();
			allTimeRechargeAmount = Number((Number((((rechargeAgg.data || [])[0] || {}).total || 0)) / 100).toFixed(2));
		} catch (eAgg) {
			allTimeRechargeAmount = 0;
		}
		try {
			const rechargeMerchantAgg = await uniPayOrderCollection
				.aggregate()
				.match(
					_.and([
						{ type: 'h5_quota_recharge' },
						{ status: 1 },
						{ user_order_success: true },
						{ is_deleted: _.neq(true) },
						{ user_id: _.exists(true) },
						{ user_id: _.neq('') }
					])
				)
				.group({ _id: '$user_id' })
				.group({ _id: null, total: $.sum(1) })
				.end();
			allTimeRechargeMerchantCount = Number((((rechargeMerchantAgg.data || [])[0] || {}).total || 0));
		} catch (eAgg) {
			allTimeRechargeMerchantCount = 0;
		}
		try {
			const refundAgg = await operationLogCollection
				.aggregate()
				.match(
					_.and([
						{ action: 'h5_refund_reset' },
						{ is_deleted: _.neq(true) },
						{ platform_no: _.exists(true) },
						{ platform_no: _.neq('') }
					])
				)
				.group({
					_id: '$platform_no',
					amount: $.max('$refund_final_amount')
				})
				.group({
					_id: null,
					total: $.sum('$amount')
				})
				.end();
			allTimeRefundAmount = Number((((refundAgg.data || [])[0] || {}).total || 0).toFixed(2));
		} catch (eAgg) {
			allTimeRefundAmount = 0;
		}
		try {
			const exchangeAgg = await withdrawCollection
				.aggregate()
				.match(
					_.and([
						{ is_deleted: _.neq(true) },
						{ is_paid: true },
						{ arrival_status: 'received' }
					])
				)
				.group({
					_id: null,
					totalCount: $.sum(1),
					totalNet: $.sum('$payable')
				})
				.end();
			allTimeExchangeCount = Number((((exchangeAgg.data || [])[0] || {}).totalCount || 0));
			allTimeExchangeNetAmount = Number(Number((((exchangeAgg.data || [])[0] || {}).totalNet || 0)).toFixed(2));
		} catch (eAgg) {
			allTimeExchangeCount = 0;
			allTimeExchangeNetAmount = 0;
		}
		try {
			if (cardBase.ok) {
				// 聚合按类型汇总，避免全量扫行 + skip 深分页
				const allTimeAgg = await adminAggregateTradeTypeStatsCardAligned(cardBase);
				allTimeTotalFlow = allTimeAgg.totalAmount;
				allTimeTradeCount = allTimeAgg.totalCount;
				(allTimeAgg.rows || []).forEach((row) => {
					const amt = Number(row.amount || 0);
					const cnt = Number(row.count || 0);
					const k = normalizeTrendTradeType(row);
					if (!allTimeTradeTypeStats[k]) allTimeTradeTypeStats[k] = { count: 0, amount: 0 };
					allTimeTradeTypeStats[k].count += cnt;
					allTimeTradeTypeStats[k].amount += amt;
				});
				Object.keys(allTimeTradeTypeStats).forEach((k) => {
					allTimeTradeTypeStats[k].amount = Number(
						Number(allTimeTradeTypeStats[k].amount || 0).toFixed(2)
					);
				});
			} else {
				allTimeTradeTypeStats = {};
				allTimeTotalFlow = 0;
				allTimeTradeCount = 0;
			}
		} catch (eAgg) {
			allTimeTradeTypeStats = {};
			allTimeTotalFlow = 0;
			allTimeTradeCount = 0;
		}

		const dayFlow = {};
		const dayBind = {};
		const dayRechargeMerchants = {};
		const rangeBindMerchants = new Set();
		const rangeRechargeMerchants = new Set();
		const dayRechargeAmount = {};
		const dayRefundAmount = {};
		const dayExchangeCount = {};
		const dayExchangeAmount = {};
		let dayTradeTypeCount = {};
		let dayTradeTypeAmount = {};
		let rangeTradeTypeStats = {};
		let rangeTradeCount = 0;
		let rangeTradeAmount = 0;
		range.keys.forEach((d) => {
			dayFlow[d] = 0;
			dayBind[d] = 0;
			dayRechargeMerchants[d] = new Set();
			dayRechargeAmount[d] = 0;
			dayRefundAmount[d] = 0;
			dayExchangeCount[d] = 0;
			dayExchangeAmount[d] = 0;
			dayTradeTypeCount[d] = {};
			dayTradeTypeAmount[d] = {};
		});

		if (cardBase.ok) {
			const bucketStats = await adminAggregateTrendBucketTradeStatsCardAligned(
				cardBase,
				range,
				normalizeTrendTradeType
			);
			Object.keys(bucketStats.dayFlow || {}).forEach((d) => {
				if (d in dayFlow) dayFlow[d] = bucketStats.dayFlow[d];
			});
			dayTradeTypeCount = bucketStats.dayTradeTypeCount || dayTradeTypeCount;
			dayTradeTypeAmount = bucketStats.dayTradeTypeAmount || dayTradeTypeAmount;
			rangeTradeTypeStats = bucketStats.rangeTradeTypeStats || {};
			rangeTradeCount = Number(bucketStats.rangeTradeCount || 0);
			rangeTradeAmount = Number(bucketStats.rangeTradeAmount || 0);
		}

		const bindSeenByDay = {};
		(bindRes.data || []).forEach((row) => {
			const d = bucketKeyByRange(row.bind_time, range);
			if (!dayBind[d] && dayBind[d] !== 0) return;
			if (!bindSeenByDay[d]) bindSeenByDay[d] = new Set();
			const mk = String(row.user_id || row._id || '');
			if (!mk || bindSeenByDay[d].has(mk)) return;
			bindSeenByDay[d].add(mk);
			rangeBindMerchants.add(mk);
			dayBind[d] += 1;
		});

		const rechargeSeen = new Set();
		const refundSeen = new Set();
		(payRes.data || []).forEach((row, idx) => {
			const ts = Number(row.pay_date || row.create_date || 0);
			const d = bucketKeyByRange(ts, range);
			if (!(d in dayRechargeAmount)) return;
			const bizNo = safeText(row.out_trade_no || row.order_no || '', 80) || `rc_${idx}`;
			if (rechargeSeen.has(bizNo)) return;
			rechargeSeen.add(bizNo);
			dayRechargeAmount[d] += Number((Number(row.total_fee || 0) / 100).toFixed(2));
			const uid = String(row.user_id || '');
			if (uid) {
				dayRechargeMerchants[d].add(uid);
				rangeRechargeMerchants.add(uid);
			}
		});
		(logRes.data || []).forEach((row, idx) => {
			const d = bucketKeyByRange(row.create_time, range);
			if (!(d in dayRechargeAmount)) return;
			if (row.action === 'h5_refund_reset') {
				const bizNo = safeText(row.platform_no || '', 80) || `rf_${idx}`;
				if (refundSeen.has(bizNo)) return;
				refundSeen.add(bizNo);
				dayRefundAmount[d] += Number(row.refund_final_amount || row.refund_amount || 0);
			}
		});

		const withdrawSeen = new Set();
		(wdRes.data || []).forEach((row, idx) => {
			const tsForBucket = Number(row.arrival_time || row.pay_time || row.create_time || 0);
			const d = bucketKeyByRange(tsForBucket, range);
			if (!(d in dayExchangeCount)) return;
			const wk = safeText(row.withdraw_no || '', 80) || `wd_${idx}`;
			if (withdrawSeen.has(wk)) return;
			withdrawSeen.add(wk);
			dayExchangeCount[d] += 1;
			const net = Number(row.payable != null ? row.payable : Number(row.amount || 0) - Number(row.fee_tax || 0));
			dayExchangeAmount[d] += Number.isFinite(net) ? net : 0;
		});

		const categories = [];
		const dailyFlow = [];
		const newBindMerchantCount = [];
		const rechargeMerchantCount = [];
		const rechargeAmount = [];
		const refundAmount = [];
		const exchangeCount = [];
		const exchangeNetAmount = [];
		range.keys.forEach((d, idx) => {
			categories.push(range.labels[idx] || d);
			dailyFlow.push(Number(Number(dayFlow[d] || 0).toFixed(2)));
			newBindMerchantCount.push(Number(dayBind[d] || 0));
			rechargeMerchantCount.push((dayRechargeMerchants[d] && dayRechargeMerchants[d].size) || 0);
			rechargeAmount.push(Number(Number(dayRechargeAmount[d] || 0).toFixed(2)));
			refundAmount.push(Number(Number(dayRefundAmount[d] || 0).toFixed(2)));
			exchangeCount.push(Number(dayExchangeCount[d] || 0));
			exchangeNetAmount.push(Number(Number(dayExchangeAmount[d] || 0).toFixed(2)));
		});

		const tradeTypeCodes = trendTradeTypeDefs.map((x) => x.key);
		const tradeTypeLabelByKey = trendTradeTypeDefs.reduce((m, x) => {
			m[x.key] = x.label;
			return m;
		}, {});
		const tradeTypeCountSeries = tradeTypeCodes.map((code) => ({
			type: code,
			label: tradeTypeLabelByKey[code] || code,
			data: range.keys.map((d) => Number((dayTradeTypeCount[d] && dayTradeTypeCount[d][code]) || 0))
		}));
		const tradeTypeAmountSeries = tradeTypeCodes.map((code) => ({
			type: code,
			label: tradeTypeLabelByKey[code] || code,
			data: range.keys.map((d) => Number(Number((dayTradeTypeAmount[d] && dayTradeTypeAmount[d][code]) || 0).toFixed(2)))
		}));

		const payload = {
			categories,
			tradeTypeStats: [
				...tradeTypeCodes.map((code) => ({ key: code, label: tradeTypeLabelByKey[code] || code }))
			].map((item) => {
				const cur = rangeTradeTypeStats[item.key] || {};
				const all = allTimeTradeTypeStats[item.key] || {};
				return {
					type: item.key,
					label: item.label,
					count: Number(cur.count || 0),
					amount: Number(Number(cur.amount || 0).toFixed(2)),
					allTimeCount: Number(all.count || 0),
					allTimeAmount: Number(Number(all.amount || 0).toFixed(2))
				};
			}),
			summary: {
				totalFlow: Number(Number(rangeTradeAmount || 0).toFixed(2)),
				allTimeTotalFlow: Number(Number(allTimeTotalFlow || 0).toFixed(2)),
				totalBindMerchantCount: Number(rangeBindMerchants.size || 0),
				totalRechargeMerchantCount: Number(rangeRechargeMerchants.size || 0),
				allTimeBindMerchantCount: Number(allTimeBindMerchantCount || 0),
				allTimeRechargeMerchantCount: Number(allTimeRechargeMerchantCount || 0),
				totalRechargeAmount: Number(rechargeAmount.reduce((sum, n) => sum + Number(n || 0), 0).toFixed(2)),
				totalRefundAmount: Number(refundAmount.reduce((sum, n) => sum + Number(n || 0), 0).toFixed(2)),
				allTimeRechargeAmount: Number(Number(allTimeRechargeAmount || 0).toFixed(2)),
				allTimeRefundAmount: Number(Number(allTimeRefundAmount || 0).toFixed(2)),
				totalExchangeCount: Number(exchangeCount.reduce((sum, n) => sum + Number(n || 0), 0)),
				totalExchangeNetAmount: Number(exchangeNetAmount.reduce((sum, n) => sum + Number(n || 0), 0).toFixed(2)),
				allTimeExchangeCount: Number(allTimeExchangeCount || 0),
				allTimeExchangeNetAmount: Number(Number(allTimeExchangeNetAmount || 0).toFixed(2)),
				totalTradeCount: Number(rangeTradeCount || 0),
				allTimeTradeCount: Number(allTimeTradeCount || 0),
				totalTradeAmount: Number(Number(rangeTradeAmount || 0).toFixed(2)),
				allTimeTradeAmount: Number(Number(allTimeTotalFlow || 0).toFixed(2))
			},
			series: {
				dailyFlow,
				newBindMerchantCount,
				rechargeMerchantCount,
				rechargeAmount,
				refundAmount,
				exchangeCount,
				exchangeNetAmount,
				tradeTypeCountSeries,
				tradeTypeAmountSeries
			}
		};
		adminDashboardTrendCache = { at: now, key: cacheKey, data: payload };
		await adminHomeRedisSetLiveAndLast(
			redisTrendKey,
			redisKeyAdminHomeTrendLast(range.type),
			payload,
			REDIS_EX_ADMIN_HOME_TREND_SEC
		);
		return { code: 0, message: 'ok', data: payload, cache: 'fresh' };
	} catch (e) {
		console.error('adminDashboardTrend30d failed', e);
		return { code: 500, message: '获取首页趋势数据失败' };
	}
}

/** 控制台首页：为历史到账提现回填 withdraw_member_bucket（按当前商户身份初始化；新单在发起时已写入） */
async function backfillWithdrawMemberBucketChunk(limit = 160) {
	const _ = db.command;
	try {
		const res = await withdrawCollection
			.where(
				_.and([
					{ is_deleted: _.neq(true) },
					{ is_paid: true },
					{ arrival_status: 'received' },
					_.or([{ withdraw_member_bucket: _.exists(false) }, { withdraw_member_bucket: _.nin(['member', 'non_member']) }])
				])
			)
			.field({ merchant_user_id: true })
			.limit(Math.min(300, Math.max(1, Number(limit) || 160)))
			.get();
		const rows = res.data || [];
		if (!rows.length) return 0;
		const uids = [...new Set(rows.map((r) => String(r.merchant_user_id || '').trim()).filter(Boolean))];
		const merchantByUid = {};
		if (uids.length) {
			const mRes = await merchantCollection.where({ user_id: _.in(uids) }).limit(uids.length).get();
			(mRes.data || []).forEach((m) => {
				const k = String(m.user_id || '');
				if (k) merchantByUid[k] = m;
			});
			const missing = uids.filter((u) => !merchantByUid[u]);
			if (missing.length) {
				const m2 = await merchantCollection.where({ _id: _.in(missing) }).limit(missing.length).get();
				(m2.data || []).forEach((m) => {
					merchantByUid[String(m._id)] = m;
					const uk = String(m.user_id || '');
					if (uk && !merchantByUid[uk]) merchantByUid[uk] = m;
				});
			}
		}
		const now = nowTs();
		const tasks = rows.map((row) => {
			const uid = String(row.merchant_user_id || '').trim();
			const m = uid ? merchantByUid[uid] : null;
			const bucket = withdrawMemberBucketForSummary(m);
			return withdrawCollection.doc(row._id).update({ withdraw_member_bucket: bucket, update_time: now });
		});
		await Promise.all(tasks);
		return rows.length;
	} catch (e) {
		console.error('backfillWithdrawMemberBucketChunk failed', e);
		return 0;
	}
}

/**
 * 历史刷卡流水回填 trade_member_bucket（按商户当前身份；新流水在落库时已写入）。
 * 仅手动 adminHomeBackfillBuckets / 后台任务调用；勿挂首页热路径。
 * 逐机具等值查询，避免大 $in 误选 device_id_trade_no 空扫数万行。
 */
async function backfillTradeMemberBucketChunk(limit = 200) {
	const _ = db.command;
	try {
		const cardBase = await buildCardRecordAlignedTradeBaseWhere(_);
		if (!cardBase.ok) return 0;
		const needLimit = Math.min(400, Math.max(1, Number(limit) || 200));
		const bucketMissExtra = [
			_.or([
				{ trade_member_bucket: _.exists(false) },
				{ trade_member_bucket: _.nin(['member', 'non_member']) }
			])
		];
		const rows = [];
		const deviceIds = adminFlattenCardAlignDeviceIds(cardBase);
		let emptyStreak = 0;
		for (const deviceId of deviceIds) {
			if (rows.length >= needLimit) break;
			// 连续多台无缺失且尚未捞到任何行：视为回填已基本完成，停止空扫
			if (!rows.length && emptyStreak >= 50) break;
			const where = buildCardAlignedTradeWhereForChunk(_, [deviceId], bucketMissExtra);
			if (!where) continue;
			let q = machineTradeCollection.where(where).field({ user_id: true });
			q = applyCardAlignTradeHintToQuery(q);
			const res = await q.limit(needLimit - rows.length).get();
			const batch = res.data || [];
			if (!batch.length) {
				emptyStreak += 1;
				continue;
			}
			emptyStreak = 0;
			for (const r of batch) rows.push(r);
		}
		if (!rows.length) return 0;
		const uids = [...new Set(rows.map((r) => String(r.user_id || '').trim()).filter(Boolean))];
		const merchantByUid = {};
		if (uids.length) {
			const mRes = await merchantCollection.where({ user_id: _.in(uids) }).limit(uids.length).get();
			(mRes.data || []).forEach((m) => {
				const k = String(m.user_id || '');
				if (k) merchantByUid[k] = m;
			});
			const missing = uids.filter((u) => !merchantByUid[u]);
			if (missing.length) {
				const m2 = await merchantCollection.where({ _id: _.in(missing) }).limit(missing.length).get();
				(m2.data || []).forEach((m) => {
					merchantByUid[String(m._id)] = m;
					const uk = String(m.user_id || '');
					if (uk && !merchantByUid[uk]) merchantByUid[uk] = m;
				});
			}
		}
		const now = nowTs();
		const tasks = rows.map((row) => {
			const uid = String(row.user_id || '').trim();
			const m = uid ? merchantByUid[uid] : null;
			const bucket = tradeMemberBucketForMerchant(m);
			return machineTradeCollection.doc(row._id).update({ trade_member_bucket: bucket });
		});
		await Promise.all(tasks);
		return rows.length;
	} catch (e) {
		console.error('backfillTradeMemberBucketChunk failed', e);
		return 0;
	}
}

/** 管理端商户列表：退款窗口倒计时（与 H5 退款页同一套周期/窗口逻辑） */
function merchantHasQuotaRechargeForRefundWindow(merchant) {
	if (!merchant) return false;
	const yuan = Number(
		merchant.recharge_total_yuan != null ? merchant.recharge_total_yuan : merchant.recharge_amount || 0
	);
	if (yuan > 0) return true;
	if (Number(merchant.recharge_package_price || 0) > 0) return true;
	if (Number(merchant.recharge_cycle_start || 0) > 0) return true;
	return false;
}

async function adminMerchantRefundWindow(data) {
	try {
		const merchantKey = safeText(data?.merchantId || data?.id || '', 80) || safeText(data?.userId || '', 80);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		if (!merchantHasQuotaRechargeForRefundWindow(merchant)) {
			return { code: 400, message: '该商户未充值' };
		}
		const start = Number(merchant.recharge_cycle_start || 0);
		if (!start) {
			return {
				code: 0,
				message: 'ok',
				data: {
					phase: 'no_cycle_start',
					summary:
						'该商户暂无「周期起点」（recharge_cycle_start），系统无法计算距离退款窗口的天数。若已线下充值，请确认是否已写入周期字段。'
				}
			};
		}
		const biz = await getBizSettings();
		const now = nowTs();
		const syncRes = await syncMerchantMembershipCycles(merchant, { biz, now });
		merchant = syncRes.merchant;
		const cycleCfg = syncRes.cycleCfg || resolveMerchantRefundCycleDays(merchant, biz.refundCycle || {});
		const cd =
			syncRes.countdown ||
			computeRechargeCountdown(Number(merchant.recharge_cycle_start || start), now, cycleCfg.cycleDays, cycleCfg.windowDays);
		const DAY_MS = 24 * 60 * 60 * 1000;
		const cycleDays = cycleCfg.cycleDays;
		const windowDays = cycleCfg.windowDays;
		let summary = '';
		let daysToWindowOpen = 0;
		let daysUntilWindowEnd = 0;
		if (cd.phase === 'lock') {
			daysToWindowOpen = Math.max(0, Math.ceil((cd.windowStart - now) / DAY_MS));
			summary = `当前为锁定期（每 ${cycleDays} 天满期后，开放 ${windowDays} 天退款窗口）。距离本期退款窗口开启还有约 ${daysToWindowOpen} 天。`;
		} else if (cd.phase === 'window') {
			daysUntilWindowEnd = Math.max(0, Math.ceil((cd.windowEnd - now) / DAY_MS));
			summary = `当前在退款窗口内（本窗口 ${windowDays} 天）。距离窗口结束约还有 ${daysUntilWindowEnd} 天，可申请全额退款。`;
		} else {
			summary = '当前周期状态无法解析，请稍后再试或核对商户的充值周期数据。';
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				phase: cd.phase,
				cycleDays,
				windowDays,
				daysToWindowOpen,
				daysUntilWindowEnd,
				summary
			}
		};
	} catch (e) {
		console.error('adminMerchantRefundWindow failed', e);
		return { code: 500, message: safeText(e?.message || '查询失败', 120) };
	}
}

/** 曾充值但当前额度包目录无法匹配 package_id/价格档位 →「其他会员」 */
function merchantHasOrphanRechargeMembership(merchant, packages = []) {
	const list = Array.isArray(packages) ? packages : [];
	const totalYuan = Number(merchant?.recharge_total_yuan || 0);
	const price = Number(merchant?.recharge_package_price || 0);
	const pkgId = String(merchant?.recharge_package_id || '').trim();
	const hasRechargeTrail = totalYuan > 0 || price > 0.1 || !!pkgId;
	if (!hasRechargeTrail) return false;
	if (pkgId && pickRechargePackage(pkgId, list)) return false;
	if (price > 0.1 && getRechargePackageByPrice(price, list)) return false;
	if (pkgId && !pickRechargePackage(pkgId, list)) return true;
	if (totalYuan > 0 && price <= 0.1 && !pkgId) return true;
	return false;
}

/**
 * 首页会员分档人数（与业务口径一致，非 H5 展示名）：
 * 黄金会员＝600 元档；白金会员＝800 元档；钻石＝1000 元档。
 */
function resolveAdminHomeMembershipCategory(merchant, packages = []) {
	const list = packages && packages.length ? packages : H5_RECHARGE_PACKAGES;
	if (merchantHasOrphanRechargeMembership(merchant, list)) return 'other';

	const info = h5MembershipInfo(merchant, list);
	const tier = String(info.tier || 'normal');
	const name = String(info.name || '');
	if (tier === 'silver' || hasH5SilverMemberIdentity(merchant)) return 'silver';
	const pkg =
		pickRechargePackage(merchant.recharge_package_id, list) ||
		getRechargePackageByPrice(merchant.recharge_package_price, list);
	let price = Number((pkg && pkg.price) || merchant.recharge_package_price || 0);
	if (pkg && pkg.id === H5_RECHARGE_TEST_AS_1000_PKG_ID) price = 1000;

	if (price >= 1000 || tier === 'diamond' || name.includes('钻石')) return 'diamond';
	if (price >= 800 || tier === 'platinum' || name.includes('铂金')) return 'white_gold';
	if (price >= 600 || price === 0.1 || tier === 'white_gold' || name.includes('黄金') || name.includes('白金')) {
		return 'gold';
	}
	return 'normal';
}

async function invalidateAdminHomeSummaryCache() {
	adminHomeSummaryCache = { at: 0, data: null };
	adminMembershipTierCache = { at: 0, data: null };
	adminDashboardTrendCache = { at: 0, key: '', data: null };
	// 只清正式 key，保留 :last，刷新空窗前端仍可读旧数据
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_HOME_SUMMARY);
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_HOME_PREVIEW);
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_HOME_META);
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP);
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_HOME_PENDING_FROZEN);
	await redisH5.h5RedisDel(REDIS_KEY_ADMIN_MEMBERSHIP_TIER);
	for (const t of ADMIN_HOME_TREND_RANGE_TYPES) {
		await redisH5.h5RedisDel(redisKeyAdminHomeTrend(t));
	}
}

/** 历史 withdraw/trade 分档回填：勿在首页热路径调用，可手动触发 action adminHomeBackfillBuckets */
async function adminHomeBackfillBuckets(data = {}) {
	const maxWRounds = Math.min(50, Math.max(1, Number(data.maxWithdrawRounds) || 15));
	const maxTRounds = Math.min(80, Math.max(1, Number(data.maxTradeRounds) || 25));
	let withdrawUpdated = 0;
	let tradeUpdated = 0;
	for (let i = 0; i < maxWRounds; i++) {
		const n = await backfillWithdrawMemberBucketChunk(200);
		if (!n) break;
		withdrawUpdated += n;
	}
	for (let i = 0; i < maxTRounds; i++) {
		const n = await backfillTradeMemberBucketChunk(250);
		if (!n) break;
		tradeUpdated += n;
	}
	await invalidateAdminHomeSummaryCache();
	return { code: 0, message: 'ok', data: { withdrawUpdated, tradeUpdated } };
}

async function adminCountMembershipTierCounts() {
	const packages = await loadRechargePackagesFromQuota();
	const counts = { normal: 0, silver: 0, gold: 0, white_gold: 0, diamond: 0, other: 0 };
	const pageSize = 500;
	let skip = 0;
	const merchantFields = {
		recharge_total_yuan: true,
		recharge_package_price: true,
		recharge_package_id: true,
		membership_name: true,
		silver_member: true,
		silver_member_end_at: true,
		member_tier: true,
		membership_tier: true,
		h5_member_tier: true,
		redeem_code_claimed: true,
		exchange_code_claimed: true
	};
	for (;;) {
		const res = await merchantCollection
			.orderBy('_id', 'asc')
			.field(merchantFields)
			.skip(skip)
			.limit(pageSize)
			.get();
		const rows = res.data || [];
		if (!rows.length) break;
		for (const row of rows) {
			try {
				const cat = resolveAdminHomeMembershipCategory(row, packages);
				if (Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat] += 1;
				else counts.normal += 1;
			} catch (rowErr) {
				console.error('resolveAdminHomeMembershipCategory row', row._id, rowErr);
				counts.normal += 1;
			}
		}
		if (rows.length < pageSize) break;
		skip += pageSize;
		if (skip > 100000) break;
	}
	return counts;
}

async function adminCountMembershipTierCountsCached(forceRefresh = false) {
	const now = nowTs();
	if (!forceRefresh && adminMembershipTierCache.data && now - adminMembershipTierCache.at < ADMIN_MEMBERSHIP_TIER_CACHE_MS) {
		return adminMembershipTierCache.data;
	}
	if (!forceRefresh) {
		const hit = await redisH5.h5RedisGetJson(REDIS_KEY_ADMIN_MEMBERSHIP_TIER);
		if (hit && typeof hit.normal === 'number') {
			adminMembershipTierCache = { at: now, data: hit };
			return hit;
		}
	}
	const counts = await adminCountMembershipTierCounts();
	adminMembershipTierCache = { at: now, data: counts };
	await redisH5.h5RedisSetJson(REDIS_KEY_ADMIN_MEMBERSHIP_TIER, counts, REDIS_EX_ADMIN_MEMBERSHIP_TIER_SEC);
	return counts;
}

/** 控制台首页粉卡：已提现(已打款)/待打款/已绑定商户机具刷卡额/累计充值/累计退款 */
async function adminHomeSummary(data = {}) {
	try {
		const forceRefresh = !!(data && data.refresh);
		const cacheOnly = !!(data && (data.cacheOnly === true || data.fromCache === true));
		const now = nowTs();
		if (!forceRefresh) {
			if (adminHomeSummaryCache.data && now - adminHomeSummaryCache.at < ADMIN_HOME_SUMMARY_CACHE_MS) {
				return { code: 0, message: 'ok', data: adminHomeSummaryCache.data, cache: 'memory' };
			}
			const redisHit = await redisH5.h5RedisGetJson(REDIS_KEY_ADMIN_HOME_SUMMARY);
			if (redisHit && redisHit.membershipCounts) {
				adminHomeSummaryCache = { at: now, data: redisHit };
				return { code: 0, message: 'ok', data: redisHit, cache: 'redis' };
			}
			const lastHit = await redisH5.h5RedisGetJson(REDIS_KEY_ADMIN_HOME_SUMMARY_LAST);
			if (lastHit && lastHit.membershipCounts) {
				adminHomeSummaryCache = { at: now, data: lastHit };
				return { code: 0, message: 'ok', data: lastHit, cache: 'redis_last' };
			}
			if (cacheOnly) {
				return { code: 0, message: 'cache_miss', data: null, cache: 'miss' };
			}
		}

		const _ = db.command;
		const $ = db.command.aggregate;
		// 已提现/到账/提现率：只统计「已打款且已到账」(is_paid + arrival_status=received)
		const wdPaidMatch = _.and([
			{ is_deleted: _.neq(true) },
			{ is_paid: true },
			{ arrival_status: 'received' }
		]);
		// 待打款：未打款且未失效/退回
		const wdPendingMatch = _.and([
			{ is_deleted: _.neq(true) },
			{ is_paid: false },
			{ arrival_status: _.nin(['returned', 'expired']) }
		]);
		const cardBase = await buildCardRecordAlignedTradeBaseWhere(_);

		// 提现分桶可轻量补；刷卡 trade_member_bucket 回填勿走热路径（大 $in 易慢查），用 adminHomeBackfillBuckets
		try {
			await backfillWithdrawMemberBucketChunk(200);
		} catch (eBf) {
			console.error('adminHomeSummary withdraw backfill', eBf);
		}

		const rechargeMatch = _.and([
			{ type: 'h5_quota_recharge' },
			{ status: 1 },
			{ user_order_success: true },
			{ is_deleted: _.neq(true) },
			{ out_trade_no: _.exists(true) },
			{ out_trade_no: _.neq('') }
		]);
		const refundMatch = _.and([
			{ action: 'h5_refund_reset' },
			{ is_deleted: _.neq(true) },
			{ platform_no: _.exists(true) },
			{ platform_no: _.neq('') }
		]);

		const membershipPromise = adminCountMembershipTierCountsCached(forceRefresh);

		const wdTotalPromise = withdrawCollection
			.aggregate()
			.match(wdPaidMatch)
			.group({ _id: null, total: $.sum('$payable') })
			.end()
			.catch((e) => {
				console.error('adminHomeSummary wdAgg', e);
				return { data: [] };
			});

		const wdSplitPromise = withdrawCollection
			.aggregate()
			.match(wdPaidMatch)
			.group({ _id: '$withdraw_member_bucket', total: $.sum('$payable') })
			.end()
			.catch((e) => {
				console.error('adminHomeSummary wdSplit', e);
				return { data: [] };
			});

		const wdPendingSplitPromise = withdrawCollection
			.aggregate()
			.match(wdPendingMatch)
			.group({ _id: '$withdraw_member_bucket', total: $.sum('$payable') })
			.end()
			.catch((e) => {
				console.error('adminHomeSummary wdPendingSplit', e);
				return { data: [] };
			});

		const tradeTotalPromise = cardBase.ok
			? adminSumTradeAmountCardAligned(cardBase)
					.then((total) => ({ data: [{ total }] }))
					.catch((e) => {
						console.error('adminHomeSummary tradeAgg', e);
						return { data: [] };
					})
			: Promise.resolve({ data: [] });

		const tradeSplitPromise = cardBase.ok
			? adminSumTradeAmountByBucketCardAligned(cardBase)
					.then((pack) => ({ data: pack.rows || [] }))
					.catch((e) => {
						console.error('adminHomeSummary tradeSplit', e);
						return { data: [] };
					})
			: Promise.resolve({ data: [] });

		const rechargePromise = uniPayOrderCollection
			.aggregate()
			.match(rechargeMatch)
			.group({ _id: '$out_trade_no', amount: $.max('$total_fee') })
			.group({ _id: null, total: $.sum('$amount') })
			.end()
			.catch((e) => {
				console.error('adminHomeSummary rechargeAgg', e);
				return { data: [] };
			});

		const refundPromise = operationLogCollection
			.aggregate()
			.match(refundMatch)
			.group({ _id: '$platform_no', amount: $.max('$refund_final_amount') })
			.group({ _id: null, total: $.sum('$amount') })
			.end()
			.catch((e) => {
				console.error('adminHomeSummary refundAgg', e);
				return { data: [] };
			});

		const [membershipCounts, wdAgg, splitAgg, pendingSplitAgg, tradeAgg, tradeSplitAgg, rechargeAgg, refundAgg] =
			await Promise.all([
				membershipPromise.catch((e) => {
					console.error('adminCountMembershipTierCountsCached', e);
					return {
						normal: 0,
						silver: 0,
						gold: 0,
						white_gold: 0,
						diamond: 0,
						other: 0,
						_error: safeText(e?.message, 200)
					};
				}),
				wdTotalPromise,
				wdSplitPromise,
				wdPendingSplitPromise,
				tradeTotalPromise,
				tradeSplitPromise,
				rechargePromise,
				refundPromise
			]);

		let arrivedWithdrawAmount = Number(Number((((wdAgg.data || [])[0] || {}).total || 0)).toFixed(2));
		let arrivedWithdrawAmountMember = 0;
		let arrivedWithdrawAmountNonMember = 0;
		let arrivedWithdrawAmountUnbucketed = 0;
		for (const row of splitAgg.data || []) {
			const key = row._id;
			const t = Number(Number((row.total || 0)).toFixed(2));
			if (key === 'member') arrivedWithdrawAmountMember = t;
			else if (key === 'non_member') arrivedWithdrawAmountNonMember = t;
			else arrivedWithdrawAmountUnbucketed = Number((arrivedWithdrawAmountUnbucketed + t).toFixed(2));
		}
		// 未分桶金额并入非会员，保证 会员+非会员 = 已提现
		if (arrivedWithdrawAmountUnbucketed > 0) {
			arrivedWithdrawAmountNonMember = Number(
				(arrivedWithdrawAmountNonMember + arrivedWithdrawAmountUnbucketed).toFixed(2)
			);
		}
		// 以分桶合计为准（与总聚合在四舍五入后对齐）
		const arrivedSplitSum = Number(
			(arrivedWithdrawAmountMember + arrivedWithdrawAmountNonMember).toFixed(2)
		);
		if (arrivedSplitSum > 0) arrivedWithdrawAmount = arrivedSplitSum;

		let pendingWithdrawAmountMember = 0;
		let pendingWithdrawAmountNonMember = 0;
		let pendingUnbucketed = 0;
		for (const row of pendingSplitAgg.data || []) {
			const key = row._id;
			const t = Number(Number((row.total || 0)).toFixed(2));
			if (key === 'member') pendingWithdrawAmountMember = t;
			else if (key === 'non_member') pendingWithdrawAmountNonMember = t;
			else pendingUnbucketed = Number((pendingUnbucketed + t).toFixed(2));
		}
		if (pendingUnbucketed > 0) {
			pendingWithdrawAmountNonMember = Number(
				(pendingWithdrawAmountNonMember + pendingUnbucketed).toFixed(2)
			);
		}

		let boundMerchantTradeAmount = 0;
		let boundMerchantTradeAmountMember = 0;
		let boundMerchantTradeAmountNonMember = 0;
		let tradeUnbucketed = 0;
		if (cardBase.ok) {
			boundMerchantTradeAmount = Number(Number((((tradeAgg.data || [])[0] || {}).total || 0)).toFixed(2));
			for (const row of tradeSplitAgg.data || []) {
				const key = row._id;
				const t = Number(Number((row.total || 0)).toFixed(2));
				if (key === 'member') boundMerchantTradeAmountMember = t;
				else if (key === 'non_member') boundMerchantTradeAmountNonMember = t;
				else tradeUnbucketed = Number((tradeUnbucketed + t).toFixed(2));
			}
			if (tradeUnbucketed > 0) {
				boundMerchantTradeAmountNonMember = Number(
					(boundMerchantTradeAmountNonMember + tradeUnbucketed).toFixed(2)
				);
			}
			const tradeSplitSum = Number(
				(boundMerchantTradeAmountMember + boundMerchantTradeAmountNonMember).toFixed(2)
			);
			if (tradeSplitSum > 0) boundMerchantTradeAmount = tradeSplitSum;
		}

		const totalRechargeAmount = Number((Number((((rechargeAgg.data || [])[0] || {}).total || 0)) / 100).toFixed(2));
		const totalRefundAmount = Number((((refundAgg.data || [])[0] || {}).total || 0).toFixed(2));

		const payload = {
			membershipCounts,
			arrivedWithdrawAmount,
			arrivedWithdrawAmountMember,
			arrivedWithdrawAmountNonMember,
			pendingWithdrawAmountMember,
			pendingWithdrawAmountNonMember,
			boundMerchantTradeAmount,
			boundMerchantTradeAmountMember,
			boundMerchantTradeAmountNonMember,
			totalRechargeAmount,
			totalRefundAmount,
			_paidMatch: 'is_paid+arrival_received',
			_unbucketedFolded: {
				arrived: arrivedWithdrawAmountUnbucketed,
				pending: pendingUnbucketed,
				trade: tradeUnbucketed
			}
		};
		adminHomeSummaryCache = { at: now, data: payload };
		await adminHomeRedisSetLiveAndLast(
			REDIS_KEY_ADMIN_HOME_SUMMARY,
			REDIS_KEY_ADMIN_HOME_SUMMARY_LAST,
			payload,
			REDIS_EX_ADMIN_HOME_SUMMARY_SEC
		);
		return { code: 0, message: 'ok', data: payload, cache: 'fresh' };
	} catch (e) {
		console.error('adminHomeSummary failed', e);
		return { code: 500, message: '获取首页汇总失败' };
	}
}

/** 数据预览中控台计数（原前端直查 DB，改为服务端预热进 Redis） */
async function computeAdminHomePreviewCounts() {
	const _ = db.command;
	const $ = db.command.aggregate;
	const brandCollection = db.collection('hsy-brand');
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayTs = todayStart.getTime();

	const [
		brandRes,
		machineRes,
		activatedRes,
		boundRes,
		todayActivatedRes,
		merchantRes,
		memberRes,
		wdAgg
	] = await Promise.all([
		brandCollection.where({ is_deleted: false }).count(),
		machineCollection.where({ is_deleted: false }).count(),
		machineCollection.where({ is_deleted: false, is_activated: true }).count(),
		machineCollection.where({ is_deleted: false, is_bound: 1 }).count(),
		machineCollection
			.where({
				is_deleted: false,
				is_activated: true,
				activated_time: _.gte(todayTs)
			})
			.count()
			.catch(async () =>
				machineCollection
					.where({
						is_deleted: false,
						is_activated: true,
						activated_time: _.gte(todayStart)
					})
					.count()
			),
		merchantCollection.count(),
		merchantCollection
			.where(
				_.or([{ recharge_amount: _.gt(0) }, { recharge_total_yuan: _.gt(0) }])
			)
			.count(),
		withdrawCollection
			.aggregate()
			.match({
				is_deleted: _.neq(true),
				is_paid: true,
				arrival_status: 'received'
			})
			.group({
				_id: null,
				count: $.sum(1),
				total: $.sum('$payable')
			})
			.end()
			.catch((e) => {
				console.error('computeAdminHomePreviewCounts wdAgg', e);
				return { data: [] };
			})
	]);

	const wdRow = ((wdAgg && wdAgg.data) || [])[0] || {};
	const userCount = Number((merchantRes && merchantRes.total) || 0);
	const memberCount = Number((memberRes && memberRes.total) || 0);
	const memberRate = userCount ? ((memberCount / userCount) * 100).toFixed(2) : '0.00';

	return {
		brandCount: Number((brandRes && brandRes.total) || 0),
		machineCount: Number((machineRes && machineRes.total) || 0),
		activatedCount: Number((activatedRes && activatedRes.total) || 0),
		boundCount: Number((boundRes && boundRes.total) || 0),
		todayActivatedCount: Number((todayActivatedRes && todayActivatedRes.total) || 0),
		withdrawCount: Number(wdRow.count || 0),
		withdrawAmount: Number(Number(wdRow.total || 0).toFixed(2)),
		userCount,
		memberCount,
		memberRate,
		returnPaid: 0,
		returnDue: 0,
		returnRate: '0.00'
	};
}

async function refreshAdminHomePreviewCache() {
	const preview = await computeAdminHomePreviewCounts();
	await adminHomeRedisSetLiveAndLast(
		REDIS_KEY_ADMIN_HOME_PREVIEW,
		REDIS_KEY_ADMIN_HOME_PREVIEW_LAST,
		preview,
		REDIS_EX_ADMIN_HOME_PREVIEW_SEC
	);
	return preview;
}

/**
 * 提现前 20：按「已打款且已到账」的 payable（实际到微信零钱）汇总排名。
 */
async function computeAdminHomeWithdrawTop20() {
	const _ = db.command;
	const $ = db.command.aggregate;
	const wdPaidMatch = _.and([
		{ is_deleted: _.neq(true) },
		{ is_paid: true },
		{ arrival_status: 'received' }
	]);

	let ranked = [];
	try {
		const agg = await withdrawCollection
			.aggregate()
			.match(wdPaidMatch)
			.group({
				_id: '$merchant_user_id',
				withdrawAmount: $.sum('$payable'),
				withdrawCount: $.sum(1)
			})
			.sort({ withdrawAmount: -1 })
			.limit(20)
			.end();
		ranked = (agg.data || [])
			.map((row) => ({
				merchantUserId: String(row._id || '').trim(),
				withdrawAmount: Number(Number(row.withdrawAmount || 0).toFixed(2)),
				withdrawCount: Number(row.withdrawCount || 0) || 0
			}))
			.filter((x) => x.merchantUserId && x.withdrawAmount > 0);
	} catch (e) {
		console.error('computeAdminHomeWithdrawTop20 aggregate failed', e);
		ranked = [];
	}

	if (!ranked.length) {
		return { list: [], updatedAt: nowTs() };
	}

	const uids = ranked.map((x) => x.merchantUserId);
	const merchantByUid = new Map();
	try {
		const mRes = await merchantCollection
			.where({ user_id: _.in(uids) })
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				device_id: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				recharge_update_time: true,
				recharge_cycle_start: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				estimated_free_quota: true,
				recharge_package_quota: true,
				silver_member: true,
				silver_member_start_at: true,
				silver_member_end_at: true
			})
			.limit(Math.max(40, uids.length * 2))
			.get();
		for (const m of mRes.data || []) {
			const uid = String(m.user_id || '').trim();
			if (uid) merchantByUid.set(uid, m);
			const docId = String(m._id || '').trim();
			if (docId && !merchantByUid.has(docId)) merchantByUid.set(docId, m);
		}
	} catch (e) {
		console.error('computeAdminHomeWithdrawTop20 merchants', e);
	}

	const bindIds = [];
	for (const uid of uids) {
		bindIds.push(uid);
		const m = merchantByUid.get(uid);
		if (m && m._id) bindIds.push(String(m._id));
	}
	let machineMap = {};
	try {
		machineMap = await batchListBoundMachinesByBindUserIds(bindIds);
	} catch (e) {
		console.error('computeAdminHomeWithdrawTop20 machines', e);
		machineMap = {};
	}

	const list = ranked.map((row, idx) => {
		const m = merchantByUid.get(row.merchantUserId) || {};
		const mem = resolveMerchantMembershipForAdmin(m);
		const machines =
			machineMap[row.merchantUserId] ||
			(m._id ? machineMap[String(m._id)] : null) ||
			[];
		const deviceIds = (machines || []).map((x) => x.device_id).filter(Boolean);
		const deviceIdText =
			deviceIds.length > 0
				? deviceIds.join('、')
				: safeText(m.device_id, 80) || '-';
		const openedAt = Number(mem.openedAt || 0) || 0;
		return {
			rank: idx + 1,
			merchantUserId: row.merchantUserId,
			merchantName: safeText(m.wx_nickname || m.mobile || row.merchantUserId, 80) || '-',
			deviceId: deviceIdText,
			withdrawAmount: row.withdrawAmount,
			withdrawCount: row.withdrawCount,
			membershipLevel: safeText(mem.level || '普通会员', 40) || '普通会员',
			membershipOpenedAt: openedAt,
			membershipOpenedAtText: openedAt > 0 ? formatTime(openedAt) : '-'
		};
	});

	return { list, updatedAt: nowTs() };
}

async function refreshAdminHomeWithdrawTopCache() {
	const payload = await computeAdminHomeWithdrawTop20();
	await adminHomeRedisSetLiveAndLast(
		REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP,
		REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP_LAST,
		payload,
		REDIS_EX_ADMIN_HOME_WITHDRAW_TOP_SEC
	);
	return payload;
}

/**
 * 全平台待提现 + 本月起连续 5 个月（本月+后四月）未领待返/冻结。
 * 待提现 = 各商户账号积分（H5 待提现，已领未提）。
 * 按月金额 = hsy-points-slice-state 未领片的 effective_amount（已含积分优化后的生效值）。
 */
async function computeAdminHomePendingFrozen() {
	const _ = db.command;
	const $ = db.command.aggregate;
	const now = nowTs();
	const curYm = shanghaiYearMonthFromTs(now);
	const monthYms = [];
	for (let i = 0; i <= 4; i += 1) {
		monthYms.push(addCalendarMonthsYm(curYm, i));
	}
	const maxYm = monthYms[monthYms.length - 1];

	let pendingWithdrawTotal = 0;
	try {
		const pendAgg = await merchantCollection
			.aggregate()
			.group({
				_id: null,
				totalAp: $.sum('$account_points'),
				totalWpb: $.sum('$withdraw_pending_balance')
			})
			.end();
		const row = ((pendAgg && pendAgg.data) || [])[0] || {};
		const ap = Number(row.totalAp || 0);
		const wpb = Number(row.totalWpb || 0);
		// 优先用 account_points（与 H5 待提现一致）；若库内多为 withdraw_pending_balance 再兜底
		pendingWithdrawTotal = Number((ap > 0 || wpb <= 0 ? ap : wpb).toFixed(2));
	} catch (e) {
		console.error('computeAdminHomePendingFrozen pending agg', e);
		pendingWithdrawTotal = 0;
	}

	const byYm = {};
	monthYms.forEach((ym) => {
		byYm[ym] = 0;
	});
	try {
		const sliceCol = db.collection('hsy-points-slice-state');
		const sliceAgg = await sliceCol
			.aggregate()
			.match(
				_.and([
					{ is_deleted: _.neq(true) },
					{ is_claimed: _.neq(true) },
					{ target_ym: _.gte(curYm) },
					{ target_ym: _.lte(maxYm) }
				])
			)
			.group({
				_id: '$target_ym',
				total: $.sum('$effective_amount')
			})
			.end();
		for (const row of (sliceAgg && sliceAgg.data) || []) {
			const ym = String(row._id || '').trim();
			if (!ym || !(ym in byYm)) continue;
			byYm[ym] = Number(Number(row.total || 0).toFixed(2));
		}
	} catch (e) {
		console.error('computeAdminHomePendingFrozen slice agg', e);
	}

	const frozenMonths = monthYms.map((ym, idx) => {
		const mon = Number(String(ym).split('-')[1]) || 0;
		return {
			ym,
			label: mon > 0 ? `${mon}月` : ym,
			labelFull: ymToDisplayLabel(ym),
			kind: idx === 0 ? 'current' : 'future',
			amount: Number(byYm[ym] || 0)
		};
	});
	const frozenTotal = Number(
		frozenMonths.reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)
	);
	const frozenCurrentMonth = Number((frozenMonths[0] && frozenMonths[0].amount) || 0);
	const frozenFutureMonths = Number(
		frozenMonths.slice(1).reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)
	);

	return {
		pendingWithdrawTotal,
		currentYm: curYm,
		frozenMonths,
		frozenTotal,
		frozenCurrentMonth,
		frozenFutureMonths,
		updatedAt: now,
		note: '待提现=全平台账号积分合计；按月冻结=未领分片生效额（含积分优化后），本月+后四月'
	};
}

async function refreshAdminHomePendingFrozenCache() {
	const payload = await computeAdminHomePendingFrozen();
	await adminHomeRedisSetLiveAndLast(
		REDIS_KEY_ADMIN_HOME_PENDING_FROZEN,
		REDIS_KEY_ADMIN_HOME_PENDING_FROZEN_LAST,
		payload,
		REDIS_EX_ADMIN_HOME_PENDING_FROZEN_SEC
	);
	return payload;
}

/**
 * 定时预热：写入 Redis。parts 可选 preview / summary / trend / withdrawTop / pendingFrozen
 * rangeTypes 仅对 trend 生效，默认四档全刷（建议 cron 分次调用避免超时）
 */
async function adminHomeCacheRefresh(data = {}) {
	const partsRaw = Array.isArray(data.parts) ? data.parts.map((x) => String(x || '').trim()) : [];
	const parts = partsRaw.length
		? new Set(partsRaw)
		: new Set(['preview', 'summary', 'trend', 'withdrawTop', 'pendingFrozen']);
	const rangeTypes = Array.isArray(data.rangeTypes) && data.rangeTypes.length
		? data.rangeTypes.map((x) => String(x || '').trim()).filter(Boolean)
		: ADMIN_HOME_TREND_RANGE_TYPES.slice();

	const out = {
		updatedAt: nowTs(),
		preview: false,
		summary: false,
		withdrawTop: false,
		pendingFrozen: false,
		trends: {}
	};

	try {
		if (parts.has('preview')) {
			await refreshAdminHomePreviewCache();
			out.preview = true;
		}
		if (parts.has('summary')) {
			const sumRes = await adminHomeSummary({ refresh: true });
			out.summary = !!(sumRes && sumRes.code === 0);
			if (!out.summary) {
				return { code: sumRes?.code || 500, message: sumRes?.message || '汇总刷新失败', data: out };
			}
		}
		if (parts.has('withdrawTop')) {
			await refreshAdminHomeWithdrawTopCache();
			out.withdrawTop = true;
		}
		if (parts.has('pendingFrozen')) {
			await refreshAdminHomePendingFrozenCache();
			out.pendingFrozen = true;
		}
		if (parts.has('trend')) {
			for (const rangeType of rangeTypes) {
				const tr = await adminDashboardTrend30d({ rangeType, refresh: true });
				out.trends[rangeType] = !!(tr && tr.code === 0);
				if (!out.trends[rangeType]) {
					return {
						code: tr?.code || 500,
						message: tr?.message || `趋势刷新失败(${rangeType})`,
						data: out
					};
				}
			}
		}
		await adminHomeRedisSetLiveAndLast(
			REDIS_KEY_ADMIN_HOME_META,
			REDIS_KEY_ADMIN_HOME_META_LAST,
			{ updatedAt: out.updatedAt },
			REDIS_EX_ADMIN_HOME_META_SEC
		);
		return { code: 0, message: 'ok', data: out };
	} catch (e) {
		console.error('adminHomeCacheRefresh failed', e);
		return { code: 500, message: e?.message || '首页缓存刷新失败', data: out };
	}
}

/** 前端只读 Redis：预览 + 汇总 + 趋势 + 提现TOP + 待提现/冻结；miss 回退 :last */
async function adminHomeCacheGet(data = {}) {
	try {
		const rangeType = String(data.rangeType || '30d').trim() || '30d';
		const [previewPack, summaryPack, trendPack, withdrawTopPack, pendingFrozenPack, metaPack] =
			await Promise.all([
				adminHomeRedisGetLiveOrLast(
					REDIS_KEY_ADMIN_HOME_PREVIEW,
					REDIS_KEY_ADMIN_HOME_PREVIEW_LAST,
					isAdminHomePreviewPayload
				),
				adminHomeRedisGetLiveOrLast(
					REDIS_KEY_ADMIN_HOME_SUMMARY,
					REDIS_KEY_ADMIN_HOME_SUMMARY_LAST,
					isAdminHomeSummaryPayload
				),
				adminHomeRedisGetLiveOrLast(
					redisKeyAdminHomeTrend(rangeType),
					redisKeyAdminHomeTrendLast(rangeType),
					isAdminHomeTrendPayload
				),
				adminHomeRedisGetLiveOrLast(
					REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP,
					REDIS_KEY_ADMIN_HOME_WITHDRAW_TOP_LAST,
					isAdminHomeWithdrawTopPayload
				),
				adminHomeRedisGetLiveOrLast(
					REDIS_KEY_ADMIN_HOME_PENDING_FROZEN,
					REDIS_KEY_ADMIN_HOME_PENDING_FROZEN_LAST,
					isAdminHomePendingFrozenPayload
				),
				adminHomeRedisGetLiveOrLast(REDIS_KEY_ADMIN_HOME_META, REDIS_KEY_ADMIN_HOME_META_LAST)
			]);
		const preview = previewPack.data;
		const summary = summaryPack.data;
		const trend = trendPack.data;
		const withdrawTop = withdrawTopPack.data;
		const pendingFrozen = pendingFrozenPack.data;
		const meta = metaPack.data;
		const hit = {
			preview: isAdminHomePreviewPayload(preview),
			summary: isAdminHomeSummaryPayload(summary),
			trend: isAdminHomeTrendPayload(trend),
			withdrawTop: isAdminHomeWithdrawTopPayload(withdrawTop),
			pendingFrozen: isAdminHomePendingFrozenPayload(pendingFrozen)
		};
		const stale = {
			preview: hit.preview && previewPack.from === 'last',
			summary: hit.summary && summaryPack.from === 'last',
			trend: hit.trend && trendPack.from === 'last',
			withdrawTop: hit.withdrawTop && withdrawTopPack.from === 'last',
			pendingFrozen: hit.pendingFrozen && pendingFrozenPack.from === 'last'
		};
		const allHit =
			hit.preview && hit.summary && hit.trend && hit.withdrawTop && hit.pendingFrozen;
		const anyStale = !!(
			stale.preview ||
			stale.summary ||
			stale.trend ||
			stale.withdrawTop ||
			stale.pendingFrozen
		);
		const redisAlive = !!(redisH5.h5RedisAlive && redisH5.h5RedisAlive());
		return {
			code: 0,
			message: allHit ? (anyStale ? 'stale' : 'ok') : 'partial',
			data: {
				preview: hit.preview ? preview : null,
				summary: hit.summary ? summary : null,
				trend: hit.trend ? trend : null,
				withdrawTop: hit.withdrawTop ? withdrawTop : null,
				pendingFrozen: hit.pendingFrozen ? pendingFrozen : null,
				rangeType,
				updatedAt: Number((meta && meta.updatedAt) || 0) || 0,
				cacheHit: hit,
				cacheStale: stale,
				cacheFrom: {
					preview: previewPack.from,
					summary: summaryPack.from,
					trend: trendPack.from,
					withdrawTop: withdrawTopPack.from,
					pendingFrozen: pendingFrozenPack.from,
					meta: metaPack.from
				},
				redisAlive
			}
		};
	} catch (e) {
		console.error('adminHomeCacheGet failed', e);
		return { code: 500, message: '读取首页缓存失败' };
	}
}

/** 交易记录：未选时间时的默认查询跨度 */
const FLOW_MERCHANT_DEFAULT_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
/** 带商户/单号搜索但未选时间时向前追溯上限 */
const FLOW_MERCHANT_KEYWORD_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
const FLOW_MERCHANT_PER_SOURCE_LIMIT_MAX = 2500;
const FLOW_LOG_ACTIONS_ALL = ['offline_first_recharge', 'h5_quota_recharge', 'h5_refund_reset'];
const FLOW_LOG_ACTIONS_RECHARGE = ['offline_first_recharge', 'h5_quota_recharge'];
const FLOW_LOG_FIELDS = {
	action: true,
	create_time: true,
	target_id: true,
	target_name: true,
	platform_no: true,
	offline_order_no: true,
	package_title: true,
	package_price: true,
	refund_final_amount: true,
	refund_amount: true,
	refund_penalty_amount: true
};
const FLOW_WD_FIELDS = {
	merchant_user_id: true,
	user_nickname: true,
	user_mobile: true,
	amount: true,
	payable: true,
	fee_tax: true,
	withdraw_no: true,
	wx_trade_no: true,
	arrival_time: true,
	pay_time: true,
	create_time: true
};
const FLOW_MERCHANT_LOOKUP_FIELDS = { wx_nickname: true, mobile: true, user_id: true };

function normalizeFinanceFlowTimeRange(data) {
	const now = nowTs();
	let tsStart = data?.timeStart !== '' && data?.timeStart != null ? Number(data.timeStart) : 0;
	let tsEnd = data?.timeEnd !== '' && data?.timeEnd != null ? Number(data.timeEnd) : 0;
	if (!Number.isFinite(tsStart) || tsStart < 0) tsStart = 0;
	if (!Number.isFinite(tsEnd) || tsEnd < 0) tsEnd = 0;
	const hasKeyword = !!(safeText(data?.merchantKeyword, 60) || safeText(data?.orderNo, 80));
	const span = hasKeyword ? FLOW_MERCHANT_KEYWORD_RANGE_MS : FLOW_MERCHANT_DEFAULT_RANGE_MS;
	if (!tsStart && !tsEnd) {
		tsEnd = now;
		tsStart = now - span;
	} else if (tsStart && !tsEnd) {
		tsEnd = now;
	} else if (!tsStart && tsEnd) {
		tsStart = tsEnd - span;
	}
	if (tsStart && tsEnd && tsStart > tsEnd) {
		const t = tsStart;
		tsStart = tsEnd;
		tsEnd = t;
	}
	return { tsStart, tsEnd };
}

async function resolveFinanceFlowMerchantKeys(merchantKeyword) {
	const kw = safeText(merchantKeyword, 60);
	if (!kw) return null;
	const _ = db.command;
	const r = new RegExp(escapeReg(kw), 'i');
	const res = await merchantCollection
		.where(_.or([{ mobile: r }, { wx_nickname: r }]))
		.field({ _id: true, user_id: true })
		.limit(500)
		.get();
	const keys = [];
	(res.data || []).forEach((m) => {
		if (m._id) keys.push(String(m._id));
		if (m.user_id) keys.push(String(m.user_id));
	});
	return [...new Set(keys)];
}

function buildFinanceFlowLogWhere({ tsStart, tsEnd, orderNo, actions, merchantKeys }) {
	const _ = db.command;
	const parts = [{ action: _.in(actions) }, { is_deleted: _.neq(true) }];
	if (merchantKeys && merchantKeys.length) {
		parts.push(merchantKeys.length === 1 ? { target_id: merchantKeys[0] } : { target_id: _.in(merchantKeys) });
	}
	if (orderNo) {
		const r = new RegExp(escapeReg(orderNo), 'i');
		parts.push(_.or([{ platform_no: r }, { offline_order_no: r }]));
	}
	if (tsStart && tsEnd) {
		parts.push(_.and([{ create_time: _.gte(tsStart) }, { create_time: _.lte(tsEnd) }]));
	} else if (tsStart) {
		parts.push({ create_time: _.gte(tsStart) });
	} else if (tsEnd) {
		parts.push({ create_time: _.lte(tsEnd) });
	}
	return parts.length === 1 ? parts[0] : _.and(parts);
}

function buildFinanceFlowWdWhere({ tsStart, tsEnd, orderNo, merchantKeys }) {
	const _ = db.command;
	const parts = [{ is_deleted: _.neq(true) }, { is_paid: true }, { arrival_status: 'received' }];
	if (merchantKeys && merchantKeys.length) {
		parts.push(
			merchantKeys.length === 1 ? { merchant_user_id: merchantKeys[0] } : { merchant_user_id: _.in(merchantKeys) }
		);
	}
	if (orderNo) {
		const r = new RegExp(escapeReg(orderNo), 'i');
		parts.push(_.or([{ withdraw_no: r }, { wx_trade_no: r }]));
	}
	if (tsStart && tsEnd) {
		parts.push(_.and([{ arrival_time: _.gte(tsStart) }, { arrival_time: _.lte(tsEnd) }]));
	} else if (tsStart) {
		parts.push({ arrival_time: _.gte(tsStart) });
	} else if (tsEnd) {
		parts.push({ arrival_time: _.lte(tsEnd) });
	}
	return parts.length === 1 ? parts[0] : _.and(parts);
}

function mapFinanceFlowLogRow(row, merchantMap) {
	const merchant = merchantMap[String(row.target_id || '')] || null;
	const merchantName = merchant?.wx_nickname || merchant?.mobile || row.target_name || '-';
	const merchantMobile = merchant?.mobile || '-';
	const ts = Number(row.create_time || 0);
	if (row.action === 'offline_first_recharge' || row.action === 'h5_quota_recharge') {
		const amount = Number(row.package_price || 0);
		const order = safeText(row.platform_no || row.offline_order_no || '', 80) || '-';
		return {
			recordKey: `in:${row._id}`,
			bizType: '充值',
			direction: '入账',
			merchantDisplay: `${merchantName}\n${merchantMobile}`,
			changeAmount: amount,
			changeAmountText: `￥${amount.toFixed(2)}`,
			actualAmount: amount,
			actualAmountText: `￥${amount.toFixed(2)}`,
			orderNo: order,
			remark: row.action === 'offline_first_recharge' ? '线下首冲额度' : safeText(row.package_title || '', 80) || 'H5额度充值',
			finishTime: formatTime(ts),
			_ts: ts
		};
	}
	if (row.action === 'h5_refund_reset') {
		const outAmount = Number(row.refund_final_amount || row.refund_amount || 0);
		const refundAmount = Number(row.refund_amount || 0);
		const penalty = Number(row.refund_penalty_amount || 0);
		const order = safeText(row.platform_no || '', 80) || '-';
		return {
			recordKey: `out_refund:${row._id}`,
			bizType: '退款',
			direction: '出账',
			merchantDisplay: `${merchantName}\n${merchantMobile}`,
			changeAmount: outAmount,
			changeAmountText: `￥${outAmount.toFixed(2)}`,
			actualAmount: outAmount,
			actualAmountText: `￥${outAmount.toFixed(2)}`,
			orderNo: order,
			remark: `原申请:${refundAmount.toFixed(2)}，违约金:${penalty.toFixed(2)}`,
			finishTime: formatTime(ts),
			_ts: ts
		};
	}
	return null;
}

function mapFinanceFlowWdRow(wd, merchantMap) {
	const merchant = merchantMap[String(wd.merchant_user_id || '')] || null;
	const merchantName = merchant?.wx_nickname || wd.user_nickname || wd.user_mobile || '-';
	const merchantMobile = merchant?.mobile || wd.user_mobile || '-';
	const ts = Number(wd.arrival_time || wd.pay_time || wd.create_time || 0);
	const amount = Number(wd.amount || 0);
	const payable = Number(wd.payable || 0);
	return {
		recordKey: `out_withdraw:${wd._id}`,
		bizType: '提现',
		direction: '出账',
		merchantDisplay: `${merchantName}\n${merchantMobile}`,
		changeAmount: amount,
		changeAmountText: `￥${amount.toFixed(2)}`,
		actualAmount: payable,
		actualAmountText: `￥${payable.toFixed(2)}`,
		orderNo: safeText(wd.withdraw_no || wd.wx_trade_no || '', 80) || '-',
		remark: `税费:${Number(wd.fee_tax || 0).toFixed(2)}`,
		finishTime: formatTime(ts),
		_ts: ts
	};
}

async function loadFinanceFlowMerchantMap(targetIds, merchantUserIds) {
	const _ = db.command;
	const merchantMap = {};
	const chunkIn = async (field, values) => {
		const uniq = [...new Set(values.filter(Boolean))];
		if (!uniq.length) return;
		const CHUNK = 400;
		for (let i = 0; i < uniq.length; i += CHUNK) {
			const part = uniq.slice(i, i + CHUNK);
			const res = await merchantCollection
				.where({ [field]: _.in(part) })
				.field(FLOW_MERCHANT_LOOKUP_FIELDS)
				.limit(CHUNK)
				.get();
			(res.data || []).forEach((m) => {
				merchantMap[String(m._id)] = m;
				if (m.user_id) merchantMap[String(m.user_id)] = m;
			});
		}
	};
	await Promise.all([
		chunkIn('_id', targetIds),
		chunkIn('user_id', merchantUserIds)
	]);
	return merchantMap;
}

async function financeFlowListPagedLogs({ where, page, pageSize }) {
	const p = Math.max(1, Number(page) || 1);
	const ps = Math.min(100, Math.max(1, Number(pageSize) || 10));
	const countRes = await operationLogCollection.where(where).count();
	const total = Number(countRes.total) || 0;
	const res = await operationLogCollection
		.where(where)
		.field(FLOW_LOG_FIELDS)
		.orderBy('create_time', 'desc')
		.skip((p - 1) * ps)
		.limit(ps)
		.get();
	const logs = res.data || [];
	const merchantMap = await loadFinanceFlowMerchantMap(
		logs.map((x) => String(x.target_id || '')),
		[]
	);
	const list = logs.map((row) => mapFinanceFlowLogRow(row, merchantMap)).filter(Boolean).map(({ _ts, ...rest }) => rest);
	return { list, total, page: p, pageSize: ps, truncated: false };
}

async function financeFlowListPagedWithdraw({ where, page, pageSize }) {
	const p = Math.max(1, Number(page) || 1);
	const ps = Math.min(100, Math.max(1, Number(pageSize) || 10));
	const countRes = await withdrawCollection.where(where).count();
	const total = Number(countRes.total) || 0;
	const res = await withdrawCollection
		.where(where)
		.field(FLOW_WD_FIELDS)
		.orderBy('arrival_time', 'desc')
		.skip((p - 1) * ps)
		.limit(ps)
		.get();
	const withdraws = res.data || [];
	const merchantMap = await loadFinanceFlowMerchantMap(
		[],
		withdraws.map((x) => String(x.merchant_user_id || ''))
	);
	const list = withdraws.map((wd) => mapFinanceFlowWdRow(wd, merchantMap)).map(({ _ts, ...rest }) => rest);
	return { list, total, page: p, pageSize: ps, truncated: false };
}

async function financeMerchantFlowList(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			bizType = '',
			merchantKeyword = '',
			orderNo = '',
			timeStart = '',
			timeEnd = ''
		} = data || {};
		const p = Math.max(1, Number(page) || 1);
		const ps = Math.min(100, Math.max(1, Number(pageSize) || 10));
		const orderKw = safeText(orderNo, 80);
		const bt = String(bizType || '');
		const { tsStart, tsEnd } = normalizeFinanceFlowTimeRange({
			merchantKeyword,
			orderNo: orderKw,
			timeStart,
			timeEnd
		});
		const merchantKeys = await resolveFinanceFlowMerchantKeys(merchantKeyword);
		if (merchantKeyword && merchantKeys && merchantKeys.length === 0) {
			return {
				code: 0,
				message: 'ok',
				data: { list: [], total: 0, page: p, pageSize: ps, truncated: false, timeStart: tsStart, timeEnd: tsEnd }
			};
		}

		if (bt === '充值') {
			const where = buildFinanceFlowLogWhere({
				tsStart,
				tsEnd,
				orderNo: orderKw,
				actions: FLOW_LOG_ACTIONS_RECHARGE,
				merchantKeys
			});
			const payload = await financeFlowListPagedLogs({ where, page: p, pageSize: ps });
			return { code: 0, message: 'ok', data: { ...payload, timeStart: tsStart, timeEnd: tsEnd } };
		}
		if (bt === '退款') {
			const where = buildFinanceFlowLogWhere({
				tsStart,
				tsEnd,
				orderNo: orderKw,
				actions: ['h5_refund_reset'],
				merchantKeys
			});
			const payload = await financeFlowListPagedLogs({ where, page: p, pageSize: ps });
			return { code: 0, message: 'ok', data: { ...payload, timeStart: tsStart, timeEnd: tsEnd } };
		}
		if (bt === '提现') {
			const where = buildFinanceFlowWdWhere({ tsStart, tsEnd, orderNo: orderKw, merchantKeys });
			const payload = await financeFlowListPagedWithdraw({ where, page: p, pageSize: ps });
			return { code: 0, message: 'ok', data: { ...payload, timeStart: tsStart, timeEnd: tsEnd } };
		}

		const logWhere = buildFinanceFlowLogWhere({
			tsStart,
			tsEnd,
			orderNo: orderKw,
			actions: FLOW_LOG_ACTIONS_ALL,
			merchantKeys
		});
		const wdWhere = buildFinanceFlowWdWhere({ tsStart, tsEnd, orderNo: orderKw, merchantKeys });
		const perNeed = Math.min(
			FLOW_MERCHANT_PER_SOURCE_LIMIT_MAX,
			Math.max(120, (p - 1) * ps + ps)
		);
		const [logCountRes, wdCountRes, logRes, wdRes] = await Promise.all([
			operationLogCollection.where(logWhere).count(),
			withdrawCollection.where(wdWhere).count(),
			operationLogCollection
				.where(logWhere)
				.field(FLOW_LOG_FIELDS)
				.orderBy('create_time', 'desc')
				.limit(perNeed)
				.get(),
			withdrawCollection
				.where(wdWhere)
				.field(FLOW_WD_FIELDS)
				.orderBy('arrival_time', 'desc')
				.limit(perNeed)
				.get()
		]);
		const logs = logRes.data || [];
		const withdraws = wdRes.data || [];
		const truncated =
			logs.length >= perNeed ||
			withdraws.length >= perNeed ||
			Number(logCountRes.total) + Number(wdCountRes.total) > perNeed * 2;
		const merchantMap = await loadFinanceFlowMerchantMap(
			logs.map((x) => String(x.target_id || '')),
			withdraws.map((x) => String(x.merchant_user_id || ''))
		);
		const rows = [];
		logs.forEach((row) => {
			const mapped = mapFinanceFlowLogRow(row, merchantMap);
			if (mapped) rows.push(mapped);
		});
		withdraws.forEach((wd) => rows.push(mapFinanceFlowWdRow(wd, merchantMap)));
		rows.sort((a, b) => Number(b._ts || 0) - Number(a._ts || 0));
		const total = (Number(logCountRes.total) || 0) + (Number(wdCountRes.total) || 0);
		const s = (p - 1) * ps;
		const list = rows.slice(s, s + ps).map(({ _ts, ...rest }) => rest);
		return {
			code: 0,
			message: 'ok',
			data: { list, total, page: p, pageSize: ps, truncated, timeStart: tsStart, timeEnd: tsEnd }
		};
	} catch (error) {
		console.error('financeMerchantFlowList failed:', error);
		return { code: 500, message: '获取交易记录失败' };
	}
}

function escapeReg(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function arrivalStatusText(s) {
	const m = {
		pending: '未到账',
		received: '已到账',
		returned: '已退回',
		expired: '已失效'
	};
	return m[s] || s || '-';
}

function mapWithdrawItem(item) {
	const auditStatus = safeText(item.audit_status || '', 24) || (item.audit_required ? 'pending' : 'none');
	const transferState = safeText(item.transfer_state || '', 40);
	const needReaudit = !!item.audit_required && auditStatus === 'pending' && isWithdrawFailReauditState(transferState);
	const auditMap = { pending: '待审核', approved: '已同意', rejected: '已拒绝', failed: '审核失败', none: '-' };
	let auditStatusText = auditMap[auditStatus] || auditStatus || '-';
	if (needReaudit) auditStatusText = '待重新审核';
	const arrivalStatus = item.arrival_status || 'pending';
	let isPaidText = '未打款';
	if (item.is_paid) isPaidText = '已打款';
	else if (arrivalStatus === 'expired') isPaidText = '已失效';
	else if (arrivalStatus === 'returned') isPaidText = '已退回';
	// 竞态残留：已打款却仍标失效/退回 → 列表侧按到账展示，避免两页互相矛盾
	let displayArrival = arrivalStatus;
	let arrivalText = arrivalStatusText(arrivalStatus);
	if (item.is_paid && (arrivalStatus === 'expired' || arrivalStatus === 'returned')) {
		displayArrival = 'received';
		arrivalText = '已到账';
		isPaidText = '已打款';
	}
	return {
		id: item._id,
		withdrawNo: item.withdraw_no || '',
		merchantUserId: item.merchant_user_id || '',
		userDisplay: [item.user_nickname || '', item.user_mobile || ''].filter(Boolean).join('\n') || '-',
		deviceId: item.device_id || '',
		company: item.company || '-',
		salesman: item.salesman || '-',
		amount: Number(item.amount || 0),
		amountText: Number(item.amount || 0).toFixed(4),
		feeTax: Number(item.fee_tax || 0),
		feeTaxText: Number(item.fee_tax || 0).toFixed(4),
		payable: Number(item.payable || 0),
		payableText: Number(item.payable || 0).toFixed(4),
		isPaid: !!item.is_paid,
		isPaidText,
		wxTradeNo: item.wx_trade_no || '',
		transferState,
		transferError: safeText(item.transfer_error || '', 200),
		balanceRestored: !!item.balance_restored,
		balanceRestoreTime: formatTime(item.balance_restore_time),
		wxExpireResponse: (() => {
			const raw = item.wx_expire_response;
			if (raw == null || raw === '') return '';
			if (typeof raw === 'string') return safeText(raw, 2000);
			try {
				return safeText(JSON.stringify(raw), 2000);
			} catch (e) {
				return '';
			}
		})(),
		auditRequired: !!item.audit_required,
		auditStatus,
		auditStatusText,
		needReaudit,
		payTime: formatTime(item.pay_time),
		arrivalStatus: displayArrival,
		arrivalStatusText: arrivalText,
		arrivalTime: formatTime(item.arrival_time),
		createTime: formatTime(item.create_time)
	};
}

async function buildWithdrawWhere(data) {
	const {
		userKeyword = '',
		merchantUserId = '',
		merchantUserIds,
		withdrawNo = '',
		deviceId = '',
		companyKeyword = '',
		salesmanKeyword = '',
		isPaid = '',
		isPaidList,
		payTimeStart = '',
		payTimeEnd = '',
		arrivalStatus = '',
		arrivalStatusList,
		arrivalTimeStart = '',
		arrivalTimeEnd = '',
		createTimeStart = '',
		createTimeEnd = ''
	} = data || {};

	const parts = [{ is_deleted: false }];

	const uidArr = Array.isArray(merchantUserIds) ? [...new Set(merchantUserIds.map(String))] : [];
	if (uidArr.length === 1) {
		parts.push({ merchant_user_id: uidArr[0] });
	} else if (uidArr.length > 1) {
		parts.push({ merchant_user_id: db.command.in(uidArr) });
	} else if (merchantUserId) {
		parts.push({ merchant_user_id: String(merchantUserId) });
	}

	if (userKeyword) {
		const r = new RegExp(escapeReg(userKeyword), 'i');
		parts.push(db.command.or([{ user_nickname: r }, { user_mobile: r }]));
	}
	if (withdrawNo) {
		parts.push({ withdraw_no: new RegExp(escapeReg(withdrawNo), 'i') });
	}
	// 机具号：提现单只存快照主码牌；需按机具表 bind_user_id 扩到该商户全部提现
	if (deviceId) {
		const deviceCond = buildDeviceIdFieldCond(deviceId);
		const bindUserIds = await listBindUserIdsByBoundDeviceKeyword(deviceId);
		const orParts = [];
		if (deviceCond) orParts.push(deviceCond);
		const ids = [
			...new Set(
				(Array.isArray(bindUserIds) ? bindUserIds : [])
					.map((x) => String(x || '').trim())
					.filter(Boolean)
			)
		];
		const CHUNK = 450;
		for (let i = 0; i < ids.length; i += CHUNK) {
			orParts.push({ merchant_user_id: db.command.in(ids.slice(i, i + CHUNK)) });
		}
		if (orParts.length === 1) parts.push(orParts[0]);
		else if (orParts.length > 1) parts.push(db.command.or(orParts));
	}
	if (companyKeyword) {
		parts.push({ company: new RegExp(escapeReg(companyKeyword), 'i') });
	}
	if (salesmanKeyword) {
		parts.push({ salesman: new RegExp(escapeReg(salesmanKeyword), 'i') });
	}

	const paidArr = Array.isArray(isPaidList) ? [...new Set(isPaidList.map(String))] : [];
	if (paidArr.length === 1) {
		parts.push({ is_paid: paidArr[0] === '1' || paidArr[0] === 'true' });
	} else if (paidArr.length > 1) {
		const ors = paidArr.map((p) => ({ is_paid: p === '1' || p === 'true' }));
		parts.push(db.command.or(ors));
	} else if (isPaid !== '' && isPaid !== undefined && isPaid !== null) {
		parts.push({ is_paid: isPaid === '1' || isPaid === 1 || isPaid === true });
	}

	if (payTimeStart && payTimeEnd) {
		parts.push(
			db.command.and([
				{ pay_time: db.command.gte(Number(payTimeStart)) },
				{ pay_time: db.command.lte(Number(payTimeEnd)) }
			])
		);
	} else if (payTimeStart) {
		parts.push({ pay_time: db.command.gte(Number(payTimeStart)) });
	} else if (payTimeEnd) {
		parts.push({ pay_time: db.command.lte(Number(payTimeEnd)) });
	}

	const arrSt = Array.isArray(arrivalStatusList) ? [...new Set(arrivalStatusList.map(String))] : [];
	if (arrSt.length === 1) {
		parts.push({ arrival_status: arrSt[0] });
	} else if (arrSt.length > 1) {
		parts.push({ arrival_status: db.command.in(arrSt) });
	} else if (arrivalStatus) {
		parts.push({ arrival_status: String(arrivalStatus) });
	}

	if (arrivalTimeStart && arrivalTimeEnd) {
		parts.push(
			db.command.and([
				{ arrival_time: db.command.gte(Number(arrivalTimeStart)) },
				{ arrival_time: db.command.lte(Number(arrivalTimeEnd)) }
			])
		);
	} else if (arrivalTimeStart) {
		parts.push({ arrival_time: db.command.gte(Number(arrivalTimeStart)) });
	} else if (arrivalTimeEnd) {
		parts.push({ arrival_time: db.command.lte(Number(arrivalTimeEnd)) });
	}

	if (createTimeStart && createTimeEnd) {
		parts.push(
			db.command.and([
				{ create_time: db.command.gte(Number(createTimeStart)) },
				{ create_time: db.command.lte(Number(createTimeEnd)) }
			])
		);
	} else if (createTimeStart) {
		parts.push({ create_time: db.command.gte(Number(createTimeStart)) });
	} else if (createTimeEnd) {
		parts.push({ create_time: db.command.lte(Number(createTimeEnd)) });
	}

	return parts.length === 1 ? parts[0] : db.command.and(parts);
}

async function withdrawSummary(whereExpr) {
	try {
		const $ = db.command.aggregate;
		const res = await withdrawCollection
			.aggregate()
			.match(whereExpr)
			.group({
				_id: null,
				totalWithdraw: $.sum('$amount'),
				totalFeeTax: $.sum('$fee_tax'),
				totalPayable: $.sum('$payable')
			})
			.end();
		const row = res.data && res.data[0];
		return {
			totalWithdraw: Number(row && row.totalWithdraw) || 0,
			totalFeeTax: Number(row && row.totalFeeTax) || 0,
			totalPayable: Number(row && row.totalPayable) || 0
		};
	} catch (e) {
		console.error('withdrawSummary aggregate fallback:', e);
		try {
			const all = await withdrawCollection
				.where(whereExpr)
				.field({ amount: true, fee_tax: true, payable: true })
				.limit(5000)
				.get();
			let totalWithdraw = 0;
			let totalFeeTax = 0;
			let totalPayable = 0;
			(all.data || []).forEach((t) => {
				totalWithdraw += Number(t.amount || 0);
				totalFeeTax += Number(t.fee_tax || 0);
				totalPayable += Number(t.payable || 0);
			});
			return { totalWithdraw, totalFeeTax, totalPayable };
		} catch (e2) {
			console.error('withdrawSummary fallback failed:', e2);
			return { totalWithdraw: 0, totalFeeTax: 0, totalPayable: 0 };
		}
	}
}

/** 提现列表顶部看板：成功三项 + 审核中/不通过/已失效（金额+手续费） */
async function withdrawListBoardSummary(data) {
	const _ = db.command;
	const baseData = {
		...(data || {}),
		isPaid: '',
		isPaidList: [],
		arrivalStatus: '',
		arrivalStatusList: []
	};
	const baseWhere = await buildWithdrawWhere(baseData);
	const andBase = (extra) => (baseWhere ? _.and([baseWhere, extra]) : extra);

	const [success, auditPending, auditRejected, expired] = await Promise.all([
		withdrawSummary(
			await buildWithdrawWhere({
				...baseData,
				isPaid: '1',
				arrivalStatus: 'received'
			})
		),
		withdrawSummary(andBase({ audit_status: 'pending' })),
		withdrawSummary(andBase({ audit_status: 'rejected' })),
		withdrawSummary(andBase({ arrival_status: 'expired' }))
	]);

	const plusFee = (s) =>
		Number((Number(s.totalWithdraw || 0) + Number(s.totalFeeTax || 0)).toFixed(2));

	return {
		// 已打款 + 已到账
		totalWithdraw: Number(Number(success.totalWithdraw || 0).toFixed(2)),
		totalFeeTax: Number(Number(success.totalFeeTax || 0).toFixed(2)),
		totalPayable: Number(Number(success.totalPayable || 0).toFixed(2)),
		// 金额 + 手续费税费
		auditPendingTotal: plusFee(auditPending),
		auditRejectedTotal: plusFee(auditRejected),
		expiredTotal: plusFee(expired)
	};
}

/** 提现列表机具号展示：该商户当前全部绑定机具（含快照上的历史机具号） */
async function enrichWithdrawListDeviceIds(list) {
	const rows = Array.isArray(list) ? list : [];
	if (!rows.length) return rows;
	const uids = [
		...new Set(rows.map((x) => safeText(x.merchantUserId, 80)).filter(Boolean))
	];
	const deviceIdsByBindUser = await batchListBoundDeviceIdsByBindUserIds(uids);
	for (const item of rows) {
		const uid = safeText(item.merchantUserId, 80);
		const ids = [];
		const seen = new Set();
		const add = (d) => {
			const v = safeText(d, 80);
			if (!v || seen.has(v)) return;
			seen.add(v);
			ids.push(v);
		};
		for (const d of deviceIdsByBindUser[uid] || []) add(d);
		add(item.deviceId);
		item.deviceId = ids.length ? ids.join('、') : item.deviceId || '-';
	}
	return rows;
}

async function getWithdrawList(data) {
	try {
		const { page = 1, pageSize = 10 } = data || {};
		const whereExpr = await buildWithdrawWhere(data);
		const countRes = await withdrawCollection.where(whereExpr).count();
		const total = countRes.total;
		const res = await withdrawCollection
			.where(whereExpr)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = await enrichWithdrawListDeviceIds((res.data || []).map((row) => mapWithdrawItem(row)));
		const summary = await withdrawListBoardSummary(data);
		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page, pageSize, summary }
		};
	} catch (error) {
		console.error('提现列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

function isWithdrawTerminalFailState(state) {
	return ['FAIL', 'FAILED', 'CANCELLED'].includes(normalizeTransferState(state));
}

function isWithdrawFailReauditState(state) {
	const s = normalizeTransferState(state || '');
	return isWithdrawTerminalFailState(s) || s === 'RETRYABLE_FAIL';
}

async function resolveMerchantForWithdrawRow(row) {
	const merchantUserId = safeText(row?.merchant_user_id, 80);
	if (!merchantUserId) return null;
	const r = await merchantCollection.where({ user_id: merchantUserId }).limit(1).get();
	return r.data && r.data[0] ? r.data[0] : null;
}

/** 需审核提现微信打款失败：回待审核、记录原因，并通知管理员重新审核 */
async function markWithdrawFailNeedsReaudit(row, state, reason, options = {}) {
	if (!row || !row._id || !row.audit_required) return false;
	if (row.is_paid || safeText(row.arrival_status, 20) === 'received') return false;
	const st = normalizeTransferState(state || row.transfer_state || 'FAIL');
	const transferState = isWithdrawTerminalFailState(st) ? st : 'RETRYABLE_FAIL';
	const errText = safeText(reason || row.transfer_error || `微信提现失败：${transferState}`, 180);
	const prevAudit = safeText(row.audit_status, 20);
	const prevState = normalizeTransferState(row.transfer_state || '');
	if (
		prevAudit === 'pending' &&
		isWithdrawFailReauditState(prevState) &&
		safeText(row.transfer_error, 180) === errText
	) {
		return false;
	}
	const now = nowTs();
	await withdrawCollection.doc(row._id).update({
		audit_status: 'pending',
		audit_time: null,
		arrival_status: 'pending',
		is_paid: false,
		transfer_state: transferState,
		transfer_error: errText,
		update_time: now
	});
	await writeTransferLog({
		scene: 'withdraw',
		stage: 'withdraw_fail_needs_reaudit',
		level: 'warn',
		withdrawId: row._id,
		withdrawNo: safeText(row.withdraw_no, 64),
		merchantUserId: safeText(row.merchant_user_id, 80),
		deviceId: row.device_id || '',
		outBillNo: safeText(row.withdraw_no, 64),
		transferState,
		message: errText,
		payload: { prevAudit, prevState }
	});
	const shouldNotify =
		options.notifyWecom !== false &&
		(prevAudit === 'approved' || !isWithdrawFailReauditState(prevState));
	if (shouldNotify) {
		const merchant = options.merchant || (await resolveMerchantForWithdrawRow(row));
		const name = merchant ? maybeMerchantDisplayName(merchant) : safeText(row.user_nickname || row.user_mobile, 40) || '商户';
		const notifiedBalance = await maybeNotifyWxOperatingAccountInsufficientWecom(errText, {
			scene: '提现',
			withdrawNo: safeText(row.withdraw_no, 64),
			outBillNo: safeText(row.withdraw_no, 64),
			merchantName: name
		});
		if (!notifiedBalance) {
			await sendWecomRobotText(`${name}微信提现失败，请重新到「提现列表」进行审核`);
		}
	}
	return true;
}

/**
 * 微信侧已 SUCCESS：同步本地到账。
 * 若本地已「已失效/已退回」并返还过积分，则先扣回积分再记已到账（避免零点失效与成功回调竞态导致「钱到微信 + 积分退回」）。
 * @param {object} [opts]
 * @param {number} [opts.arrivalTime] 优先用微信 success_time，避免零点补记造成「都在 00:00 到账」的假象
 */
async function settleWithdrawSuccess(withdrawRow, wxTradeNo = '', transferState = 'SUCCESS', opts = {}) {
	if (!withdrawRow || !withdrawRow._id) return { ok: false, reason: 'missing' };
	const freshRes = await withdrawCollection.doc(withdrawRow._id).get();
	const row = (freshRes.data && freshRes.data[0]) || withdrawRow;
	const arrival = safeText(row.arrival_status, 20) || 'pending';
	if (row.is_paid || arrival === 'received') return { ok: false, reason: 'already_received' };

	const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
	const amountPoints = Number(row.amount || 0);
	const merchantUserId = safeText(row.merchant_user_id, 80);
	const wasRestored = arrival === 'expired' || arrival === 'returned';
	const merchantRes = merchantUserId
		? await merchantCollection.where({ user_id: merchantUserId }).limit(1).get()
		: { data: [] };
	const merchant = merchantRes.data && merchantRes.data[0];
	const machineRes = row.device_id
		? await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get()
		: { data: [] };
	const machine = machineRes.data && machineRes.data[0];
	const now = nowTs();
	const wxArrival = Number(opts?.arrivalTime || 0);
	const arrivalAt = wxArrival > 0 ? wxArrival : now;

	// 条件写：防止与零点失效并发互相覆盖
	const _ = db.command;
	const claim = await withdrawCollection
		.where({
			_id: row._id,
			is_paid: _.neq(true),
			arrival_status: _.neq('received')
		})
		.update({
			audit_status: 'approved',
			audit_time: Number(row.audit_time || now),
			is_paid: true,
			arrival_status: 'received',
			pay_time: Number(row.pay_time || arrivalAt),
			arrival_time: arrivalAt,
			wx_trade_no: safeText(wxTradeNo || row.wx_trade_no || '', 80),
			transfer_state: safeText(transferState || 'SUCCESS', 40),
			transfer_error: '',
			balance_restored: false,
			update_time: now
		});
	if (!claim.updated) return { ok: false, reason: 'claim_failed' };

	if (merchant) {
		if (wasRestored) {
			// 积分曾退回：扣回积分，只增加已提现（pending 在失效时已扣过）
			await merchantCollection.doc(merchant._id).update({
				available_reward: Number(Math.max(0, rawWithdrawQuotaBalance(merchant) - amountPoints).toFixed(4)),
				withdraw_quota_balance: Number(Math.max(0, rawWithdrawQuotaBalance(merchant) - amountPoints).toFixed(4)),
				account_points: Number(Math.max(0, rawPendingBalance(merchant) - amountPoints).toFixed(4)),
				withdraw_pending_balance: Number(Math.max(0, rawPendingBalance(merchant) - amountPoints).toFixed(4)),
				withdrawn: Number((Number(merchant.withdrawn || 0) + settleAmt).toFixed(4)),
				update_time: now
			});
		} else {
			await merchantCollection.doc(merchant._id).update({
				pending_withdraw: Number(Math.max(0, Number(merchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
				withdrawn: Number((Number(merchant.withdrawn || 0) + settleAmt).toFixed(4)),
				update_time: now
			});
		}
	}
	if (machine) {
		if (wasRestored) {
			await machineCollection.doc(machine._id).update({
				withdrawn_amount: Number((Number(machine.withdrawn_amount || 0) + settleAmt).toFixed(4))
			});
		} else {
			await machineCollection.doc(machine._id).update({
				pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4)),
				withdrawn_amount: Number((Number(machine.withdrawn_amount || 0) + settleAmt).toFixed(4))
			});
		}
	}
	await writeTransferLog({
		scene: 'withdraw',
		stage: 'withdraw_arrival_settled',
		withdrawId: row._id,
		withdrawNo: safeText(row.withdraw_no, 64),
		merchantUserId,
		outBillNo: safeText(row.withdraw_no, 64),
		transferState: safeText(transferState || 'SUCCESS', 40),
		message: wasRestored
			? '提现到账：本地曾失效/退回，已扣回积分并改为已到账'
			: '提现到账：已同步本地到账状态及商户/机具账务',
		payload: {
			wxTradeNo: safeText(wxTradeNo || row.wx_trade_no || '', 80),
			settleAmt,
			amountPoints,
			wasRestored,
			arrivalAt,
			wxSuccessTime: wxArrival || null
		}
	});
	if (wasRestored) {
		await sendWecomRobotText(
			`提现竞态修复：单号 ${safeText(row.withdraw_no, 64)} 微信已成功但本地曾失效/退回，已扣回积分并记已到账`
		);
	}
	return { ok: true, wasRestored, arrivalAt };
}

/** 解析微信商家转账 success_time（优先用于本地到账时间） */
function parseWxTransferSuccessTs(q) {
	if (!q || typeof q !== 'object') return 0;
	const raw = q.success_time ?? q.successTime ?? q.transfer_time ?? q.transferTime ?? '';
	if (raw == null || raw === '') return 0;
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
	}
	const s = String(raw).trim();
	if (/^\d{10,13}$/.test(s)) {
		const n = Number(s);
		return n > 1e12 ? n : n * 1000;
	}
	const t = Date.parse(s);
	return Number.isFinite(t) ? t : 0;
}

async function withdrawSyncProcessing(data = {}) {
	const limit = Math.min(Math.max(Number(data?.limit || 20), 1), 100);
	const now = nowTs();
	try {
		const processingStates = ['PROCESSING', 'ACCEPTED', 'WAIT_USER_CONFIRM', 'UNKNOWN'];
		let success = 0;
		let failed = 0;
		let processing = 0;
		let reconciled = 0;

		// 已同意但微信终态失败：回待审核并通知
		const stuckFailRes = await withdrawCollection
			.where({
				is_deleted: false,
				audit_required: true,
				audit_status: 'approved',
				is_paid: false,
				arrival_status: db.command.nin(['received', 'returned', 'expired']),
				transfer_state: db.command.in(['FAIL', 'FAILED', 'CANCELLED', 'RETRYABLE_FAIL'])
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		for (const row of stuckFailRes.data || []) {
			const ok = await markWithdrawFailNeedsReaudit(
				row,
				row.transfer_state,
				row.transfer_error || row.transfer_state
			);
			if (ok) reconciled += 1;
		}

		// 含「无需审核」自动打款：此前只扫 audit_required=true，导致确认收款后 SUCCESS 拖到零点才补记
		const res = await withdrawCollection
			.where({
				is_deleted: false,
				is_paid: false,
				arrival_status: db.command.nin(['received', 'returned', 'expired']),
				transfer_state: db.command.in(processingStates)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		for (const row of rows) {
			const cfg = ensureWxWithdrawPayConfig();
			if (!cfg.ok) throw new Error(cfg.message);
			const wc = cfg.creds;
			const outBillNo = safeText(row.withdraw_no, 64);
			if (!outBillNo) continue;
			try {
				const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
				const state = normalizeTransferState(q?.state || q?.status || row.transfer_state || 'UNKNOWN');
				const billNo = safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80);
				await writeTransferLog({
					stage: 'auto_poll_query',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId: row.merchant_user_id,
					deviceId: row.device_id,
					outBillNo,
					transferState: state,
					message: '自动轮询微信提现状态',
					payload: q || {}
				});
				if (state === 'SUCCESS') {
					await settleWithdrawSuccess(row, billNo, state, {
						arrivalTime: parseWxTransferSuccessTs(q) || nowTs()
					});
					success += 1;
					continue;
				}
				if (isWithdrawTerminalFailState(state)) {
					if (row.audit_required) {
						await markWithdrawFailNeedsReaudit(
							row,
							state,
							safeText(q?.fail_reason || q?.message || state, 180)
						);
					} else if (safeText(row.arrival_status, 20) !== 'returned') {
						const restored = await restoreUnpaidWithdrawBalances(row);
						await withdrawCollection.doc(row._id).update({
							arrival_status: 'returned',
							transfer_state: state,
							transfer_error: safeText(q?.fail_reason || q?.message || `微信提现失败：${state}`, 180),
							wx_trade_no: billNo || row.wx_trade_no || '',
							update_time: nowTs()
						});
						await writeTransferLog({
							stage: 'auto_poll_auto_withdraw_fail_restore',
							level: 'warn',
							withdrawId: row._id,
							withdrawNo: row.withdraw_no,
							merchantUserId: row.merchant_user_id,
							outBillNo,
							transferState: state,
							message: '自动提现终态失败，已退回积分',
							payload: { restored: !!restored?.ok }
						});
					}
					if (billNo) {
						await withdrawCollection.doc(row._id).update({
							wx_trade_no: billNo,
							update_time: nowTs()
						});
					}
					failed += 1;
					continue;
				}
				const polledPkg = pickTransferPackageInfo(q);
				await withdrawCollection.doc(row._id).update({
					transfer_state: state || 'PROCESSING',
					wx_trade_no: billNo,
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
				processing += 1;
			} catch (e) {
				await writeTransferLog({
					stage: 'auto_poll_error',
					level: 'error',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId: row.merchant_user_id,
					deviceId: row.device_id,
					outBillNo,
					message: safeText(e?.message || '自动轮询失败', 180)
				});
			}
		}
		return { code: 0, message: 'ok', data: { total: rows.length, success, failed, processing, reconciled, at: now } };
	} catch (e) {
		console.error('withdrawSyncProcessing failed:', e);
		return { code: 500, message: safeText(e?.message || '自动轮询失败', 160) };
	}
}

/** 无微信单时，可直接失效并返还（无需撤销） */
const WITHDRAW_SAFE_AUTO_EXPIRE_STATES = [
	'',
	'PENDING_AUDIT',
	'RETRYABLE_FAIL',
	'FAIL',
	'FAILED',
	'CANCELLED',
	'UNKNOWN',
	'REJECTED',
	'EXPIRED'
];

/** 用户确认收款前，可调微信撤销接口的状态 */
const WITHDRAW_WX_CANCELABLE_STATES = ['ACCEPTED', 'PROCESSING', 'WAIT_USER_CONFIRM', 'CREATED'];

/**
 * 撤回未打款提现：返还积分与提现额度，扣回 pending_withdraw / 机具 pending_amount。
 * 与管理员「不同意提现」同一套返还口径（按 amount 全额积分返还）。
 */
async function restoreUnpaidWithdrawBalances(row) {
	const merchantUserId = safeText(row.merchant_user_id, 80);
	const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
	const amountPoints = Number(row.amount || 0);
	const now = nowTs();
	let merchant = null;
	if (merchantUserId) {
		const byUid = await merchantCollection.where({ user_id: merchantUserId }).limit(1).get();
		merchant = byUid.data && byUid.data[0];
		if (!merchant) {
			const byId = await merchantCollection.doc(merchantUserId).get();
			merchant = byId.data && byId.data[0];
		}
	}
	if (!merchant) return { ok: false, message: '商户不存在' };
	const machineRes = row.device_id
		? await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get()
		: { data: [] };
	const machine = machineRes.data && machineRes.data[0];
	await merchantCollection.doc(merchant._id).update({
		available_reward: Number((rawWithdrawQuotaBalance(merchant) + amountPoints).toFixed(4)),
		withdraw_quota_balance: Number((rawWithdrawQuotaBalance(merchant) + amountPoints).toFixed(4)),
		account_points: Number((rawPendingBalance(merchant) + amountPoints).toFixed(4)),
		withdraw_pending_balance: Number((rawPendingBalance(merchant) + amountPoints).toFixed(4)),
		pending_withdraw: Number(Math.max(0, Number(merchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
		update_time: now
	});
	if (machine) {
		await machineCollection.doc(machine._id).update({
			pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4))
		});
	}
	return { ok: true, amountPoints, settleAmt, merchantId: merchant._id };
}

/** 确认微信侧已撤销/失败后：先条件抢占「已失效」，再返还积分（避免与到账结算互相覆盖） */
async function finalizeWithdrawExpiredAndRestore(row, reason, extra = {}) {
	const id = String(row._id || '');
	if (!id) return { ok: false, message: '缺少记录ID' };
	const freshRes = await withdrawCollection.doc(id).get();
	const fresh = (freshRes.data && freshRes.data[0]) || row;
	const arrival = safeText(fresh.arrival_status, 20) || 'pending';
	if (arrival === 'received') {
		return { ok: false, skip: true, message: `已是终态:${arrival}` };
	}
	if (fresh.is_paid) return { ok: false, skip: true, message: '已打款不可失效返还' };

	// 已失效但未退回积分：只补返还（修复历史脏数据）
	if (arrival === 'expired' || arrival === 'returned') {
		if (fresh.balance_restored) {
			return {
				ok: true,
				skip: true,
				message: '已失效且已返还',
				amountPoints: Number(fresh.amount || 0),
				settleAmt: Number(fresh.payable != null ? fresh.payable : fresh.amount || 0),
				merchantId: ''
			};
		}
		const patched = await ensureExpiredBalanceRestored(fresh, { reason, wxState: extra.wxState || '' });
		if (!patched.ok) return { ok: false, message: patched.message || '补返还失败' };
		return {
			ok: true,
			amountPoints: patched.amountPoints,
			settleAmt: patched.settleAmt,
			merchantId: patched.merchantId,
			repaired: !!patched.restoredNow
		};
	}

	const auditPrev = safeText(fresh.audit_status, 24);
	const prevArrival = arrival;
	const prevTransferState = safeText(fresh.transfer_state, 40);
	const prevTransferError = safeText(fresh.transfer_error, 180);
	const _ = db.command;
	const claim = await withdrawCollection
		.where({
			_id: id,
			is_paid: _.neq(true),
			arrival_status: _.nin(['received', 'returned', 'expired'])
		})
		.update({
			arrival_status: 'expired',
			audit_status: auditPrev === 'pending' || auditPrev === 'approved' || !auditPrev ? 'rejected' : auditPrev,
			transfer_state: 'EXPIRED',
			transfer_error: safeText(reason, 180),
			balance_restored: false,
			update_time: nowTs(),
			...(extra.wxTradeNo ? { wx_trade_no: safeText(extra.wxTradeNo, 80) } : {})
		});
	if (!claim.updated) {
		return { ok: false, skip: true, message: '并发终态跳过(未抢占失效)' };
	}

	const restored = await restoreUnpaidWithdrawBalances(fresh);
	if (!restored.ok) {
		// 返还失败：回滚失效标记，避免「已失效但钱没退回」
		try {
			await withdrawCollection.doc(id).update({
				arrival_status: prevArrival || 'pending',
				transfer_state: prevTransferState || fresh.transfer_state || '',
				transfer_error: prevTransferError,
				balance_restored: false,
				update_time: nowTs()
			});
		} catch (eRoll) {}
		await writeTransferLog({
			stage: 'withdraw_auto_expire_restore_fail',
			level: 'error',
			withdrawId: id,
			withdrawNo: safeText(fresh.withdraw_no, 80),
			merchantUserId: safeText(fresh.merchant_user_id, 80),
			deviceId: fresh.device_id,
			outBillNo: fresh.withdraw_no,
			transferState: 'EXPIRED',
			message: restored.message || '返还失败',
			payload: { wxState: extra.wxState || '', rolledBack: true }
		});
		await sendWecomRobotText(
			`提现失效返还失败已回滚：单号 ${safeText(fresh.withdraw_no, 64)}，原因：${safeText(restored.message || '返还失败', 80)}`
		);
		return { ok: false, message: restored.message || '返还失败' };
	}
	await withdrawCollection.doc(id).update({
		balance_restored: true,
		balance_restore_time: nowTs(),
		wx_expire_response: safeJson(extra.payload || { wxState: extra.wxState || '' }, 4000),
		update_time: nowTs()
	});
	await writeTransferLog({
		stage: 'withdraw_auto_expire',
		withdrawId: id,
		withdrawNo: safeText(fresh.withdraw_no, 80),
		merchantUserId: safeText(fresh.merchant_user_id, 80),
		deviceId: fresh.device_id,
		outBillNo: fresh.withdraw_no,
		transferState: 'EXPIRED',
		message: safeText(reason, 180),
		payload: {
			withdrawId: id,
			amountPoints: restored.amountPoints,
			settleAmt: restored.settleAmt,
			merchantId: restored.merchantId,
			wxState: extra.wxState || '',
			balanceRestored: true,
			balanceRestoreTime: nowTs(),
			...(extra.payload || {})
		}
	});
	return {
		ok: true,
		amountPoints: restored.amountPoints,
		settleAmt: restored.settleAmt,
		merchantId: restored.merchantId
	};
}

/**
 * 已失效记录补退积分（幂等）：已有成功返还日志或 balance_restored=true 则不重复加积分。
 */
async function ensureExpiredBalanceRestored(row, extra = {}) {
	const id = String(row._id || '');
	if (!id) return { ok: false, message: '缺少记录ID' };
	if (row.balance_restored) {
		return { ok: true, skipped: true, reason: 'flag', amountPoints: Number(row.amount || 0), settleAmt: Number(row.payable != null ? row.payable : row.amount || 0) };
	}
	const logsRes = await transferLogCollection
		.where({
			is_deleted: db.command.neq(true),
			withdraw_no: safeText(row.withdraw_no, 80),
			stage: db.command.in(['withdraw_auto_expire', 'withdraw_expire_repair_restore'])
		})
		.orderBy('create_time', 'desc')
		.limit(10)
		.get();
	const okLogs = (logsRes.data || []).filter((x) => {
		const p = typeof x.payload === 'string' ? (() => { try { return JSON.parse(x.payload); } catch (e) { return {}; } })() : (x.payload || {});
		return Number(p.amountPoints || p.amount_points || 0) > 0 || p.balanceRestored === true || p.merchantId;
	});
	if (okLogs.length) {
		await withdrawCollection.doc(id).update({ balance_restored: true, update_time: nowTs() });
		return {
			ok: true,
			skipped: true,
			reason: 'log',
			amountPoints: Number(row.amount || 0),
			settleAmt: Number(row.payable != null ? row.payable : row.amount || 0)
		};
	}
	const restored = await restoreUnpaidWithdrawBalances(row);
	if (!restored.ok) return { ok: false, message: restored.message || '返还失败' };
	await withdrawCollection.doc(id).update({
		balance_restored: true,
		balance_restore_time: nowTs(),
		transfer_error: safeText(extra.reason || row.transfer_error || '系统补退已失效提现积分', 180),
		update_time: nowTs()
	});
	await writeTransferLog({
		stage: 'withdraw_expire_repair_restore',
		withdrawId: id,
		withdrawNo: safeText(row.withdraw_no, 80),
		merchantUserId: safeText(row.merchant_user_id, 80),
		deviceId: row.device_id,
		outBillNo: row.withdraw_no,
		transferState: safeText(row.transfer_state, 40) || 'EXPIRED',
		message: '补退已失效提现的积分/额度',
		payload: {
			amountPoints: restored.amountPoints,
			settleAmt: restored.settleAmt,
			merchantId: restored.merchantId,
			wxState: extra.wxState || '',
			balanceRestored: true,
			balanceRestoreTime: nowTs()
		}
	});
	return {
		ok: true,
		restoredNow: true,
		amountPoints: restored.amountPoints,
		settleAmt: restored.settleAmt,
		merchantId: restored.merchantId
	};
}

/**
 * 处理中单据：查微信 → 可撤销则撤销 → 仅当终态 CANCELLED/FAIL 后返还；SUCCESS 则按到账结算。
 */
async function cancelOrResolveWxWithdrawForExpire(row, reason) {
	const outBillNo = safeText(row.withdraw_no, 64);
	if (!outBillNo) return { action: 'error', message: '缺少提现单号' };
	const cfg = ensureWxWithdrawPayConfig();
	if (!cfg.ok) return { action: 'error', message: cfg.message };
	const wc = cfg.creds;
	let state = normalizeTransferState(row.transfer_state || '');
	let billNo = safeText(row.wx_trade_no || '', 80);
	let lastQuery = null;

	const applyLocalState = async (nextState, q) => {
		state = normalizeTransferState(nextState || state);
		billNo = safeText(q?.transfer_bill_no || billNo, 80);
		const polledPkg = pickTransferPackageInfo(q);
		await withdrawCollection.doc(row._id).update({
			transfer_state: state,
			...(billNo ? { wx_trade_no: billNo } : {}),
			...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
			update_time: nowTs()
		});
		row.transfer_state = state;
		if (billNo) row.wx_trade_no = billNo;
	};

	const queryOnce = async (stage) => {
		const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
		lastQuery = q;
		const st = normalizeTransferState(q?.state || q?.status || state || 'UNKNOWN');
		await writeTransferLog({
			stage,
			withdrawId: row._id,
			withdrawNo: row.withdraw_no,
			merchantUserId: row.merchant_user_id,
			deviceId: row.device_id,
			outBillNo,
			transferState: st,
			message: '自动失效前查询微信转账状态',
			payload: q || {}
		});
		await applyLocalState(st, q);
		return st;
	};

	try {
		state = await queryOnce('withdraw_expire_query');
	} catch (e) {
		const wxCode = safeText(e?.wxBody?.code || e?.code || '', 40);
		const msg = safeText(e?.message || '查单失败', 160);
		// 微信无此单：可安全本地失效返还（从未占用商户号资金或已不存在）
		if (wxCode === 'NOT_FOUND' || /NOT_FOUND/i.test(msg)) {
			const fin = await finalizeWithdrawExpiredAndRestore(row, reason, {
				wxTradeNo: billNo,
				wxState: 'NOT_FOUND',
				payload: e && e.name === 'WxPayRequestError' ? e.wxBody || {} : { error: msg }
			});
			if (fin.skip && !fin.ok) return { action: 'skip', message: fin.message, wxState: 'NOT_FOUND' };
			if (!fin.ok) return { action: 'error', message: fin.message, wxState: 'NOT_FOUND' };
			return {
				action: 'expired',
				wxState: 'NOT_FOUND',
				amountPoints: fin.amountPoints,
				settleAmt: fin.settleAmt,
				merchantId: fin.merchantId
			};
		}
		return {
			action: 'error',
			message: msg,
			wxState: state
		};
	}

	if (state === 'SUCCESS') {
		await settleWithdrawSuccess(row, billNo, state, {
			arrivalTime: parseWxTransferSuccessTs(lastQuery) || nowTs()
		});
		return { action: 'settled', wxState: state, billNo };
	}

	if (isWithdrawTerminalFailState(state) || state === 'CANCELLED') {
		const fin = await finalizeWithdrawExpiredAndRestore(row, reason, {
			wxTradeNo: billNo,
			wxState: state,
			payload: lastQuery || {}
		});
		if (fin.skip) return { action: 'skip', message: fin.message, wxState: state };
		if (!fin.ok) return { action: 'error', message: fin.message, wxState: state };
		return {
			action: 'expired',
			wxState: state,
			amountPoints: fin.amountPoints,
			settleAmt: fin.settleAmt,
			merchantId: fin.merchantId
		};
	}

	if (state === 'CANCELING') {
		// 已受理撤销：短轮询等待 CANCELLED
		for (let i = 0; i < 3; i += 1) {
			await sleepMs(1500);
			try {
				state = await queryOnce('withdraw_expire_cancel_poll');
			} catch (e) {
				break;
			}
			if (state === 'SUCCESS') {
				await settleWithdrawSuccess(row, billNo, state, {
					arrivalTime: parseWxTransferSuccessTs(lastQuery) || nowTs()
				});
				return { action: 'settled', wxState: state, billNo };
			}
			if (isWithdrawTerminalFailState(state) || state === 'CANCELLED') {
				const fin = await finalizeWithdrawExpiredAndRestore(row, reason, {
					wxTradeNo: billNo,
					wxState: state
				});
				if (fin.ok) {
					return {
						action: 'expired',
						wxState: state,
						amountPoints: fin.amountPoints,
						settleAmt: fin.settleAmt,
						merchantId: fin.merchantId
					};
				}
				if (fin.skip) return { action: 'skip', message: fin.message, wxState: state };
				return { action: 'error', message: fin.message, wxState: state };
			}
			if (state !== 'CANCELING' && !WITHDRAW_WX_CANCELABLE_STATES.includes(state)) break;
		}
		return { action: 'cancel_pending', wxState: state || 'CANCELING' };
	}

	if (!WITHDRAW_WX_CANCELABLE_STATES.includes(state)) {
		return { action: 'skip', message: `不可撤销状态:${state}`, wxState: state };
	}

	try {
		const cancelRes = await wxPayCancelMerchantTransfer(wc, outBillNo);
		const cancelState = normalizeTransferState(cancelRes?.state || 'CANCELING');
		await writeTransferLog({
			stage: 'withdraw_expire_cancel',
			withdrawId: row._id,
			withdrawNo: row.withdraw_no,
			merchantUserId: row.merchant_user_id,
			deviceId: row.device_id,
			outBillNo,
			transferState: cancelState,
			message: '自动失效：已请求微信撤销转账',
			payload: cancelRes || {}
		});
		await applyLocalState(cancelState || 'CANCELING', cancelRes);
	} catch (e) {
		const msg = safeText(e?.message || '撤销失败', 160);
		await writeTransferLog({
			stage: 'withdraw_expire_cancel_error',
			level: 'error',
			withdrawId: row._id,
			withdrawNo: row.withdraw_no,
			merchantUserId: row.merchant_user_id,
			deviceId: row.device_id,
			outBillNo,
			message: msg,
			payload: e && e.name === 'WxPayRequestError' ? e.wxBody || {} : {}
		});
		// 撤销失败时再查一次，可能已终态
		try {
			state = await queryOnce('withdraw_expire_query_after_cancel_fail');
			if (state === 'SUCCESS') {
				await settleWithdrawSuccess(row, billNo, state, {
					arrivalTime: parseWxTransferSuccessTs(lastQuery) || nowTs()
				});
				return { action: 'settled', wxState: state, billNo };
			}
			if (isWithdrawTerminalFailState(state) || state === 'CANCELLED') {
				const fin = await finalizeWithdrawExpiredAndRestore(row, reason, {
					wxTradeNo: billNo,
					wxState: state
				});
				if (fin.ok) {
					return {
						action: 'expired',
						wxState: state,
						amountPoints: fin.amountPoints,
						settleAmt: fin.settleAmt,
						merchantId: fin.merchantId
					};
				}
			}
		} catch (e2) {}
		return { action: 'error', message: msg, wxState: state };
	}

	for (let i = 0; i < 4; i += 1) {
		await sleepMs(1500);
		try {
			state = await queryOnce('withdraw_expire_cancel_poll');
		} catch (e) {
			return { action: 'cancel_pending', wxState: 'CANCELING', message: safeText(e?.message || '', 120) };
		}
		if (state === 'SUCCESS') {
			await settleWithdrawSuccess(row, billNo, state, {
				arrivalTime: parseWxTransferSuccessTs(lastQuery) || nowTs()
			});
			return { action: 'settled', wxState: state, billNo };
		}
		if (isWithdrawTerminalFailState(state) || state === 'CANCELLED') {
			const fin = await finalizeWithdrawExpiredAndRestore(row, reason, {
				wxTradeNo: billNo,
				wxState: state
			});
			if (fin.ok) {
				return {
					action: 'expired',
					wxState: state,
					amountPoints: fin.amountPoints,
					settleAmt: fin.settleAmt,
					merchantId: fin.merchantId
				};
			}
			if (fin.skip) return { action: 'skip', message: fin.message, wxState: state };
			return { action: 'error', message: fin.message, wxState: state };
		}
		if (state !== 'CANCELING' && !WITHDRAW_WX_CANCELABLE_STATES.includes(state)) {
			return { action: 'cancel_pending', wxState: state };
		}
	}
	return { action: 'cancel_pending', wxState: state || 'CANCELING' };
}

/**
 * 每天零点（北京时间）由定时任务调用：
 * 1）无微信处理中的未打款：直接已失效并返还积分
 * 2）微信处理中：先撤销 → 查单确认 CANCELLED/FAIL 后再返还；若已 SUCCESS 则按到账结算
 * 3）待审核（audit_status=pending / PENDING_AUDIT）不失效，保持待审核
 */
async function withdrawAutoExpireUnpaid(data = {}) {
	try {
		const _ = db.command;
		const limit = Math.min(200, Math.max(1, parseInt(String(data?.limit || 100), 10) || 100));
		const reason = safeText(data?.reason || '系统每天 00:00 自动撤回未打款提现', 180);
		const res = await withdrawCollection
			.where(
				_.and([
					{ is_deleted: _.neq(true) },
					{ is_paid: false },
					{ arrival_status: _.nin(['received', 'returned', 'expired']) },
					// 待审核不参与零点失效
					{ audit_status: _.neq('pending') },
					{ transfer_state: _.neq('PENDING_AUDIT') }
				])
			)
			.orderBy('create_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		let expired = 0;
		let skipped = 0;
		let failed = 0;
		let cancelRequested = 0;
		let cancelPending = 0;
		let settled = 0;
		const errors = [];
		const skipReasons = {};
		const expiredSamples = [];
		const bumpSkip = (why) => {
			skipped += 1;
			const k = String(why || 'other');
			skipReasons[k] = (skipReasons[k] || 0) + 1;
		};

		for (const row of rows) {
			const id = String(row._id || '');
			const arrival = safeText(row.arrival_status, 20) || 'pending';
			if (arrival === 'received' || arrival === 'returned' || arrival === 'expired') {
				bumpSkip(`arrival:${arrival}`);
				continue;
			}
			// 双保险：待审核 / 待重新审核一律跳过
			if (safeText(row.audit_status, 24) === 'pending') {
				bumpSkip('audit:pending');
				continue;
			}
			let stateNow = normalizeTransferState(row.transfer_state || '');
			if (stateNow === 'PENDING_AUDIT') {
				bumpSkip('transfer:PENDING_AUDIT');
				continue;
			}
			if (safeText(row.audit_status, 24) === 'rejected' && arrival !== 'pending') {
				bumpSkip('audit:rejected');
				continue;
			}

			// 凡有平台单号且可能已发微信：先查微信/撤销，禁止直接失效导致商户号资金未退回
			const needsWxCancelFlow =
				!!safeText(row.withdraw_no, 64) ||
				WITHDRAW_WX_CANCELABLE_STATES.includes(stateNow) ||
				stateNow === 'CANCELING' ||
				(stateNow === 'UNKNOWN' && !!safeText(row.wx_trade_no, 80)) ||
				(stateNow === 'UNKNOWN' && !!row.audit_required && safeText(row.audit_status, 24) === 'approved');

			try {
				if (needsWxCancelFlow) {
					const r = await cancelOrResolveWxWithdrawForExpire(row, reason);
					if (r.action === 'expired') {
						expired += 1;
						if (expiredSamples.length < 10) {
							expiredSamples.push({
								id,
								withdrawNo: safeText(row.withdraw_no, 80),
								merchantUserId: safeText(row.merchant_user_id, 80),
								amountPoints: r.amountPoints,
								settleAmt: r.settleAmt,
								via: 'wx_cancel'
							});
						}
						continue;
					}
					if (r.action === 'settled') {
						settled += 1;
						continue;
					}
					if (r.action === 'cancel_pending') {
						cancelPending += 1;
						cancelRequested += 1;
						continue;
					}
					if (r.action === 'skip') {
						bumpSkip(r.message || `wx:${r.wxState || stateNow}`);
						continue;
					}
					failed += 1;
					errors.push({ id, message: r.message || '微信撤销处理失败', wxState: r.wxState || '' });
					continue;
				}

				if (!WITHDRAW_SAFE_AUTO_EXPIRE_STATES.includes(stateNow) && stateNow !== 'UNKNOWN') {
					bumpSkip(`transfer:${stateNow || 'EMPTY'}`);
					continue;
				}

				const fin = await finalizeWithdrawExpiredAndRestore(row, reason, { wxState: stateNow });
				if (fin.skip) {
					bumpSkip(fin.message || 'skip');
					continue;
				}
				if (!fin.ok) {
					failed += 1;
					errors.push({ id, message: fin.message || '返还失败' });
					continue;
				}
				expired += 1;
				if (expiredSamples.length < 10) {
					expiredSamples.push({
						id,
						withdrawNo: safeText(row.withdraw_no, 80),
						merchantUserId: safeText(row.merchant_user_id, 80),
						amountPoints: fin.amountPoints,
						settleAmt: fin.settleAmt,
						via: 'direct'
					});
				}
			} catch (e) {
				failed += 1;
				errors.push({ id, message: safeText(e?.message || '失效失败', 160) });
			}
		}

		return {
			code: 0,
			message: 'ok',
			data: {
				scanned: rows.length,
				expired,
				skipped,
				failed,
				cancelRequested,
				cancelPending,
				settled,
				skipReasons,
				expiredSamples,
				errors: errors.slice(0, 20),
				hasMore: rows.length >= limit
			}
		};
	} catch (e) {
		console.error('withdrawAutoExpireUnpaid failed:', e);
		return { code: 500, message: safeText(e?.message || '自动失效失败', 160) };
	}
}

/**
 * 排查单笔提现：微信是否到账，还是已退回商户积分。
 * 浏览器：uniCloud.callFunction({ name:'merchant', data:{ action:'withdrawDiagnose', params:{ withdrawNo:'平台单号' }}})
 */
async function withdrawDiagnose(data = {}) {
	try {
		const withdrawNo = safeText(data?.withdrawNo || data?.outBillNo || '', 64);
		const id = safeText(data?.id || data?.withdrawId || '', 80);
		if (!withdrawNo && !id) return { code: 400, message: '请传 withdrawNo 或 id' };
		let row = null;
		if (id) {
			const r = await withdrawCollection.doc(id).get();
			row = r.data && r.data[0];
		}
		if (!row && withdrawNo) {
			const r = await withdrawCollection.where({ withdraw_no: withdrawNo, is_deleted: db.command.neq(true) }).limit(1).get();
			row = r.data && r.data[0];
		}
		if (!row) return { code: 404, message: '提现记录不存在' };

		const logsRes = await transferLogCollection
			.where({
				is_deleted: db.command.neq(true),
				withdraw_no: safeText(row.withdraw_no, 80)
			})
			.orderBy('create_time', 'desc')
			.limit(30)
			.get();
		const logs = (logsRes.data || []).map((x) => ({
			stage: x.stage,
			transferState: x.transfer_state,
			message: x.message,
			createTime: formatTime(x.create_time),
			payload: x.payload
		}));

		const arrival = safeText(row.arrival_status, 20) || 'pending';
		const transferState = normalizeTransferState(row.transfer_state || '');
		const hasExpireLog = logs.some((x) => x.stage === 'withdraw_auto_expire');
		const hasSettledLog = logs.some((x) => x.stage === 'withdraw_arrival_settled');
		const inconsistent =
			(row.is_paid && arrival === 'expired') ||
			(row.is_paid && arrival === 'returned') ||
			(!row.is_paid && arrival === 'received') ||
			(hasExpireLog && hasSettledLog);

		let verdict = 'pending';
		let verdictText = '处理中/未终态';
		if (arrival === 'received' && row.is_paid) {
			verdict = 'paid_to_wechat';
			verdictText = '已到微信零钱（本地已到账）；积分未退回商户';
		} else if (arrival === 'expired') {
			if (row.balance_restored || hasExpireLog) {
				verdict = 'restored_to_merchant';
				verdictText = '已失效：本地记录显示积分应已退回商户；请再核对微信商户号资金是否已因撤销退回';
			} else {
				verdict = 'expired_without_restore';
				verdictText = '已失效但可能未退回积分（无 balance_restored / 无成功返还日志），请执行 withdrawRepairExpired';
			}
		} else if (arrival === 'returned') {
			verdict = 'returned_to_merchant';
			verdictText = '已退回：积分/额度已退回商户账户';
		} else if (inconsistent) {
			verdict = 'inconsistent';
			verdictText = '本地状态矛盾，请结合转账日志与微信查单人工核对';
		}

		// 可选：实时查微信
		let wxQuery = null;
		let wxState = '';
		if (data?.queryWx !== false && safeText(row.withdraw_no, 64)) {
			try {
				const cfg = ensureWxWithdrawPayConfig();
				if (cfg.ok) {
					wxQuery = await wxPayQueryMerchantTransfer(cfg.creds, safeText(row.withdraw_no, 64));
					wxState = normalizeTransferState(wxQuery?.state || wxQuery?.status || '');
				}
			} catch (e) {
				wxQuery = { error: safeText(e?.message || '查单失败', 160) };
			}
		}
		if (wxState === 'SUCCESS') {
			verdict = 'paid_to_wechat';
			verdictText =
				arrival === 'received'
					? '微信 SUCCESS 且本地已到账：钱已到用户微信'
					: `微信 SUCCESS 但本地为 ${arrival || 'pending'}：钱很可能已到微信，本地需对账修复`;
		} else if (
			['WAIT_USER_CONFIRM', 'ACCEPTED', 'PROCESSING', 'CANCELING', 'CREATED'].includes(wxState) &&
			(arrival === 'expired' || arrival === 'returned')
		) {
			verdict = 'wx_still_holding';
			verdictText = `本地已失效但微信仍为 ${wxState}：商户号资金可能仍被占用，请执行 withdrawRepairExpired 撤销并补退积分`;
		} else if (wxState === 'CANCELLED' || wxState === 'FAIL' || wxState === 'FAILED') {
			if (arrival === 'expired' || arrival === 'returned') {
				if (!row.balance_restored && !hasExpireLog) {
					verdict = 'expired_without_restore';
					verdictText = `微信已 ${wxState}，但本地可能未退积分，请执行 withdrawRepairExpired`;
				} else {
					verdict = arrival === 'expired' ? 'restored_to_merchant' : 'returned_to_merchant';
					verdictText = `微信 ${wxState} 且本地已${arrivalStatusText(arrival)}：钱应已退回商户号，积分应已退回商户`;
				}
			}
		}

		return {
			code: 0,
			message: 'ok',
			data: {
				verdict,
				verdictText,
				inconsistent,
				row: {
					id: row._id,
					withdrawNo: row.withdraw_no,
					isPaid: !!row.is_paid,
					isPaidText: row.is_paid
						? '已打款'
						: arrival === 'expired'
							? '已失效'
							: arrival === 'returned'
								? '已退回'
								: '未打款',
					arrivalStatus: arrival,
					arrivalStatusText: arrivalStatusText(arrival),
					arrivalTime: formatTime(row.arrival_time),
					payTime: formatTime(row.pay_time),
					transferState,
					transferError: safeText(row.transfer_error || '', 200),
					wxTradeNo: safeText(row.wx_trade_no || '', 80),
					amount: Number(row.amount || 0),
					payable: Number(row.payable || 0),
					merchantUserId: safeText(row.merchant_user_id, 80),
					balanceRestored: !!row.balance_restored,
					createTime: formatTime(row.create_time)
				},
				wxState,
				wxQuery,
				logs,
				howToRead: {
					deviceOrderCol: '支付状态 = isPaidText（已打款/已失效/未打款）',
					withdrawCols: '是否打款=isPaidText；是否到账=arrivalStatusText',
					repair: '已失效但资金未回：withdrawRepairExpired({ withdrawNo })'
				}
			}
		};
	} catch (e) {
		console.error('withdrawDiagnose failed:', e);
		return { code: 500, message: safeText(e?.message || '诊断失败', 160) };
	}
}

/**
 * 修复「已失效但微信未撤销 / 积分未退回」的脏数据。
 * 例：uniCloud.callFunction({ name:'merchant', data:{ action:'withdrawRepairExpired', params:{ withdrawNo:'H51784540446700rjS5DBVe' }}})
 */
async function withdrawRepairExpired(data = {}) {
	try {
		const withdrawNo = safeText(data?.withdrawNo || data?.outBillNo || '', 64);
		const id = safeText(data?.id || data?.withdrawId || '', 80);
		if (!withdrawNo && !id) return { code: 400, message: '请传 withdrawNo 或 id' };
		let row = null;
		if (id) {
			const r = await withdrawCollection.doc(id).get();
			row = r.data && r.data[0];
		}
		if (!row && withdrawNo) {
			const r = await withdrawCollection
				.where({ withdraw_no: withdrawNo, is_deleted: db.command.neq(true) })
				.limit(1)
				.get();
			row = r.data && r.data[0];
		}
		if (!row) return { code: 404, message: '提现记录不存在' };
		const reason = safeText(data?.reason || '修复：已失效单撤销微信占用并补退积分', 180);
		const result = await repairOneExpiredWithdraw(row, reason);
		if (result.code != null) return result;
		return { code: 0, message: result.message || 'ok', data: result };
	} catch (e) {
		console.error('withdrawRepairExpired failed:', e);
		return { code: 500, message: safeText(e?.message || '修复失败', 160) };
	}
}

/**
 * 批量修复所有「已失效」提现：查微信撤销占用 + 幂等补退积分。
 * 浏览器控制台可循环执行直到 hasMore=false：
 * uniCloud.callFunction({ name:'merchant', data:{ action:'withdrawRepairExpiredBatch', params:{ limit:20 }}})
 */
async function withdrawRepairExpiredBatch(data = {}) {
	try {
		const limit = Math.min(50, Math.max(1, parseInt(String(data?.limit || 20), 10) || 20));
		// onlyUnrestored=true 时只扫未标记 balance_restored 的；默认扫全部已失效（含需撤销微信占用）
		const onlyUnrestored = data?.onlyUnrestored === true || data?.onlyNeedRestore === true;
		const reason = safeText(data?.reason || '批量修复：已失效单撤销微信占用并补退积分', 180);
		const _ = db.command;
		const whereObj = {
			is_deleted: _.neq(true),
			is_paid: _.neq(true),
			arrival_status: 'expired'
		};
		if (onlyUnrestored) {
			whereObj.balance_restored = _.neq(true);
		}
		const res = await withdrawCollection
			.where(whereObj)
			.orderBy('create_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		const summary = {
			scanned: rows.length,
			restored: 0,
			alreadyRestored: 0,
			expired: 0,
			settled: 0,
			cancelPending: 0,
			skipped: 0,
			failed: 0,
			amountPointsRestored: 0,
			samples: [],
			errors: []
		};
		for (const row of rows) {
			const withdrawNo = safeText(row.withdraw_no, 80);
			try {
				const r = await repairOneExpiredWithdraw(row, reason);
				const action = r.action || '';
				if (action === 'restored') {
					summary.restored += 1;
					summary.amountPointsRestored += Number(r.amountPoints || 0);
				} else if (action === 'already_restored') {
					summary.alreadyRestored += 1;
				} else if (action === 'expired') {
					summary.expired += 1;
					summary.amountPointsRestored += Number(r.amountPoints || 0);
				} else if (action === 'settled') {
					summary.settled += 1;
				} else if (action === 'cancel_pending') {
					summary.cancelPending += 1;
				} else if (action === 'need_manual' || action === 'skip') {
					summary.skipped += 1;
				} else if (r.ok === false || (r.code && r.code !== 0)) {
					summary.failed += 1;
					summary.errors.push({ withdrawNo, message: r.message || '失败' });
				} else {
					summary.skipped += 1;
				}
				if (summary.samples.length < 30) {
					summary.samples.push({
						withdrawNo,
						merchantUserId: safeText(row.merchant_user_id, 80),
						amount: Number(row.amount || 0),
						action: action || r.message || '',
						wxState: r.wxState || '',
						amountPoints: r.amountPoints
					});
				}
			} catch (e) {
				summary.failed += 1;
				summary.errors.push({ withdrawNo, message: safeText(e?.message || '异常', 120) });
			}
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				...summary,
				hasMore: rows.length >= limit,
				hint: rows.length >= limit
					? '还有未处理完，请用相同命令再执行一次'
					: '本批已扫完；若 cancelPending>0，等几分钟后再跑一轮'
			}
		};
	} catch (e) {
		console.error('withdrawRepairExpiredBatch failed:', e);
		return { code: 500, message: safeText(e?.message || '批量修复失败', 160) };
	}
}

/**
 * 复核本地「未打款/未到账」但微信已 SUCCESS 的提现，立即同步为已打款已到账。
 * 自动扫描仅处理「最近 30 天」创建的未到账单（微信超期单无法查单）。
 *
 * 控制台指定单号（仍会查微信）：
 * uniCloud.callFunction({ name:'merchant', data:{ action:'withdrawReconcileArrivalFromWx', params:{
 *   withdrawNos:['H5178...']
 * }}})
 *
 * 超期无法查单、确认已到账时强制落库：
 * action: withdrawForceMarkReceived
 */
async function withdrawReconcileArrivalFromWx(data = {}) {
	try {
		const _ = db.command;
		const limit = Math.min(50, Math.max(1, parseInt(String(data?.limit || 30), 10) || 30));
		const days = Math.min(90, Math.max(1, parseInt(String(data?.withinDays || 30), 10) || 30));
		const sinceTs = nowTs() - days * 24 * 60 * 60 * 1000;
		let nos = [];
		if (Array.isArray(data?.withdrawNos)) {
			nos = data.withdrawNos.map((x) => safeText(x, 64)).filter(Boolean);
		} else if (typeof data?.withdrawNos === 'string' && data.withdrawNos.trim()) {
			nos = data.withdrawNos
				.split(/[,，\s]+/)
				.map((x) => safeText(x, 64))
				.filter(Boolean);
		} else if (data?.withdrawNo) {
			nos = [safeText(data.withdrawNo, 64)].filter(Boolean);
		}

		let rows = [];
		if (nos.length) {
			const res = await withdrawCollection
				.where({
					is_deleted: _.neq(true),
					withdraw_no: _.in(nos.slice(0, 50))
				})
				.limit(Math.min(50, nos.length))
				.get();
			rows = res.data || [];
		} else {
			// 扫描：仅最近 N 天内、本地未打款且未终态退回/失效
			const res = await withdrawCollection
				.where(
					_.and([
						{ is_deleted: _.neq(true) },
						{ is_paid: _.neq(true) },
						{ arrival_status: _.nin(['received', 'returned', 'expired']) },
						{ withdraw_no: _.exists(true) },
						{ withdraw_no: _.neq('') },
						{ create_time: _.gte(sinceTs) }
					])
				)
				.orderBy('create_time', 'asc')
				.limit(limit)
				.get();
			rows = res.data || [];
		}

		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };

		const summary = {
			scanned: rows.length,
			settled: 0,
			alreadyOk: 0,
			stillPending: 0,
			failedTerminal: 0,
			notFound: 0,
			errors: [],
			samples: []
		};

		if (nos.length) {
			const foundSet = new Set(rows.map((r) => safeText(r.withdraw_no, 64)));
			for (const n of nos) {
				if (!foundSet.has(n)) {
					summary.notFound += 1;
					summary.errors.push({ withdrawNo: n, message: '本地无此提现单' });
				}
			}
		}

		for (const row of rows) {
			const withdrawNo = safeText(row.withdraw_no, 64);
			const arrival = safeText(row.arrival_status, 20) || 'pending';
			try {
				if (row.is_paid && arrival === 'received') {
					summary.alreadyOk += 1;
					if (summary.samples.length < 40) {
						summary.samples.push({ withdrawNo, action: 'already_ok', wxState: 'SUCCESS' });
					}
					continue;
				}
				if (!withdrawNo) {
					summary.errors.push({ withdrawNo: '', id: row._id, message: '缺少提现单号' });
					continue;
				}

				let q = null;
				let state = '';
				try {
					q = await wxPayQueryMerchantTransfer(cfg.creds, withdrawNo);
					state = normalizeTransferState(q?.state || q?.status || '');
				} catch (e) {
					const wxCode = safeText(e?.wxBody?.code || e?.code || '', 40);
					const msg = safeText(e?.message || '查单失败', 160);
					if (wxCode === 'NOT_FOUND' || /NOT_FOUND/i.test(msg)) {
						summary.notFound += 1;
						summary.errors.push({ withdrawNo, message: `微信无单:${msg}` });
						if (summary.samples.length < 40) {
							summary.samples.push({ withdrawNo, action: 'wx_not_found', message: msg });
						}
						continue;
					}
					summary.errors.push({ withdrawNo, message: msg });
					if (summary.samples.length < 40) {
						summary.samples.push({ withdrawNo, action: 'query_error', message: msg });
					}
					continue;
				}

				const billNo = safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80);
				await writeTransferLog({
					stage: 'withdraw_reconcile_query',
					withdrawId: row._id,
					withdrawNo,
					merchantUserId: row.merchant_user_id,
					deviceId: row.device_id,
					outBillNo: withdrawNo,
					transferState: state,
					message: '到账复核：查询微信转账状态',
					payload: q || {}
				});

				if (state === 'SUCCESS') {
					await settleWithdrawSuccess(row, billNo, state, {
						arrivalTime: parseWxTransferSuccessTs(q) || nowTs()
					});
					summary.settled += 1;
					if (summary.samples.length < 40) {
						summary.samples.push({
							withdrawNo,
							action: 'settled',
							wxState: state,
							payable: Number(row.payable || 0),
							arrivalTime: formatTime(parseWxTransferSuccessTs(q) || nowTs())
						});
					}
					continue;
				}

				if (isWithdrawTerminalFailState(state) || state === 'CANCELLED') {
					summary.failedTerminal += 1;
					await withdrawCollection.doc(row._id).update({
						transfer_state: state,
						wx_trade_no: billNo || row.wx_trade_no || '',
						transfer_error: safeText(q?.fail_reason || q?.message || state, 180),
						update_time: nowTs()
					});
					if (summary.samples.length < 40) {
						summary.samples.push({
							withdrawNo,
							action: 'terminal_fail',
							wxState: state,
							failReason: safeText(q?.fail_reason || '', 80)
						});
					}
					continue;
				}

				// 仍处理中：只刷新本地微信状态
				const polledPkg = pickTransferPackageInfo(q);
				await withdrawCollection.doc(row._id).update({
					transfer_state: state || row.transfer_state || 'PROCESSING',
					wx_trade_no: billNo || row.wx_trade_no || '',
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
				summary.stillPending += 1;
				if (summary.samples.length < 40) {
					summary.samples.push({ withdrawNo, action: 'still_pending', wxState: state });
				}
			} catch (e) {
				summary.errors.push({ withdrawNo, message: safeText(e?.message || '复核异常', 120) });
			}
		}

		return {
			code: 0,
			message: 'ok',
			data: {
				...summary,
				withinDays: nos.length ? null : days,
				sinceTime: nos.length ? null : formatTime(sinceTs),
				hasMore: !nos.length && rows.length >= limit,
				hint: nos.length
					? `指定 ${nos.length} 单：已同步 SUCCESS→已到账 ${summary.settled} 笔`
					: summary.hasMore
						? `还有未扫完（仅最近 ${days} 天），请再执行或等定时任务`
						: `本批扫描完成（仅最近 ${days} 天）`
			}
		};
	} catch (e) {
		console.error('withdrawReconcileArrivalFromWx failed:', e);
		return { code: 500, message: safeText(e?.message || '到账复核失败', 160) };
	}
}

/**
 * 超期无法查微信、但确认钱已到用户零钱：直接落库已打款+已到账（走 settle 账务）。
 * uniCloud.callFunction({ name:'merchant', data:{ action:'withdrawForceMarkReceived', params:{
 *   withdrawNos:['H5178...'], reason:'超期无法查单，人工确认已到账'
 * }}})
 */
async function withdrawForceMarkReceived(data = {}) {
	try {
		const _ = db.command;
		let nos = [];
		if (Array.isArray(data?.withdrawNos)) {
			nos = data.withdrawNos.map((x) => safeText(x, 64)).filter(Boolean);
		} else if (typeof data?.withdrawNos === 'string' && data.withdrawNos.trim()) {
			nos = data.withdrawNos
				.split(/[,，\s]+/)
				.map((x) => safeText(x, 64))
				.filter(Boolean);
		} else if (data?.withdrawNo) {
			nos = [safeText(data.withdrawNo, 64)].filter(Boolean);
		}
		if (!nos.length) return { code: 400, message: '请传 withdrawNos' };
		const reason = safeText(data?.reason || '超期无法查微信，人工确认已到账并强制落库', 180);

		const res = await withdrawCollection
			.where({
				is_deleted: _.neq(true),
				withdraw_no: _.in(nos.slice(0, 50))
			})
			.limit(Math.min(50, nos.length))
			.get();
		const rows = res.data || [];
		const found = new Set(rows.map((r) => safeText(r.withdraw_no, 64)));
		const summary = {
			requested: nos.length,
			settled: 0,
			alreadyOk: 0,
			notFound: 0,
			skipped: 0,
			errors: [],
			samples: []
		};
		for (const n of nos) {
			if (!found.has(n)) {
				summary.notFound += 1;
				summary.errors.push({ withdrawNo: n, message: '本地无此提现单' });
			}
		}

		for (const row of rows) {
			const withdrawNo = safeText(row.withdraw_no, 64);
			const arrival = safeText(row.arrival_status, 20) || 'pending';
			try {
				if (row.is_paid && arrival === 'received') {
					summary.alreadyOk += 1;
					summary.samples.push({ withdrawNo, action: 'already_ok' });
					continue;
				}
				if (arrival === 'expired' || arrival === 'returned') {
					// 已失效/退回但仍确认微信到账：走 settle（含 clawback）
				}
				const arrivalAt =
					Number(row.arrival_time || 0) ||
					Number(row.pay_time || 0) ||
					Number(row.update_time || 0) ||
					Number(row.create_time || 0) ||
					nowTs();
				const ret = await settleWithdrawSuccess(
					row,
					safeText(row.wx_trade_no || '', 80),
					'SUCCESS',
					{ arrivalTime: arrivalAt }
				);
				if (ret && ret.ok === false && ret.reason === 'already_received') {
					summary.alreadyOk += 1;
					summary.samples.push({ withdrawNo, action: 'already_ok' });
					continue;
				}
				if (ret && ret.ok === false && ret.reason === 'claim_failed') {
					summary.skipped += 1;
					summary.errors.push({ withdrawNo, message: '并发抢占失败，请重试' });
					continue;
				}
				await withdrawCollection.doc(row._id).update({
					transfer_state: 'SUCCESS',
					transfer_error: reason,
					update_time: nowTs()
				});
				await writeTransferLog({
					stage: 'withdraw_force_mark_received',
					withdrawId: row._id,
					withdrawNo,
					merchantUserId: row.merchant_user_id,
					deviceId: row.device_id,
					outBillNo: withdrawNo,
					transferState: 'SUCCESS',
					message: reason,
					payload: {
						payable: Number(row.payable || 0),
						amount: Number(row.amount || 0),
						arrivalAt,
						force: true
					}
				});
				summary.settled += 1;
				summary.samples.push({
					withdrawNo,
					action: 'force_settled',
					payable: Number(row.payable || 0),
					arrivalTime: formatTime(arrivalAt)
				});
			} catch (e) {
				summary.errors.push({ withdrawNo, message: safeText(e?.message || '强制落库失败', 120) });
			}
		}

		return { code: 0, message: 'ok', data: summary };
	} catch (e) {
		console.error('withdrawForceMarkReceived failed:', e);
		return { code: 500, message: safeText(e?.message || '强制落库失败', 160) };
	}
}

/**
 * 提现列表「失败原因-详情」：回款时间 + 微信原始应答（记录字段或转账日志回填）
 */
async function withdrawFailDetail(data = {}) {
	try {
		const withdrawNo = safeText(data?.withdrawNo || data?.outBillNo || '', 64);
		const id = safeText(data?.id || data?.withdrawId || '', 80);
		if (!withdrawNo && !id) return { code: 400, message: '请传 withdrawNo 或 id' };
		let row = null;
		if (id) {
			const r = await withdrawCollection.doc(id).get();
			row = r.data && r.data[0];
		}
		if (!row && withdrawNo) {
			const r = await withdrawCollection
				.where({ withdraw_no: withdrawNo, is_deleted: db.command.neq(true) })
				.limit(1)
				.get();
			row = r.data && r.data[0];
		}
		if (!row) return { code: 404, message: '提现记录不存在' };

		const parsePayload = (raw) => {
			if (raw == null || raw === '') return null;
			if (typeof raw === 'object') return raw;
			if (typeof raw === 'string') {
				try {
					return JSON.parse(raw);
				} catch (e) {
					return { raw: safeText(raw, 2000) };
				}
			}
			return null;
		};
		const pretty = (obj) => {
			if (obj == null) return '';
			if (typeof obj === 'string') return obj;
			try {
				return JSON.stringify(obj, null, 2);
			} catch (e) {
				return String(obj);
			}
		};

		let restoreTimeTs = Number(row.balance_restore_time || 0) || 0;
		let wxRaw = parsePayload(row.wx_expire_response);
		let wxState = safeText(row.transfer_state, 40);
		let source = 'record';

		const logsRes = await transferLogCollection
			.where({
				is_deleted: db.command.neq(true),
				withdraw_no: safeText(row.withdraw_no, 80)
			})
			.orderBy('create_time', 'desc')
			.limit(40)
			.get();
		const logs = logsRes.data || [];

		if (!restoreTimeTs) {
			const restoreLog = logs.find((x) =>
				['withdraw_auto_expire', 'withdraw_expire_repair_restore'].includes(String(x.stage || ''))
			);
			if (restoreLog) {
				restoreTimeTs = Number(restoreLog.create_time || 0) || 0;
				const p = parsePayload(restoreLog.payload);
				if (p && Number(p.balanceRestoreTime || 0) > 0) restoreTimeTs = Number(p.balanceRestoreTime);
				source = 'transfer_log';
			}
		}

		if (!wxRaw || (typeof wxRaw === 'object' && !Object.keys(wxRaw).length)) {
			const preferStages = [
				'withdraw_expire_cancel',
				'withdraw_expire_query',
				'withdraw_expire_cancel_poll',
				'withdraw_expire_query_after_cancel_fail',
				'withdraw_auto_expire',
				'auto_poll_query',
				'h5_confirm_after_poll'
			];
			for (const st of preferStages) {
				const hit = logs.find((x) => String(x.stage || '') === st);
				if (!hit) continue;
				const p = parsePayload(hit.payload);
				if (p && typeof p === 'object' && Object.keys(p).length) {
					wxRaw = p;
					if (!wxState) wxState = safeText(hit.transfer_state, 40);
					source = `transfer_log:${st}`;
					break;
				}
			}
		}

		// 仍无原始应答时，实时查一次微信（只读）
		let liveWx = null;
		if ((!wxRaw || !Object.keys(wxRaw || {}).length) && data?.queryWx !== false && safeText(row.withdraw_no, 64)) {
			try {
				const cfg = ensureWxWithdrawPayConfig();
				if (cfg.ok) {
					liveWx = await wxPayQueryMerchantTransfer(cfg.creds, safeText(row.withdraw_no, 64));
					wxRaw = liveWx;
					wxState = normalizeTransferState(liveWx?.state || liveWx?.status || wxState);
					source = 'live_query';
				}
			} catch (e) {
				liveWx = {
					error: safeText(e?.message || '查单失败', 160),
					wxCode: safeText(e?.wxBody?.code || '', 40),
					wxBody: e && e.name === 'WxPayRequestError' ? e.wxBody || {} : {}
				};
				if (!wxRaw) wxRaw = liveWx;
				source = 'live_query_error';
			}
		}

		return {
			code: 0,
			message: 'ok',
			data: {
				withdrawNo: row.withdraw_no || '',
				reason: safeText(row.transfer_error || '', 300),
				arrivalStatus: safeText(row.arrival_status, 20),
				transferState: wxState || safeText(row.transfer_state, 40),
				balanceRestored: !!row.balance_restored,
				balanceRestoreTime: restoreTimeTs ? formatTime(restoreTimeTs) : '',
				balanceRestoreTimeTs: restoreTimeTs || null,
				wxRawText: pretty(wxRaw) || '（暂无微信原始应答，可查看转账日志）',
				wxRaw,
				dataSource: source,
				wxTradeNo: safeText(row.wx_trade_no || '', 80)
			}
		};
	} catch (e) {
		console.error('withdrawFailDetail failed:', e);
		return { code: 500, message: safeText(e?.message || '获取失败详情失败', 160) };
	}
}

/** @returns {Promise<object>} data 形态，或带 code 的错误 */
async function repairOneExpiredWithdraw(row, reason) {
	const arrival = safeText(row.arrival_status, 20) || 'pending';
	if (row.is_paid || arrival === 'received') {
		return { code: 400, message: '该单已到账，不能按失效修复', action: 'skip' };
	}
	const steps = [];
	let wxState = normalizeTransferState(row.transfer_state || '');
	let wxQuery = null;

	const outBillNo = safeText(row.withdraw_no, 64);
	if (outBillNo) {
		const r = await cancelOrResolveWxWithdrawForExpire(row, reason);
		steps.push({ step: 'cancelOrResolve', result: r });
		if (r.action === 'settled') {
			return {
				ok: true,
				action: 'settled',
				message: '微信已 SUCCESS，已按到账结算（未退回商户）',
				wxState: r.wxState,
				steps
			};
		}
		if (r.action === 'expired') {
			return {
				ok: true,
				action: 'expired',
				message: '已撤销/确认失败并完成失效返还',
				wxState: r.wxState,
				amountPoints: r.amountPoints,
				settleAmt: r.settleAmt,
				merchantId: r.merchantId,
				steps
			};
		}
		if (r.action === 'cancel_pending') {
			return {
				ok: true,
				action: 'cancel_pending',
				message: '已发起撤销，微信处理中',
				wxState: r.wxState,
				steps
			};
		}
		wxState = r.wxState || wxState;
	}

	const freshRes = await withdrawCollection.doc(row._id).get();
	const fresh = (freshRes.data && freshRes.data[0]) || row;
	const arrival2 = safeText(fresh.arrival_status, 20) || 'pending';
	if (arrival2 === 'expired' || arrival2 === 'returned') {
		const patched = await ensureExpiredBalanceRestored(fresh, { reason, wxState });
		steps.push({ step: 'ensureRestore', result: patched });
		if (!patched.ok) {
			return { code: 500, ok: false, message: patched.message || '补退失败', action: 'failed', steps, wxState };
		}
		return {
			ok: true,
			action: patched.restoredNow ? 'restored' : 'already_restored',
			message: patched.restoredNow
				? '已补退积分到商户账户'
				: `无需重复退回（${patched.reason || '已返还'}）`,
			amountPoints: patched.amountPoints,
			settleAmt: patched.settleAmt,
			merchantId: patched.merchantId,
			wxState,
			wxQuery,
			steps
		};
	}

	if (wxState === 'CANCELLED' || isWithdrawTerminalFailState(wxState) || wxState === 'NOT_FOUND' || wxState === 'EXPIRED') {
		const fin = await finalizeWithdrawExpiredAndRestore(fresh, reason, { wxState });
		steps.push({ step: 'finalize', result: fin });
		if (!fin.ok && !fin.skip) {
			return { code: 500, ok: false, message: fin.message || '失效返还失败', action: 'failed', steps, wxState };
		}
		return {
			ok: true,
			action: 'expired',
			message: '已标记失效并返还',
			amountPoints: fin.amountPoints,
			settleAmt: fin.settleAmt,
			merchantId: fin.merchantId,
			wxState,
			steps
		};
	}

	return {
		ok: false,
		action: 'need_manual',
		message: `当前无法自动修复（本地 ${arrival2}，微信 ${wxState || '未知'}）`,
		wxState,
		steps
	};
}

async function withdrawApprove(data) {
	try {
		const id = safeText(data?.id, 80);
		const actionType = safeText(data?.actionType, 20); // approve | reject | pay | arrival | returned | expired
		if (!id) return { code: 400, message: '缺少提现记录ID' };
		if (!['approve', 'reject', 'pay', 'arrival', 'returned', 'expired'].includes(actionType)) {
			return { code: 400, message: '审批动作无效' };
		}

		const oldRes = await withdrawCollection.doc(id).get();
		const row = oldRes.data && oldRes.data[0];
		if (!row) return { code: 404, message: '提现记录不存在' };

		const now = nowTs();
		if (actionType === 'approve') {
			if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
			if (safeText(row.audit_status, 20) !== 'pending') return { code: 400, message: '该记录不是待审核状态' };
			if (row.is_paid || safeText(row.arrival_status, 20) === 'received') {
				return { code: 400, message: '该记录已完成打款，无需重复操作' };
			}
			const merchantUserId = safeText(row.merchant_user_id, 80);
			const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
			const amountPoints = Number(row.amount || 0);
			const merchantRes = merchantUserId
				? await merchantCollection.where({ user_id: merchantUserId }).limit(1).get()
				: { data: [] };
			const merchant = merchantRes.data && merchantRes.data[0];
			if (!merchant) return { code: 404, message: '商户不存在' };
			const openid = safeText(merchant.wx_openid, 100);
			if (!openid) return { code: 400, message: '商户缺少openid，无法商家打款' };
			const cfg = ensureWxWithdrawPayConfig();
			if (!cfg.ok) return { code: 500, message: cfg.message };
			const wc = cfg.creds;
			const machineRes = row.device_id
				? await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get()
				: { data: [] };
			const machine = machineRes.data && machineRes.data[0];

			const merchantPendingBefore = Number(merchant.pending_withdraw || 0);
			const merchantWithdrawnBefore = Number(merchant.withdrawn || 0);
			const machinePendingBefore = machine ? Number(machine.pending_amount || 0) : 0;
			const machineWithdrawnBefore = machine ? Number(machine.withdrawn_amount || 0) : 0;
			await writeTransferLog({
				stage: 'approve_click',
				withdrawId: row._id,
				withdrawNo: row.withdraw_no,
				merchantUserId: row.merchant_user_id,
				openid,
				deviceId: row.device_id,
				outBillNo: row.withdraw_no,
				message: '管理员点击同意提现',
				payload: { settleAmt, actionType }
			});

			try {
				// 先查一次微信单状态，避免重复发起导致“处理中/已成功”被误判为失败
				try {
					const q0 = await wxPayQueryMerchantTransfer(wc, safeText(row.withdraw_no, 64));
					const s0 = normalizeTransferState(q0?.state || q0?.status || '');
					const bill0 = safeText(q0?.transfer_bill_no || '', 80);
					if (s0 === 'SUCCESS') {
						await writeTransferLog({
							stage: 'approve_precheck',
							withdrawId: row._id,
							withdrawNo: row.withdraw_no,
							merchantUserId: row.merchant_user_id,
							openid,
							deviceId: row.device_id,
							outBillNo: row.withdraw_no,
							transferState: s0,
							message: '预查询已成功，直接同步本地状态',
							payload: q0 || {}
						});
						await withdrawCollection.doc(id).update({
							audit_status: 'approved',
							audit_time: nowTs(),
							is_paid: true,
							arrival_status: 'received',
							pay_time: nowTs(),
							arrival_time: nowTs(),
							wx_trade_no: bill0,
							transfer_state: s0,
							package_info: safeText(
								pickTransferPackageInfo(q0) || pickTransferPackageInfo(row) || '',
								1200
							),
							update_time: nowTs()
						});
						await merchantCollection.doc(merchant._id).update({
							pending_withdraw: Number(Math.max(0, merchantPendingBefore - settleAmt).toFixed(4)),
							withdrawn: Number((merchantWithdrawnBefore + settleAmt).toFixed(4)),
							update_time: nowTs()
						});
						if (machine) {
							await machineCollection.doc(machine._id).update({
								pending_amount: Number(Math.max(0, machinePendingBefore - settleAmt).toFixed(4)),
								withdrawn_amount: Number((machineWithdrawnBefore + settleAmt).toFixed(4))
							});
						}
						return { code: 0, message: '该单已成功打款，已完成状态同步' };
					}
					if (!['UNKNOWN', 'FAIL', 'FAILED', 'CANCELLED'].includes(s0)) {
						await writeTransferLog({
							stage: 'approve_precheck',
							withdrawId: row._id,
							withdrawNo: row.withdraw_no,
							merchantUserId: row.merchant_user_id,
							openid,
							deviceId: row.device_id,
							outBillNo: row.withdraw_no,
							transferState: s0,
							message: '预查询仍处理中，等待后续轮询',
							payload: q0 || {}
						});
						await withdrawCollection.doc(id).update({
							audit_status: 'approved',
							audit_time: nowTs(),
							is_paid: false,
							arrival_status: 'pending',
							wx_trade_no: bill0,
							transfer_state: s0,
							package_info: safeText(
								pickTransferPackageInfo(q0) || pickTransferPackageInfo(row) || '',
								1200
							),
							update_time: nowTs()
						});
						return { code: 0, message: '该单仍在微信处理中，请稍后重试' };
					}
				} catch (e0) {}

				const transferCreateResp = await wxPayMerchantTransferToOpenid(wc, {
					appid: wc.appId,
					openid,
					amountFen: Math.round(settleAmt * 100),
					outBillNo: safeText(row.withdraw_no, 64),
					reason: '后台审核提现打款'
				});
				await writeTransferLog({
					stage: 'approve_transfer_create',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId: row.merchant_user_id,
					openid,
					deviceId: row.device_id,
					outBillNo: row.withdraw_no,
					message: '同意提现发起商家转账返回',
					payload: transferCreateResp || {}
				});
				let transferState = 'PROCESSING';
				let transferBillNo = '';
				let transferQueryResp = null;
				try {
					const q = await wxPayQueryMerchantTransfer(wc, safeText(row.withdraw_no, 64));
					transferQueryResp = q;
					transferState = normalizeTransferState(q?.state || q?.status || transferState);
					transferBillNo = safeText(q?.transfer_bill_no || '', 80);
					await writeTransferLog({
						stage: 'approve_query',
						withdrawId: row._id,
						withdrawNo: row.withdraw_no,
						merchantUserId: row.merchant_user_id,
						openid,
						deviceId: row.device_id,
						outBillNo: row.withdraw_no,
						transferState,
						message: '同意提现后查询微信状态',
						payload: q || {}
					});
				} catch (e) {}
				if (transferState === 'SUCCESS') {
					await withdrawCollection.doc(id).update({
						audit_status: 'approved',
						audit_time: nowTs(),
						is_paid: true,
						arrival_status: 'received',
						pay_time: nowTs(),
						arrival_time: nowTs(),
						wx_trade_no: transferBillNo,
						transfer_state: transferState,
						package_info: safeText(
							pickTransferPackageInfo(transferQueryResp) ||
								pickTransferPackageInfo(transferCreateResp) ||
								pickTransferPackageInfo(row) ||
								'',
							1200
						),
						update_time: nowTs()
					});
					await merchantCollection.doc(merchant._id).update({
						pending_withdraw: Number(Math.max(0, merchantPendingBefore - settleAmt).toFixed(4)),
						withdrawn: Number((merchantWithdrawnBefore + settleAmt).toFixed(4)),
						update_time: nowTs()
					});
					if (machine) {
						await machineCollection.doc(machine._id).update({
							pending_amount: Number(Math.max(0, machinePendingBefore - settleAmt).toFixed(4)),
							withdrawn_amount: Number((machineWithdrawnBefore + settleAmt).toFixed(4))
						});
					}
					return { code: 0, message: '同意提现成功，已完成打款' };
				}
				if (['FAIL', 'FAILED', 'CANCELLED'].includes(transferState)) {
					throw new Error(`微信提现失败：${transferState}`);
				}
				// PROCESSING 等非终态：管理员已同意并发起转账，审核记为已通过；到账仍以后续查询为准
				await withdrawCollection.doc(id).update({
					audit_status: 'approved',
					audit_time: nowTs(),
					is_paid: false,
					arrival_status: 'pending',
					wx_trade_no: transferBillNo,
					transfer_state: transferState || 'PROCESSING',
					package_info: safeText(
						pickTransferPackageInfo(transferQueryResp) ||
							pickTransferPackageInfo(transferCreateResp) ||
							pickTransferPackageInfo(row) ||
							'',
						1200
					),
					update_time: nowTs()
				});
				await writeTransferLog({
					stage: 'approve_processing',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId: row.merchant_user_id,
					openid,
					deviceId: row.device_id,
					outBillNo: row.withdraw_no,
					transferState: transferState || 'PROCESSING',
					message: '同意提现后微信处理中，等待轮询'
				});
				return { code: 0, message: '同意提现成功，微信打款处理中' };
			} catch (e) {
				const reason = safeText(e?.message || '微信提现失败', 180);
				await maybeNotifyWxOperatingAccountInsufficientWecom(e, {
					scene: '提现',
					withdrawNo: safeText(row.withdraw_no, 64),
					outBillNo: safeText(row.withdraw_no, 64),
					merchantName: merchant ? maybeMerchantDisplayName(merchant) : safeText(row.user_nickname || row.user_mobile, 40)
				});
				await markWithdrawFailNeedsReaudit(row, 'RETRYABLE_FAIL', reason, { merchant, notifyWecom: false });
				await writeTransferLog({
					stage: 'approve_failed',
					level: 'error',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId: row.merchant_user_id,
					openid,
					deviceId: row.device_id,
					outBillNo: row.withdraw_no,
					transferState: 'RETRYABLE_FAIL',
					message: reason,
					payload: e && e.name === 'WxPayRequestError' ? (e.wxBody || {}) : { error: safeText(e?.message || '', 300) }
				});
				// 打款失败时保留冻结金额与待审核状态，便于管理员再次点击“同意提现”
				return { code: 500, message: `同意提现失败（可重试）：${reason}` };
			}
		}

		if (actionType === 'reject') {
			if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
			if (safeText(row.audit_status, 20) !== 'pending') return { code: 400, message: '该记录不是待审核状态' };
			const stateNow = normalizeTransferState(row.transfer_state || '');
			if (!WITHDRAW_SAFE_AUTO_EXPIRE_STATES.includes(stateNow)) {
				return { code: 400, message: '当前微信提现处理中或已成功，暂不可不同意提现' };
			}
			const restored = await restoreUnpaidWithdrawBalances(row);
			if (!restored.ok) return { code: 404, message: restored.message || '商户不存在' };
			await withdrawCollection.doc(id).update({
				audit_status: 'rejected',
				arrival_status: 'returned',
				transfer_state: 'REJECTED',
				transfer_error: safeText(data?.reason || '管理员不同意提现', 180),
				update_time: now
			});
			return { code: 0, message: '已不同意提现并退回冻结金额' };
		}

		if (actionType === 'pay') {
			if (row.is_paid) return { code: 400, message: '该记录已打款' };
			await withdrawCollection.doc(id).update({
				is_paid: true,
				pay_time: now,
				update_time: now
			});
			return { code: 0, message: '已标记为打款' };
		}

		if (!row.is_paid) return { code: 400, message: '请先完成打款' };
		const nextStatus = actionType === 'arrival' ? 'received' : actionType;
		if (row.arrival_status === nextStatus) {
			return { code: 400, message: `该记录已是${arrivalStatusText(nextStatus)}` };
		}

		const merchantUserId = safeText(row.merchant_user_id, 80);
		const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
		const merchantRes = merchantUserId
			? await merchantCollection.where({ user_id: merchantUserId }).limit(1).get()
			: { data: [] };
		const merchant = merchantRes.data && merchantRes.data[0];
		const machineRes = row.device_id
			? await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get()
			: { data: [] };
		const machine = machineRes.data && machineRes.data[0];

		await withdrawCollection.doc(id).update({
			arrival_status: nextStatus,
			arrival_time: nextStatus === 'received' ? now : row.arrival_time || null,
			update_time: now
		});

		const wasReceived = row.arrival_status === 'received';
		const isReceived = nextStatus === 'received';
		if (!wasReceived && isReceived && settleAmt > 0) {
			if (merchant) {
				await merchantCollection.doc(merchant._id).update({
					pending_withdraw: Number(Math.max(0, Number(merchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
					withdrawn: Number((Number(merchant.withdrawn || 0) + settleAmt).toFixed(4))
				});
			}
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4)),
					withdrawn_amount: Number((Number(machine.withdrawn_amount || 0) + settleAmt).toFixed(4))
				});
			}
		}
		if (wasReceived && !isReceived && settleAmt > 0) {
			// 兜底回滚：若误改状态离开“已到账”，把金额退回待提
			if (merchant) {
				await merchantCollection.doc(merchant._id).update({
					pending_withdraw: Number((Number(merchant.pending_withdraw || 0) + settleAmt).toFixed(4)),
					withdrawn: Number(Math.max(0, Number(merchant.withdrawn || 0) - settleAmt).toFixed(4))
				});
			}
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number((Number(machine.pending_amount || 0) + settleAmt).toFixed(4)),
					withdrawn_amount: Number(Math.max(0, Number(machine.withdrawn_amount || 0) - settleAmt).toFixed(4))
				});
			}
		}
		return { code: 0, message: `已标记为${arrivalStatusText(nextStatus)}` };
	} catch (error) {
		console.error('withdrawApprove failed:', error);
		return { code: 500, message: '审批失败' };
	}
}

async function withdrawDelete(data, event) {
	try {
		const ids = Array.isArray(data?.ids) ? data.ids.map((x) => safeText(x, 80)).filter(Boolean) : [];
		if (!ids.length) return { code: 400, message: '请选择要删除的记录' };
		const now = nowTs();
		const operator = getOperator(event);
		await withdrawCollection.where({ _id: db.command.in(ids), is_deleted: false }).update({
			is_deleted: true,
			update_time: now,
			delete_time: now,
			delete_user: operator
		});
		return { code: 0, message: '删除成功' };
	} catch (error) {
		console.error('withdrawDelete failed:', error);
		return { code: 500, message: '删除失败' };
	}
}

function csvEscape(val) {
	const s = String(val == null ? '' : val);
	if (/[",\n\r]/.test(s)) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

async function exportWithdrawCsv(data) {
	try {
		const whereExpr = await buildWithdrawWhere(data);
		const MAX = 10000;
		const BATCH = 500;
		const raw = [];
		let skip = 0;
		while (raw.length < MAX) {
			const res = await withdrawCollection
				.where(whereExpr)
				.orderBy('create_time', 'desc')
				.skip(skip)
				.limit(BATCH)
				.get();
			const chunk = res.data || [];
			if (!chunk.length) break;
			raw.push(...chunk);
			skip += BATCH;
			if (chunk.length < BATCH) break;
		}
		const headers = [
			'提现用户',
			'分公司',
			'业务员',
			'机具号',
			'提现单号',
			'提现金额',
			'税费+手续费',
			'应付金额',
			'打款时间',
			'是否打款',
			'到账时间',
			'是否到账'
		];
		const lines = [headers.join(',')];
		const mapped = await enrichWithdrawListDeviceIds(raw.map((item) => mapWithdrawItem(item)));
		mapped.forEach((m) => {
			lines.push(
				[
					csvEscape(m.userDisplay.replace(/\n/g, ' ')),
					csvEscape(m.company),
					csvEscape(m.salesman),
					csvEscape(m.deviceId),
					csvEscape(m.withdrawNo),
					csvEscape(m.amountText),
					csvEscape(m.feeTaxText),
					csvEscape(m.payableText),
					csvEscape(m.payTime),
					csvEscape(m.isPaidText),
					csvEscape(m.arrivalTime),
					csvEscape(m.arrivalStatusText)
				].join(',')
			);
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				csv: lines.join('\r\n'),
				total: raw.length,
				truncated: raw.length >= MAX
			}
		};
	} catch (e) {
		console.error('exportWithdrawCsv', e);
		return { code: 500, message: '导出失败' };
	}
}

function safeText(v, max = 120) {
	return String(v == null ? '' : v).trim().slice(0, max);
}

function nowTs() {
	return Date.now();
}

function randomStr(len = 24) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
	let out = '';
	for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
	return out;
}

function isValidNotifyUrl(url) {
	const s = String(url || '');
	return /^https:\/\/[^#\s]+$/i.test(s);
}

/** 平台已接入的微信商户号（证书在 pay.config / 环境变量中预置） */
const WX_MCH_FANFAN = '1111130439';
const WX_MCH_ZHIFAN = '1646399792';
const WX_PAY_MCH_OPTIONS = [
	{ mchId: WX_MCH_FANFAN, label: '帆帆电子' },
	{ mchId: WX_MCH_ZHIFAN, label: '志帆科技' }
];

function wxCredentialsForZhifan() {
	return {
		mchId: WX_PAY_MCH_ID,
		appId: WX_PAY_APPID,
		mchApiV3Key: WX_PAY_MCH_API_V3_KEY,
		mchSerialNo: WX_PAY_MCH_SERIAL_NO,
		privateKey: WX_PAY_PRIVATE_KEY,
		platformCert: WX_PAY_PLATFORM_CERT
	};
}

function wxCredentialsForFanfan() {
	const fallback = wxCredentialsForZhifan();
	return {
		mchId: WX_PAY_RECHARGE_MCH_ID || fallback.mchId,
		appId: WX_PAY_RECHARGE_APPID || fallback.appId,
		mchApiV3Key: WX_PAY_RECHARGE_MCH_API_V3_KEY || fallback.mchApiV3Key,
		mchSerialNo: WX_PAY_RECHARGE_MCH_SERIAL_NO || fallback.mchSerialNo,
		privateKey: WX_PAY_RECHARGE_PRIVATE_KEY || fallback.privateKey,
		platformCert: WX_PAY_RECHARGE_PLATFORM_CERT || fallback.platformCert
	};
}

function wxCredentialsByRegisteredMchId(mchId) {
	const id = safeText(mchId, 40);
	if (id === WX_MCH_FANFAN) return wxCredentialsForFanfan();
	if (id === WX_MCH_ZHIFAN) return wxCredentialsForZhifan();
	return null;
}

/** 与 pay.config 一致：未写入业务参数时的默认商户号 */
function resolveDefaultWxPayMchIds() {
	return {
		recharge: safeText(WX_PAY_RECHARGE_MCH_ID || WX_PAY_MCH_ID, 40) || WX_MCH_FANFAN,
		refund: safeText(WX_PAY_MCH_ID, 40) || WX_MCH_ZHIFAN,
		withdraw: safeText(WX_PAY_MCH_ID, 40) || WX_MCH_ZHIFAN
	};
}

function sanitizeWxPayMchSelection(raw, defaults) {
	const defs = defaults || resolveDefaultWxPayMchIds();
	const src = raw && typeof raw === 'object' ? raw : {};
	const pick = (key) => {
		const id = safeText(src[key], 40);
		if (id === WX_MCH_FANFAN || id === WX_MCH_ZHIFAN) return id;
		return defs[key] || defs.withdraw;
	};
	return {
		recharge: pick('recharge'),
		refund: pick('refund'),
		withdraw: pick('withdraw')
	};
}

function resolveWxPayMchIdsFromBiz(biz) {
	return sanitizeWxPayMchSelection(biz?.wxPayMch, resolveDefaultWxPayMchIds());
}

function wxCredentialsForPaySceneSync(scene) {
	const ids = bizSettingsCache ? resolveWxPayMchIdsFromBiz(bizSettingsCache) : resolveDefaultWxPayMchIds();
	const mchId = ids[scene] || ids.withdraw;
	return wxCredentialsByRegisteredMchId(mchId) || wxCredentialsForZhifan();
}

function wxWithdrawCredentials() {
	return wxCredentialsForPaySceneSync('withdraw');
}

function wxRechargeCredentials() {
	return wxCredentialsForPaySceneSync('recharge');
}

function wxRefundCredentials() {
	return wxCredentialsForPaySceneSync('refund');
}

/** 未写入 wx_pay_profile 的旧 uni-pay 订单按「提现商户」证书与密钥处理（与历史单商户一致） */
function wxCredentialsForPayOrder(order) {
	const profile = order && order.custom && order.custom.wx_pay_profile;
	if (profile === 'recharge') return wxRechargeCredentials();
	if (profile === 'withdraw') return wxWithdrawCredentials();
	const mchid = safeText(order?.custom?.wx_pay_mchid || order?.mchid || order?.provider_mchid, 40);
	if (mchid && mchid === wxRechargeCredentials().mchId) return wxRechargeCredentials();
	if (mchid && mchid === wxWithdrawCredentials().mchId) return wxWithdrawCredentials();
	if (String(order?.type || '') === 'h5_quota_recharge') return wxRechargeCredentials();
	return wxWithdrawCredentials();
}

function explicitMchIdOfOrder(order) {
	return safeText(order?.custom?.wx_pay_mchid || order?.mchid || order?.provider_mchid, 40);
}

function wxCredentialsByMchId(mchId) {
	const id = safeText(mchId, 40);
	if (!id) return null;
	const hit = wxCredentialsByRegisteredMchId(id);
	if (hit) return hit;
	const rc = wxRechargeCredentials();
	if (id === rc.mchId) return rc;
	const wc = wxWithdrawCredentials();
	if (id === wc.mchId) return wc;
	const rf = wxRefundCredentials();
	if (id === rf.mchId) return rf;
	return null;
}

function isWxOrderNotExistsError(e) {
	const msg = String(e?.wxBody?.message || e?.wxBody?.code || e?.message || '').toLowerCase();
	return msg.includes('订单不存在') || msg.includes('order_not_exist') || msg.includes('resource_not_exists');
}

function ensureWxPayConfigForCreds(c, sceneLabel) {
	const label = safeText(sceneLabel, 40) || '微信';
	if (!c.mchId || !c.appId || !c.mchSerialNo || !c.privateKey) {
		return { ok: false, message: `${label}支付参数未配置完整（商户号/AppID/证书序列号/私钥）` };
	}
	if (!c.mchApiV3Key || String(c.mchApiV3Key).length !== 32) {
		return { ok: false, message: `${label} APIv3 密钥必须是32位` };
	}
	if (!c.platformCert) {
		return { ok: false, message: `${label}未配置微信平台证书，无法校验回调签名` };
	}
	return { ok: true, creds: c };
}

function wxPayMchLabel(mchId) {
	const hit = WX_PAY_MCH_OPTIONS.find((x) => x.mchId === safeText(mchId, 40));
	return hit ? hit.label : safeText(mchId, 40) || '-';
}

function ensureWxWithdrawPayConfig() {
	const c = wxWithdrawCredentials();
	const base = ensureWxPayConfigForCreds(c, `提现（${wxPayMchLabel(c.mchId)}）`);
	return base;
}

function ensureWxRefundPayConfig() {
	const c = wxRefundCredentials();
	return ensureWxPayConfigForCreds(c, `退款（${wxPayMchLabel(c.mchId)}）`);
}

function ensureWxRechargePayConfig() {
	const c = wxRechargeCredentials();
	const base = ensureWxPayConfigForCreds(c, `升级充值（${wxPayMchLabel(c.mchId)}）`);
	if (!base.ok) return base;
	if (!isValidNotifyUrl(H5_PAY_NOTIFY_URL)) {
		return { ok: false, message: 'WX_PAY_NOTIFY_URL 必须是可公网访问的 https 接口地址，且不能包含 # 哈希路由' };
	}
	if (H5_REFUND_NOTIFY_URL && !isValidNotifyUrl(H5_REFUND_NOTIFY_URL)) {
		return { ok: false, message: 'WX_PAY_REFUND_NOTIFY_URL 必须是可公网访问的 https 接口地址，且不能包含 # 哈希路由' };
	}
	return base;
}

function signWxV3MessageWithKey(privateKeyPem, message) {
	const crypto = require('crypto');
	const sign = crypto.createSign('RSA-SHA256');
	sign.update(message);
	sign.end();
	return sign.sign(privateKeyPem, 'base64');
}

function wxPayAuthHeaderFor(creds, method, urlPathWithQuery, bodyString = '') {
	const timestamp = String(Math.floor(nowTs() / 1000));
	const nonceStr = randomStr(24);
	const msg = `${method}\n${urlPathWithQuery}\n${timestamp}\n${nonceStr}\n${bodyString}\n`;
	const signature = signWxV3MessageWithKey(creds.privateKey, msg);
	return `WECHATPAY2-SHA256-RSA2048 mchid="${creds.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${creds.mchSerialNo}",signature="${signature}"`;
}

class WxPayRequestError extends Error {
	constructor(httpStatus, wxBody, urlPathWithQuery) {
		const obj = wxBody && typeof wxBody === 'object' ? wxBody : {};
		const msg =
			(typeof obj.message === 'string' && obj.message) ||
			(typeof obj.detail === 'string' && obj.detail) ||
			`微信支付请求失败(${httpStatus})`;
		super(msg);
		this.name = 'WxPayRequestError';
		this.httpStatus = httpStatus;
		this.wxBody = obj;
		this.path = urlPathWithQuery || '';
	}
}

function normalizeWxPayResponseData(raw) {
	if (raw !== null && typeof raw === 'object') {
		let cur = raw;
		// 兼容代理/网关常见包裹：{success,data} / {code,data} / {result,data} / {body,...}
		for (let i = 0; i < 5; i++) {
			if (cur && typeof cur === 'object') {
				if (Object.prototype.hasOwnProperty.call(cur, 'prepay_id')) return cur;
				if (Object.prototype.hasOwnProperty.call(cur, 'data') && cur.data && typeof cur.data === 'object') {
					cur = cur.data;
					continue;
				}
				if (Object.prototype.hasOwnProperty.call(cur, 'result') && cur.result && typeof cur.result === 'object') {
					cur = cur.result;
					continue;
				}
				if (Object.prototype.hasOwnProperty.call(cur, 'body') && cur.body && typeof cur.body === 'object') {
					cur = cur.body;
					continue;
				}
			}
			break;
		}
		return cur;
	}
	if (typeof raw === 'string') {
		try {
			return normalizeWxPayResponseData(JSON.parse(raw));
		} catch (_) {
			return { _raw: raw };
		}
	}
	return {};
}

function normalizeProxyResp(resp) {
	if (resp && typeof resp === 'object') {
		// httpProxyForEip 常见返回：{ success, data, statusCode? }，其中 data 还可能再包一层 { data, statusCode }
		let payload = resp;
		let status = Number(resp.statusCode || resp.status || 200);
		const nestedStatusLike = Number(resp.statusCodeValue || 0);
		if (nestedStatusLike) status = nestedStatusLike;
		if (Object.prototype.hasOwnProperty.call(resp, 'success') && Object.prototype.hasOwnProperty.call(resp, 'data')) {
			payload = resp.data;
		}
		if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
			const nestedStatus = Number(payload.statusCode || payload.status || payload.statusCodeValue || 0);
			if (nestedStatus) status = nestedStatus;
			payload = payload.data;
		}
		// 兼容代理直接回传 { headers, body, statusCodeValue } 的场景
		if (payload && typeof payload === 'object') {
			const s2 = Number(payload.statusCode || payload.status || payload.statusCodeValue || 0);
			if (s2) status = s2;
			if (payload.body && typeof payload.body === 'object') {
				payload = payload.body;
			}
		}
		return { status, data: payload };
	}
	return { status: 200, data: resp };
}

async function requestViaEipProxyIfPossible(method, url, bodyObj, headers) {
	if (!uniCloud.httpProxyForEip) return null;
	try {
		if (method === 'GET') {
			const qIdx = url.indexOf('?');
			const base = qIdx >= 0 ? url.slice(0, qIdx) : url;
			const params = {};
			if (qIdx >= 0) {
				const query = new URLSearchParams(url.slice(qIdx + 1));
				for (const [k, v] of query.entries()) params[k] = v;
			}
			// GET 查询同样必须带微信支付 Authorization 头，否则会返回 401 鉴权错误
			try {
				const r = await uniCloud.httpProxyForEip.get(base, params, headers || {});
				return normalizeProxyResp(r);
			} catch (e1) {
				// 兼容部分环境 get(url, params) 旧签名，不阻断流程
				const r = await uniCloud.httpProxyForEip.get(base, params);
				return normalizeProxyResp(r);
			}
		}
		if (method === 'POST') {
			const r = await uniCloud.httpProxyForEip.postJson(url, bodyObj || {}, headers || {});
			return normalizeProxyResp(r);
		}
		return null;
	} catch (e) {
		console.error(`[requestViaEipProxyIfPossible] ${method} ${url} failed`, e && e.message);
		return null;
	}
}

async function wxPayRequestFor(creds, method, urlPathWithQuery, bodyObj, opts = {}) {
	const url = `https://api.mch.weixin.qq.com${urlPathWithQuery}`;
	const bodyString = bodyObj ? JSON.stringify(bodyObj) : '';
	const headers = {
		Authorization: wxPayAuthHeaderFor(creds, method, urlPathWithQuery, bodyString),
		Accept: 'application/json',
		'Content-Type': 'application/json',
		'User-Agent': 'hsy-merchant-cloudfn'
	};
	const useEipProxy = !!opts.useEipProxy;
	const proxyResp = useEipProxy ? await requestViaEipProxyIfPossible(method, url, bodyObj, headers) : null;
	const resp = proxyResp
		? { status: proxyResp.status, data: proxyResp.data }
		: await uniCloud.httpclient.request(url, {
				method,
				data: bodyString || undefined,
				dataType: 'json',
				contentType: 'application/json',
				headers,
				timeout: 15000
		  });
	const data = normalizeWxPayResponseData(resp.data);
	// 代理模式下有时会返回 200 + 错误对象，需主动识别
	if (
		data &&
		typeof data === 'object' &&
		(data.code || data.errcode) &&
		!data.prepay_id &&
		!data.trade_state &&
		!data.transfer_bill_no &&
		!data.out_bill_no
	) {
		console.error(
			`[wxPayRequestFor] ${method} ${urlPathWithQuery} logical_error wechat_json=${JSON.stringify(data)}`
		);
		throw new WxPayRequestError(resp.status || 400, data, urlPathWithQuery);
	}
	if (resp.status >= 400) {
		console.error(
			`[wxPayRequestFor] ${method} ${urlPathWithQuery} http=${resp.status} wechat_json=${JSON.stringify(data)}`
		);
		throw new WxPayRequestError(resp.status, data, urlPathWithQuery);
	}
	return data;
}

/** 按各订单剩余可退金额比例拆分本次退款（分），总和等于 targetRefundFen */
function distributeRefundFenAcrossOrders(orders, targetRefundFen) {
	const n = orders.length;
	if (!n || targetRefundFen <= 0) return new Array(n).fill(0);
	const remain = orders.map((o) => {
		const tf = Number(o.total_fee || 0);
		const rf = Number(o.refund_fee || 0);
		return Math.max(0, tf - rf);
	});
	const sumRem = remain.reduce((a, b) => a + b, 0);
	if (!sumRem) return new Array(n).fill(0);
	const parts = [];
	let acc = 0;
	for (let i = 0; i < n; i++) {
		if (i === n - 1) {
			parts.push(Math.min(remain[i], Math.max(0, targetRefundFen - acc)));
		} else {
			const p = Math.floor((targetRefundFen * remain[i]) / sumRem);
			const part = Math.min(remain[i], p);
			parts.push(part);
			acc += part;
		}
	}
	let s = parts.reduce((a, b) => a + b, 0);
	if (s < targetRefundFen && n > 0) {
		const add = Math.min(remain[n - 1] - parts[n - 1], targetRefundFen - s);
		parts[n - 1] += add;
	}
	return parts;
}

/**
 * 微信支付 V3 申请退款（商户号 API）
 * https://pay.weixin.qq.com/doc/v3/merchant/4012791859
 */
async function wxPayCreateRefundFor(creds, { outTradeNo, outRefundNo, refundFen, totalFen, reason }) {
	const body = {
		out_trade_no: safeText(outTradeNo, 40),
		out_refund_no: safeText(outRefundNo, 64),
		reason: safeText(reason || 'H5额度充值退款', 80),
		amount: {
			refund: Math.round(Number(refundFen || 0)),
			total: Math.round(Number(totalFen || 0)),
			currency: 'CNY'
		}
	};
	if (H5_REFUND_NOTIFY_URL && isValidNotifyUrl(H5_REFUND_NOTIFY_URL)) {
		body.notify_url = H5_REFUND_NOTIFY_URL;
	}
	return wxPayRequestFor(creds, 'POST', '/v3/refund/domestic/refunds', body);
}

async function wxPayQueryRefundFor(creds, outRefundNo) {
	const path = `/v3/refund/domestic/refunds/${encodeURIComponent(safeText(outRefundNo, 64))}`;
	return wxPayRequestFor(creds, 'GET', path, null);
}

/**
 * 微信支付 V3 商家转账（升级版，单笔）
 * https://pay.weixin.qq.com/doc/v3/merchant/4012716436
 */
async function wxPayMerchantTransferToOpenid(creds, { appid, openid, amountFen, outBillNo, reason }) {
	if (!WX_TRANSFER_SCENE_ID) {
		throw new Error('未配置 WX_TRANSFER_SCENE_ID（商家转账场景ID）');
	}
	const sceneId = safeText(WX_TRANSFER_SCENE_ID, 20) || '1000';
	const transferRemark = safeText(reason || '积分兑换提现', 32);
	const reportInfosByScene = (scene, remark) => {
		// 微信要求：不同 scene_id 需传对应固定 info_type；当前你使用 1000（现金营销）
		if (scene === '1000') {
			return [
				{ info_type: '活动名称', info_content: safeText('积分兑换提现活动', 32) },
				{ info_type: '奖励说明', info_content: safeText(remark || '积分兑换现金奖励', 32) }
			];
		}
		// 其他场景暂按最保守兜底，避免空数组触发“报备信息不完整”
		return [
			{ info_type: '活动名称', info_content: safeText('商户提现活动', 32) },
			{ info_type: '奖励说明', info_content: safeText(remark || '商户转账', 32) }
		];
	};
	const body = {
		appid: safeText(appid, 80),
		out_bill_no: safeText(outBillNo, 64),
		transfer_scene_id: sceneId,
		openid: safeText(openid, 128),
		transfer_amount: Math.round(Number(amountFen || 0)),
		transfer_remark: transferRemark,
		// 现金营销场景（1000）需上报场景报备信息
		transfer_scene_report_infos: reportInfosByScene(sceneId, transferRemark),
		// 可选项：不传默认“活动奖励”，这里显式传入提升可读性
		user_recv_perception: '活动奖励'
	};
	if (WX_TRANSFER_NOTIFY_URL && isValidNotifyUrl(WX_TRANSFER_NOTIFY_URL)) {
		body.notify_url = WX_TRANSFER_NOTIFY_URL;
	}
	return wxPayRequestFor(creds, 'POST', '/v3/fund-app/mch-transfer/transfer-bills', body, { useEipProxy: true });
}

async function wxPayQueryMerchantTransfer(creds, outBillNo) {
	const path = `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(safeText(outBillNo, 64))}`;
	return wxPayRequestFor(creds, 'GET', path, null, { useEipProxy: true });
}

/** 撤销商家转账（用户确认收款前）；返回成功仅表示受理，终态以查单为准 */
async function wxPayCancelMerchantTransfer(creds, outBillNo) {
	const path = `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(safeText(outBillNo, 64))}/cancel`;
	return wxPayRequestFor(creds, 'POST', path, {}, { useEipProxy: true });
}

function sleepMs(ms) {
	const n = Math.max(0, Number(ms) || 0);
	return new Promise((resolve) => setTimeout(resolve, n));
}

/** 商家转账「用户确认收款」拉起参数；发起/查单多为 snake_case，个别网关可能驼峰 */
function pickTransferPackageInfo(obj) {
	if (!obj || typeof obj !== 'object') return '';
	const p = obj.package_info ?? obj.packageInfo;
	return String(p == null ? '' : p).trim();
}

function normalizeTransferState(raw) {
	const s = String(raw || '').toUpperCase();
	if (!s) return 'UNKNOWN';
	return s;
}

function isTransferTerminalState(state) {
	return ['SUCCESS', 'FAIL', 'FAILED', 'CANCELLED'].includes(normalizeTransferState(state));
}

function normalizeRefundState(raw) {
	const s = String(raw || '').toUpperCase();
	if (!s) return 'UNKNOWN';
	return s;
}

function isRefundSuccessState(state) {
	return normalizeRefundState(state) === 'SUCCESS';
}

function isRefundFailedState(state) {
	return ['ABNORMAL', 'CLOSED', 'CHANGE'].includes(normalizeRefundState(state));
}

function normalizePem(pemLike) {
	return String(pemLike || '').replace(/\\n/g, '\n').trim();
}

function getHeaderValue(headers, key) {
	const h = headers || {};
	return h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || '';
}

function verifyWxCallbackSignatureFor(creds, headers, rawBody) {
	const crypto = require('crypto');
	const serial = getHeaderValue(headers, 'wechatpay-serial');
	const signature = getHeaderValue(headers, 'wechatpay-signature');
	const timestamp = getHeaderValue(headers, 'wechatpay-timestamp');
	const nonce = getHeaderValue(headers, 'wechatpay-nonce');
	if (!serial || !signature || !timestamp || !nonce) {
		return { ok: false, message: '回调头缺少签名字段' };
	}
	const platformPem = normalizePem(creds.platformCert);
	if (!platformPem) return { ok: false, message: '未配置平台证书' };
	const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
	const verify = crypto.createVerify('RSA-SHA256');
	verify.update(message);
	verify.end();
	const ok = verify.verify(platformPem, signature, 'base64');
	return ok ? { ok: true } : { ok: false, message: '回调签名校验失败' };
}

function verifyWxCallbackSignatureDual(headers, rawBody) {
	const tried = [];
	for (const opt of WX_PAY_MCH_OPTIONS) {
		const creds = wxCredentialsByRegisteredMchId(opt.mchId);
		if (!creds || !ensureWxPayConfigForCreds(creds, opt.label).ok) continue;
		const r = verifyWxCallbackSignatureFor(creds, headers, rawBody);
		if (r.ok) return { ok: true, creds };
		tried.push(opt.label);
	}
	return { ok: false, message: tried.length ? '回调签名校验失败' : '未配置可用微信支付商户证书' };
}

function decryptWxResourceFor(creds, resource) {
	const crypto = require('crypto');
	const nonce = resource?.nonce;
	const associatedData = resource?.associated_data || '';
	const cipherText = resource?.ciphertext || '';
	if (!nonce || !cipherText) throw new Error('回调密文参数不完整');
	const key = Buffer.from(String(creds.mchApiV3Key || ''), 'utf8');
	if (key.length !== 32) throw new Error('APIv3 密钥必须是32位');
	const encrypted = Buffer.from(cipherText, 'base64');
	const data = encrypted.slice(0, encrypted.length - 16);
	const authTag = encrypted.slice(encrypted.length - 16);
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
	if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
	decipher.setAuthTag(authTag);
	let out = decipher.update(data, undefined, 'utf8');
	out += decipher.final('utf8');
	return JSON.parse(out);
}

function wxAckSuccess() {
	return { code: 'SUCCESS', message: '成功' };
}

function wxAckFail(msg) {
	return { code: 'FAIL', message: safeText(msg || '失败', 120) };
}

async function maybeCreateRechargeGiftShipment(orderDoc, merchant, now) {
	const custom = orderDoc.custom || {};
	const targetPrice = Number(custom.target_price || 0);
	const pkgId = safeText(custom.package_id, 40);
	if (targetPrice !== RECHARGE_GIFT_PRICE && pkgId !== H5_RECHARGE_TEST_AS_1000_PKG_ID) return;
	const giftType = safeText(custom.recharge_gift_type, 20);
	if (giftType !== 'speaker' && giftType !== 'scan_pos') return;
	const orderNo = safeText(orderDoc.out_trade_no || orderDoc.order_no, 40);
	if (!orderNo) return;
	const dup = await rechargeGiftShipmentCollection.where({ order_no: orderNo }).limit(1).get();
	if (dup.data && dup.data.length) return;
	const giftLabel =
		safeText(custom.recharge_gift_label, 40) ||
		(giftType === 'speaker' ? '蓝牙音响' : '扫码POS机');
	await rechargeGiftShipmentCollection.add({
		merchant_id: String(merchant._id || ''),
		merchant_user_id: String(merchant.user_id || merchant._id || ''),
		order_no: orderNo,
		gift_type: giftType,
		gift_label: giftLabel,
		wx_nickname: safeText(merchant.wx_nickname, 80),
		mobile: safeText(merchant.mobile, 30),
		device_id: safeText(merchant.device_id, 80),
		brand_name: safeText(merchant.brand_name, 80),
		tracking_no: '',
		receipt_status: 'pending',
		create_time: now,
		update_time: now
	});
}

async function rechargeGiftShipmentList(data) {
	try {
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 10)));
		const orderNo = safeText(data?.orderNo, 40);
		const keyword = safeText(data?.keyword, 80);
		const receiptStatus = safeText(data?.receiptStatus, 20);
		const where = {};
		if (orderNo) where.order_no = new RegExp(escapeReg(orderNo), 'i');
		if (receiptStatus && ['pending', 'shipped', 'signed'].includes(receiptStatus)) {
			where.receipt_status = receiptStatus;
		}
		if (keyword) {
			const k = new RegExp(escapeReg(keyword), 'i');
			where.$or = [{ wx_nickname: k }, { mobile: k }, { device_id: k }];
		}
		const countRes = await rechargeGiftShipmentCollection.where(where).count();
		const total = countRes.total || 0;
		const res = await rechargeGiftShipmentCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (res.data || []).map((row) => ({
			id: row._id,
			orderNo: row.order_no || '',
			giftType: row.gift_type || '',
			giftLabel: row.gift_label || '',
			wxNickname: row.wx_nickname || '',
			mobile: row.mobile || '',
			deviceId: row.device_id || '',
			brandName: row.brand_name || '',
			trackingNo: row.tracking_no || '',
			receiptStatus: row.receipt_status || 'pending',
			createTime: row.create_time ? formatTime(row.create_time) : ''
		}));
		return { code: 0, message: 'ok', data: { list, total, page, pageSize } };
	} catch (e) {
		console.error('rechargeGiftShipmentList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function rechargeGiftShipmentUpdate(data, event) {
	try {
		const id = safeText(data?.id, 80);
		if (!id) return { code: 400, message: '缺少记录ID' };
		const hasTracking = data && Object.prototype.hasOwnProperty.call(data, 'trackingNo');
		const trackingNo = hasTracking ? safeText(String(data.trackingNo), 120) : null;
		const hasStatus = data && Object.prototype.hasOwnProperty.call(data, 'receiptStatus');
		const receiptStatus = hasStatus ? safeText(data.receiptStatus, 20) : '';
		if (!hasTracking && !hasStatus) {
			return { code: 400, message: '请填写快递单号或选择签收状态' };
		}
		if (hasStatus && receiptStatus && !['pending', 'shipped', 'signed'].includes(receiptStatus)) {
			return { code: 400, message: '签收状态无效' };
		}
		const oldRes = await rechargeGiftShipmentCollection.doc(id).get();
		const row = oldRes.data && oldRes.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		const now = nowTs();
		const operator = getOperator(event);
		const patch = { update_time: now, update_user: operator };
		if (hasTracking) patch.tracking_no = trackingNo;
		if (hasStatus && receiptStatus) patch.receipt_status = receiptStatus;
		await rechargeGiftShipmentCollection.doc(id).update(patch);
		return { code: 0, message: '保存成功' };
	} catch (e) {
		console.error('rechargeGiftShipmentUpdate failed', e);
		return { code: 500, message: '保存失败' };
	}
}

async function applyRechargeByOrder(orderDoc) {
	let sourceOrder = orderDoc || {};
	const orderId = safeText(orderDoc?._id, 80);
	if (orderId) {
		const latestOrderRes = await uniPayOrderCollection.doc(orderId).get();
		const latestOrder = latestOrderRes.data && latestOrderRes.data[0];
		if (latestOrder) sourceOrder = latestOrder;
	}
	const custom = sourceOrder.custom || {};
	if (custom.recharge_applied) return;
	if (!custom.merchant_id) return;
	const merchant = await getMerchantByIdOrUserId(custom.merchant_id);
	if (!merchant) return;
	const now = nowTs();
	const biz = await getBizSettings();
	const refundCycle = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
	const targetPrice = Number(custom.target_price || 0);
	const beforePrice = Number(custom.before_price || 0);
	const targetReward = Number(custom.target_reward || 0);
	const beforeReward = Number(custom.before_reward || 0);
	const grantDelta = Math.max(
		0,
		Number(((targetReward > 0 || beforeReward > 0 ? targetReward - beforeReward : grantYuanByRechargePrice(targetPrice, biz.rechargeRules) - grantYuanByRechargePrice(beforePrice, biz.rechargeRules))).toFixed(2))
	);
	const prevRem = Number(merchant.remaining_quota || 0);
	const afterRem = Number((prevRem + grantDelta).toFixed(2));
	// 充值后“剩余提现额度”按当前套餐额度重置，不叠加原有待提现金额/账号积分。
	const nextAvailableReward = Number((targetReward > 0 ? targetReward : grantYuanByRechargePrice(targetPrice, biz.rechargeRules)).toFixed(2));
	const volAdd = Number(custom.add_quota || 0);
	const addPaidYuan = Number(Number(custom.paid_amount || 0).toFixed(2));
	const prevTrackedTotal = Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0);
	let baseRechargeTotal = Number.isFinite(prevTrackedTotal) && prevTrackedTotal > 0 ? prevTrackedTotal : 0;
	if (baseRechargeTotal <= 0 && addPaidYuan > 0) {
		const logRes = await operationLogCollection
			.where({
				user_id: merchant.user_id || merchant._id,
				action: 'h5_quota_recharge',
				refunded: false
			})
			.field({ package_price: true })
			.limit(500)
			.get();
		let fromLogs = 0;
		(logRes.data || []).forEach((x) => {
			fromLogs += Number(x.package_price || 0);
		});
		baseRechargeTotal = Number(fromLogs.toFixed(2));
	}
	const nextRechargeTotalYuan = Number((baseRechargeTotal + addPaidYuan).toFixed(2));
	const targetMembershipName = safeText(custom.target_membership_name || '', 40);
	let nextMembershipName = targetMembershipName;
	if (!nextMembershipName) {
		if (targetReward >= 7600 || Number(custom.target_quota || 0) >= 2000000 || targetPrice >= 1000) nextMembershipName = '钻石会员';
		else if (targetReward >= 5700 || Number(custom.target_quota || 0) >= 1500000 || targetPrice >= 800) nextMembershipName = '铂金会员';
		else if (targetReward >= 3800 || Number(custom.target_quota || 0) >= 1000000 || targetPrice >= 600 || targetPrice === 0.1) nextMembershipName = '白金会员';
	}
	if (isNormalMemberForUpgradePointsClear(merchant)) {
		await clearNormalMemberPointsAndFrozenOnUpgrade(merchant, {
			now,
			upgradeKind: 'paid_recharge',
			targetMembershipName: nextMembershipName || targetMembershipName || '充值会员',
			orderNo: sourceOrder.out_trade_no || sourceOrder.order_no || '',
			operatorSource: 'h5',
			operator: 'wxpay_notify'
		});
	}
	await merchantCollection.doc(merchant._id).update({
		remaining_quota: afterRem,
		available_reward: nextAvailableReward,
		withdraw_quota_balance: nextAvailableReward,
		estimated_free_quota: Number(custom.target_quota || 0),
		recharge_package_id: custom.package_id || '',
		recharge_package_price: targetPrice,
		recharge_package_quota: Number(custom.target_quota || 0),
		recharge_package_reward: Number((targetReward > 0 ? targetReward : grantYuanByRechargePrice(targetPrice, biz.rechargeRules)) || 0),
		recharge_cycle_start: now,
		recharge_cycle_days: Number(refundCycle.cycleDays || 180),
		recharge_window_days: Number(refundCycle.windowDays || 3),
		recharge_total_yuan: nextRechargeTotalYuan,
		recharge_amount: nextRechargeTotalYuan,
		membership_name: nextMembershipName || merchant.membership_name || '',
		recharge_update_time: now,
		update_time: now
	});
	const logOperatorSource = safeText(custom.operator_source, 20) || 'h5';
	const logOperator = safeText(custom.operator, 80) || 'wxpay_notify';
	const logContent =
		safeText(custom.log_content, 300) ||
		`H5额度充值: ${custom.package_title || ''}, 免门槛权益额度+${grantDelta}元(交易量配置+${volAdd})`;
	await operationLogCollection.add({
		user_id: merchant.user_id || merchant._id,
		user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
		action: 'h5_quota_recharge',
		module: 'finance',
		target_id: merchant._id,
		target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
		content: logContent,
		operator_source: logOperatorSource,
		operator: logOperator,
		platform_no: sourceOrder.out_trade_no || sourceOrder.order_no || '',
		package_id: custom.package_id || '',
		package_title: custom.package_title || '',
		package_price: Number(custom.paid_amount || 0),
		package_total_price: targetPrice,
		package_before_price: beforePrice,
		package_quota: Number(custom.target_quota || 0),
		package_add_quota: volAdd,
		package_grant_yuan: grantDelta,
		refunded: false,
		create_time: now
	});
	if (sourceOrder._id) {
		try {
			await maybeCreateRechargeGiftShipment(sourceOrder, merchant, now);
		} catch (e) {
			console.error('maybeCreateRechargeGiftShipment failed', e);
		}
		await uniPayOrderCollection.doc(sourceOrder._id).update({
			custom: {
				...custom,
				recharge_applied: true,
				recharge_applied_at: now
			},
			update_date: now
		});
	}
	await invalidateH5MerchantCaches(merchant);
}

/**
 * H5 Mock 登录开关：
 * - HSY_ALLOW_H5_MOCK=1：显式开启（开发/测试云空间推荐）
 * - HSY_ALLOW_H5_MOCK=0：显式关闭（正式云空间必须配置）
 * - 未配置时：允许云函数 NODE_ENV=development，或客户端开发构建传入 h5DevMock
 */
function isH5MockAuthAllowed(data) {
	if (process.env.HSY_ALLOW_H5_MOCK === '1') return true;
	if (process.env.HSY_ALLOW_H5_MOCK === '0') return false;
	if (process.env.NODE_ENV === 'development') return true;
	if (data && data.h5DevMock === true) return true;
	return false;
}

function pickAuthProfile(data) {
	const authMode = safeText(data?.authMode || 'mock', 20) || 'mock';
	if (authMode === 'mock' && !isH5MockAuthAllowed(data)) {
		return { authMode: 'mock', blocked: true };
	}
	if (authMode === 'wechat') {
		// 真授权阶段由网关完成 code->openid/手机号换取；这里保留兼容入参。
		const openid = safeText(data?.openid, 80);
		const nickname = safeText(data?.wxNickname || data?.nickname, 60);
		const avatar = safeText(data?.wxAvatar || data?.avatar, 500);
		const mobile = safeText(data?.mobile, 20);
		return { authMode, openid, nickname, avatar, mobile };
	}
	const mockMobile = safeText(data?.mobile || '', 20);
	// 本地调试默认固定 openid，避免每次 Mock 都新建商户；可用入参或 HSY_H5_MOCK_OPENID 覆盖
	const fixedMockOpenid = safeText(process.env.HSY_H5_MOCK_OPENID || 'mock_dev_test', 80) || 'mock_dev_test';
	const openid = safeText(
		data?.openid || (mockMobile ? `mock_${mockMobile}` : fixedMockOpenid),
		80
	);
	return {
		authMode: 'mock',
		openid,
		nickname: safeText(data?.wxNickname || data?.nickname || 'test', 60),
		avatar: safeText(data?.wxAvatar || data?.avatar || '', 500),
		mobile: mockMobile
	};
}

/** 最后登录写入最短间隔，避免首页缓存刷新频繁写库 */
const MERCHANT_LOGIN_TOUCH_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 记录最后登录时间（并重置登录周优化进度，与鉴权登录一致）。
 * @param {object} merchant 商户文档（需含 _id、login_time）
 * @param {{ force?: boolean }} options force=true 时忽略节流（鉴权登录用）
 */
async function markMerchantLastLogin(merchant, options = {}) {
	if (!merchant || !merchant._id) return false;
	const now = nowTs();
	const force = !!(options && options.force);
	const prev = Number(merchant.login_time) || 0;
	if (!force && prev > 0 && now - prev < MERCHANT_LOGIN_TOUCH_MIN_INTERVAL_MS) {
		return false;
	}
	try {
		await merchantCollection.doc(merchant._id).update({
			login_time: now,
			points_opt_week_applied: 0
		});
		merchant.login_time = now;
		merchant.points_opt_week_applied = 0;
		return true;
	} catch (e) {
		console.error('markMerchantLastLogin', e);
		return false;
	}
}

async function upsertMerchantByAuth(profile) {
	const now = nowTs();
	const where = profile.openid ? { wx_openid: profile.openid } : { mobile: profile.mobile };
	const existing = await merchantCollection.where(where).limit(1).get();
	if (existing.data && existing.data.length) {
		const row = existing.data[0];
		await merchantCollection.doc(row._id).update({
			wx_openid: profile.openid || row.wx_openid || '',
			wx_nickname: profile.nickname || row.wx_nickname || '',
			wx_avatar: profile.avatar || row.wx_avatar || '',
			mobile: profile.mobile || row.mobile || '',
			login_time: now,
			// 登录周优化：重置相对锚点进度，已砍待返金额不恢复
			points_opt_week_applied: 0
		});
		return { id: row._id, userId: row.user_id || row._id, created: false };
	}

	const userId = `h5_${now}_${Math.random().toString(36).slice(2, 8)}`;
	const doc = {
		user_id: userId,
		wx_openid: profile.openid || '',
		wx_nickname: profile.nickname || '微信用户',
		wx_avatar: profile.avatar || '',
		mobile: profile.mobile || '',
		device_id: '',
		brand_name: '',
		agreement_img: '',
		agreement_signed_at: null,
		agreement_version: '',
		agreement_signed_ip: '',
		agreement_sign_device: '',
		remaining_quota: 0,
		pending_withdraw: 0,
		withdrawn: 0,
		frozen_amount: 0,
		coupon_count: 0,
		available_reward: 0,
		withdraw_quota_balance: 0,
		estimated_free_quota: 0,
		account_points: 0,
		withdraw_pending_balance: 0,
		use_status: 1,
		status: true,
		flag1: true,
		flag2: true,
		flag3: true,
		micro_merchant: true,
		login_time: now
	};
	const addRes = await merchantCollection.add(doc);
	return { id: addRes.id, userId, created: true };
}

/**
 * 按 _id / user_id / mobile / 设备号 查商户。
 * 默认不返回 agreement_img（历史 base64 单文档可达数 MB；新签署存 cloud://，仍建议按需拉取）。
 * 需要协议图时传 { includeAgreementImg: true }。
 */
async function getMerchantByIdOrUserId(key, options = {}) {
	const val = safeText(key, 120);
	if (!val) return null;
	const includeAgreementImg = options.includeAgreementImg === true;
	const applyField = (q) => (includeAgreementImg ? q : q.field({ agreement_img: false }));
	const ors = [{ _id: val }, { user_id: val }];
	if (isValidCnMobile(val)) ors.push({ mobile: val });
	const res = await applyField(merchantCollection.where(db.command.or(ors)).limit(1)).get();
	if (res.data && res.data.length) return res.data[0];
	const mRes = await machineCollection
		.where({ device_id: val, is_deleted: false, is_bound: 1 })
		.field({ bind_user_id: true })
		.limit(1)
		.get();
	const bindUid = mRes.data && mRes.data[0] && mRes.data[0].bind_user_id ? String(mRes.data[0].bind_user_id).trim() : '';
	if (!bindUid) return null;
	const res2 = await applyField(
		merchantCollection.where(db.command.or([{ user_id: bindUid }, { _id: bindUid }])).limit(1)
	).get();
	if (res2.data && res2.data.length) return res2.data[0];
	return null;
}

function compactMerchantInfo(row, options = {}) {
	const includeAgreementImg = !!options.includeAgreementImg;
	const quotaBalance = normalizeWithdrawQuotaBalance(row);
	const pendingBalance = normalizePendingBalance(row);
	const rechargeAmount = Number(row.recharge_amount != null ? row.recharge_amount : row.recharge_total_yuan || 0);
	const hasAgreementSigned =
		!!String(row.agreement_img || '').trim() || Number(row.agreement_signed_at || 0) > 0;
	const h5Mem = options.h5Membership;
	const membershipName =
		h5Mem && typeof h5Mem.name === 'string' && String(h5Mem.name).trim()
			? safeText(h5Mem.name, 40)
			: safeText(row.membership_name || '', 40) || '普通会员';
	return {
		id: row._id,
		userId: row.user_id || row._id,
		wxNickname: row.wx_nickname || '',
		wxAvatar: row.wx_avatar || '',
		mobile: row.mobile || '',
		deviceId: row.device_id || '',
		brandName: row.brand_name || '',
		agreementImg: includeAgreementImg ? (row.agreement_img || '') : '',
		agreementSigned: hasAgreementSigned,
		agreementSignedAt: formatTime(row.agreement_signed_at),
		agreementVersion: row.agreement_version || '',
		availableReward: quotaBalance,
		estimatedFreeQuota: Number(row.estimated_free_quota || 0),
		accountPoints: pendingBalance,
		membershipName,
		rechargeAmount: Number(Number(rechargeAmount || 0).toFixed(2))
	};
}

async function ensureMerchantRechargeAmountAccurate(merchant) {
	try {
		if (!merchant || !merchant._id) return merchant;
		const current = Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0);
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		if (!merchantUserId) return merchant;
		const logRes = await operationLogCollection
			.where({
				user_id: merchantUserId,
				action: 'h5_quota_recharge',
				refunded: false
			})
			.field({ package_price: true, platform_no: true, create_time: true })
			.limit(1000)
			.get();
		const rows = (logRes.data || []).slice().sort((a, b) => Number(a.create_time || 0) - Number(b.create_time || 0));
		const seenTradeNo = new Set();
		let trackedByLogs = 0;
		rows.forEach((x, idx) => {
			const tradeNo = safeText(x.platform_no || '', 80) || `idx_${idx}`;
			if (seenTradeNo.has(tradeNo)) return;
			seenTradeNo.add(tradeNo);
			trackedByLogs += Number(x.package_price || 0);
		});
		const tracked = Number(trackedByLogs.toFixed(2));
		if (!(Number.isFinite(tracked) && tracked > 0)) return merchant;
		if (Math.abs(current - tracked) < 0.0001) return merchant;
		await merchantCollection.doc(merchant._id).update({
			recharge_amount: tracked,
			recharge_total_yuan: tracked,
			update_time: nowTs()
		});
		return {
			...merchant,
			recharge_amount: tracked,
			recharge_total_yuan: tracked
		};
	} catch (e) {
		console.error('ensureMerchantRechargeAmountAccurate failed', e);
		return merchant;
	}
}

function rawWithdrawQuotaBalance(row) {
	if (!row) return 0;
	if (row.withdraw_quota_balance != null && row.withdraw_quota_balance !== '') {
		return Number(row.withdraw_quota_balance || 0);
	}
	return Number(row.available_reward || 0);
}

function normalizeWithdrawQuotaBalance(row) {
	let balance = rawWithdrawQuotaBalance(row);
	const rewardCap = Number(row?.recharge_package_reward || 0);
	// 兼容历史脏数据：充值额度不应叠加账号积分
	if (rewardCap > 0 && balance > rewardCap && Number(row?.recharge_total_yuan || 0) > 0) {
		balance = rewardCap;
	}
	return Math.max(0, Number(Number(balance).toFixed(2)));
}

function normalizeAdminRemainingQuota(row) {
	// 后台「剩余额度」统一读 withdraw_quota_balance / available_reward，随提现扣减；兑换码白银 H5 仍对外隐藏。
	return normalizeWithdrawQuotaBalance(row);
}

function rawPendingBalance(row) {
	if (!row) return 0;
	if (row.withdraw_pending_balance != null && row.withdraw_pending_balance !== '') {
		return Number(row.withdraw_pending_balance || 0);
	}
	return Number(row.account_points || 0);
}

function normalizePendingBalance(row) {
	return Number(Number(rawPendingBalance(row)).toFixed(2));
}

const CURRENT_AGREEMENT_CACHE_MS = 30000;
let currentAgreementCache = { at: 0, doc: undefined };
async function getCurrentAgreement() {
	const now = Date.now();
	if (currentAgreementCache.at > 0 && now - currentAgreementCache.at < CURRENT_AGREEMENT_CACHE_MS) {
		return currentAgreementCache.doc;
	}
	const rHit = await redisH5.h5RedisGetJson(REDIS_KEY_AGR);
	if (rHit && rHit.__none) {
		currentAgreementCache = { at: now, doc: null };
		return null;
	}
	if (rHit && rHit._id) {
		currentAgreementCache = { at: now, doc: rHit };
		return rHit;
	}
	const res = await agreementCollection
		.where({ is_deleted: false, is_current: true })
		.orderBy('create_time', 'desc')
		.limit(1)
		.get();
	const doc = res.data && res.data[0] ? res.data[0] : null;
	currentAgreementCache = { at: now, doc };
	if (doc) {
		await redisH5.h5RedisSetJson(REDIS_KEY_AGR, doc, REDIS_EX_AGR_SEC);
	} else {
		await redisH5.h5RedisSetJson(REDIS_KEY_AGR, { __none: true }, 12);
	}
	return doc;
}

function isMerchantAgreementSatisfied(merchant, agreement) {
	const hasSignedImage = !!String(merchant?.agreement_img || '').trim();
	const hasSignedRecord = Number(merchant?.agreement_signed_at || 0) > 0;
	const baseOk = hasSignedImage || hasSignedRecord;
	if (!agreement) return baseOk;
	if (!baseOk) return false;
	if (!agreement.notify_all_resign) return true;
	const curVersion = String(agreement.version || '').trim();
	if (!curVersion) return true;
	return String(merchant?.agreement_version || '').trim() === curVersion;
}

async function listBoundMachinesByMerchant(merchant) {
	const ids = [String(merchant?.user_id || '').trim(), String(merchant?._id || '').trim()].filter(Boolean);
	const uniqIds = [...new Set(ids)];
	if (!uniqIds.length) return [];
	const res = await machineCollection
		.where({
			is_deleted: false,
			is_bound: 1,
			bind_user_id: uniqIds.length === 1 ? uniqIds[0] : db.command.in(uniqIds)
		})
		.field({ _id: true, device_id: true, brand_name: true, company: true, salesman: true, bind_time: true })
		.limit(200)
		.get();
	return res.data || [];
}

async function merchantHasBoundMachine(merchant) {
	const rows = await listBoundMachinesByMerchant(merchant);
	return rows.length > 0;
}

async function refreshMerchantPrimaryMachine(merchantId) {
	const merchant = await getMerchantByIdOrUserId(merchantId);
	if (!merchant) return null;
	const rows = await listBoundMachinesByMerchant(merchant);
	if (!rows.length) {
		await merchantCollection.doc(merchant._id).update({
			device_id: '',
			brand_name: '',
			bind_time: null,
			update_time: nowTs()
		});
		return null;
	}
	const primary = rows.slice().sort((a, b) => Number(b.bind_time || 0) - Number(a.bind_time || 0))[0];
	await merchantCollection.doc(merchant._id).update({
		device_id: safeText(primary.device_id || '', 80),
		brand_name: safeText(primary.brand_name || '', 80),
		bind_time: Number(primary.bind_time || nowTs()),
		update_time: nowTs()
	});
	return primary;
}

function pickPrimaryBoundMachine(merchant, machines) {
	const arr = Array.isArray(machines) ? machines : [];
	if (!arr.length) return null;
	const preferId = String(merchant?.device_id || '').trim();
	if (preferId) {
		const hit = arr.find((x) => String(x.device_id || '').trim() === preferId);
		if (hit) return hit;
	}
	return arr
		.slice()
		.sort((a, b) => Number(b.bind_time || 0) - Number(a.bind_time || 0))[0];
}

function isValidCnMobile(m) {
	return /^1\d{10}$/.test(String(m || '').trim());
}

function needBindMobileFlag(row) {
	return !isValidCnMobile(row?.mobile);
}

/** 手机号在 hsy-merchant-users 全库唯一（排除当前商户 _id） */
async function assertMobileUniqueAmongMerchants(merchantId, mobile) {
	const m = safeText(mobile, 20);
	if (!m) return null;
	const dup = await merchantCollection
		.where({
			mobile: m,
			_id: db.command.neq(merchantId)
		})
		.limit(1)
		.get();
	if (dup.data && dup.data.length) {
		return { code: 400, message: '该手机号已被系统内其他商户使用，请更换' };
	}
	return null;
}

async function wxOAuthAccessToken(code) {
	const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(
		WX_MP_APPID
	)}&secret=${encodeURIComponent(WX_MP_APPSECRET)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
	const res = await uniCloud.httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 15000 });
	const data = res.data || {};
	if (data.errcode) {
		throw new Error(data.errmsg || `微信授权错误(${data.errcode})`);
	}
	return data;
}

async function wxOAuthUserInfo(accessToken, openid) {
	const url = `https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(
		accessToken
	)}&openid=${encodeURIComponent(openid)}&lang=zh_CN`;
	const res = await uniCloud.httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 15000 });
	const data = res.data || {};
	if (data.errcode) {
		throw new Error(data.errmsg || `获取用户信息失败(${data.errcode})`);
	}
	return data;
}

/** 微信网页授权：code -> openid + 用户信息（snsapi_userinfo） */
async function h5WechatLogin(data) {
	try {
		const code = safeText(data?.code, 200);
		if (!code) {
			return { code: 400, message: '缺少微信授权 code' };
		}
		if (!WX_MP_APPSECRET) {
			return { code: 500, message: '服务端未配置 WX_MP_APPSECRET，请在云函数环境变量中配置公众号 AppSecret' };
		}
		const tokenJson = await wxOAuthAccessToken(code);
		const accessToken = tokenJson.access_token;
		const openid = tokenJson.openid;
		if (!accessToken || !openid) {
			return { code: 400, message: '微信授权未返回有效身份' };
		}
		let nickname = '微信用户';
		let avatar = '';
		try {
			const ui = await wxOAuthUserInfo(accessToken, openid);
			nickname = safeText(ui.nickname, 60) || nickname;
			avatar = safeText(ui.headimgurl, 500) || '';
		} catch (e) {
			console.warn('wxOAuthUserInfo', e);
		}

		const profile = {
			authMode: 'wechat',
			openid,
			nickname,
			avatar,
			mobile: ''
		};
		const upsertRes = await upsertMerchantByAuth(profile);
		const merchant = await getMerchantByIdOrUserId(upsertRes.id);
		const hasBound = await merchantHasBoundMachine(merchant);
		const bizUi = await getBizSettings();
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: 'wechat',
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !hasBound,
				h5UiStyle: String(bizUi.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A',
				merchant: compactMerchantInfo(merchant)
			}
		};
	} catch (e) {
		console.error('h5WechatLogin failed', e);
		return { code: 500, message: e.message || '微信登录失败' };
	}
}

async function h5SendBindMobileCode(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const mobile = safeText(data?.mobile, 20);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!isValidCnMobile(mobile)) {
			return { code: 400, message: '请输入正确手机号' };
		}
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };

		const dupErr = await assertMobileUniqueAmongMerchants(merchant._id, mobile);
		if (dupErr) return dupErr;

		const codeStr = String(Math.floor(100000 + Math.random() * 900000));
		const now = nowTs();
		const expireAt = now + MOBILE_CODE_TTL_MS;
		await mobileCodeCollection.where({ merchant_id: merchant._id }).remove();
		await mobileCodeCollection.add({
			merchant_id: merchant._id,
			mobile,
			code: codeStr,
			expire_at: expireAt,
			create_time: now
		});

		if (SMS_KEY && SMS_SECRET && SMS_TEMPLATE_ID) {
			try {
				await uniCloud.sendSms({
					smsKey: SMS_KEY,
					smsSecret: SMS_SECRET,
					phone: mobile,
					templateId: SMS_TEMPLATE_ID,
					data: {
						name: SMS_NAME,
						code: codeStr,
						expMinute: '5'
					}
				});
			} catch (e) {
				console.error('sendSms', e);
				return { code: 500, message: '短信发送失败，请稍后重试或检查短信配置' };
			}
		} else {
			console.warn('[H5] 未配置短信：H5_BIND_MOBILE_TEMPLATE_ID / DCLOUD_SMS_KEY / DCLOUD_SMS_SECRET，验证码仅日志可见');
			console.warn('[H5] bind mobile code for', mobile, codeStr);
			return {
				code: 503,
				message:
					'短信通道未配置：请在 uniCloud 控制台为云函数配置 DCLOUD_SMS_KEY、DCLOUD_SMS_SECRET、H5_BIND_MOBILE_TEMPLATE_ID（或使用环境变量 SMS_KEY/SMS_SECRET）'
			};
		}

		return { code: 0, message: '验证码已发送' };
	} catch (e) {
		console.error('h5SendBindMobileCode failed', e);
		return { code: 500, message: '发送失败' };
	}
}

async function h5BindMobileVerify(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const mobile = safeText(data?.mobile, 20);
		const codeStr = safeText(data?.code, 10);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!isValidCnMobile(mobile)) {
			return { code: 400, message: '请输入正确手机号' };
		}
		if (!/^\d{6}$/.test(codeStr)) {
			return { code: 400, message: '请输入6位验证码' };
		}

		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };

		const dupErr = await assertMobileUniqueAmongMerchants(merchant._id, mobile);
		if (dupErr) return dupErr;

		const rec = await mobileCodeCollection
			.where({ merchant_id: merchant._id, mobile, code: codeStr })
			.limit(1)
			.get();
		if (!rec.data || !rec.data.length) {
			return { code: 400, message: '验证码错误或已过期' };
		}
		const row = rec.data[0];
		if (Number(row.expire_at) < nowTs()) {
			await mobileCodeCollection.doc(row._id).remove();
			return { code: 400, message: '验证码已过期，请重新获取' };
		}

		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			mobile,
			login_time: now
		});
		await mobileCodeCollection.doc(row._id).remove();

		const latest = await getMerchantByIdOrUserId(merchant._id);
		const hasBound = await merchantHasBoundMachine(latest);
		return {
			code: 0,
			message: '绑定成功',
			data: {
				needBindMobile: needBindMobileFlag(latest),
				needBind: !hasBound,
				merchant: compactMerchantInfo(latest)
			}
		};
	} catch (e) {
		console.error('h5BindMobileVerify failed', e);
		return { code: 500, message: '绑定失败' };
	}
}

/** 无短信验证：用户自行填写手机号（仍校验格式与全库唯一） */
async function h5SetMobileDirect(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const mobile = safeText(data?.mobile, 20);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!isValidCnMobile(mobile)) {
			return { code: 400, message: '请输入11位中国大陆手机号' };
		}
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const dupErr = await assertMobileUniqueAmongMerchants(merchant._id, mobile);
		if (dupErr) return dupErr;
		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			mobile,
			login_time: now,
			update_time: now
		});
		const latest = await getMerchantByIdOrUserId(merchant._id);
		return {
			code: 0,
			message: '保存成功',
			data: {
				needBindMobile: needBindMobileFlag(latest),
				merchant: compactMerchantInfo(latest)
			}
		};
	} catch (e) {
		console.error('h5SetMobileDirect failed', e);
		return { code: 500, message: '保存失败' };
	}
}

async function h5AuthSync(data) {
	try {
		const profile = pickAuthProfile(data);
		if (profile.blocked) {
			return {
				code: 403,
				message:
					process.env.HSY_ALLOW_H5_MOCK === '0'
						? 'Mock 登录已关闭（正式环境）。请使用微信打开并完成授权登录'
						: 'Mock 登录未开启：请在云函数 merchant 环境变量配置 HSY_ALLOW_H5_MOCK=1，或使用微信授权登录'
			};
		}
		if (!profile.openid) {
			return { code: 400, message: '未获取到用户身份信息，请重试' };
		}
		const upsertRes = await upsertMerchantByAuth(profile);
		let merchant = await getMerchantByIdOrUserId(upsertRes.id);
		const hasBound = await merchantHasBoundMachine(merchant);
		if (hasBound) {
			await refreshMerchantPrimaryMachine(merchant._id);
			merchant = await getMerchantByIdOrUserId(upsertRes.id);
		}
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: profile.authMode,
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !hasBound,
				h5UiStyle: String((await getBizSettings()).h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A',
				merchant: compactMerchantInfo(merchant)
			}
		};
	} catch (e) {
		console.error('h5AuthSync failed', e);
		return { code: 500, message: '登录失败' };
	}
}

async function h5BindMachine(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const deviceId = safeText(data?.deviceId, 80);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!deviceId) return { code: 400, message: '请输入机具号码' };

		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };

		const oldDeviceId = safeText(merchant.device_id, 80);
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const alreadyBoundRes = await machineCollection
			.where({ device_id: deviceId, is_deleted: false, is_bound: 1, bind_user_id: merchantUserId })
			.limit(1)
			.get();
		if (alreadyBoundRes.data && alreadyBoundRes.data.length) {
			const latest = await getMerchantByIdOrUserId(merchant._id);
			return { code: 0, message: '已是当前绑定的码牌', data: { merchant: compactMerchantInfo(latest), unchanged: true } };
		}

		const mRes = await machineCollection.where({ device_id: deviceId, is_deleted: false }).limit(1).get();
		if (!mRes.data || !mRes.data.length) {
			return { code: 404, message: '机具不存在，请核对机具号码' };
		}
		const machine = mRes.data[0];
		if (machine.is_bound === 1 && machine.bind_user_id && machine.bind_user_id !== (merchant.user_id || merchant._id)) {
			return { code: 400, message: '该机具已被其他商户绑定' };
		}

		const now = nowTs();

		await merchantCollection.doc(merchant._id).update({
			device_id: deviceId,
			brand_name: machine.brand_name || '',
			bind_time: now,
			login_time: now
		});
		await machineCollection.doc(machine._id).update({
			is_bound: 1,
			bind_time: now,
			bind_user_id: merchantUserId,
			bind_user_name: merchant.wx_nickname || '',
			bind_user_mobile: merchant.mobile || ''
		});

		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
			action: safeText(data?.operatorSource, 20) === 'admin' ? 'admin_bind_machine' : 'h5_bind_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: oldDeviceId ? `新增绑定码牌：${deviceId}` : `绑定码牌：${deviceId}`,
			operator_source: safeText(data?.operatorSource, 20) || 'h5',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});

		const latest = await getMerchantByIdOrUserId(merchant._id);
		return { code: 0, message: '绑定成功', data: { merchant: compactMerchantInfo(latest) } };
	} catch (e) {
		console.error('h5BindMachine failed', e);
		return { code: 500, message: '绑定失败' };
	}
}

async function h5MachineBindingList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const rows = await listBoundMachinesByMerchant(merchant);
		const primaryId = safeText(merchant.device_id, 80);
		const list = rows
			.slice()
			.sort((a, b) => Number(b.bind_time || 0) - Number(a.bind_time || 0))
			.map((m) => {
				const deviceId = safeText(m.device_id, 80);
				return {
					id: String(m._id || ''),
					deviceId,
					brandName: safeText(m.brand_name || '', 80),
					company: safeText(m.company || '', 80),
					salesman: safeText(m.salesman || '', 80),
					bindTime: Number(m.bind_time || 0),
					bindTimeText: formatTime(m.bind_time),
					isPrimary: deviceId && deviceId === primaryId
				};
			});
		return {
			code: 0,
			message: 'ok',
			data: {
				currentDeviceId: primaryId,
				list,
				total: list.length
			}
		};
	} catch (e) {
		console.error('h5MachineBindingList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function h5UnbindMachine(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const deviceId = safeText(data?.deviceId, 80);
		if (!deviceId) return { code: 400, message: '缺少机具号' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserIds = [String(merchant.user_id || '').trim(), String(merchant._id || '').trim()].filter(Boolean);
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const r = await machineCollection
			.where({
				device_id: deviceId,
				is_deleted: false,
				is_bound: 1,
				bind_user_id: merchantUserIds.length === 1 ? merchantUserIds[0] : db.command.in(merchantUserIds)
			})
			.limit(1)
			.get();
		if (!r.data || !r.data.length) return { code: 400, message: '该机具未绑定到当前账号' };
		const row = r.data[0];
		const now = nowTs();
		await machineCollection.doc(row._id).update({
			is_bound: 2,
			bind_time: null,
			unbind_time: now,
			bind_user_id: '',
			bind_user_name: '',
			bind_user_mobile: ''
		});
		await machineTradeCollection.where({ device_id: deviceId, is_deleted: db.command.neq(true) }).update({
			is_deleted: true,
			delete_time: now
		});
		await refreshMerchantPrimaryMachine(merchant._id);
		await operationLogCollection.add({
			user_id: merchantUserId,
			user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
			action: safeText(data?.operatorSource, 20) === 'admin' ? 'admin_unbind_machine' : 'h5_unbind_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `解绑码牌：${deviceId}`,
			operator_source: safeText(data?.operatorSource, 20) || 'h5',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});
		return { code: 0, message: '解绑成功' };
	} catch (e) {
		console.error('h5UnbindMachine failed', e);
		return { code: 500, message: '解绑失败' };
	}
}

async function adminMerchantMachineSetPrimary(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const deviceId = safeText(data?.deviceId, 80);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!deviceId) return { code: 400, message: '缺少机具号' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const rows = await listBoundMachinesByMerchant(merchant);
		const hit = rows.find((m) => safeText(m.device_id, 80) === deviceId);
		if (!hit) return { code: 400, message: '该机具未绑定到该商户' };
		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			device_id: deviceId,
			brand_name: safeText(hit.brand_name || '', 80),
			bind_time: Number(hit.bind_time || now),
			update_time: now
		});
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || '商户',
			action: 'admin_set_primary_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `设为主码牌：${deviceId}`,
			operator_source: 'admin',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});
		return { code: 0, message: '已设为主码牌' };
	} catch (e) {
		console.error('adminMerchantMachineSetPrimary failed', e);
		return { code: 500, message: '设置失败' };
	}
}

async function adminMerchantMachineReplace(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const oldDeviceId = safeText(data?.oldDeviceId, 80);
		const newDeviceId = safeText(data?.newDeviceId || data?.deviceId, 80);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!oldDeviceId) return { code: 400, message: '缺少原机具号' };
		if (!newDeviceId) return { code: 400, message: '请输入新机具号' };
		if (oldDeviceId === newDeviceId) return { code: 400, message: '新机具号不能与原机具号相同' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserIds = [String(merchant.user_id || '').trim(), String(merchant._id || '').trim()].filter(Boolean);
		const oldRes = await machineCollection
			.where({
				device_id: oldDeviceId,
				is_deleted: false,
				is_bound: 1,
				bind_user_id: merchantUserIds.length === 1 ? merchantUserIds[0] : db.command.in(merchantUserIds)
			})
			.limit(1)
			.get();
		if (!oldRes.data || !oldRes.data.length) return { code: 400, message: '原机具未绑定到该商户' };

		const bindRes = await h5BindMachine(
			{ merchantUserId: merchantKey, deviceId: newDeviceId, operatorSource: 'admin' },
			event
		);
		if (bindRes.code !== 0) return bindRes;

		const unbindRes = await h5UnbindMachine(
			{ merchantUserId: merchantKey, deviceId: oldDeviceId, operatorSource: 'admin' },
			event
		);
		if (unbindRes.code !== 0) {
			return {
				code: 500,
				message: `新码牌已绑定，但原码牌解绑失败：${unbindRes.message || '请手动处理'}`
			};
		}

		const now = nowTs();
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || '商户',
			action: 'admin_replace_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `换绑码牌：${oldDeviceId} → ${newDeviceId}`,
			operator_source: 'admin',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});
		return { code: 0, message: '换绑成功' };
	} catch (e) {
		console.error('adminMerchantMachineReplace failed', e);
		return { code: 500, message: '换绑失败' };
	}
}

/** H5：码牌绑定/解绑记录（操作日志） */
async function h5MachineBindLogList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 20)));
		const skip = (page - 1) * pageSize;

		const res = await operationLogCollection
			.where({
				user_id: merchantUserId,
				action: db.command.in([
					'h5_bind_machine',
					'h5_unbind_machine',
					'unbind',
					'admin_bind_machine',
					'admin_unbind_machine',
					'admin_replace_machine',
					'admin_set_primary_machine'
				])
			})
			.orderBy('create_time', 'desc')
			.limit(500)
			.get();

		const all = res.data || [];
		const total = all.length;
		const slice = all.slice(skip, skip + pageSize);
		const list = slice.map((row) => ({
			id: String(row._id),
			action:
				row.action === 'unbind' || row.action === 'h5_unbind_machine' || row.action === 'admin_unbind_machine'
					? 'unbind'
					: 'bind',
			actionText:
				row.action === 'unbind' || row.action === 'h5_unbind_machine' || row.action === 'admin_unbind_machine'
					? '解除绑定'
					: row.action === 'admin_replace_machine'
						? '换绑'
						: row.action === 'admin_set_primary_machine'
							? '设为主码牌'
							: '绑定',
			content: safeText(row.content || '', 500),
			time: row.create_time,
			timeText: formatTime(row.create_time),
			reason: safeText(row.reason || '', 200),
			operatorSource: safeText(row.operator_source || '', 20)
		}));

		return {
			code: 0,
			message: 'ok',
			data: {
				list,
				total,
				page,
				pageSize
			}
		};
	} catch (e) {
		console.error('h5MachineBindLogList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

/** H5：财务流水，仅商户提现记录（不含充值/退款） */
async function h5FinanceRecords(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 20)));
		const now = nowTs();
		let winStart = Number(data?.startTs || 0);
		let winEnd = Number(data?.endTs || 0);
		if (!winEnd) winEnd = now;
		if (!winStart) winStart = winEnd - 365 * 24 * 60 * 60 * 1000;

		const merged = [];
		{
			const r = await withdrawCollection
				.where({ merchant_user_id: merchantUserId, is_deleted: false })
				.orderBy('create_time', 'desc')
				.limit(500)
				.get();
			for (const row of r.data || []) {
				const t = Number(row.create_time || 0);
				if (t < winStart || t > winEnd) continue;
				const transferState = normalizeTransferState(row.transfer_state || '');
				let st = '处理中';
				if (row.is_paid) st = '已打款';
				else if (row.arrival_status === 'received') st = '已到账';
				else if (row.arrival_status === 'returned') st = '已退回';
				else if (row.arrival_status === 'expired') st = '已失效';
				if (transferState === 'WAIT_USER_CONFIRM') st = '待确认收款';
				merged.push({
					recordType: 'withdraw',
					id: `w_${row._id}`,
					time: t,
					timeText: formatTime(t),
					title: '提现',
					subtitle: safeText(row.withdraw_no || '', 40),
					amount: Number(row.amount || 0).toFixed(2),
					amountLabel: '金额(元)',
					status: st,
					extra: {
						withdrawNo: row.withdraw_no || '',
						payable: Number(row.payable || 0).toFixed(2),
						deviceId: row.device_id || '',
						transferState,
						canConfirmReceipt: transferState === 'WAIT_USER_CONFIRM'
					}
				});
			}
		}

		merged.sort((a, b) => b.time - a.time);
		const total = merged.length;
		const startIdx = (page - 1) * pageSize;
		const list = merged.slice(startIdx, startIdx + pageSize);

		return {
			code: 0,
			message: 'ok',
			data: {
				list,
				total,
				page,
				pageSize,
				window: { startTs: winStart, endTs: winEnd }
			}
		};
	} catch (e) {
		console.error('h5FinanceRecords failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function h5WithdrawConfirmPackage(data) {
	try {
		await getBizSettings();
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const withdrawNo = safeText(data?.withdrawNo, 64);
		if (!withdrawNo) return { code: 400, message: '缺少提现单号' };
		const wr = await withdrawCollection
			.where({ merchant_user_id: merchantUserId, withdraw_no: withdrawNo, is_deleted: false })
			.limit(1)
			.get();
		const row = wr.data && wr.data[0];
		if (!row) return { code: 404, message: '提现记录不存在' };
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		let q = null;
		let state = normalizeTransferState(row.transfer_state || '');
		try {
			q = await wxPayQueryMerchantTransfer(wc, withdrawNo);
			state = normalizeTransferState(q?.state || q?.status || state);
			const qPkgEarly = pickTransferPackageInfo(q);
			await withdrawCollection.doc(row._id).update({
				transfer_state: state,
				wx_trade_no: safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80),
				...(qPkgEarly ? { package_info: safeText(qPkgEarly, 1200) } : {}),
				update_time: nowTs()
			});
		} catch (e) {
			await writeTransferLog({
				stage: 'h5_confirm_package_query_error',
				level: 'error',
				withdrawId: row._id,
				withdrawNo: row.withdraw_no,
				merchantUserId,
				openid: safeText(merchant.wx_openid, 100),
				outBillNo: withdrawNo,
				message: safeText(e?.message || '查询微信提现状态失败', 180)
			});
		}
		if (state === 'SUCCESS') {
			await settleWithdrawSuccess(row, safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80), state, {
				arrivalTime: parseWxTransferSuccessTs(q) || nowTs()
			});
			return { code: 400, message: '该笔提现已到账，无需确认收款' };
		}
		if (isWithdrawTerminalFailState(state)) {
			if (row.audit_required) {
				await markWithdrawFailNeedsReaudit(
					row,
					state,
					safeText(q?.fail_reason || q?.message || `微信提现失败：${state}`, 180),
					{ merchant }
				);
				return { code: 400, message: '该笔提现打款失败，已提交管理员重新审核' };
			}
			// 终态失败：自动提现单需回退已冻结积分，避免长时间占用可提现余额。
			if (safeText(row.arrival_status, 20) !== 'returned') {
				const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
				const amountPoints = Number(row.amount || 0);
				const merchantRes = await merchantCollection.where({ _id: merchant._id }).limit(1).get();
				const latestMerchant = merchantRes.data && merchantRes.data[0];
				if (latestMerchant) {
					await merchantCollection.doc(latestMerchant._id).update({
						available_reward: Number((rawWithdrawQuotaBalance(latestMerchant) + amountPoints).toFixed(4)),
						withdraw_quota_balance: Number((rawWithdrawQuotaBalance(latestMerchant) + amountPoints).toFixed(4)),
						account_points: Number((rawPendingBalance(latestMerchant) + amountPoints).toFixed(4)),
						withdraw_pending_balance: Number((rawPendingBalance(latestMerchant) + amountPoints).toFixed(4)),
						pending_withdraw: Number(Math.max(0, Number(latestMerchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
						update_time: nowTs()
					});
				}
				if (row.device_id) {
					const machineRes = await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get();
					const machine = machineRes.data && machineRes.data[0];
					if (machine) {
						await machineCollection.doc(machine._id).update({
							pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4))
						});
					}
				}
				await withdrawCollection.doc(row._id).update({
					arrival_status: 'returned',
					transfer_state: state,
					transfer_error: `微信提现失败：${state}`,
					update_time: nowTs()
				});
			}
			return { code: 400, message: `该笔提现当前状态为${state}，请联系管理员重试打款` };
		}
		const packageInfo = safeText(
			pickTransferPackageInfo(q) || pickTransferPackageInfo(row) || '',
			1200
		);
		if (state !== 'WAIT_USER_CONFIRM' || !packageInfo) {
			return { code: 400, message: '当前暂无可拉起的收款确认，请稍后再试' };
		}
		await withdrawCollection.doc(row._id).update({
			package_info: packageInfo,
			transfer_state: state,
			update_time: nowTs()
		});
		await writeTransferLog({
			stage: 'h5_confirm_package_ready',
			withdrawId: row._id,
			withdrawNo: row.withdraw_no,
			merchantUserId,
			openid: safeText(merchant.wx_openid, 100),
			outBillNo: withdrawNo,
			transferState: state,
			message: '返回用户确认收款拉起参数',
			payload: { hasPackage: true }
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				mchId: wc.mchId,
				appId: wc.appId,
				package: packageInfo,
				withdrawNo,
				state
			}
		};
	} catch (e) {
		console.error('h5WithdrawConfirmPackage failed', e);
		return { code: 500, message: '获取确认收款参数失败' };
	}
}

/**
 * 用户二次确认收款后：短轮询微信直到 SUCCESS 并立即本地到账（不再拖到零点补记）。
 */
async function h5WithdrawSyncAfterConfirm(data = {}) {
	try {
		await getBizSettings();
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const withdrawNo = safeText(data?.withdrawNo, 64);
		if (!withdrawNo) return { code: 400, message: '缺少提现单号' };

		const rounds = Math.min(12, Math.max(1, parseInt(String(data?.rounds || 8), 10) || 8));
		const intervalMs = Math.min(3000, Math.max(600, parseInt(String(data?.intervalMs || 1200), 10) || 1200));

		const wr = await withdrawCollection
			.where({ merchant_user_id: merchantUserId, withdraw_no: withdrawNo, is_deleted: false })
			.limit(1)
			.get();
		let row = wr.data && wr.data[0];
		if (!row) return { code: 404, message: '提现记录不存在' };

		if (row.is_paid || safeText(row.arrival_status, 20) === 'received') {
			return {
				code: 0,
				message: '已到账',
				data: {
					arrived: true,
					state: 'SUCCESS',
					arrivalTime: formatTime(row.arrival_time),
					withdrawNo
				}
			};
		}

		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		let lastState = normalizeTransferState(row.transfer_state || '');
		let lastQuery = null;

		for (let i = 0; i < rounds; i += 1) {
			if (i > 0) await sleepMs(intervalMs);
			try {
				const q = await wxPayQueryMerchantTransfer(wc, withdrawNo);
				lastQuery = q;
				lastState = normalizeTransferState(q?.state || q?.status || lastState);
				const billNo = safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80);
				const polledPkg = pickTransferPackageInfo(q);
				await withdrawCollection.doc(row._id).update({
					transfer_state: lastState,
					...(billNo ? { wx_trade_no: billNo } : {}),
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
				await writeTransferLog({
					stage: 'h5_confirm_after_poll',
					withdrawId: row._id,
					withdrawNo,
					merchantUserId,
					openid: safeText(merchant.wx_openid, 100),
					outBillNo: withdrawNo,
					transferState: lastState,
					message: `确认收款后查单(${i + 1}/${rounds})`,
					payload: q || {}
				});
				if (lastState === 'SUCCESS') {
					await settleWithdrawSuccess(row, billNo, lastState, {
						arrivalTime: parseWxTransferSuccessTs(q) || nowTs()
					});
					const fresh = await withdrawCollection.doc(row._id).get();
					const fr = fresh.data && fresh.data[0];
					return {
						code: 0,
						message: '已到账',
						data: {
							arrived: true,
							state: 'SUCCESS',
							arrivalTime: formatTime(fr?.arrival_time || parseWxTransferSuccessTs(q) || nowTs()),
							withdrawNo,
							roundsUsed: i + 1
						}
					};
				}
				if (isWithdrawTerminalFailState(lastState)) {
					if (row.audit_required) {
						await markWithdrawFailNeedsReaudit(
							row,
							lastState,
							safeText(q?.fail_reason || q?.message || lastState, 180),
							{ merchant }
						);
					} else if (safeText(row.arrival_status, 20) !== 'returned') {
						await restoreUnpaidWithdrawBalances(row);
						await withdrawCollection.doc(row._id).update({
							arrival_status: 'returned',
							transfer_state: lastState,
							transfer_error: safeText(q?.fail_reason || q?.message || `微信提现失败：${lastState}`, 180),
							update_time: nowTs()
						});
					}
					return {
						code: 400,
						message: `打款未成功：${lastState}`,
						data: { arrived: false, state: lastState, withdrawNo }
					};
				}
			} catch (e) {
				await writeTransferLog({
					stage: 'h5_confirm_after_poll_error',
					level: 'error',
					withdrawId: row._id,
					withdrawNo,
					merchantUserId,
					outBillNo: withdrawNo,
					message: safeText(e?.message || '确认后查单失败', 180)
				});
			}
			const freshRes = await withdrawCollection.doc(row._id).get();
			row = (freshRes.data && freshRes.data[0]) || row;
			if (row.is_paid || safeText(row.arrival_status, 20) === 'received') {
				return {
					code: 0,
					message: '已到账',
					data: {
						arrived: true,
						state: 'SUCCESS',
						arrivalTime: formatTime(row.arrival_time),
						withdrawNo
					}
				};
			}
		}

		return {
			code: 0,
			message: '确认已提交，到账状态同步中，请稍后刷新',
			data: {
				arrived: false,
				state: lastState || 'WAIT_USER_CONFIRM',
				withdrawNo,
				wxHint: lastQuery ? safeText(lastQuery.state || lastQuery.status || '', 40) : ''
			}
		};
	} catch (e) {
		console.error('h5WithdrawSyncAfterConfirm failed', e);
		return { code: 500, message: '同步到账状态失败' };
	}
}

/**
 * H5 打开财务管理时：同步本商户处理中的提现（含待确认收款后已 SUCCESS 但未本地到账）。
 */
async function h5WithdrawSyncMine(data = {}) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const limit = Math.min(15, Math.max(1, parseInt(String(data?.limit || 8), 10) || 8));
		const processingStates = ['PROCESSING', 'ACCEPTED', 'WAIT_USER_CONFIRM', 'UNKNOWN'];
		const res = await withdrawCollection
			.where({
				merchant_user_id: merchantUserId,
				is_deleted: false,
				is_paid: false,
				arrival_status: db.command.nin(['received', 'returned', 'expired']),
				transfer_state: db.command.in(processingStates)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		if (!rows.length) {
			return { code: 0, message: 'ok', data: { scanned: 0, success: 0, failed: 0 } };
		}
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		let success = 0;
		let failed = 0;
		for (const row of rows) {
			const outBillNo = safeText(row.withdraw_no, 64);
			if (!outBillNo) continue;
			try {
				const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
				const state = normalizeTransferState(q?.state || q?.status || row.transfer_state || 'UNKNOWN');
				const billNo = safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80);
				if (state === 'SUCCESS') {
					await settleWithdrawSuccess(row, billNo, state, {
						arrivalTime: parseWxTransferSuccessTs(q) || nowTs()
					});
					success += 1;
					continue;
				}
				if (isWithdrawTerminalFailState(state)) {
					if (row.audit_required) {
						await markWithdrawFailNeedsReaudit(
							row,
							state,
							safeText(q?.fail_reason || q?.message || state, 180),
							{ merchant }
						);
					} else if (safeText(row.arrival_status, 20) !== 'returned') {
						await restoreUnpaidWithdrawBalances(row);
						await withdrawCollection.doc(row._id).update({
							arrival_status: 'returned',
							transfer_state: state,
							transfer_error: safeText(q?.fail_reason || q?.message || `微信提现失败：${state}`, 180),
							wx_trade_no: billNo,
							update_time: nowTs()
						});
					}
					failed += 1;
					continue;
				}
				const polledPkg = pickTransferPackageInfo(q);
				await withdrawCollection.doc(row._id).update({
					transfer_state: state,
					wx_trade_no: billNo,
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
			} catch (e) {
				await writeTransferLog({
					stage: 'h5_sync_mine_error',
					level: 'error',
					withdrawId: row._id,
					withdrawNo: row.withdraw_no,
					merchantUserId,
					outBillNo,
					message: safeText(e?.message || '同步失败', 180)
				});
			}
		}
		return {
			code: 0,
			message: 'ok',
			data: { scanned: rows.length, success, failed }
		};
	} catch (e) {
		console.error('h5WithdrawSyncMine failed', e);
		return { code: 500, message: '同步失败' };
	}
}

async function h5MineInfo(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const unapplied = await uniPayOrderCollection
			.where({ user_id: merchantUserId, type: 'h5_quota_recharge', status: 1, user_order_success: true })
			.orderBy('create_date', 'desc')
			.limit(10)
			.get();
		for (const o of unapplied.data || []) {
			if (!(o.custom && o.custom.recharge_applied)) {
				await applyRechargeByOrder(o);
			}
		}
		merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		merchant = await ensureMerchantRechargeAmountAccurate(merchant);
		const bizEarly = await getBizSettings();
		const syncMine = await syncMerchantMembershipCycles(merchant, { biz: bizEarly, now: nowTs() });
		merchant = syncMine.merchant;
		const [boundMachines, biz, curAgreement, openTicket, rechargePackages] = await Promise.all([
			listBoundMachinesByMerchant(merchant),
			getBizSettings(),
			getCurrentAgreement(),
			feedbackFindOpenTicket(merchant._id),
			loadRechargePackagesFromQuota()
		]);
		const boundDeviceIds = [...new Set(boundMachines.map((m) => safeText(m.device_id, 80)).filter(Boolean))];
		const deviceDisplay = boundDeviceIds.length
			? `${boundDeviceIds.length}个码牌：${boundDeviceIds.join('、')}`
			: (safeText(merchant.device_id, 80) || '未绑定');
		const agreementNeedSign = !isMerchantAgreementSatisfied(merchant, curAgreement);
		const totalGrantedYuan = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		// 可用奖励口径：按提现申请积分总额扣减（与税费/到账净额无关）；白银 H5 仅展示 0
		const showAvailableReward = h5DisplayWithdrawQuotaRemainingYuan(merchant);
		const showPendingBalance = normalizePendingBalance(merchant);
		const now = nowTs();
		const silverEndAt = Number(merchant.silver_member_end_at || 0);
		const silverActive = isH5SilverMemberForWithdraw(merchant) && silverEndAt > now;
		let membership = h5MembershipInfo(merchant, rechargePackages);
		if (membership.tier === 'normal' && merchantHasRechargeMembership(merchant)) {
			const fixed = await resolveRechargeMembershipFallback(merchant, rechargePackages);
			if (fixed && fixed.tier && fixed.tier !== 'normal') {
				membership = fixed;
			}
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: compactMerchantInfo(merchant, { includeAgreementImg: false, h5Membership: membership }),
				device: {
					boundCount: boundDeviceIds.length,
					display: deviceDisplay
				},
				agreement: {
					needSign: agreementNeedSign,
					currentVersion: safeText(curAgreement?.version || '', 40),
					title: safeText(curAgreement?.title || '开户优惠活动计划书', 80),
					pdfFileId: safeText(curAgreement?.pdf_file_id || '', 500),
					notifyAllResign: !!curAgreement?.notify_all_resign
				},
				account: {
					availableReward: showAvailableReward.toFixed(2),
					estimatedFreeQuota: Number(merchant.estimated_free_quota || 0).toFixed(2),
					accountPoints: showPendingBalance.toFixed(2)
				},
				silver: {
					active: silverActive,
					expireAt: silverEndAt,
					remainingSec: silverActive ? Math.max(0, Math.floor((silverEndAt - now) / 1000)) : 0
				},
				feedback: {
					unreadReply: openTicket ? !!openTicket.user_unread_reply : false
				},
				servicePhone: safeText(biz?.servicePhone || DEFAULT_BIZ_SETTINGS.servicePhone, 30),
				h5UiStyle: String(biz.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A'
			}
		};
	} catch (e) {
		console.error('h5MineInfo failed', e);
		return { code: 500, message: '获取失败' };
	}
}

/** H5 专用：按需拉取签署快照（含协议图 URL），勿放入 h5MineInfo，避免拖慢「我的」页 */
async function h5AgreementSignedSnapshot(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		const merchant = await getMerchantByIdOrUserId(merchantKey, { includeAgreementImg: true });
		if (!merchant) return { code: 404, message: '商户不存在' };
		const curAgreement = await getCurrentAgreement();
		const needSign = !isMerchantAgreementSatisfied(merchant, curAgreement);
		const img = String(merchant.agreement_img || '').trim();
		const agreementSigned =
			!!img || Number(merchant.agreement_signed_at || 0) > 0;
		const displayUrl = img ? await resolveAgreementImgDisplayUrl(img) : '';
		return {
			code: 0,
			message: 'ok',
			data: {
				agreementImg: displayUrl || img,
				agreementSigned,
				agreementSignedAt: formatTime(merchant.agreement_signed_at),
				needSign
			}
		};
	} catch (e) {
		console.error('h5AgreementSignedSnapshot failed', e);
		return { code: 500, message: '加载失败' };
	}
}

const BIZ_SETTING_KEY = 'h5_biz_params';

async function loadPeriodLimitsFromStore() {
	try {
		const r = await periodLimitsCollection.where({ key: PERIOD_LIMITS_DOC_KEY }).limit(1).get();
		if (!(r.data && r.data[0])) return null;
		const d = r.data[0];
		return sanitizeBizSettings({
			withdrawPeriodLimits: {
				exchangeCoupon: d.exchangeCoupon,
				paidGoldPlatinum: d.paidGoldPlatinum,
				paidDiamond: d.paidDiamond
			}
		}).withdrawPeriodLimits;
	} catch (e) {
		console.error('loadPeriodLimitsFromStore failed', e);
		return null;
	}
}

async function savePeriodLimitsToStore(limits, operator = '') {
	const clean = sanitizeBizSettings({
		withdrawPeriodLimits: limits || {}
	}).withdrawPeriodLimits;
	const now = nowTs();
	const payload = {
		key: PERIOD_LIMITS_DOC_KEY,
		exchangeCoupon: clean.exchangeCoupon,
		paidGoldPlatinum: clean.paidGoldPlatinum,
		paidDiamond: clean.paidDiamond,
		update_time: now,
		update_user: safeText(operator, 80)
	};
	const r = await periodLimitsCollection.where({ key: PERIOD_LIMITS_DOC_KEY }).limit(1).get();
	if (r.data && r.data[0]) {
		await periodLimitsCollection.doc(r.data[0]._id).update(payload);
	} else {
		await periodLimitsCollection.add(payload);
	}
	return clean;
}

const DEFAULT_RECHARGE_RULES = [
	{ price: 600, rewardYuan: 3800, quota: 1000000, tip: '600元配置100万交易量，等于补贴市场价的3800元手续费' },
	{ price: 800, rewardYuan: 5700, quota: 1500000, tip: '800元配置150万交易量，等于补贴市场价的5700元手续费' },
	{
		price: 1000,
		rewardYuan: 7600,
		quota: 2000000,
		tip: '1000元配置200万交易量，等于补贴市场价的7600元手续费；另可在充值页任选蓝牙音响或扫码POS机一台（支付成功后发货）'
	}
];
/** H5「退款与周期」页规则说明，支持占位符 {cycleDays}、{windowDays}、{penaltyRate}（与参数配置中锁定周期/窗口/违约金一致） */
const DEFAULT_H5_REFUND_RULE_LINES = [
	'1）重置后 {cycleDays} 天内无法退款。',
	'2）满 {cycleDays} 天后，系统会自动给客户 {windowDays} 天提取时间；若客户在窗口期内未提取，额度将自动保留并顺延，系统继续配置对应额度，以此类推。',
	'3）如客户执意在 {cycleDays} 天内退款，将扣除 {penaltyRate}% 违约金后返还剩余款项。'
];

function sanitizeH5RefundRuleLines(raw) {
	const arr = Array.isArray(raw) ? raw : [];
	const lines = arr
		.map((x) => String(x == null ? '' : x).trim())
		.filter(Boolean)
		.slice(0, 20)
		.map((s) => s.slice(0, 800));
	return lines.length ? lines : DEFAULT_H5_REFUND_RULE_LINES.slice();
}

function formatH5RefundRuleLines(biz) {
	const rc = biz.refundCycle || {};
	const cycleDays = Math.max(1, Number(rc.cycleDays || DEFAULT_BIZ_SETTINGS.refundCycle.cycleDays));
	const windowDays = Math.max(1, Number(rc.windowDays || DEFAULT_BIZ_SETTINGS.refundCycle.windowDays));
	const penaltyRate = Math.max(
		0,
		Math.min(
			100,
			Number(biz.refundPenaltyRate != null ? biz.refundPenaltyRate : DEFAULT_BIZ_SETTINGS.refundPenaltyRate)
		)
	);
	const lines = sanitizeH5RefundRuleLines(biz.h5RefundRuleLines);
	return lines.map((line) =>
		String(line || '')
			.replace(/\{cycleDays\}/g, String(cycleDays))
			.replace(/\{windowDays\}/g, String(windowDays))
			.replace(/\{penaltyRate\}/g, String(penaltyRate))
	);
}

const DEFAULT_BIZ_SETTINGS = {
	rechargeRules: DEFAULT_RECHARGE_RULES,
	withdrawRange: { memberMin: 10, memberMax: 200, nonMemberMin: 30, nonMemberMax: 200 },
	withdrawMinByCount: {
		memberFirst5: 10,
		member6To10: 30,
		member11Plus: 50,
		nonMemberFirst3: 30,
		nonMember4To6: 50,
		nonMember7Plus: 100
	},
	/**
	 * 会员分档日/周累计提现上限（积分=元；0=不限制）
	 * - exchangeCoupon：兑换券/兑换码开通的非付费会员（业务所称「兑换券铂金」等）
	 * - paidGoldPlatinum：600 元黄金 / 800 元白金（含历史白金/铂金命名）
	 * - paidDiamond：1000 元钻石
	 * 周=北京时间周一至周日
	 */
	withdrawPeriodLimits: {
		exchangeCoupon: { dayMax: 200, weekMax: 300 },
		paidGoldPlatinum: { dayMax: 200, weekMax: 500 },
		paidDiamond: { dayMax: 200, weekMax: 500 }
	},
	withdrawAudit: { memberRequired: false, nonMemberRequired: false },
	/** H5 充值全额退款（商家转账）：与提现审核开关独立，逻辑一致（会员/非会员是否需后台同意后再打款） */
	refundTransferAudit: { memberRequired: false, nonMemberRequired: false },
	optimizeConfig: { enabled: true, thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 5 },
	/** 登录周积分优化总开关：默认关闭，仅管理端控制；H5 不展示 */
	pointsOptimizeLoginEnabled: false,
	/** H5 权益页待领取奖励自流水/生成时刻起的有效天数，到期后不再展示 */
	incomePacketClaimValidDays: 7,
	refundCycle: { cycleDays: 180, windowDays: 3 },
	refundPenaltyRate: 50,
	/** H5 充值退款商家转账拆单：单笔上限(元)，受 sanitize 限制在 0.01~500 */
	refundTransferSliceMaxYuan: 200,
	/** 后台退款列表「撤销同意(开发)」：仅联调用，生产务必保持 false（存业务参数表，无需云函数环境变量） */
	refundApproveRevokeDevEnabled: false,
	riskRates: { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 },
	testMerchantIds: [],
	servicePhone: '400-668-5796',
	/** H5 UI：A=紫色深色，B=明亮亮色 */
	h5UiStyle: 'A',
	h5RefundRuleLines: DEFAULT_H5_REFUND_RULE_LINES.slice(),
	wxPayMch: sanitizeWxPayMchSelection(null, resolveDefaultWxPayMchIds())
};
const BIZ_SETTINGS_CACHE_TTL_MS = 60000;

function sanitizeBizSettings(raw = {}) {
	const rechargeRules = (Array.isArray(raw.rechargeRules) ? raw.rechargeRules : DEFAULT_RECHARGE_RULES)
		.map((x) => ({
			price: Number(x?.price || 0),
			rewardYuan: Number(x?.rewardYuan || 0),
			quota: Number(x?.quota || 0),
			tip: String(x?.tip || '').trim().slice(0, 200)
		}))
		.filter((x) => x.price > 0 && x.rewardYuan >= 0)
		.sort((a, b) => a.price - b.price);
	const normRules = rechargeRules.length ? rechargeRules : DEFAULT_RECHARGE_RULES;
	const wr = raw.withdrawRange || {};
	const withdrawRange = {
		memberMin: Math.max(1, Number(wr.memberMin || DEFAULT_BIZ_SETTINGS.withdrawRange.memberMin)),
		memberMax: Math.max(1, Number(wr.memberMax || DEFAULT_BIZ_SETTINGS.withdrawRange.memberMax)),
		nonMemberMin: Math.max(1, Number(wr.nonMemberMin || DEFAULT_BIZ_SETTINGS.withdrawRange.nonMemberMin)),
		nonMemberMax: Math.max(1, Number(wr.nonMemberMax || DEFAULT_BIZ_SETTINGS.withdrawRange.nonMemberMax))
	};
	if (withdrawRange.memberMin > withdrawRange.memberMax) withdrawRange.memberMax = withdrawRange.memberMin;
	if (withdrawRange.nonMemberMin > withdrawRange.nonMemberMax) withdrawRange.nonMemberMax = withdrawRange.nonMemberMin;
	const wm = raw.withdrawMinByCount || {};
	const defWm = DEFAULT_BIZ_SETTINGS.withdrawMinByCount;
	const withdrawMinByCount = {
		memberFirst5: Math.max(
			1,
			Number(wm.memberFirst5 != null ? wm.memberFirst5 : wm.memberFirst3 != null ? wm.memberFirst3 : defWm.memberFirst5)
		),
		member6To10: Math.max(
			1,
			Number(wm.member6To10 != null ? wm.member6To10 : wm.member4To6 != null ? wm.member4To6 : defWm.member6To10)
		),
		member11Plus: Math.max(
			1,
			Number(wm.member11Plus != null ? wm.member11Plus : wm.member7Plus != null ? wm.member7Plus : defWm.member11Plus)
		),
		nonMemberFirst3: Math.max(1, Number(wm.nonMemberFirst3 || defWm.nonMemberFirst3)),
		nonMember4To6: Math.max(1, Number(wm.nonMember4To6 || defWm.nonMember4To6)),
		nonMember7Plus: Math.max(1, Number(wm.nonMember7Plus || defWm.nonMember7Plus))
	};
	const defPeriod = DEFAULT_BIZ_SETTINGS.withdrawPeriodLimits;
	let srcPeriodRaw = raw.withdrawPeriodLimits;
	if (typeof srcPeriodRaw === 'string') {
		try {
			srcPeriodRaw = JSON.parse(srcPeriodRaw);
		} catch (e) {
			srcPeriodRaw = null;
		}
	}
	const srcPeriod = srcPeriodRaw && typeof srcPeriodRaw === 'object' ? srcPeriodRaw : {};
	const normPeriodNum = (v, fallback) => {
		const n = Number(v);
		if (Number.isFinite(n) && n >= 0) return n;
		const fb = Number(fallback);
		return Number.isFinite(fb) && fb >= 0 ? fb : 0;
	};
	const normPeriodGroup = (g, d) => ({
		dayMax: normPeriodNum(g && g.dayMax != null && g.dayMax !== '' ? g.dayMax : d.dayMax, d.dayMax),
		weekMax: normPeriodNum(g && g.weekMax != null && g.weekMax !== '' ? g.weekMax : d.weekMax, d.weekMax)
	});
	const withdrawPeriodLimits = {
		exchangeCoupon: normPeriodGroup(srcPeriod.exchangeCoupon, defPeriod.exchangeCoupon),
		paidGoldPlatinum: normPeriodGroup(srcPeriod.paidGoldPlatinum, defPeriod.paidGoldPlatinum),
		paidDiamond: normPeriodGroup(srcPeriod.paidDiamond, defPeriod.paidDiamond)
	};
	// 扁平字段兜底（避免深层对象在 callFunction 传参时丢失）
	const applyFlat = (group, dayKey, weekKey) => {
		if (raw[dayKey] != null && raw[dayKey] !== '') {
			withdrawPeriodLimits[group].dayMax = normPeriodNum(raw[dayKey], withdrawPeriodLimits[group].dayMax);
		}
		if (raw[weekKey] != null && raw[weekKey] !== '') {
			withdrawPeriodLimits[group].weekMax = normPeriodNum(raw[weekKey], withdrawPeriodLimits[group].weekMax);
		}
	};
	applyFlat('exchangeCoupon', 'periodExchangeDay', 'periodExchangeWeek');
	applyFlat('paidGoldPlatinum', 'periodGoldDay', 'periodGoldWeek');
	applyFlat('paidDiamond', 'periodDiamondDay', 'periodDiamondWeek');
	const wa = raw.withdrawAudit || {};
	const withdrawAudit = {
		memberRequired: wa.memberRequired === true || wa.memberRequired === '1' || wa.memberRequired === 1,
		nonMemberRequired: wa.nonMemberRequired === true || wa.nonMemberRequired === '1' || wa.nonMemberRequired === 1
	};
	const rta = raw.refundTransferAudit || {};
	const refundTransferAudit = {
		memberRequired: rta.memberRequired === true || rta.memberRequired === '1' || rta.memberRequired === 1,
		nonMemberRequired: rta.nonMemberRequired === true || rta.nonMemberRequired === '1' || rta.nonMemberRequired === 1
	};
	const oc = raw.optimizeConfig || {};
	const optimizeConfig = {
		enabled: oc.enabled !== false,
		thresholdYuan: Math.max(0, Number(oc.thresholdYuan || DEFAULT_BIZ_SETTINGS.optimizeConfig.thresholdYuan)),
		aboveInstallments: Math.max(1, Number(oc.aboveInstallments || DEFAULT_BIZ_SETTINGS.optimizeConfig.aboveInstallments)),
		belowInstallments: Math.max(1, Number(oc.belowInstallments || DEFAULT_BIZ_SETTINGS.optimizeConfig.belowInstallments))
	};
	const incomePacketClaimValidDays = Math.max(
		1,
		Math.min(
			365,
			Number(
				raw.incomePacketClaimValidDays != null && raw.incomePacketClaimValidDays !== ''
					? raw.incomePacketClaimValidDays
					: DEFAULT_BIZ_SETTINGS.incomePacketClaimValidDays
			)
		)
	);
	const rc = raw.refundCycle || {};
	const refundCycle = {
		cycleDays: Math.max(1, Number(rc.cycleDays || DEFAULT_BIZ_SETTINGS.refundCycle.cycleDays)),
		windowDays: Math.max(1, Number(rc.windowDays || DEFAULT_BIZ_SETTINGS.refundCycle.windowDays))
	};
	const refundPenaltyRate = Math.max(0, Math.min(100, Number(raw.refundPenaltyRate != null ? raw.refundPenaltyRate : DEFAULT_BIZ_SETTINGS.refundPenaltyRate)));
	let rtsNum = Number(
		raw.refundTransferSliceMaxYuan != null && raw.refundTransferSliceMaxYuan !== ''
			? raw.refundTransferSliceMaxYuan
			: DEFAULT_BIZ_SETTINGS.refundTransferSliceMaxYuan
	);
	if (!Number.isFinite(rtsNum)) rtsNum = DEFAULT_BIZ_SETTINGS.refundTransferSliceMaxYuan;
	const refundTransferSliceMaxYuan = Math.min(500, Math.max(0.01, rtsNum));
	const refundApproveRevokeDevEnabled =
		raw.refundApproveRevokeDevEnabled === true ||
		raw.refundApproveRevokeDevEnabled === '1' ||
		raw.refundApproveRevokeDevEnabled === 1;
	const riskRates = {};
	const rr = raw.riskRates || {};
	Object.keys(rr).forEach((k) => {
		riskRates[String(k)] = Math.max(0, Math.min(100, Number(rr[k] || 0)));
	});
	const rawTestMerchantIds = Array.isArray(raw.testMerchantIds)
		? raw.testMerchantIds
		: String(raw.testMerchantIds || '')
			.split(/[\n,，;\s]+/)
			.filter(Boolean);
	const testMerchantIds = [...new Set(rawTestMerchantIds.map((x) => safeText(x, 80)).filter(Boolean))];
	const servicePhone = safeText(raw.servicePhone || DEFAULT_BIZ_SETTINGS.servicePhone, 30);
	const h5UiStyle = String(raw.h5UiStyle || DEFAULT_BIZ_SETTINGS.h5UiStyle || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A';
	const h5RefundRuleLines = sanitizeH5RefundRuleLines(raw.h5RefundRuleLines);
	const wxPayMch = sanitizeWxPayMchSelection(raw.wxPayMch, resolveDefaultWxPayMchIds());
	const pointsOptimizeLoginEnabled =
		raw.pointsOptimizeLoginEnabled === true ||
		raw.pointsOptimizeLoginEnabled === '1' ||
		raw.pointsOptimizeLoginEnabled === 1;
	return {
		rechargeRules: normRules,
		withdrawRange,
		withdrawMinByCount,
		withdrawPeriodLimits,
		withdrawAudit,
		refundTransferAudit,
		optimizeConfig,
		pointsOptimizeLoginEnabled,
		incomePacketClaimValidDays,
		refundCycle,
		refundPenaltyRate,
		refundTransferSliceMaxYuan,
		refundApproveRevokeDevEnabled,
		riskRates,
		testMerchantIds,
		servicePhone,
		h5UiStyle,
		h5RefundRuleLines,
		wxPayMch
	};
}

function resolveWithdrawMinPoints(member, biz, historyCount) {
	const wm = biz?.withdrawMinByCount || DEFAULT_BIZ_SETTINGS.withdrawMinByCount;
	const defWm = DEFAULT_BIZ_SETTINGS.withdrawMinByCount;
	const nextNo = Math.max(1, Number(historyCount || 0) + 1);
	if (member) {
		const memberFirst5 = Number(wm.memberFirst5 != null ? wm.memberFirst5 : wm.memberFirst3 != null ? wm.memberFirst3 : defWm.memberFirst5);
		const member6To10 = Number(wm.member6To10 != null ? wm.member6To10 : wm.member4To6 != null ? wm.member4To6 : defWm.member6To10);
		const member11Plus = Number(wm.member11Plus != null ? wm.member11Plus : wm.member7Plus != null ? wm.member7Plus : defWm.member11Plus);
		if (nextNo <= 5) return memberFirst5;
		if (nextNo <= 10) return member6To10;
		return member11Plus;
	}
	if (nextNo <= 3) return Number(wm.nonMemberFirst3 || defWm.nonMemberFirst3);
	if (nextNo <= 6) return Number(wm.nonMember4To6 || defWm.nonMember4To6);
	return Number(wm.nonMember7Plus || defWm.nonMember7Plus);
}

async function countMerchantWithdrawTimes(merchantUserId) {
	const uid = safeText(merchantUserId, 80);
	if (!uid) return 0;
	try {
		const cRes = await withdrawCollection.where({ merchant_user_id: uid, is_deleted: false }).count();
		return Number(cRes?.total || 0);
	} catch (e) {
		console.error('countMerchantWithdrawTimes failed', e);
		return 0;
	}
}

function isTestMerchantByBiz(merchant, biz) {
	const allow = Array.isArray(biz?.testMerchantIds) ? biz.testMerchantIds.map((x) => String(x || '')) : [];
	if (!allow.length || !merchant) return false;
	const uid = String(merchant.user_id || '').trim();
	const mid = String(merchant._id || '').trim();
	return (uid && allow.includes(uid)) || (mid && allow.includes(mid));
}

async function getBizSettings() {
	const now = Date.now();
	let settings = null;
	// 优先读 Redis（跨实例一致）。禁止「仅内存缓存优先」：多实例下 A 保存后 B 仍会返回旧值，导致后台改参回弹。
	const rRedis = await redisH5.h5RedisGetJson(REDIS_KEY_BIZ);
	if (rRedis && rRedis.rechargeRules && Array.isArray(rRedis.rechargeRules)) {
		settings = sanitizeBizSettings(rRedis);
	} else if (bizSettingsCache && now - bizSettingsCacheAt < 2000) {
		settings = bizSettingsCache;
	} else {
		try {
			const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(20).get();
			const doc = pickBizSettingDoc(r.data || []);
			if (doc) {
				settings = sanitizeBizSettings(resolveBizRawFromDoc(doc));
			}
		} catch (e) {
			console.error('getBizSettings failed', e);
		}
		if (!settings) {
			settings = sanitizeBizSettings(DEFAULT_BIZ_SETTINGS);
		}
		await pushBizSettingsToRedis(settings, Date.now(), { touchMeta: false });
	}
	// 独立表覆盖日/周限额（不依赖旧版 system-settings.value 是否含新字段）
	const periodOverride = await loadPeriodLimitsFromStore();
	if (periodOverride) {
		settings.withdrawPeriodLimits = periodOverride;
	}
	bizSettingsCache = settings;
	bizSettingsCacheAt = now;
	return settings;
}

/**
 * 将业务参数写入 Redis；保存配置时 touchMeta=true 同步更新时间戳。
 * @returns {{ ok: boolean, updatedAt: number }}
 */
async function pushBizSettingsToRedis(settings, updatedAt, options = {}) {
	const at = Number(updatedAt) || Date.now();
	const touchMeta = options.touchMeta !== false;
	const payload = Object.assign({}, settings || {}, { _redisUpdatedAt: at });
	await redisH5.h5RedisDel(REDIS_KEY_BIZ);
	const ok = await redisH5.h5RedisSetJson(REDIS_KEY_BIZ, payload, REDIS_EX_BIZ_SEC);
	if (touchMeta) {
		await redisH5.h5RedisSetJson(REDIS_KEY_BIZ_META, { updatedAt: at }, 0);
	}
	return { ok: !!ok, updatedAt: at };
}

async function readBizRedisMeta() {
	const meta = await redisH5.h5RedisGetJson(REDIS_KEY_BIZ_META);
	const updatedAt = meta && Number(meta.updatedAt) > 0 ? Number(meta.updatedAt) : 0;
	const live = await redisH5.h5RedisGetJson(REDIS_KEY_BIZ);
	const liveAt =
		live && Number(live._redisUpdatedAt) > 0 ? Number(live._redisUpdatedAt) : 0;
	return {
		updatedAt: updatedAt || liveAt || 0,
		redisAlive: !!(live && live.rechargeRules && Array.isArray(live.rechargeRules)),
		liveUpdatedAt: liveAt
	};
}

function grantYuanByRechargePrice(price, rechargeRules = DEFAULT_RECHARGE_RULES) {
	let p = Number(price || 0);
	const defaultRules = (Array.isArray(DEFAULT_RECHARGE_RULES) ? DEFAULT_RECHARGE_RULES : []).slice().sort((a, b) => a.price - b.price);
	const rules = (Array.isArray(rechargeRules) ? rechargeRules : DEFAULT_RECHARGE_RULES).slice().sort((a, b) => a.price - b.price);
	// 0.1 元测试档与 600 档同权益：奖励计算按首档正式套餐金额处理
	if (p === 0.1 && rules.length) {
		p = Number(rules[0].price || 0);
	}
	// 0.2 元测试档与 1000 元档同权益（含赠品流程）
	if (p === 0.2) {
		p = 1000;
	}
	let reward = 0;
	for (const rule of rules) {
		const pricePoint = Number(rule.price || 0);
		if (p >= pricePoint) {
			const configuredReward = Number(rule.rewardYuan || 0);
			let defaultReward = 0;
			for (const dr of defaultRules) {
				if (pricePoint >= Number(dr.price || 0)) defaultReward = Number(dr.rewardYuan || 0);
			}
			// 配置被误改为 0 时，回退到系统默认奖励档位，保证 600/800/1000 档可正常展示奖励值
			reward = Math.max(configuredReward, defaultReward);
		}
	}
	return Number(reward || 0);
}

function shanghaiYMD(ts) {
	const s = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(ts));
	const [y, m, d] = s.split('-').map(Number);
	return { y, m, d };
}

function chinaRangeMs(which, ts) {
	const { y, m, d } = shanghaiYMD(ts);
	const pad = (n) => String(n).padStart(2, '0');
	if (which === 'day') {
		const start = new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+08:00`).getTime();
		return { start, end: start + 86400000 - 1 };
	}
	if (which === 'week') {
		// 北京时间自然周：周一 00:00:00 ~ 周日 23:59:59.999
		const startOfDay = new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+08:00`).getTime();
		const { weekday } = shanghaiWeekdayAndMinuteOfDay(ts); // 0=周日 … 6=周六
		const daysFromMon = weekday === 0 ? 6 : weekday - 1;
		const start = startOfDay - daysFromMon * 86400000;
		return { start, end: start + 7 * 86400000 - 1 };
	}
	if (which === 'month') {
		const start = new Date(`${y}-${pad(m)}-01T00:00:00+08:00`).getTime();
		const nm = m === 12 ? 1 : m + 1;
		const ny = m === 12 ? y + 1 : y;
		const nextStart = new Date(`${ny}-${pad(nm)}-01T00:00:00+08:00`).getTime();
		return { start, end: nextStart - 1 };
	}
	const start = new Date(`${y}-01-01T00:00:00+08:00`).getTime();
	const nextYear = new Date(`${y + 1}-01-01T00:00:00+08:00`).getTime();
	return { start, end: nextYear - 1 };
}

function buildWithdrawReceivedInRange(merchantUserId, timeStart, timeEnd) {
	return db.command.and([
		{ is_deleted: false },
		{ merchant_user_id: String(merchantUserId) },
		{ arrival_status: 'received' },
		{ arrival_time: db.command.gte(Number(timeStart)) },
		{ arrival_time: db.command.lte(Number(timeEnd)) }
	]);
}

const H5_HOME_SUMMARY_CACHE_TTL_MS = 30000;
const h5HomeSummaryCache = new Map();
const H5_HOME_DASH_CACHE_TTL_MS = 12000;
const h5HomeDashboardCache = new Map();
const H5_SILVER_TRADE_CACHE_TTL_MS = 45000;
const h5SilverTradeCache = new Map();

function h5HomeSummaryCacheKey(merchantUserId, now) {
	const dayR = chinaRangeMs('day', now);
	const monthR = chinaRangeMs('month', now);
	const yearR = chinaRangeMs('year', now);
	return {
		key: `${String(merchantUserId)}|${dayR.start}|${monthR.start}|${yearR.start}`,
		dayR,
		monthR,
		yearR
	};
}

async function getH5WithdrawSummaryCached(merchantUserId, now) {
	const k = h5HomeSummaryCacheKey(merchantUserId, now);
	const cached = h5HomeSummaryCache.get(k.key);
	if (cached && now - cached.at < H5_HOME_SUMMARY_CACHE_TTL_MS) {
		return cached.data;
	}
	const redisWdKey = `hsy:h5:wd:${k.key.replace(/\|/g, ':')}`;
	const rSum = await redisH5.h5RedisGetJson(redisWdKey);
	if (rSum && rSum.daySum && rSum.monthSum && rSum.yearSum) {
		h5HomeSummaryCache.set(k.key, { at: now, data: rSum });
		return rSum;
	}
	const [daySum, monthSum, yearSum] = await Promise.all([
		withdrawSummary(buildWithdrawReceivedInRange(merchantUserId, k.dayR.start, k.dayR.end)),
		withdrawSummary(buildWithdrawReceivedInRange(merchantUserId, k.monthR.start, k.monthR.end)),
		withdrawSummary(buildWithdrawReceivedInRange(merchantUserId, k.yearR.start, k.yearR.end))
	]);
	const data = { daySum, monthSum, yearSum };
	h5HomeSummaryCache.set(k.key, { at: now, data });
	await redisH5.h5RedisSetJson(redisWdKey, data, REDIS_EX_WD_SUM_SEC);
	return data;
}

function resolveRechargePriceForReward(merchant, rechargeRules = DEFAULT_RECHARGE_RULES) {
	const pid = safeText(merchant?.recharge_package_id, 40);
	if (pid) {
		// 兼容动态套餐 id：pkg_600 / pkg_0_1 / 自定义规则生成形式
		const m = pid.match(/^pkg_(\d+)(?:_(\d+))?$/);
		if (m) {
			const n = Number(m[1] + (m[2] ? `.${m[2]}` : ''));
			if (Number.isFinite(n) && n > 0) return n;
		}
		const r = (Array.isArray(rechargeRules) ? rechargeRules : []).find((x) => `pkg_${String(Number(x.price || 0)).replace('.', '_')}` === pid);
		if (r) return Number(r.price || 0);
	}
	const quota = Number(merchant?.recharge_package_quota || 0);
	if (quota > 0) {
		const byQuota = (Array.isArray(rechargeRules) ? rechargeRules : [])
			.filter((x) => Number(x.quota || 0) === quota)
			.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
		if (byQuota.length) return Number(byQuota[0].price || 0);
	}
	const directPrice = Number(merchant?.recharge_package_price || 0);
	if (directPrice > 0) return directPrice;
	return 0;
}

function h5WithdrawQuotaTotalYuan(merchant, rechargeRules = DEFAULT_RECHARGE_RULES) {
	const reward = Number(merchant?.recharge_package_reward || 0);
	if (reward > 0) return reward;
	const quota = Number(merchant?.estimated_free_quota || merchant?.recharge_package_quota || 0);
	// H5 固定业务档位：100万=3800，150万=5700，200万=7600（不受后台误配置影响）
	if (quota >= 2000000) return 7600;
	if (quota >= 1500000) return 5700;
	if (quota >= 1000000) return 3800;
	const price = resolveRechargePriceForReward(merchant, rechargeRules);
	return grantYuanByRechargePrice(price, rechargeRules);
}

function h5MembershipInfo(merchant, packages = null) {
	if (!merchantHasRechargeMembership(merchant)) {
		if (hasH5SilverMemberIdentity(merchant)) {
			return { tier: 'silver', name: '白银会员', accent: '#c0cbd9' };
		}
		return { tier: 'normal', name: '普通会员', accent: '#94a3b8' };
	}
	const persistedName = safeText(merchant?.membership_name || '', 40);
	if (persistedName) {
		let tier = 'normal';
		let accent = '#94a3b8';
		if (persistedName.includes('钻石')) {
			tier = 'diamond';
			accent = '#38bdf8';
		} else if (persistedName.includes('铂金')) {
			tier = 'platinum';
			accent = '#c084fc';
		} else if (persistedName.includes('白金')) {
			tier = 'white_gold';
			accent = '#fcd34d';
		} else if (persistedName.includes('白银')) {
			tier = 'silver';
			accent = '#c0cbd9';
		} else if (Number(merchant?.recharge_total_yuan || 0) > 0) {
			// 自定义会员名（例如“测试会员”）且已充值，视为充值会员档
			tier = 'white_gold';
			accent = '#fcd34d';
		}
		// 商户仍有 persisted membership_name（如默认「普通会员」）时会提前 return，
		// 否则兑换码白银逻辑只在「无 membership_name」分支生效，导致与后台不一致
		if (tier === 'normal' && hasH5SilverMemberIdentity(merchant)) {
			return { tier: 'silver', name: '白银会员', accent: '#c0cbd9' };
		}
		return { tier, name: persistedName, accent };
	}
	const list = packages && packages.length ? packages : H5_RECHARGE_PACKAGES;
	const pkg = pickRechargePackage(merchant.recharge_package_id, list) || getRechargePackageByPrice(merchant.recharge_package_price, list);
	let price = Number((pkg && pkg.price) || merchant.recharge_package_price || 0);
	if (pkg && pkg.id === H5_RECHARGE_TEST_AS_1000_PKG_ID) price = 1000;
	let out;
	if (price >= 1000) {
		out = { tier: 'diamond', name: '钻石会员', accent: '#38bdf8' };
	} else if (price >= 800) {
		out = { tier: 'platinum', name: '铂金会员', accent: '#c084fc' };
	} else if (price >= 600 || price === 0.1) {
		out = { tier: 'white_gold', name: '白金会员', accent: '#fcd34d' };
	} else {
		out = { tier: 'normal', name: '普通会员', accent: '#94a3b8' };
	}
	const custom = pkg && String(pkg.membershipName || '').trim();
	if (custom) {
		return { ...out, name: custom };
	}
	// 兑换码白银会员：非充值会员时首页也应展示会员身份
	if (out.tier === 'normal' && hasH5SilverMemberIdentity(merchant)) {
		return { tier: 'silver', name: '白银会员', accent: '#c0cbd9' };
	}
	return out;
}

const H5_WITHDRAW_FEE_YUAN = 3;
const H5_WITHDRAW_TAX_RATE = 0.08;
const H5_WITHDRAW_MAX_POINTS = 200;
const H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN = 50000;

function isH5RechargeMemberForWithdraw(merchant) {
	const tier = String(h5MembershipInfo(merchant).tier || '');
	if (tier === 'white_gold' || tier === 'platinum' || tier === 'diamond') return true;
	// 退款流程中仅在“真正退款成功”后才清零该值；若仍>0应继续按充值会员处理
	return Number(merchant?.recharge_total_yuan || 0) > 0;
}

/** 白银会员是否在有效期内（兑换码天数到期后不再视为白银） */
function isActiveH5SilverMember(merchant, now = nowTs()) {
	if (!merchant) return false;
	const endAt = Number(merchant.silver_member_end_at || 0);
	if (endAt > 0 && now >= endAt) return false;
	if (merchant.silver_member === true) return !endAt || endAt > now;
	if (merchant.exchange_code_claimed === true || merchant.redeem_code_claimed === true) {
		return endAt > now;
	}
	const tag = String(merchant.member_tier || merchant.membership_tier || merchant.h5_member_tier || '').toLowerCase();
	if (tag === 'silver' || tag === 'white_silver' || tag === 'silver_member') {
		return !endAt || endAt > now;
	}
	const name = String(merchant.membership_name || '').trim();
	if (
		name.includes('白银') &&
		Number(merchant.recharge_total_yuan || 0) <= 0 &&
		Number(merchant.recharge_cycle_start || 0) <= 0
	) {
		return !endAt || endAt > now;
	}
	return false;
}

function hasH5SilverMemberIdentity(merchant) {
	return isActiveH5SilverMember(merchant);
}

function isH5SilverMemberForWithdraw(merchant) {
	return hasH5SilverMemberIdentity(merchant);
}

/** 是否曾有过 H5 额度充值（含充值后另领兑换码白银的场景） */
function isMerchantEligibleForH5Refund(merchant) {
	if (!merchant) return false;
	if (isH5RechargeMemberForWithdraw(merchant)) return true;
	const rechargeYuan = Number(
		merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0
	);
	if (rechargeYuan > 0) return true;
	if (Number(merchant.recharge_package_price || 0) > 0) return true;
	if (Number(merchant.recharge_cycle_start || 0) > 0) return true;
	return false;
}

/** 仅拦截「纯兑换码白银、从未充值」的退款；充值后领兑换码不受影响 */
function shouldBlockH5RefundForSilverOnly(merchant) {
	return isH5SilverMemberForWithdraw(merchant) && !isMerchantEligibleForH5Refund(merchant);
}

function resolveH5WithdrawRole(merchant) {
	if (isH5RechargeMemberForWithdraw(merchant)) return 'recharge_member';
	if (isH5SilverMemberForWithdraw(merchant)) return 'silver_member';
	return 'normal_member';
}

/** 普通会员升级（兑换码白银 / 付费黄金及以上）前是否需清除已领待提现积分与冻结金额 */
function isNormalMemberForUpgradePointsClear(merchant) {
	return resolveH5WithdrawRole(merchant) === 'normal_member';
}

const MEMBER_UPGRADE_POINTS_CLEAR_ACTION = 'member_upgrade_points_clear';

function upgradeKindLabelForPointsClear(kind) {
	const map = {
		exchange_code_silver: '兑换码开通白银',
		paid_recharge: '付费升级充值会员'
	};
	return map[String(kind || '')] || String(kind || '会员升级');
}

/**
 * 普通会员升级为白银（兑换码）或黄金/白金/钻石（付费）时，清除已领取的账号积分（待提现）与冻结金额。
 * 白银付费升档、充值会员之间升档不调用本函数。
 */
async function clearNormalMemberPointsAndFrozenOnUpgrade(merchant, ctx = {}) {
	if (!merchant || !merchant._id) return { cleared: false, reason: 'no_merchant' };
	const beforeAp = normalizePendingBalance(merchant);
	const beforeFrozen = Number(Number(merchant.frozen_amount || 0).toFixed(4));
	const beforePendingWithdraw = Number(Number(merchant.pending_withdraw || 0).toFixed(4));
	const now = ctx.now != null ? ctx.now : nowTs();
	const targetMembershipName = safeText(ctx.targetMembershipName || '', 40) || '会员';
	const upgradeKind = safeText(ctx.upgradeKind || '', 40);
	const kindLabel = upgradeKindLabelForPointsClear(upgradeKind);

	const merchantPatch = {
		account_points: 0,
		withdraw_pending_balance: 0,
		pending_withdraw: 0,
		frozen_amount: 0,
		update_time: now
	};
	await merchantCollection.doc(merchant._id).update(merchantPatch);

	const boundMachines = await listBoundMachinesByMerchant(merchant);
	const machineSnapshots = [];
	for (const m of boundMachines) {
		const prevFrozen = Number(Number(m.frozen_amount || 0).toFixed(4));
		if (prevFrozen > 0) {
			await machineCollection.doc(m._id).update({ frozen_amount: 0 });
		}
		machineSnapshots.push({
			_id: m._id,
			device_id: m.device_id || '',
			frozen_amount_before: prevFrozen
		});
	}

	const content = `普通会员${kindLabel}至${targetMembershipName}：清除账号积分（待提现）${beforeAp.toFixed(2)} 元、冻结金额 ${beforeFrozen.toFixed(2)} 元`;
	await operationLogCollection.add({
		user_id: merchant.user_id || merchant._id,
		user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
		action: MEMBER_UPGRADE_POINTS_CLEAR_ACTION,
		module: 'points',
		target_id: merchant._id,
		target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
		content,
		operator_source: safeText(ctx.operatorSource || 'h5', 20) || 'h5',
		operator: safeText(ctx.operator || 'system', 40) || 'system',
		upgrade_kind: upgradeKind,
		target_membership_name: targetMembershipName,
		cleared_account_points: beforeAp,
		cleared_frozen_amount: beforeFrozen,
		cleared_pending_withdraw: beforePendingWithdraw,
		platform_no: safeText(ctx.orderNo || ctx.redeemCode || '', 64),
		before_merchant_snapshot: {
			account_points: beforeAp,
			withdraw_pending_balance: Number(rawPendingBalance(merchant) || 0),
			pending_withdraw: beforePendingWithdraw,
			frozen_amount: beforeFrozen
		},
		before_machine_snapshot: machineSnapshots.slice(0, 10),
		create_time: now
	});

	return {
		cleared: true,
		clearedAccountPoints: beforeAp,
		clearedFrozenAmount: beforeFrozen,
		clearedPendingWithdraw: beforePendingWithdraw
	};
}

/**
 * 首页资金汇总：按提现发起时商户身份分档（与 resolveH5WithdrawRole 一致）。
 * member＝充值会员（钻石/铂金/白金等付费档）；non_member＝普通会员、白银会员。
 */
function withdrawMemberBucketForSummary(merchant) {
	return tradeMemberBucketForMerchant(merchant);
}

/** 兑换券/兑换码开通白银（exchange / redeem claimed）：提现计算侧可用的隐藏剩余额度下限（界面仍不展示） */
const H5_SILVER_EXCHANGE_HIDDEN_QUOTA_YUAN = 1000;

function hasSilverExchangeCouponClaim(merchant) {
	if (!merchant) return false;
	return merchant.exchange_code_claimed === true || merchant.redeem_code_claimed === true;
}

function isSilverExchangeQuotaMerchant(merchant) {
	if (!merchant || isH5RechargeMemberForWithdraw(merchant)) return false;
	if (!hasH5SilverMemberIdentity(merchant)) return false;
	return hasSilverExchangeCouponClaim(merchant);
}

/** 兑换码授予/重置的白银隐藏提现额度（固定值，不累加） */
function silverExchangeQuotaGrantYuan() {
	return H5_SILVER_EXCHANGE_HIDDEN_QUOTA_YUAN;
}

/** 白银会员续兑：将 DB 剩余额度重置为 grantYuan（非叠加），上限即 grantYuan */
function resolveSilverExchangeQuotaOnRedeem(_merchant) {
	return silverExchangeQuotaGrantYuan();
}

/** 是否允许使用兑换码（普通会员首开白银、白银会员续兑重置额度；充值会员不可用） */
function canMerchantUseH5ExchangeCoupon(merchant) {
	if (!merchant) return false;
	if (isH5RechargeMemberForWithdraw(merchant)) return false;
	if (isNormalMemberForUpgradePointsClear(merchant)) return true;
	if (hasH5SilverMemberIdentity(merchant)) return true;
	if (merchant.silver_member === true || merchant.exchange_code_claimed || merchant.redeem_code_claimed) {
		return true;
	}
	const name = String(merchant.membership_name || '').trim();
	return name.includes('白银');
}

/**
 * H5 积分兑换提现：可用奖励额度口径。
 * 兑换码白银以 DB 剩余额度为准；仅历史未写入额度时兜底不低于 1000。
 */
function effectiveH5WithdrawQuotaBalanceForRedeem(merchant) {
	const base = normalizeWithdrawQuotaBalance(merchant);
	if (!isSilverExchangeQuotaMerchant(merchant)) return base;
	if (base > 0) return base;
	return H5_SILVER_EXCHANGE_HIDDEN_QUOTA_YUAN;
}

/**
 * H5 对外展示「剩余提现额度」：白银会员统一显示 0；后台 listMerchants 等仍用真实 normalizeAdminRemainingQuota / 原始字段。
 */
function h5DisplayWithdrawQuotaRemainingYuan(merchant) {
	if (!merchant) return 0;
	if (resolveH5WithdrawRole(merchant) === 'silver_member') return 0;
	return normalizeWithdrawQuotaBalance(merchant);
}

/** 校验提现积分是否不超过额度与待提现；返回 arBase 供扣减使用 */
function validateH5WithdrawPointsAffordable(merchant, points) {
	const arStored = normalizeWithdrawQuotaBalance(merchant);
	const arForCheck = effectiveH5WithdrawQuotaBalanceForRedeem(merchant);
	const ap = normalizePendingBalance(merchant);
	const pts = Number(points || 0);
	if (!(pts > 0)) return { ok: false, code: 400, message: '兑换积分须为大于 0 的整数' };
	if (pts > arForCheck + 1e-6) {
		return { ok: false, code: 400, message: '提现额度不足' };
	}
	if (pts > ap + 1e-6) {
		return { ok: false, code: 400, message: '可兑换积分不足' };
	}
	// 历史未写入额度的兑换码白银：按兜底额度扣减并回写 DB
	const arBase = isSilverExchangeQuotaMerchant(merchant) && arStored <= 0 ? arForCheck : arStored;
	return { ok: true, arBase, ap, arForCheck };
}

async function getH5CurrentMonthTradeYuan(merchant, now = nowTs()) {
	try {
		if (!merchant) return 0;
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		if (!merchantUserId) return 0;
		let bindTs = Number(merchant.bind_time || 0);
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		for (const mach of boundMachines) {
			if (mach && mach.bind_time) bindTs = Math.max(bindTs, Number(mach.bind_time || 0));
		}
		const monthR = chinaRangeMs('month', now);
		const _ = db.command;
		const tradeParts = [
			{ user_id: merchantUserId },
			{ trade_type: _.in(['real', 'virtual']) },
			{ stats_eligible: _.neq(false) },
			{ amount: _.gt(0) },
			{ is_deleted: _.neq(true) },
			_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }]),
			{ create_time: _.gte(Math.max(monthR.start, bindTs || 0)) },
			{ create_time: _.lte(monthR.end) }
		];
		const tRes = await machineTradeCollection
			.where(_.and(tradeParts))
			.field({ amount: true })
			.limit(20000)
			.get();
		let sum = 0;
		for (const row of tRes.data || []) sum += Number(row.amount || 0);
		return Number(sum.toFixed(2));
	} catch (e) {
		console.error('getH5CurrentMonthTradeYuan failed', e);
		return 0;
	}
}

async function getH5CurrentMonthTradeYuanCached(merchant, now = nowTs()) {
	if (!merchant) return 0;
	const monthR = chinaRangeMs('month', now);
	const merchantUserId = String(merchant.user_id || merchant._id || '');
	const key = `${merchantUserId}|${monthR.start}`;
	const m = h5SilverTradeCache.get(key);
	if (m && now - m.at < H5_SILVER_TRADE_CACHE_TTL_MS) return Number(m.val || 0);
	const redisKey = `hsy:h5:silver:trade:${merchantUserId}:${monthR.start}`;
	const r = await redisH5.h5RedisGetJson(redisKey);
	if (r && typeof r.val === 'number') {
		h5SilverTradeCache.set(key, { at: now, val: Number(r.val || 0) });
		return Number(r.val || 0);
	}
	const val = Number(await getH5CurrentMonthTradeYuan(merchant, now) || 0);
	h5SilverTradeCache.set(key, { at: now, val });
	await redisH5.h5RedisSetJson(redisKey, { val }, REDIS_EX_H5_SILVER_TRADE_SEC);
	return val;
}

async function resolveRechargeMembershipFallback(merchant, rechargePackages = []) {
	try {
		if (!merchant || !merchantHasRechargeMembership(merchant)) return null;
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		if (!merchantUserId) return null;
		const redisKey = `hsy:h5:member:hint:${merchantUserId}`;
		const hit = await redisH5.h5RedisGetJson(redisKey);
		if (hit && Number(hit.price || 0) > 0) {
			return h5MembershipInfo(
				Object.assign({}, merchant, {
					recharge_package_price: Number(hit.price || 0),
					recharge_package_id: String(hit.packageId || '')
				}),
				rechargePackages
			);
		}
		const logRes = await operationLogCollection
			.where({ user_id: merchantUserId, action: 'h5_quota_recharge', refunded: false })
			.orderBy('create_time', 'desc')
			.limit(1)
			.get();
		const row = logRes.data && logRes.data[0];
		const price = Number(row?.package_price || 0);
		if (price <= 0) return null;
		await redisH5.h5RedisSetJson(
			redisKey,
			{
				price,
				packageId: safeText(row?.package_id || '', 40)
			},
			REDIS_EX_H5_RECHARGE_HINT_SEC
		);
		return h5MembershipInfo(
			Object.assign({}, merchant, {
				recharge_package_price: price,
				recharge_package_id: safeText(row?.package_id || '', 40)
			}),
			rechargePackages
		);
	} catch (e) {
		return null;
	}
}

function shanghaiWeekdayAndMinuteOfDay(ts) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Shanghai',
		weekday: 'short',
		hour: 'numeric',
		minute: 'numeric',
		hour12: false
	}).formatToParts(new Date(ts));
	const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	let weekday = 0;
	let hour = 0;
	let minute = 0;
	for (const p of parts) {
		if (p.type === 'weekday') weekday = wdMap[p.value] != null ? wdMap[p.value] : 0;
		if (p.type === 'hour') hour = Number(p.value);
		if (p.type === 'minute') minute = Number(p.value);
	}
	return { weekday, minuteOfDay: hour * 60 + minute };
}

function isH5WithdrawBusinessHours(ts = Date.now()) {
	const { weekday, minuteOfDay } = shanghaiWeekdayAndMinuteOfDay(ts);
	if (weekday === 0 || weekday === 6) return false;
	return minuteOfDay >= 9 * 60 && minuteOfDay < 18 * 60;
}

function h5WithdrawOutsideHoursMessage() {
	return '提现在工作日 9:00–18:00（北京时间）开放办理，请于该时段再试。';
}

/** 用于分档提现日/周限额：解析套餐价格（元） */
function resolveWithdrawPackagePriceYuan(merchant) {
	let price = Number(merchant?.recharge_package_price || 0);
	const pid = safeText(merchant?.recharge_package_id || '', 40);
	if (pid === H5_RECHARGE_TEST_AS_1000_PKG_ID) price = 1000;
	return price;
}

/**
 * 提现日/周累计限额分档：
 * - exchangeCoupon：兑换券/兑换码开通的非付费会员（业务「兑换券铂金」）
 * - paidGoldPlatinum：600 黄金 / 800 白金
 * - paidDiamond：1000 钻石
 */
function resolveWithdrawPeriodLimitGroup(merchant) {
	if (!merchant) return '';
	if (!isH5RechargeMemberForWithdraw(merchant)) {
		if (
			merchant.exchange_code_claimed === true ||
			merchant.redeem_code_claimed === true ||
			isH5SilverMemberForWithdraw(merchant)
		) {
			return 'exchangeCoupon';
		}
		return '';
	}
	const price = resolveWithdrawPackagePriceYuan(merchant);
	const name = String(merchant.membership_name || '').trim();
	if (price >= 1000 || name.includes('钻石')) return 'paidDiamond';
	if (
		price >= 600 ||
		price === 0.1 ||
		name.includes('黄金') ||
		name.includes('白金') ||
		name.includes('铂金')
	) {
		return 'paidGoldPlatinum';
	}
	return 'paidGoldPlatinum';
}

function withdrawPeriodLimitGroupLabel(group) {
	if (group === 'exchangeCoupon') return '兑换券铂金会员';
	if (group === 'paidGoldPlatinum') return '黄金/白金会员';
	if (group === 'paidDiamond') return '钻石会员';
	return '会员';
}

function buildWithdrawCreatedInRange(merchantUserId, timeStart, timeEnd) {
	const _ = db.command;
	return _.and([
		{ is_deleted: _.neq(true) },
		{ merchant_user_id: String(merchantUserId) },
		{ create_time: _.gte(Number(timeStart)) },
		{ create_time: _.lte(Number(timeEnd)) },
		{ arrival_status: _.nin(['returned', 'expired']) },
		{ audit_status: _.neq('rejected') }
	]);
}

async function sumWithdrawPointsInCreateRange(merchantUserId, timeStart, timeEnd) {
	const sum = await withdrawSummary(buildWithdrawCreatedInRange(merchantUserId, timeStart, timeEnd));
	return Math.max(0, Number(sum.totalWithdraw || 0));
}

async function getH5WithdrawPeriodUsage(merchantUserId, now = nowTs()) {
	const dayR = chinaRangeMs('day', now);
	const weekR = chinaRangeMs('week', now);
	const [dayUsed, weekUsed] = await Promise.all([
		sumWithdrawPointsInCreateRange(merchantUserId, dayR.start, dayR.end),
		sumWithdrawPointsInCreateRange(merchantUserId, weekR.start, weekR.end)
	]);
	return {
		dayUsed: Number(dayUsed.toFixed(2)),
		weekUsed: Number(weekUsed.toFixed(2)),
		dayRange: dayR,
		weekRange: weekR
	};
}

function pickWithdrawPeriodLimitConfig(biz, group) {
	const limits = (biz && biz.withdrawPeriodLimits) || DEFAULT_BIZ_SETTINGS.withdrawPeriodLimits;
	const conf = (limits && limits[group]) || { dayMax: 0, weekMax: 0 };
	return {
		dayMax: Math.max(0, Number(conf.dayMax || 0)),
		weekMax: Math.max(0, Number(conf.weekMax || 0))
	};
}

/**
 * @returns {{ ok:boolean, message?:string, group:string, dayMax:number, weekMax:number, dayUsed:number, weekUsed:number, dayRemain:number, weekRemain:number, periodCap?:number }}
 */
async function evaluateH5WithdrawPeriodLimits(merchant, biz, points, now = nowTs(), options = {}) {
	const skip = !!options.skip;
	const empty = {
		ok: true,
		group: '',
		dayMax: 0,
		weekMax: 0,
		dayUsed: 0,
		weekUsed: 0,
		dayRemain: Infinity,
		weekRemain: Infinity,
		periodCap: 0
	};
	if (skip || !merchant) return empty;
	const group = resolveWithdrawPeriodLimitGroup(merchant);
	if (!group) return empty;
	const { dayMax, weekMax } = pickWithdrawPeriodLimitConfig(biz, group);
	if (!(dayMax > 0) && !(weekMax > 0)) {
		return { ...empty, group, dayMax, weekMax };
	}
	const merchantUserId = String(merchant.user_id || merchant._id || '');
	const usage = await getH5WithdrawPeriodUsage(merchantUserId, now);
	const dayRemain = dayMax > 0 ? Math.max(0, Number((dayMax - usage.dayUsed).toFixed(2))) : Infinity;
	const weekRemain = weekMax > 0 ? Math.max(0, Number((weekMax - usage.weekUsed).toFixed(2))) : Infinity;
	let periodCap = Infinity;
	if (dayMax > 0) periodCap = Math.min(periodCap, dayRemain);
	if (weekMax > 0) periodCap = Math.min(periodCap, weekRemain);
	if (!Number.isFinite(periodCap)) periodCap = 0;
	const need = Math.max(0, Number(points || 0));
	// 对商户不暴露具体日/周额度数字，仅区分今日/本周用尽
	if (need > 0 && dayMax > 0 && usage.dayUsed + need > dayMax + 1e-9) {
		return {
			ok: false,
			message: '今日提现额度已用完',
			group,
			dayMax,
			weekMax,
			dayUsed: usage.dayUsed,
			weekUsed: usage.weekUsed,
			dayRemain,
			weekRemain,
			periodCap: Math.floor(periodCap)
		};
	}
	if (need > 0 && weekMax > 0 && usage.weekUsed + need > weekMax + 1e-9) {
		return {
			ok: false,
			message: '本周提现额度已用完',
			group,
			dayMax,
			weekMax,
			dayUsed: usage.dayUsed,
			weekUsed: usage.weekUsed,
			dayRemain,
			weekRemain,
			periodCap: Math.floor(periodCap)
		};
	}
	return {
		ok: true,
		group,
		dayMax,
		weekMax,
		dayUsed: usage.dayUsed,
		weekUsed: usage.weekUsed,
		dayRemain: Number.isFinite(dayRemain) ? dayRemain : 0,
		weekRemain: Number.isFinite(weekRemain) ? weekRemain : 0,
		periodCap: Math.floor(Number.isFinite(periodCap) ? periodCap : 0)
	};
}

async function h5WithdrawInfo(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		merchant = await ensureMerchantRechargeAmountAccurate(merchant);
		const biz = await getBizSettings();
		const syncWd = await syncMerchantMembershipCycles(merchant, { biz, now: nowTs() });
		merchant = syncWd.merchant;
		const testMerchant = isTestMerchantByBiz(merchant, biz);
		const now = nowTs();
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const isRechargeMember = withdrawRole === 'recharge_member';
		const monthTradeYuan = withdrawRole === 'silver_member' ? await getH5CurrentMonthTradeYuan(merchant, now) : 0;
		const silverTradeMeetsMin = monthTradeYuan >= H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN;
		// 白银当月流水门槛：测试商户白名单不校验，其余商户保持 5 万
		const silverCanWithdrawByTrade = testMerchant || silverTradeMeetsMin;
		const canWithdraw =
			withdrawRole === 'recharge_member' || (withdrawRole === 'silver_member' && silverCanWithdrawByTrade);
		let withdrawHint = '';
		if (withdrawRole === 'normal_member') {
			withdrawHint = '当前账号仅可领取积分，暂不支持提现。';
		} else if (withdrawRole === 'silver_member' && !testMerchant && !silverTradeMeetsMin) {
			withdrawHint = `白银会员需当月流水达到${H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN}元后可提现，当前为${monthTradeYuan.toFixed(2)}元。`;
		}
		const auditCfg = biz.withdrawAudit || {};
		// 测试商户仅豁免提现门槛与时间限制，不豁免审核开关
		const needAudit = isRechargeMember ? !!auditCfg.memberRequired : !!auditCfg.nonMemberRequired;
		const ar = effectiveH5WithdrawQuotaBalanceForRedeem(merchant);
		const ap = normalizePendingBalance(merchant);
		const redeemable = Math.max(0, Math.floor(Math.min(ar, ap)));
		const withdrawTimes = await countMerchantWithdrawTimes(String(merchant.user_id || merchant._id || ''));
		let minPoints = testMerchant ? 1 : resolveWithdrawMinPoints(isRechargeMember, biz, withdrawTimes);
		let maxPoints = isRechargeMember
			? Number(biz.withdrawRange.memberMax || H5_WITHDRAW_MAX_POINTS)
			: Number(biz.withdrawRange.nonMemberMax || H5_WITHDRAW_MAX_POINTS);
		/** day | week | ''：日/周额度用尽时供 H5 展示红字提示 */
		let periodLimitHit = '';
		const periodEval = await evaluateH5WithdrawPeriodLimits(merchant, biz, 0, now, { skip: testMerchant });
		if (periodEval.periodCap > 0 || periodEval.dayMax > 0 || periodEval.weekMax > 0) {
			const cap = Math.max(0, Number(periodEval.periodCap || 0));
			maxPoints = Math.max(0, Math.min(maxPoints, cap));
			if (cap <= 0) {
				// 避免「10～0」误导：额度用尽时展示 0～0
				minPoints = 0;
				maxPoints = 0;
				const dayRemain = Number(periodEval.dayRemain);
				const weekRemain = Number(periodEval.weekRemain);
				if (periodEval.dayMax > 0 && !(dayRemain > 0)) periodLimitHit = 'day';
				else if (periodEval.weekMax > 0 && !(weekRemain > 0)) periodLimitHit = 'week';
				else if (periodEval.dayMax > 0) periodLimitHit = 'day';
				else if (periodEval.weekMax > 0) periodLimitHit = 'week';
			}
		}
		const rechargePackages = await loadRechargePackagesFromQuota();
		const mship = h5MembershipInfo(merchant, rechargePackages);
		return {
			code: 0,
			message: 'ok',
			data: {
				serverTime: now,
				redeemablePoints: redeemable,
				isRechargeMember,
				withdrawRole,
				canWithdraw,
				withdrawHint,
				silverMonthTradeYuan: Number(monthTradeYuan.toFixed(2)),
				silverMonthTradeNeedYuan: H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN,
				membershipName: mship.name,
				withdrawTimes,
				minPoints,
				maxPoints,
				periodLimitHit,
				feePerOrderYuan: H5_WITHDRAW_FEE_YUAN,
				inBusinessHours: testMerchant ? true : isH5WithdrawBusinessHours(now),
				pointEqualsYuan: true
			}
		};
	} catch (e) {
		console.error('h5WithdrawInfo failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function h5WithdrawApply(data) {
	try {
		await getBizSettings();
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const now = nowTs();
		const raw = data?.points;
		const n = typeof raw === 'string' ? Number(String(raw).trim()) : Number(raw);
		if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
			return { code: 400, message: '兑换积分须为大于 0 的整数' };
		}
		const points = n;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const openid = safeText(merchant.wx_openid, 100);
		if (!openid) return { code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
		const biz = await getBizSettings();
		const syncApply = await syncMerchantMembershipCycles(merchant, { biz, now });
		merchant = syncApply.merchant;
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const isRechargeMember = withdrawRole === 'recharge_member';
		const auditCfg = biz.withdrawAudit || {};
		const testMerchant = isTestMerchantByBiz(merchant, biz);
		// 测试商户仅豁免提现门槛与时间限制，不豁免审核开关
		const needAudit = isRechargeMember ? !!auditCfg.memberRequired : !!auditCfg.nonMemberRequired;
		if (withdrawRole === 'normal_member') {
			return { code: 400, message: '当前账号暂不支持提现。' };
		}
		if (withdrawRole === 'silver_member' && !testMerchant) {
			const monthTradeYuan = await getH5CurrentMonthTradeYuan(merchant, now);
			if (monthTradeYuan < H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN) {
				return {
					code: 400,
					message: `白银会员需当月流水达到${H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN}元后可提现，当前为${monthTradeYuan.toFixed(2)}元。`
				};
			}
		}
		if (!testMerchant && !isH5WithdrawBusinessHours(now)) {
			return { code: 400, message: h5WithdrawOutsideHoursMessage() };
		}
		const withdrawTimes = await countMerchantWithdrawTimes(String(merchant.user_id || merchant._id || ''));
		const minP = testMerchant ? 1 : resolveWithdrawMinPoints(isRechargeMember, biz, withdrawTimes);
		const maxP = isRechargeMember ? Number(biz.withdrawRange.memberMax || H5_WITHDRAW_MAX_POINTS) : Number(biz.withdrawRange.nonMemberMax || H5_WITHDRAW_MAX_POINTS);
		if (points < minP) {
			return { code: 400, message: testMerchant ? `单次兑换最低为 ${minP} 积分` : `单次兑换最低为 ${minP} 积分（${isRechargeMember ? '充值会员' : '非充值会员'}）` };
		}
		if (points > maxP) {
			return { code: 400, message: `单次兑换最高为 ${maxP} 积分` };
		}
		const periodCheck = await evaluateH5WithdrawPeriodLimits(merchant, biz, points, now, { skip: testMerchant });
		if (!periodCheck.ok) {
			return { code: 400, message: periodCheck.message || '已超过日/周提现上限' };
		}
		if (
			(periodCheck.dayMax > 0 || periodCheck.weekMax > 0) &&
			Number(periodCheck.periodCap || 0) >= 0 &&
			points > Number(periodCheck.periodCap || 0)
		) {
			return {
				code: 400,
				message: `受日/周提现上限限制，本次最多可兑换 ${Math.floor(Number(periodCheck.periodCap || 0))} 积分`
			};
		}
		const afford = validateH5WithdrawPointsAffordable(merchant, points);
		if (!afford.ok) return { code: afford.code, message: afford.message };
		const arBase = afford.arBase;
		const ap = afford.ap;
		const fee = H5_WITHDRAW_FEE_YUAN;
		const tax = Number((points * H5_WITHDRAW_TAX_RATE).toFixed(2));
		const payable = Number((points - tax - fee).toFixed(2));
		if (payable <= 0) {
			return { code: 400, message: '兑换积分扣除手续费后金额需大于 0' };
		}

		const merchantUserId = String(merchant.user_id || merchant._id || '');
		let company = '-';
		let salesman = '-';
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		const machine = pickPrimaryBoundMachine(merchant, boundMachines);
		if (machine) {
			company = String(machine.company || '').trim() || '-';
			salesman = String(machine.salesman || '').trim() || '-';
		}

		const withdrawNo = `H5${now}${randomStr(8)}`;
		const addRes = await withdrawCollection.add({
			withdraw_no: withdrawNo,
			merchant_user_id: merchantUserId,
			user_nickname: safeText(merchant.wx_nickname, 80),
			user_mobile: safeText(merchant.mobile, 20),
			device_id: safeText(machine?.device_id || merchant.device_id, 80),
			company,
			salesman,
			amount: points,
			fee_tax: Number((fee + tax).toFixed(2)),
			payable,
			is_paid: false,
			arrival_status: 'pending',
			audit_required: !!needAudit,
			audit_status: needAudit ? 'pending' : 'none',
			transfer_state: needAudit ? 'PENDING_AUDIT' : '',
			create_time: now,
			update_time: now,
			is_deleted: false,
			withdraw_member_bucket: withdrawMemberBucketForSummary(merchant)
		});
		const newWithdrawId = addRes.id;
		await writeTransferLog({
			stage: 'withdraw_apply_create',
			withdrawId: newWithdrawId,
			withdrawNo,
			merchantUserId,
			openid,
			deviceId: machine?.device_id || merchant.device_id,
			outBillNo: withdrawNo,
			transferState: needAudit ? 'PENDING_AUDIT' : 'CREATED',
			message: needAudit ? '用户发起提现（需审核）' : '用户发起提现（自动打款）',
			payload: { points, fee, tax, payable, needAudit }
		});
		const withdrawnBefore = Number(merchant.withdrawn || 0);
		const machineWithdrawnBefore = machine ? Number(machine.withdrawn_amount || 0) : 0;
		const pendingWithdrawBefore = Number(merchant.pending_withdraw || 0);
		const machinePendingBefore = machine ? Number(machine.pending_amount || 0) : 0;
		const restoreWithdrawDeduction = async () => {
			await merchantCollection.doc(merchant._id).update({
				available_reward: Number(arBase.toFixed(4)),
				withdraw_quota_balance: Number(arBase.toFixed(4)),
				account_points: Number(ap.toFixed(4)),
				withdraw_pending_balance: Number(ap.toFixed(4)),
				pending_withdraw: Number(pendingWithdrawBefore.toFixed(4)),
				withdrawn: Number(withdrawnBefore.toFixed(4)),
				update_time: nowTs()
			});
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number(machinePendingBefore.toFixed(4)),
					withdrawn_amount: Number(machineWithdrawnBefore.toFixed(4))
				});
			}
		};
		const quotaAfterDeduct = Number((arBase - points).toFixed(4));
		const pointsAfterDeduct = Number((ap - points).toFixed(4));
		try {
			// 点击“积分兑换提现”即先冻结并扣除积分与提现额度，防止回执未更新期间重复发起。
			await merchantCollection.doc(merchant._id).update({
				available_reward: quotaAfterDeduct,
				withdraw_quota_balance: quotaAfterDeduct,
				account_points: pointsAfterDeduct,
				withdraw_pending_balance: pointsAfterDeduct,
				pending_withdraw: Number((pendingWithdrawBefore + payable).toFixed(4)),
				update_time: now
			});
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number((machinePendingBefore + payable).toFixed(4))
				});
			}
			if (needAudit) {
				await sendWecomRobotText(`商户${maybeMerchantDisplayName(merchant)}申请提现，请及时处理。`);
				return {
					code: 0,
					message: '提交成功，待管理员审核后打款',
					data: {
						withdrawNo,
						points,
						feeTax: Number((fee + tax).toFixed(2)),
						tax,
						fee,
						payable,
						needAudit: true
					}
				};
			}
			// 先发起微信商家转账；该步骤才是“真实打款”
			let transferResp = null;
			try {
				transferResp = await wxPayMerchantTransferToOpenid(wc, {
					appid: wc.appId,
					openid,
					amountFen: Math.round(payable * 100),
					outBillNo: withdrawNo,
					reason: '积分兑换提现'
				});
				await writeTransferLog({
					stage: 'withdraw_auto_transfer_request',
					withdrawId: newWithdrawId,
					withdrawNo,
					merchantUserId,
					openid,
					deviceId: machine?.device_id || merchant.device_id,
					outBillNo: withdrawNo,
					message: '自动提现发起微信商家转账',
					payload: transferResp || {}
				});
			} catch (e) {
				const msg =
					e && e.name === 'WxPayRequestError' && e.wxBody
						? safeText(e.wxBody.message || e.wxBody.code || e.message, 180)
						: safeText(e.message || '微信打款失败', 180);
				await maybeNotifyWxOperatingAccountInsufficientWecom(e, {
					scene: '提现',
					withdrawNo,
					outBillNo: withdrawNo,
					merchantName: maybeMerchantDisplayName(merchant)
				});
				await withdrawCollection.doc(newWithdrawId).update({
					arrival_status: 'returned',
					update_time: nowTs(),
					transfer_error: msg
				});
				await restoreWithdrawDeduction();
				await writeTransferLog({
					stage: 'withdraw_auto_transfer_error',
					level: 'error',
					withdrawId: newWithdrawId,
					withdrawNo,
					merchantUserId,
					openid,
					deviceId: machine?.device_id || merchant.device_id,
					outBillNo: withdrawNo,
					transferState: 'FAILED',
					message: msg
				});
				return { code: 500, message: `微信提现失败：${msg}` };
			}

			let transferState = normalizeTransferState(transferResp?.state || transferResp?.status || '');
			let transferBillNo = safeText(transferResp?.transfer_bill_no || transferResp?.bill_no || '', 80);
			let transferQueryAfter = null;
			// 再查一次，尽量拿到最终态；若仍处理中则让前端看到“处理中”
			try {
				const q = await wxPayQueryMerchantTransfer(wc, withdrawNo);
				transferQueryAfter = q;
				if (q) {
					transferState = normalizeTransferState(q.state || q.status || transferState);
					transferBillNo = safeText(q.transfer_bill_no || transferBillNo, 80);
					await writeTransferLog({
						stage: 'withdraw_auto_transfer_query',
						withdrawId: newWithdrawId,
						withdrawNo,
						merchantUserId,
						openid,
						deviceId: machine?.device_id || merchant.device_id,
						outBillNo: withdrawNo,
						transferState,
						message: '自动提现查询微信状态',
						payload: q
					});
				}
			} catch (qe) {}

			const withdrawPackageInfo = safeText(
				pickTransferPackageInfo(transferQueryAfter) || pickTransferPackageInfo(transferResp) || '',
				1200
			);

			const isSuccess = transferState === 'SUCCESS';
			const isTerminalFail = ['FAIL', 'FAILED', 'CANCELLED'].includes(transferState);

			if (isSuccess) {
				if (withdrawPackageInfo) {
					await withdrawCollection.doc(newWithdrawId).update({
						package_info: withdrawPackageInfo,
						update_time: nowTs()
					});
				}
				const freshRes = await withdrawCollection.doc(newWithdrawId).get();
				const freshRow = freshRes.data && freshRes.data[0];
				await settleWithdrawSuccess(
					freshRow || { _id: newWithdrawId, amount: points, payable, merchant_user_id: merchantUserId, device_id: safeText(machine?.device_id || merchant.device_id, 80) },
					transferBillNo,
					transferState,
					{ arrivalTime: parseWxTransferSuccessTs(transferQueryAfter) || parseWxTransferSuccessTs(transferResp) || nowTs() }
				);
				return {
					code: 0,
					message: '提交成功，已完成微信打款',
					data: { withdrawNo, points, feeTax: Number((fee + tax).toFixed(2)), tax, fee, payable, transferState, transferBillNo }
				};
			}

			if (isTerminalFail) {
				const failMsg = safeText(
					transferResp?.fail_reason || transferResp?.message || transferResp?.state || transferState || '微信提现失败',
					180
				);
				await maybeNotifyWxOperatingAccountInsufficientWecom(failMsg, {
					scene: '提现',
					withdrawNo,
					outBillNo: withdrawNo,
					merchantName: maybeMerchantDisplayName(merchant)
				});
				await withdrawCollection.doc(newWithdrawId).update({
					arrival_status: 'returned',
					update_time: nowTs(),
					wx_trade_no: transferBillNo,
					transfer_state: transferState,
					transfer_error: failMsg
				});
				await restoreWithdrawDeduction();
				return { code: 500, message: `微信提现失败：${failMsg}` };
			}

			await withdrawCollection.doc(newWithdrawId).update({
				arrival_status: 'pending',
				update_time: nowTs(),
				wx_trade_no: transferBillNo,
				transfer_state: transferState,
				...(withdrawPackageInfo ? { package_info: withdrawPackageInfo } : {})
			});
			return {
				code: 0,
				message: '提交成功，微信打款处理中',
				data: { withdrawNo, points, feeTax: Number((fee + tax).toFixed(2)), tax, fee, payable, transferState, transferBillNo }
			};
		} catch (err) {
			try {
				if (newWithdrawId) await withdrawCollection.doc(newWithdrawId).remove();
			} catch (e2) {
				console.error('h5WithdrawApply rollback withdraw failed', e2);
			}
			if (machine) {
				try {
					await machineCollection.doc(machine._id).update({
						withdrawn_amount: Number(machineWithdrawnBefore.toFixed(4))
					});
					await machineCollection.doc(machine._id).update({
						pending_amount: Number(machinePendingBefore.toFixed(4))
					});
				} catch (e3) {
					console.error('h5WithdrawApply rollback machine withdrawn failed', e3);
				}
			}
			try {
				await merchantCollection.doc(merchant._id).update({
					available_reward: Number(arBase.toFixed(4)),
					withdraw_quota_balance: Number(arBase.toFixed(4)),
					account_points: Number(ap.toFixed(4)),
					withdraw_pending_balance: Number(ap.toFixed(4)),
					pending_withdraw: Number(pendingWithdrawBefore.toFixed(4)),
					withdrawn: Number(withdrawnBefore.toFixed(4)),
					update_time: nowTs()
				});
			} catch (e4) {
				console.error('h5WithdrawApply rollback merchant failed', e4);
			}
			throw err;
		}
	} catch (e) {
		console.error('h5WithdrawApply failed', e);
		return { code: 500, message: safeText(e?.message || '提交失败', 180) || '提交失败' };
	}
}

async function h5HomeDashboard(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		// 本地会话直进首页不会再走鉴权：在此刷新「最后登录」（1 小时内节流）
		await markMerchantLastLogin(merchant);
		const now = nowTs();
		const merchantId = String(merchant._id || merchant.user_id || '');
		const cacheSign = `${merchantId}|${Number(merchant.update_time || 0)}|${Number(merchant.recharge_cycle_start || 0)}|${Number(rawWithdrawQuotaBalance(merchant) || 0)}|${Number(rawPendingBalance(merchant) || 0)}|${Number(merchant.silver_member_end_at || 0)}`;
		const memHit = h5HomeDashboardCache.get(cacheSign);
		if (memHit && now - memHit.at < H5_HOME_DASH_CACHE_TTL_MS) {
			const payload = JSON.parse(JSON.stringify(memHit.payload));
			if (payload?.data) {
				payload.data.serverTime = now;
				const bizNow = await getBizSettings();
				payload.data.refundRuleLines = formatH5RefundRuleLines(bizNow);
			}
			return payload;
		}
		const redisDashKey = `hsy:h5:home:dash:${cacheSign}`;
		const redisHit = await redisH5.h5RedisGetJson(redisDashKey);
		if (redisHit && redisHit.code === 0 && redisHit.data) {
			const payload = redisHit;
			payload.data.serverTime = now;
			const bizNow = await getBizSettings();
			payload.data.refundRuleLines = formatH5RefundRuleLines(bizNow);
			h5HomeDashboardCache.set(cacheSign, { at: now, payload: JSON.parse(JSON.stringify(payload)) });
			return payload;
		}
		const withdrawMerchantKey = String(merchant.user_id || merchant._id || '');
		const bindIds = [String(merchant?.user_id || '').trim(), String(merchant?._id || '').trim()].filter(Boolean);
		const bindWhere = {
			is_deleted: false,
			is_bound: 1,
			bind_user_id: bindIds.length <= 1 ? bindIds[0] : db.command.in([...new Set(bindIds)])
		};
		const [boundCountRes, boundSampleRes, biz, withdrawSums, rechargePackages] = await Promise.all([
			bindIds.length ? machineCollection.where(bindWhere).count() : Promise.resolve({ total: 0 }),
			bindIds.length ? machineCollection.where(bindWhere).field({ device_id: true }).limit(8).get() : Promise.resolve({ data: [] }),
			getBizSettings(),
			getH5WithdrawSummaryCached(withdrawMerchantKey, now),
			loadRechargePackagesFromQuota()
		]);
		const { daySum, monthSum, yearSum } = withdrawSums;
		const boundCount = Number(boundCountRes?.total || boundCountRes?.result?.total || 0);
		const boundDeviceIds = [...new Set((boundSampleRes?.data || []).map((m) => safeText(m.device_id, 80)).filter(Boolean))];
		const deviceDisplay = boundCount
			? `${boundCount}个码牌：${boundDeviceIds.join('、')}${boundCount > boundDeviceIds.length ? '…' : ''}`
			: (safeText(merchant.device_id, 80) || '未绑定');
		const syncDash = await syncMerchantMembershipCycles(merchant, { biz, now });
		merchant = syncDash.merchant;
		const cycleCfg = syncDash.cycleCfg || resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		const countdown =
			syncDash.countdown ||
			computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
		let membership = h5MembershipInfo(merchant, rechargePackages);
		if (membership.tier === 'normal' && merchantHasRechargeMembership(merchant)) {
			const fixed = await resolveRechargeMembershipFallback(merchant, rechargePackages);
			if (fixed && fixed.tier && fixed.tier !== 'normal') {
				membership = fixed;
			}
		}
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const silverMonthTradeYuan = withdrawRole === 'silver_member' ? await getH5CurrentMonthTradeYuanCached(merchant, now) : 0;
		const withdrawQuotaTotalYuan = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		// 统一展示：白银会员剩余额度在 H5 置 0；与 used 条、进度条一致按展示值计算
		const availableRewardYuan = h5DisplayWithdrawQuotaRemainingYuan(merchant);
		// 与 H5「账号积分」、后台「待提现」同一口径：已领取（入账）且尚未通过提现申请扣减的积分余额，1 积分=1 元，随账号
		const accountPointsYuan = normalizePendingBalance(merchant);
		const usedQuotaYuan =
			withdrawQuotaTotalYuan > 0
				? Math.max(0, Number((withdrawQuotaTotalYuan - availableRewardYuan).toFixed(2)))
				: 0;
		const out = {
			code: 0,
			message: 'ok',
			data: {
				serverTime: now,
				merchant: compactMerchantInfo(merchant, { includeAgreementImg: false, h5Membership: membership }),
				device: {
					boundCount,
					display: deviceDisplay
				},
				membership,
				withdrawContext: {
					role: withdrawRole,
					silverMonthTradeYuan: Number(silverMonthTradeYuan.toFixed(2))
				},
				withdraw: {
					today: Number(daySum.totalWithdraw || 0).toFixed(2),
					month: Number(monthSum.totalWithdraw || 0).toFixed(2),
					year: Number(yearSum.totalWithdraw || 0).toFixed(2)
				},
				pendingWithdraw: accountPointsYuan.toFixed(2),
				quota: {
					remaining: availableRewardYuan.toFixed(2),
					totalGrantedYuan: withdrawQuotaTotalYuan,
					usedYuan: withdrawQuotaTotalYuan > 0 ? usedQuotaYuan.toFixed(2) : '0.00'
				},
				rechargePackages: (rechargePackages || []).map((x) => ({
					id: safeText(x.id, 40),
					title: safeText(x.title, 80),
					price: Number(x.price || 0),
					benefitTip: safeText(x.homeBenefitTip || x.benefitTip || '', 300),
					membershipName: safeText(x.membershipName || '', 40),
					giftChoiceRequired: !!x.giftChoiceRequired
				})),
				countdown: {
					phase: countdown.phase,
					days180Left: countdown.days180Left,
					refundDaysLeft: countdown.refundDaysLeft,
					windowStartMs: Number(countdown.windowStart || 0),
					windowEndMs: Number(countdown.windowEnd || 0),
					cycleAnchorStartMs: Number(countdown.start || 0)
				},
				refundCycle: {
					cycleDays: Number(cycleCfg.cycleDays || 180),
					windowDays: Number(cycleCfg.windowDays || 3)
				},
				refundPenaltyRate: Number(biz.refundPenaltyRate != null ? biz.refundPenaltyRate : DEFAULT_BIZ_SETTINGS.refundPenaltyRate),
				refundRuleLines: formatH5RefundRuleLines(biz),
				h5UiStyle: String(biz.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A'
			}
		};
		h5HomeDashboardCache.set(cacheSign, { at: now, payload: JSON.parse(JSON.stringify(out)) });
		await redisH5.h5RedisSetJson(redisDashKey, out, REDIS_EX_H5_HOME_DASH_SEC);
		return out;
	} catch (e) {
		console.error('h5HomeDashboard failed', e);
		return { code: 500, message: '获取首页数据失败' };
	}
}

function resolveAgreementSignClientIp(event, data = {}) {
	const ctx = event?.context || {};
	let ip = safeText(ctx.CLIENTIP || ctx.clientIP || '', 80);
	const xff = ctx['x-forwarded-for'] || ctx['X-Forwarded-For'];
	if (!ip && xff) {
		ip = safeText(String(xff).split(',')[0].trim(), 80);
	}
	if (!ip && data?.clientIp) ip = safeText(data.clientIp, 80);
	return ip;
}

function buildAgreementSignDeviceRecord(data = {}) {
	const fp = safeText(data?.agreementDeviceFingerprint || data?.deviceFingerprint || '', 64);
	const det = safeText(data?.agreementDeviceDetail || data?.deviceDetail || '', 240);
	const single = safeText(data?.agreementSignDevice || '', 320);
	if (single) return single.slice(0, 320);
	const merged = [fp && `fp:${fp}`, det].filter(Boolean).join(' | ');
	return merged.slice(0, 320);
}

async function h5SignAgreement(data, event = {}) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const signatureImage = String(data?.signatureImage || '').trim();
		if (!signatureImage) return { code: 400, message: '请先签名' };
		// 需读旧图以便覆盖签署时删除云文件；默认投影会排除 agreement_img
		const merchant = await getMerchantByIdOrUserId(merchantKey, { includeAgreementImg: true });
		if (!merchant) return { code: 404, message: '商户不存在' };
		const persisted = await persistAgreementImageRef(merchant._id, signatureImage);
		if (!persisted.ok) return { code: 500, message: persisted.message || '协议图片上传失败' };
		const agreementImgRef = persisted.ref;
		const curAgreement = await getCurrentAgreement();
		const agreementVersion = safeText(data?.agreementVersion || curAgreement?.version || 'legacy', 40);
		const now = nowTs();
		const agreementSignedIp = resolveAgreementSignClientIp(event, data);
		const agreementSignDevice = buildAgreementSignDeviceRecord(data);
		const prevImg = String(merchant.agreement_img || '').trim();
		await merchantCollection.doc(merchant._id).update({
			agreement_img: agreementImgRef,
			agreement_signed_at: now,
			agreement_version: agreementVersion,
			agreement_signed_ip: agreementSignedIp,
			agreement_sign_device: agreementSignDevice,
			update_time: now
		});
		if (prevImg && prevImg !== agreementImgRef && isAgreementImgCloudFileId(prevImg)) {
			await safeDeleteAgreementCloudFile(prevImg);
		}
		const displayUrl = await resolveAgreementImgDisplayUrl(agreementImgRef);
		return {
			code: 0,
			message: '签署成功',
			data: {
				agreementImg: displayUrl || agreementImgRef,
				agreementSignedAt: now,
				agreementSignedIp: agreementSignedIp,
				agreementSignDevice: agreementSignDevice
			}
		};
	} catch (e) {
		console.error('h5SignAgreement failed', e);
		return { code: 500, message: '签署失败' };
	}
}


/** 满额充值档（默认 1000 元）可二选一实物赠品，需在下单时传入 rechargeGiftType */
const RECHARGE_GIFT_PRICE = 1000;
const RECHARGE_GIFT_OPTIONS = [
	{ value: 'speaker', label: '蓝牙音响' },
	{ value: 'scan_pos', label: '扫码POS机' }
];
/** 同档位充值下单冷却：1 分钟内不允许重复创建 */
const H5_RECHARGE_SAME_TIER_COOLDOWN_MS = 60 * 1000;

function isSameRechargeTierOrder(orderCustom, pkg) {
	const custom = orderCustom || {};
	const targetPrice = Number(custom.target_price || 0);
	const pkgPrice = Number(pkg?.price || 0);
	const pkgId = safeText(pkg?.id, 40);
	const orderPkgId = safeText(custom.package_id, 40);
	if (orderPkgId && pkgId && orderPkgId === pkgId) return true;
	if (targetPrice > 0 && pkgPrice > 0 && targetPrice === pkgPrice) return true;
	return false;
}

async function findRecentSameTierRechargeOrder(merchantUserId, pkg, sinceTs) {
	const uid = safeText(merchantUserId, 120);
	if (!uid || !pkg) return null;
	const recentRes = await uniPayOrderCollection
		.where({
			user_id: uid,
			type: 'h5_quota_recharge',
			is_deleted: db.command.neq(true),
			create_date: db.command.gte(Number(sinceTs || 0))
		})
		.field({ custom: true, out_trade_no: true, create_date: true })
		.orderBy('create_date', 'desc')
		.limit(20)
		.get();
	return (recentRes.data || []).find((row) => isSameRechargeTierOrder(row.custom, pkg)) || null;
}

const H5_RECHARGE_PACKAGES = [
	{ id: 'pkg_600', title: '600元', price: 600, quota: 1000000, benefitTip: '600元配置100万交易量，等于补贴市场价的3800元手续费', giftChoiceRequired: false, giftOptions: [] },
	{ id: 'pkg_800', title: '800元', price: 800, quota: 1500000, benefitTip: '800元配置150万交易量，等于补贴市场价的5700元手续费', giftChoiceRequired: false, giftOptions: [] },
	{
		id: 'pkg_1000',
		title: '1000元',
		price: 1000,
		quota: 2000000,
		benefitTip: '1000元配置200万交易量，等于补贴市场价的7600元手续费；另可任选蓝牙音响或扫码POS机一台（支付成功后由后台发货）',
		giftChoiceRequired: true,
		giftOptions: RECHARGE_GIFT_OPTIONS
	}
];

const DEFAULT_QUOTA_PACKAGES = [
	{
		package_id: 'pkg_600',
		title: '升级 600 元',
		bonus_quota: '¥1000000.00',
		real_quota: 3800,
		price: 600,
		description:
			'每180天自动更新100万收款交易量奖励额度，提现奖励高达3800（政策周期 5 年）',
		membership_name: '黄金会员'
	},
	{
		package_id: 'pkg_800',
		title: '升级 800 元',
		bonus_quota: '¥1500000.00',
		real_quota: 5700,
		price: 800,
		description:
			'每180天自动更新150万收款交易量奖励额度，提现奖励高达5700（政策周期 5 年）',
		membership_name: '白金会员'
	},
	{
		package_id: 'pkg_1000',
		title: '升级 1000 元',
		bonus_quota: '¥2000000.00',
		real_quota: 7600,
		price: 1000,
		description:
			'每180天自动更新200万收款交易量奖励额度，提现奖励高达7600（政策周期 5 年）',
		membership_name: '钻石会员'
	}
];

function parseBonusQuotaYuan(raw) {
	const s = String(raw == null ? '' : raw);
	const n = Number(s.replace(/[^\d.]/g, ''));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 额度包标题：与后台表单预览一致，如「升级 600 元」 */
function buildQuotaPackageTitle(price) {
	const p = Number(price || 0);
	if (!Number.isFinite(p) || p <= 0) return '';
	return `升级 ${p} 元`;
}

/** 从免额度金额推导「100万」类展示值 */
function bonusQuotaToWanText(bonusRaw) {
	const n = parseBonusQuotaYuan(bonusRaw);
	if (!Number.isFinite(n) || n <= 0) return '';
	if (n >= 10000) {
		const wan = n / 10000;
		return Number.isInteger(wan) ? `${wan}万` : `${wan.toFixed(1)}万`;
	}
	return String(Math.round(n));
}

/**
 * 解析套餐说明中的 [H5] 配置块，驱动额度包升级页权益展示。
 * 配置示例见后台「套餐说明」占位说明；无 [H5] 时从文案与免额度/额度字段推断。
 */
function parseQuotaPackageH5Display(description, row = {}) {
	const raw = String(description || '');
	const rewardYuan = Number(row.real_quota != null ? row.real_quota : row.rewardYuan || 0);
	const defaults = {
		quotaValue: bonusQuotaToWanText(row.bonus_quota),
		quotaName: '收款交易量额度',
		rewardValue: rewardYuan > 0 ? String(Math.round(rewardYuan)) : '',
		rewardPrefix: '最高',
		rewardName: '提现奖励',
		cycleDays: 180,
		cycleRule: '每 180 天自动更新额度与提现奖励',
		metricCycleSub: '每 180 天自动更新',
		policyText: '政策周期 5 年 · 长期有效保障',
		badge: '核心权益',
		flash: '限时补贴'
	};

	const blockRe = /\[H5\]([\s\S]*?)(?:\[\/H5\]|$)/i;
	const blockMatch = raw.match(blockRe);
	if (blockMatch) {
		const kv = {};
		blockMatch[1].split('\n').forEach((line) => {
			const t = String(line || '').trim();
			if (!t || t.startsWith('#') || t === '---') return;
			const idx = t.indexOf('=');
			if (idx < 0) return;
			kv[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
		});
		const cycleDays = Number(kv['更新周期'] || kv['周期天数'] || defaults.cycleDays) || 180;
		const metricCycleSub = kv['指标周期说明'] || kv['周期说明'] || `每 ${cycleDays} 天自动更新`;
		const cycleRule = kv['更新规则'] || `每 ${cycleDays} 天自动更新额度与提现奖励`;
		const quotaValue = kv['额度数值'] || defaults.quotaValue;
		const qParts = splitQuotaValueUnit(quotaValue);
		return {
			quotaValue,
			quotaNum: qParts.num,
			quotaUnit: qParts.unit,
			quotaName: kv['额度名称'] || defaults.quotaName,
			rewardValue: kv['奖励数值'] || defaults.rewardValue,
			rewardPrefix: kv['奖励前缀'] || defaults.rewardPrefix,
			rewardName: kv['奖励名称'] || defaults.rewardName,
			cycleDays,
			cycleRule,
			metricCycleSub,
			policyText: kv['政策说明'] || defaults.policyText,
			badge: kv['角标'] || defaults.badge,
			flash: kv['副标'] || defaults.flash
		};
	}

	const prose = raw.trim();
	const wanM = prose.match(/(\d+(?:\.\d+)?)\s*万/);
	const rewardM = prose.match(/(?:提现(?:奖励|额度)|奖励|高达)[^\d]{0,12}(\d+)/);
	const cycleM = prose.match(/每\s*(\d+)\s*天/);
	const policyM = prose.match(/政策周期\s*(\d+)\s*年/);
	const cycleDays = cycleM && Number(cycleM[1]) > 0 ? Number(cycleM[1]) : defaults.cycleDays;
	const metricCycleSub = `每 ${cycleDays} 天自动更新`;
	const quotaValue = wanM ? `${wanM[1]}万` : defaults.quotaValue;
	const qParts = splitQuotaValueUnit(quotaValue);
	return {
		quotaValue,
		quotaNum: qParts.num,
		quotaUnit: qParts.unit,
		quotaName: defaults.quotaName,
		rewardValue: rewardM ? rewardM[1] : defaults.rewardValue,
		rewardPrefix: defaults.rewardPrefix,
		rewardName: defaults.rewardName,
		cycleDays,
		cycleRule: `每 ${cycleDays} 天自动更新额度与提现奖励`,
		metricCycleSub,
		policyText: policyM ? `政策周期 ${policyM[1]} 年 · 长期有效保障` : defaults.policyText,
		badge: defaults.badge,
		flash: defaults.flash
	};
}

function splitQuotaValueUnit(quotaValue) {
	const s = String(quotaValue || '').trim();
	const m = s.match(/^(\d+(?:\.\d+)?)(万)?$/);
	if (m) return { num: m[1], unit: m[2] || '' };
	return { num: s, unit: '' };
}

/** H5 额度包升级页：展示后台「套餐说明」全文（去掉 [H5] 标记，保留正文） */
function quotaPackageDescriptionForH5(description) {
	let s = safeText(description, 2000).trim();
	if (!s) return '';
	s = s.replace(/\[\/H5\]/gi, '').replace(/\[H5\]/gi, '');
	return s.replace(/\n{3,}/g, '\n\n').trim();
}

function parseSortOrder(raw, fallback = 0) {
	const n = Number(raw);
	if (!Number.isFinite(n)) return Number(fallback) || 0;
	return Math.trunc(n);
}

async function ensureDefaultQuotaPackages() {
	const now = nowTs();
	for (const item of DEFAULT_QUOTA_PACKAGES) {
		const ex = await quotaCollection.where({ package_id: item.package_id, is_deleted: false }).limit(1).get();
		if (ex.data && ex.data.length) continue;
		await quotaCollection.add({ ...item, create_time: now, update_time: now, is_deleted: false });
	}
}

const RECHARGE_PKG_LIST_TTL_MS = 60000;
let rechargePackagesListCache = { at: 0, data: null };
function stripTestRechargePackages(list = []) {
	const testIds = new Set(['pkg_0_1', H5_RECHARGE_TEST_AS_1000_PKG_ID]);
	return (Array.isArray(list) ? list : []).filter((x) => !testIds.has(String(x?.id || '').trim()));
}
async function loadRechargePackagesFromQuota() {
	const t = nowTs();
	if (rechargePackagesListCache.data && t - rechargePackagesListCache.at < RECHARGE_PKG_LIST_TTL_MS) {
		return stripTestRechargePackages(rechargePackagesListCache.data);
	}
	const rList = await redisH5.h5RedisGetJson(REDIS_KEY_QUOTA_PKGS);
	if (rList && Array.isArray(rList) && rList.length) {
		const clean = stripTestRechargePackages(rList);
		rechargePackagesListCache = { at: t, data: clean };
		return clean;
	}
	await ensureDefaultQuotaPackages();
	const products = await loadProductsListCached();
	const productsMap = new Map((products || []).map((x) => [String(x.id), x]));
	const res = await quotaCollection.where({ is_deleted: false }).orderBy('price', 'asc').limit(200).get();
	const core = (res.data || [])
		.map((x) => ({
			id: safeText(x.package_id, 40),
			title: safeText(x.title, 80) || buildQuotaPackageTitle(x.price),
			price: Number(x.price || 0),
			sortOrder: parseSortOrder(x.sort_order, Number(x.price || 0)),
			quota: parseBonusQuotaYuan(x.bonus_quota),
			rewardYuan: Number(x.real_quota || 0),
			benefitTip: safeText(x.description, 300),
			benefitText: quotaPackageDescriptionForH5(x.description),
			benefitDisplay: parseQuotaPackageH5Display(x.description, x),
			homeBenefitTip: safeText(x.brief_intro, 300) || safeText(x.description, 300),
			membershipName: safeText(x.membership_name, 40),
			relatedProductIds: Array.isArray(x.related_product_ids) ? x.related_product_ids.map((s) => safeText(s, 80)).filter(Boolean) : [],
			pickTotal: Number(x.pick_total || 0),
			pickRequired: Number(x.pick_required || 0),
			relatedProducts: (Array.isArray(x.related_product_ids) ? x.related_product_ids : [])
				.map((id) => productsMap.get(String(id)))
				.filter(Boolean)
				.map((p) => ({
					id: p.id,
					name: p.name,
					image: p.images && p.images.length ? p.images[0] : ''
				})),
			giftChoiceRequired: Number(x.price || 0) === RECHARGE_GIFT_PRICE,
			giftOptions: Number(x.price || 0) === RECHARGE_GIFT_PRICE ? RECHARGE_GIFT_OPTIONS : []
		}))
		.filter((x) => x.id && x.price > 0)
		.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.price - b.price);
	const out = !core.length ? H5_RECHARGE_PACKAGES : core;
	rechargePackagesListCache = { at: t, data: out };
	await redisH5.h5RedisSetJson(REDIS_KEY_QUOTA_PKGS, out, REDIS_EX_QUOTA_SEC);
	return out;
}

async function invalidateH5QuotaPackagesCache() {
	rechargePackagesListCache = { at: 0, data: null };
	await redisH5.h5RedisDel(REDIS_KEY_QUOTA_PKGS);
	await invalidateAdminHomeSummaryCache();
}

let productsListCache = { at: 0, data: null };
async function loadProductsListCached() {
	const t = nowTs();
	if (productsListCache.data && t - productsListCache.at < RECHARGE_PKG_LIST_TTL_MS) {
		return productsListCache.data;
	}
	const rList = await redisH5.h5RedisGetJson(REDIS_KEY_PRODUCTS);
	if (Array.isArray(rList)) {
		productsListCache = { at: t, data: rList };
		return rList;
	}
	const res = await productCollection
		.where({ is_deleted: false })
		.orderBy('sort_order', 'asc')
		.orderBy('create_time', 'desc')
		.limit(1000)
		.get();
	const list = (res.data || []).map((x) => ({
		id: String(x._id || ''),
		name: safeText(x.name, 80),
		intro: safeText(x.intro, 500),
		images: Array.isArray(x.images) ? x.images.map((s) => safeText(s, 500)).filter(Boolean) : [],
		isEnabled: x.is_enabled !== false,
		sortOrder: Number(x.sort_order || 0)
	}));
	productsListCache = { at: t, data: list };
	await redisH5.h5RedisSetJson(REDIS_KEY_PRODUCTS, list, REDIS_EX_PRODUCTS_SEC);
	return list;
}

async function invalidateProductsListCache() {
	productsListCache = { at: 0, data: null };
	await redisH5.h5RedisDel(REDIS_KEY_PRODUCTS);
}

function buildRechargePackagesFromRules(rechargeRules = DEFAULT_RECHARGE_RULES) {
	const core = (Array.isArray(rechargeRules) ? rechargeRules : DEFAULT_RECHARGE_RULES)
		.map((x) => ({
			id: `pkg_${String(Number(x.price || 0)).replace('.', '_')}`,
			title: `${Number(x.price || 0)}元`,
			price: Number(x.price || 0),
			quota: Number(x.quota || 0),
			benefitTip: String(x.tip || '').trim(),
			giftChoiceRequired: Number(x.price || 0) === RECHARGE_GIFT_PRICE,
			giftOptions: Number(x.price || 0) === RECHARGE_GIFT_PRICE ? RECHARGE_GIFT_OPTIONS : []
		}))
		.filter((x) => x.price > 0)
		.sort((a, b) => a.price - b.price);
	if (!core.length) return H5_RECHARGE_PACKAGES;
	return core;
}

function pickRechargePackage(packageId, packages = H5_RECHARGE_PACKAGES) {
	const id = safeText(packageId, 40);
	return packages.find((x) => x.id === id) || null;
}

function getRechargePackageByPrice(price, packages = H5_RECHARGE_PACKAGES) {
	const p = Number(price || 0);
	return packages.find((x) => Number(x.price) === p) || null;
}

function computeRechargeCountdown(cycleStartTs, now = nowTs(), cycleDays = 180, windowDays = 3) {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const CYCLE_MS = Math.max(1, Number(cycleDays || 180)) * DAY_MS;
	const WINDOW_MS = Math.max(1, Number(windowDays || 3)) * DAY_MS;
	let start = Number(cycleStartTs || 0);
	if (!start) {
		return {
			start,
			phase: 'none',
			days180Left: 0,
			refundDaysLeft: 0,
			windowStart: 0,
			windowEnd: 0,
			normalized: false
		};
	}

	let normalized = false;
	while (now >= start + CYCLE_MS + WINDOW_MS) {
		start += CYCLE_MS + WINDOW_MS;
		normalized = true;
	}

	const windowStart = start + CYCLE_MS;
	const windowEnd = windowStart + WINDOW_MS;
	if (now < windowStart) {
		return {
			start,
			phase: 'lock',
			days180Left: Math.max(0, Math.ceil((windowStart - now) / DAY_MS)),
			refundDaysLeft: 0,
			windowStart,
			windowEnd,
			normalized
		};
	}
	if (now < windowEnd) {
		return {
			start,
			phase: 'window',
			days180Left: 0,
			refundDaysLeft: Math.max(0, Math.ceil((windowEnd - now) / DAY_MS) - 1), // 2,1,0
			windowStart,
			windowEnd,
			normalized
		};
	}
	return {
		start: windowEnd,
		phase: 'lock',
		days180Left: 180,
		refundDaysLeft: 0,
		windowStart: windowEnd + CYCLE_MS,
		windowEnd: windowEnd + CYCLE_MS + WINDOW_MS,
		normalized: true
	};
}

function resolveMerchantRefundCycleDays(merchant, globalRefundCycle = DEFAULT_BIZ_SETTINGS.refundCycle) {
	const hasOldRecharge = Number(merchant?.recharge_package_price || 0) > 0 || Number(merchant?.recharge_cycle_start || 0) > 0;
	const cycleDays = Number(merchant?.recharge_cycle_days || 0);
	const windowDays = Number(merchant?.recharge_window_days || 0);
	if (cycleDays > 0 && windowDays > 0) return { cycleDays, windowDays };
	if (hasOldRecharge) return { cycleDays: 180, windowDays: 3 };
	return {
		cycleDays: Math.max(1, Number(globalRefundCycle?.cycleDays || 180)),
		windowDays: Math.max(1, Number(globalRefundCycle?.windowDays || 3))
	};
}

function merchantHasRechargeMembership(merchant) {
	if (!merchant) return false;
	if (Number(merchant.recharge_total_yuan || 0) > 0) return true;
	if (Number(merchant.recharge_package_price || 0) > 0) return true;
	if (Number(merchant.recharge_cycle_start || 0) > 0) return true;
	if (Number(merchant.recharge_package_reward || 0) > 0) return true;
	if (Number(merchant.recharge_package_quota || 0) > 0) return true;
	if (Number(merchant.estimated_free_quota || 0) > 0 && Number(merchant.available_reward || merchant.withdraw_quota_balance || 0) > 0) {
		return true;
	}
	return false;
}

async function invalidateH5MerchantCaches(merchant) {
	const merchantUserId = String(merchant?.user_id || merchant?._id || '');
	try {
		h5HomeDashboardCache.clear();
	} catch (e) {}
	if (merchantUserId) {
		await redisH5.h5RedisDel(`hsy:h5:member:hint:${merchantUserId}`);
	}
}

async function resetMerchantAfterRechargeRefund(merchant, transferOrder, event = {}) {
	if (!merchant || !merchant._id) return;
	const now = nowTs();
	const merchantUserId = String(merchant.user_id || merchant._id || '');
	const rechargeLogIds = Array.isArray(transferOrder?.recharge_log_ids) ? transferOrder.recharge_log_ids.filter(Boolean) : [];
	if (rechargeLogIds.length) {
		await operationLogCollection.where({ _id: db.command.in(rechargeLogIds) }).update({ refunded: true, refund_time: now });
	}
	if (merchantUserId) {
		await operationLogCollection
			.where({
				user_id: merchantUserId,
				action: 'h5_quota_recharge',
				refunded: false
			})
			.update({ refunded: true, refund_time: now });
	}
	await merchantCollection.doc(merchant._id).update({
		remaining_quota: 0,
		available_reward: 0,
		withdraw_quota_balance: 0,
		estimated_free_quota: 0,
		membership_name: '普通会员',
		recharge_package_id: '',
		recharge_package_price: 0,
		recharge_package_quota: 0,
		recharge_package_reward: 0,
		recharge_cycle_start: 0,
		recharge_total_yuan: 0,
		recharge_amount: 0,
		recharge_update_time: 0,
		silver_member: false,
		...(Number(merchant.silver_member_end_at || 0) > now ? { silver_member_end_at: now } : {}),
		update_time: now
	});
	if (transferOrder && transferOrder._id) {
		const hasRefundLog = await operationLogCollection
			.where({
				target_id: merchant._id,
				action: 'h5_refund_reset',
				platform_no: transferOrder.out_bill_no || transferOrder.refund_no || ''
			})
			.limit(1)
			.get();
		if (!(hasRefundLog.data && hasRefundLog.data.length)) {
			await operationLogCollection.add({
				user_id: merchant.user_id || merchant._id,
				user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
				action: 'h5_refund_reset',
				module: 'finance',
				target_id: merchant._id,
				target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
				content: 'H5退款：原路退款成功并清空充值权益额度（待提现/历史提现/奖励/积分不变）',
				operator_source: 'admin',
				operator: getOperator(event),
				platform_no: transferOrder.out_bill_no || transferOrder.refund_no || '',
				refund_amount: Number(transferOrder.refund_amount || 0),
				refund_penalty_amount: Number(transferOrder.penalty_amount || 0),
				refund_final_amount: Number(transferOrder.final_refund_amount || 0),
				refund_reason: safeText(transferOrder.reason || '', 80),
				create_time: now
			});
		}
		await transferOrderCollection.doc(transferOrder._id).update({
			applied: true,
			applied_at: now,
			update_time: now
		});
	}
	await invalidateH5MerchantCaches(merchant);
}

function resolveRechargePackageQuotaAndReward(merchant, rechargeRules = DEFAULT_RECHARGE_RULES) {
	let reward = Number(merchant?.recharge_package_reward || 0);
	let quota = Number(merchant?.recharge_package_quota || 0);
	if (quota <= 0) quota = Number(merchant?.estimated_free_quota || 0);
	const price = resolveRechargePriceForReward(merchant, rechargeRules);
	if (reward <= 0) reward = grantYuanByRechargePrice(price, rechargeRules);
	if (quota <= 0) {
		if (reward >= 7600 || price >= 1000) quota = 2000000;
		else if (reward >= 5700 || price >= 800) quota = 1500000;
		else if (reward >= 3800 || price >= 600 || price === 0.1) quota = 1000000;
	}
	return {
		reward: Number(Number(reward || 0).toFixed(2)),
		quota: Number(quota || 0)
	};
}

function buildSilverMembershipExpiryPatch(merchant, now = nowTs()) {
	if (!merchant) return null;
	const endAt = Number(merchant.silver_member_end_at || 0);
	if (!endAt || now < endAt) return null;
	const hadSilver =
		merchant.silver_member === true ||
		merchant.exchange_code_claimed === true ||
		merchant.redeem_code_claimed === true ||
		String(merchant.membership_name || '').includes('白银');
	if (!hadSilver) return null;
	const patch = {
		silver_member: false,
		update_time: now
	};
	if (merchantHasRechargeMembership(merchant)) {
		return patch;
	}
	return {
		...patch,
		membership_name: '普通会员',
		available_reward: 0,
		withdraw_quota_balance: 0,
		estimated_free_quota: 0,
		recharge_package_quota: 0,
		recharge_package_reward: 0,
		remaining_quota: 0
	};
}

function buildRechargeCycleRolloverPatch(merchant, countdown, biz, now = nowTs()) {
	if (!merchant || !countdown?.normalized) return null;
	if (!merchantHasRechargeMembership(merchant)) return null;
	const newStart = Number(countdown.start || 0);
	if (!newStart || newStart === Number(merchant.recharge_cycle_start || 0)) return null;
	const { reward, quota } = resolveRechargePackageQuotaAndReward(merchant, biz.rechargeRules);
	return {
		recharge_cycle_start: newStart,
		available_reward: reward,
		withdraw_quota_balance: reward,
		estimated_free_quota: quota,
		recharge_package_quota: quota,
		recharge_package_reward: reward,
		recharge_update_time: now,
		update_time: now
	};
}

/**
 * 白银到期降级；充值会员在 180+窗口 后未退款则顺延周期并重置套餐额度（待提现/账号积分不变）。
 */
async function syncMerchantMembershipCycles(merchant, options = {}) {
	if (!merchant || !merchant._id) {
		return { merchant, countdown: null, cycleCfg: null, updated: false };
	}
	const now = options.now != null ? options.now : nowTs();
	const biz = options.biz || (await getBizSettings());
	const patch = {};
	const silverPatch = buildSilverMembershipExpiryPatch(merchant, now);
	if (silverPatch) Object.assign(patch, silverPatch);
	const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
	let countdown = computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
	const rolloverPatch = buildRechargeCycleRolloverPatch(merchant, countdown, biz, now);
	if (rolloverPatch) {
		Object.assign(patch, rolloverPatch);
		countdown = computeRechargeCountdown(rolloverPatch.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
	}
	const updated = Object.keys(patch).length > 0;
	if (updated) {
		Object.assign(merchant, patch);
		await merchantCollection.doc(merchant._id).update(patch);
		const parts = [];
		if (silverPatch) parts.push('白银会员到期处理');
		if (rolloverPatch) {
			const { reward, quota } = resolveRechargePackageQuotaAndReward(merchant, biz.rechargeRules);
			parts.push(`充值周期顺延：可用奖励重置为${reward}元，额度包重置为${quota}`);
		}
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
			action: 'membership_cycle_sync',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: parts.join('；') || '会员周期同步',
			operator_source: 'system',
			operator: 'system',
			create_time: now
		});
	}
	return { merchant, countdown, cycleCfg, updated };
}

function requireH5AgreementSigned(merchant) {
	// 协议管理可配置“是否通知所有商户重新签署”
	// - 否：历史已签商户继续有效，新商户按新协议签署
	// - 是：所有商户需签署当前版本
	const curAgreement = merchant && merchant.__curAgreement ? merchant.__curAgreement : null;
	const ok = isMerchantAgreementSatisfied(merchant, curAgreement);
	if (ok) return null;
	return { code: 403, message: '请先签署优惠活动计划书后再进行额度充值', needAgreement: true };
}

async function h5RechargeOptions(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const biz = await getBizSettings();
		const now = nowTs();
		const syncRecharge = await syncMerchantMembershipCycles(merchant, { biz, now });
		merchant = syncRecharge.merchant;
		const cycleCfg = syncRecharge.cycleCfg || resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		const rechargePackages = await loadRechargePackagesFromQuota();
		const countdown =
			syncRecharge.countdown ||
			computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
		const currentPkg = pickRechargePackage(merchant.recharge_package_id, rechargePackages) || getRechargePackageByPrice(merchant.recharge_package_price, rechargePackages);
		return {
			code: 0,
			message: 'ok',
			data: {
				packages: rechargePackages,
				notifyUrls: { pay: H5_PAY_NOTIFY_URL, refund: H5_REFUND_NOTIFY_URL },
				currentPackage: currentPkg
					? {
							id: currentPkg.id,
							title: currentPkg.title,
							price: currentPkg.price,
							quota: currentPkg.quota,
							membershipName: currentPkg.membershipName || ''
					  }
					: null,
				countdown: {
					phase: countdown.phase,
					days180Left: countdown.days180Left,
					refundDaysLeft: countdown.refundDaysLeft
				},
				refundCycle: {
					cycleDays: Number(cycleCfg.cycleDays || 180),
					windowDays: Number(cycleCfg.windowDays || 3)
				}
			}
		};
	} catch (e) {
		console.error('h5RechargeOptions failed', e);
		return { code: 500, message: '获取充值配置失败' };
	}
}

async function h5RechargeCreate(data, event) {
	try {
		await getBizSettings();
		const cfg = ensureWxRechargePayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const rc = wxRechargeCredentials();
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const rechargePackages = await loadRechargePackagesFromQuota();
		const pkg = pickRechargePackage(data?.packageId, rechargePackages);
		if (!pkg) return { code: 400, message: '请选择有效充值套餐' };
		const giftTypeRaw = safeText(data?.rechargeGiftType || data?.giftType, 20);
		let rechargeGiftType = '';
		let rechargeGiftLabel = '';
		const giftRequired = Boolean(pkg.giftChoiceRequired) || Number(pkg.price) === RECHARGE_GIFT_PRICE;
		if (giftRequired) {
			if (giftTypeRaw !== 'speaker' && giftTypeRaw !== 'scan_pos') {
				return { code: 400, message: '请选择赠品：蓝牙音响或扫码POS机' };
			}
			rechargeGiftType = giftTypeRaw;
			rechargeGiftLabel = (RECHARGE_GIFT_OPTIONS.find((x) => x.value === rechargeGiftType) || {}).label || '';
		}
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const needSign = requireH5AgreementSigned(merchant);
		if (needSign) return needSign;
		const openid = safeText(merchant.wx_openid, 100);
		if (!openid) return { code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
		const currentPkg = pickRechargePackage(merchant.recharge_package_id, rechargePackages) || getRechargePackageByPrice(merchant.recharge_package_price, rechargePackages);
		const currentPrice = Number(currentPkg ? currentPkg.price : merchant.recharge_package_price || 0);
		if (currentPrice > 0 && Number(pkg.price) <= currentPrice) {
			return { code: 400, message: '仅支持补差价升级到更高档位' };
		}
		const now = nowTs();
		const currentQuota = Number(currentPkg ? currentPkg.quota : merchant.recharge_package_quota || 0);
		const payAmount = currentPrice > 0 ? Number(pkg.price || 0) - currentPrice : Number(pkg.price || 0);
		const addQuota = Math.max(0, Number(pkg.quota || 0) - currentQuota);
		const payFeeFen = Math.round(payAmount * 100);
		if (payFeeFen <= 0) return { code: 400, message: '当前档位无需支付，请选择更高档位' };
		const dupOrder = await findRecentSameTierRechargeOrder(merchant.user_id || merchant._id, pkg, now - H5_RECHARGE_SAME_TIER_COOLDOWN_MS);
		if (dupOrder) {
			return { code: 400, message: '1分钟内请勿重复创建同档位充值订单' };
		}

		const orderNo = `H5R${now}${randomStr(6).toUpperCase()}`.slice(0, 28);
		const createBody = {
			appid: rc.appId,
			mchid: rc.mchId,
			description: `额度充值-${pkg.title}`,
			out_trade_no: orderNo,
			notify_url: H5_PAY_NOTIFY_URL,
			amount: { total: payFeeFen, currency: 'CNY' },
			payer: { openid }
		};
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_h5_order_pre_wx',
			merchantUserId: merchant.user_id || merchant._id,
			outBillNo: orderNo,
			withdrawNo: orderNo,
			message: '用户拉起充值：已生成单号，正在请求微信 JSAPI 下单',
			payload: { packageId: pkg.id, packageTitle: pkg.title, payFeeFen, notifyUrlTail: String(H5_PAY_NOTIFY_URL || '').slice(-48) }
		});
		const wxRes = await wxPayRequestFor(rc, 'POST', '/v3/pay/transactions/jsapi', createBody);
		const prepayId = safeText(wxRes.prepay_id, 120);
		if (!prepayId) {
			const maybeMsg = safeText(
				String(wxRes.message || wxRes.errmsg || wxRes.code || wxRes.errcode || wxRes._raw || ''),
				180
			);
			console.error('[h5RechargeCreate] missing prepay_id wxRes=', JSON.stringify(wxRes));
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_h5_order_wx_create_fail',
				level: 'error',
				merchantUserId: merchant.user_id || merchant._id,
				outBillNo: orderNo,
				withdrawNo: orderNo,
				message: maybeMsg ? `用户拉起充值：微信 JSAPI 未返回 prepay_id（${maybeMsg}）` : '用户拉起充值：微信 JSAPI 未返回 prepay_id',
				payload: { orderNo, wxRes: safeJson(wxRes, 3500) }
			});
			return { code: 500, message: maybeMsg ? `微信下单失败：${maybeMsg}` : '微信下单失败：未返回 prepay_id' };
		}

		const addPayRes = await uniPayOrderCollection.add({
			provider: 'wxpay',
			provider_pay_type: 'jsapi',
			uni_platform: 'h5',
			status: 0,
			type: 'h5_quota_recharge',
			order_no: orderNo,
			out_trade_no: orderNo,
			user_id: merchant.user_id || merchant._id,
			nickname: merchant.wx_nickname || '微信用户',
			client_ip: event?.context?.CLIENTIP || '',
			openid,
			description: `额度充值-${pkg.title}`,
			total_fee: payFeeFen,
			provider_appid: rc.appId,
			appid: '__UNI__2C9940A',
			custom: {
				merchant_id: merchant._id,
				package_id: pkg.id,
				package_title: pkg.title,
				target_membership_name: safeText(pkg.membershipName || '', 40),
				target_price: Number(pkg.price || 0),
				before_price: Number(currentPrice || 0),
				target_quota: Number(pkg.quota || 0),
				target_reward: Number(pkg.rewardYuan || 0),
				add_quota: Number(addQuota || 0),
				before_reward: Number(currentPkg?.rewardYuan || 0),
				paid_amount: Number(payAmount || 0),
				wx_pay_profile: 'recharge',
				wx_pay_mchid: rc.mchId,
				...(rechargeGiftType
					? { recharge_gift_type: rechargeGiftType, recharge_gift_label: rechargeGiftLabel }
					: {})
			},
			create_date: now,
			is_deleted: false
		});
		const payOrderId = safeText(addPayRes.id, 80);
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_h5_order_created',
			merchantUserId: merchant.user_id || merchant._id,
			withdrawId: payOrderId,
			withdrawNo: orderNo,
			outBillNo: orderNo,
			message: '用户拉起充值：已创建待支付订单（JSAPI）',
			payload: { packageId: pkg.id, packageTitle: pkg.title, totalFeeFen: payFeeFen }
		});

		const timeStamp = String(Math.floor(now / 1000));
		const nonceStr = randomStr(24);
		const pkgSign = `prepay_id=${prepayId}`;
		const paySignMessage = `${rc.appId}\n${timeStamp}\n${nonceStr}\n${pkgSign}\n`;
		const paySign = signWxV3MessageWithKey(rc.privateKey, paySignMessage);
		return {
			code: 0,
			message: '下单成功',
			data: {
				orderNo,
				packageTitle: pkg.title,
				paidAmount: Number(payAmount || 0),
				quotaAdded: Number(addQuota || 0),
				wxPayParams: {
					appId: rc.appId,
					timeStamp,
					nonceStr,
					package: pkgSign,
					signType: 'RSA',
					paySign
				}
			}
		};
	} catch (e) {
		console.error('h5RechargeCreate failed', e);
		if (e && e.name === 'WxPayRequestError' && e.wxBody) {
			console.error('[h5RechargeCreate] wechat_json', JSON.stringify(e.wxBody));
		}
		const baseMsg = safeText(e.message || '微信下单异常', 180);
		const out = { code: 500, message: `充值失败：${baseMsg}` };
		if (e && e.name === 'WxPayRequestError' && e.wxBody && Object.keys(e.wxBody).length) {
			out.data = { wxPayError: e.wxBody };
		}
		return out;
	}
}

async function h5RechargeConfirm(data) {
	try {
		const cfg = ensureWxRechargePayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const outTradeNo = safeText(data?.orderNo, 40);
		if (!outTradeNo) return { code: 400, message: '缺少订单号' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const orderRes = await uniPayOrderCollection.where({ out_trade_no: outTradeNo }).limit(1).get();
		const order = orderRes.data && orderRes.data[0];
		if (!order) return { code: 404, message: '订单不存在' };
		if (String(order.user_id || '') !== String(merchant.user_id || merchant._id)) {
			return { code: 403, message: '订单不属于当前用户' };
		}
		if (Number(order.status) === 1 && order.user_order_success) {
			if (!(order.custom && order.custom.recharge_applied)) {
				await applyRechargeByOrder(order);
			}
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_h5_confirm_already_paid',
				merchantUserId: order.user_id,
				withdrawId: order._id,
				withdrawNo: outTradeNo,
				outBillNo: outTradeNo,
				message: 'H5 主动查单/轮询：本地已支付，本次补触发额度同步'
			});
			return { code: 0, message: '支付成功', data: { paid: true } };
		}

		const payCreds = wxCredentialsForPayOrder(order);
		const queryPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(payCreds.mchId)}`;
		const q = await wxPayRequestFor(payCreds, 'GET', queryPath, null);
		if (q.trade_state !== 'SUCCESS') {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_h5_confirm_poll',
				merchantUserId: order.user_id,
				withdrawId: order._id,
				withdrawNo: outTradeNo,
				outBillNo: outTradeNo,
				message: `H5 主动查单/轮询：微信交易状态=${safeText(q.trade_state, 32) || '未知'}`,
				payload: { trade_state: q.trade_state }
			});
			return { code: 0, message: '未支付', data: { paid: false, tradeState: q.trade_state || '' } };
		}
		const now = nowTs();
		await uniPayOrderCollection.doc(order._id).update({
			status: 1,
			transaction_id: safeText(q.transaction_id, 80),
			notify_date: now,
			pay_date: now,
			user_order_success: true,
			original_data: q
		});
		await applyRechargeByOrder(order);
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_h5_confirm_paid_sync',
			merchantUserId: order.user_id,
			withdrawId: order._id,
			withdrawNo: outTradeNo,
			outBillNo: outTradeNo,
			message: 'H5 主动查单/轮询：微信已支付，已补写订单并同步额度',
			payload: { transaction_id: q.transaction_id }
		});
		return { code: 0, message: '支付成功', data: { paid: true } };
	} catch (e) {
		console.error('h5RechargeConfirm failed', e);
		if (e && e.name === 'WxPayRequestError' && e.wxBody) {
			console.error('[h5RechargeConfirm] wechat_json', JSON.stringify(e.wxBody));
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_h5_confirm_error',
				level: 'error',
				withdrawNo: safeText(data?.orderNo, 40),
				outBillNo: safeText(data?.orderNo, 40),
				message: safeText(e.message || '确认支付失败', 200),
				payload: e.wxBody || {}
			});
			const out = {
				code: 500,
				message: safeText(e.message || '确认支付失败', 180),
				data: { wxPayError: e.wxBody }
			};
			return out;
		}
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_h5_confirm_error',
			level: 'error',
			withdrawNo: safeText(data?.orderNo, 40),
			outBillNo: safeText(data?.orderNo, 40),
			message: safeText(e?.message || '确认支付失败', 200)
		});
		return { code: 500, message: '确认支付失败' };
	}
}

/** 管理端：近 N 天 status=0 的微信支付单，逐笔向微信查单；成功则补写订单并调用 applyRechargeByOrder（H5 额度充值会同步会员额度） */
const ADMIN_PENDING_WX_SYNC_DAYS = 7;
const ADMIN_PENDING_WX_SYNC_MAX = 150;

async function adminSyncPendingRechargeFromWx(data) {
	const now = nowTs();
	const cutoff = now - ADMIN_PENDING_WX_SYNC_DAYS * 24 * 60 * 60 * 1000;
	const limRaw = Number(data?.limit);
	const lim = Math.min(250, Math.max(1, Number.isFinite(limRaw) && limRaw > 0 ? Math.floor(limRaw) : ADMIN_PENDING_WX_SYNC_MAX));
	try {
		const res = await uniPayOrderCollection
			.where({
				provider: 'wxpay',
				status: 0,
				is_deleted: db.command.neq(true),
				create_date: db.command.gte(cutoff)
			})
			.field({
				_id: true,
				out_trade_no: true,
				order_no: true,
				user_id: true,
				custom: true,
				type: true,
				provider: true,
				mchid: true,
				provider_mchid: true
			})
			.orderBy('create_date', 'desc')
			.limit(lim)
			.get();
		const rows = res.data || [];
		const details = [];
		let scanned = 0;
		let synced = 0;
		let stillPending = 0;
		let errors = 0;
		for (const order of rows) {
			const outTradeNo = safeText(order.out_trade_no || order.order_no, 40);
			if (!outTradeNo) {
				details.push({ out_trade_no: '', note: 'skip_no_out_trade_no' });
				continue;
			}
			scanned += 1;
			try {
				const payCreds = wxCredentialsForPayOrder(order);
				const queryPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(payCreds.mchId)}`;
				const q = await wxPayRequestFor(payCreds, 'GET', queryPath, null);
				if (q.trade_state !== 'SUCCESS') {
					stillPending += 1;
					details.push({ out_trade_no: outTradeNo, trade_state: q.trade_state || '' });
					continue;
				}
				const latestRes = await uniPayOrderCollection.doc(order._id).get();
				const latest = latestRes.data && latestRes.data[0];
				if (!latest) {
					details.push({ out_trade_no: outTradeNo, note: 'order_gone' });
					continue;
				}
				if (Number(latest.status) !== 0) {
					if (
						Number(latest.status) === 1 &&
						latest.user_order_success &&
						latest.custom &&
						!latest.custom.recharge_applied
					) {
						await applyRechargeByOrder(latest);
						synced += 1;
						details.push({ out_trade_no: outTradeNo, note: 'reapply_quota_only' });
					} else {
						details.push({ out_trade_no: outTradeNo, note: 'already_not_pending' });
					}
					continue;
				}
				const ts = nowTs();
				await uniPayOrderCollection.doc(latest._id).update({
					status: 1,
					transaction_id: safeText(q.transaction_id, 80),
					notify_date: ts,
					pay_date: ts,
					user_order_success: true,
					original_data: q,
					update_date: ts
				});
				await applyRechargeByOrder(latest);
				synced += 1;
				details.push({ out_trade_no: outTradeNo, synced: true });
			} catch (e) {
				errors += 1;
				const wxBody = e && e.name === 'WxPayRequestError' ? e.wxBody : null;
				details.push({
					out_trade_no: outTradeNo,
					error: safeText(e?.message || 'wx_query_failed', 160),
					wx: wxBody ? safeJson(wxBody, 500) : ''
				});
				console.error('[adminSyncPendingRechargeFromWx] fail', outTradeNo, e);
			}
		}
		if (scanned > 0 || synced > 0 || errors > 0) {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_admin_batch_sync',
				message: `管理端/定时：近${ADMIN_PENDING_WX_SYNC_DAYS}天待支付查单 scanned=${scanned} synced=${synced} stillPending=${stillPending} errors=${errors}`,
				payload: {
					scanned,
					synced,
					stillPending,
					errors,
					truncated: rows.length >= lim,
					limit: lim
				}
			});
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				days: ADMIN_PENDING_WX_SYNC_DAYS,
				cutoff,
				scanned,
				synced,
				stillPending,
				errors,
				truncated: rows.length >= lim,
				limit: lim,
				details: details.slice(0, 80)
			}
		};
	} catch (e) {
		console.error('adminSyncPendingRechargeFromWx failed', e);
		return { code: 500, message: safeText(e?.message || '同步失败', 160) };
	}
}

async function h5WxPayNotify(data) {
	try {
		const headers = data?.headers || {};
		const rawBody = String(data?.rawBody || JSON.stringify(data?.body || {}));
		const verifyRes = verifyWxCallbackSignatureDual(headers, rawBody);
		if (!verifyRes.ok) {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_wx_notify_verify_fail',
				level: 'error',
				message: safeText(verifyRes.message || '签名校验失败', 200),
				payload: { headerKeys: Object.keys(headers || {}) }
			});
			return { code: 400, message: verifyRes.message, data: { ack: wxAckFail(verifyRes.message) } };
		}
		const bodyObj = data?.body && typeof data.body === 'object' ? data.body : JSON.parse(rawBody || '{}');
		if (bodyObj.event_type !== 'TRANSACTION.SUCCESS') {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_wx_notify_skip',
				message: `微信支付回调：忽略事件类型 ${safeText(bodyObj.event_type, 48)}`,
				payload: { event_type: bodyObj.event_type }
			});
			return { code: 0, message: '忽略非支付成功通知', data: { ack: wxAckSuccess() } };
		}
		const plain = decryptWxResourceFor(verifyRes.creds, bodyObj.resource || {});
		const outTradeNo = safeText(plain.out_trade_no, 40);
		if (!outTradeNo) {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_wx_notify_missing_trade_no',
				level: 'error',
				message: '微信支付回调：解密成功但缺少商户订单号'
			});
			return { code: 400, message: '回调缺少订单号', data: { ack: wxAckFail('订单号缺失') } };
		}
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_wx_notify_decrypted_ok',
			outBillNo: outTradeNo,
			withdrawNo: outTradeNo,
			message: `微信支付回调：验签解密成功，商户订单号=${outTradeNo}`,
			payload: { trade_state: safeText(plain.trade_state, 24) }
		});
		const res = await uniPayOrderCollection.where({ out_trade_no: outTradeNo }).limit(1).get();
		const order = res.data && res.data[0];
		if (!order) {
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_wx_notify_order_missing',
				message: `微信支付回调：本地无订单 out_trade_no=${outTradeNo}`,
				outBillNo: outTradeNo,
				withdrawNo: outTradeNo
			});
			return { code: 0, message: '订单不存在，忽略', data: { ack: wxAckSuccess() } };
		}
		if (Number(order.status) === 1 && order.user_order_success) {
			if (!(order.custom && order.custom.recharge_applied)) {
				await applyRechargeByOrder(order);
			}
			await writeTransferLog({
				scene: 'recharge',
				stage: 'recharge_wx_notify_duplicate',
				merchantUserId: order.user_id,
				withdrawId: order._id,
				withdrawNo: outTradeNo,
				outBillNo: outTradeNo,
				message: '微信支付回调：订单已支付，本次仅补额度或未变更'
			});
			return { code: 0, message: '已处理过', data: { ack: wxAckSuccess() } };
		}
		const now = nowTs();
		await uniPayOrderCollection.doc(order._id).update({
			status: 1,
			transaction_id: safeText(plain.transaction_id, 80),
			notify_date: now,
			pay_date: now,
			user_order_success: true,
			original_data: plain
		});
		await applyRechargeByOrder(order);
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_wx_notify_success',
			merchantUserId: order.user_id,
			withdrawId: order._id,
			withdrawNo: outTradeNo,
			outBillNo: outTradeNo,
			transferState: safeText(plain.trade_state || 'SUCCESS', 32),
			message: '微信支付回调：支付成功，已更新订单并同步额度',
			payload: { transaction_id: plain.transaction_id }
		});
		return { code: 0, message: '回调处理成功', data: { ack: wxAckSuccess() } };
	} catch (e) {
		console.error('h5WxPayNotify failed', e);
		await writeTransferLog({
			scene: 'recharge',
			stage: 'recharge_wx_notify_error',
			level: 'error',
			message: safeText(e?.message || '回调处理失败', 200)
		});
		return { code: 500, message: '回调处理失败', data: { ack: wxAckFail(e.message || '回调处理失败') } };
	}
}

async function h5WxRefundNotify(data) {
	try {
		const headers = data?.headers || {};
		const rawBody = String(data?.rawBody || JSON.stringify(data?.body || {}));
		const verifyRes = verifyWxCallbackSignatureDual(headers, rawBody);
		if (!verifyRes.ok) {
			return { code: 400, message: verifyRes.message, data: { ack: wxAckFail(verifyRes.message) } };
		}
		const bodyObj = data?.body && typeof data.body === 'object' ? data.body : JSON.parse(rawBody || '{}');
		if (bodyObj.event_type !== 'REFUND.SUCCESS') {
			return { code: 0, message: '忽略非退款成功通知', data: { ack: wxAckSuccess() } };
		}
		const plain = decryptWxResourceFor(verifyRes.creds, bodyObj.resource || {});
		const outTradeNo = safeText(plain.out_trade_no, 40);
		if (!outTradeNo) return { code: 400, message: '回调缺少订单号', data: { ack: wxAckFail('订单号缺失') } };
		const res = await uniPayOrderCollection.where({ out_trade_no: outTradeNo }).limit(1).get();
		const order = res.data && res.data[0];
		if (!order) return { code: 0, message: '订单不存在，忽略', data: { ack: wxAckSuccess() } };
		const now = nowTs();
		const refundedFen = Number(plain.amount?.refund || 0);
		const oldRefundFen = Number(order.refund_fee || 0);
		const nextRefundFen = oldRefundFen + refundedFen;
		const totalFen = Number(order.total_fee || 0);
		const status = nextRefundFen >= totalFen ? 3 : 2;
		const refundList = Array.isArray(order.refund_list) ? order.refund_list : [];
		const refundId = safeText(plain.refund_id, 80);
		if (refundId && refundList.find((x) => String(x.refund_id || '') === refundId)) {
			return { code: 0, message: '退款回调已处理过', data: { ack: wxAckSuccess() } };
		}
		refundList.push({
			refund_id: refundId,
			out_refund_no: safeText(plain.out_refund_no, 80),
			refund_fee: refundedFen,
			success_time: safeText(plain.success_time, 64),
			status: safeText(plain.refund_status, 32)
		});
		await uniPayOrderCollection.doc(order._id).update({
			status,
			refund_fee: nextRefundFen,
			refund_count: Number(order.refund_count || 0) + 1,
			refund_list: refundList,
			refund_date: now,
			original_data: plain
		});
		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_wx_pay_refund_notify',
			merchantUserId: order.user_id,
			withdrawId: order._id,
			withdrawNo: outTradeNo,
			outBillNo: outTradeNo,
			message: '微信支付退款成功回调：已更新本地订单退款累计',
			payload: { refund_id: refundId, refundedFen, status }
		});
		return { code: 0, message: '退款回调处理成功', data: { ack: wxAckSuccess() } };
	} catch (e) {
		console.error('h5WxRefundNotify failed', e);
		return { code: 500, message: '退款回调处理失败', data: { ack: wxAckFail(e.message || '退款回调处理失败') } };
	}
}

async function h5WxTransferNotify(data) {
	try {
		const headers = data?.headers || {};
		const rawBody = String(data?.rawBody || JSON.stringify(data?.body || {}));
		const verifyRes = verifyWxCallbackSignatureDual(headers, rawBody);
		if (!verifyRes.ok) {
			await writeTransferLog({
				scene: 'withdraw',
				stage: 'transfer_notify_verify_fail',
				level: 'error',
				message: verifyRes.message,
				payload: { headers: Object.keys(headers || {}), rawBody: safeText(rawBody, 800) }
			});
			return { code: 400, message: verifyRes.message, data: { ack: wxAckFail(verifyRes.message) } };
		}
		const bodyObj = data?.body && typeof data.body === 'object' ? data.body : JSON.parse(rawBody || '{}');
		const plain = decryptWxResourceFor(verifyRes.creds, bodyObj.resource || {});
		const outBillNo = safeText(plain.out_bill_no || plain.outBillNo || '', 64);
		const state = normalizeTransferState(plain.state || plain.status || '');
		let withdrawRowNotify = null;
		let refundOrderNotify = null;
		if (outBillNo) {
			const wr0 = await withdrawCollection.where({ withdraw_no: outBillNo, is_deleted: false }).limit(1).get();
			withdrawRowNotify = wr0.data && wr0.data[0];
			if (!withdrawRowNotify) {
				refundOrderNotify = await findRefundTransferOrderByBillNo(outBillNo);
			}
		}
		const notifyScene = refundOrderNotify ? 'refund' : 'withdraw';
		const notifyMsg = refundOrderNotify
			? '收到微信退款商家转账结果通知'
			: withdrawRowNotify
			? '收到微信提现商家转账结果通知'
			: '收到微信商家转账结果通知';
		await writeTransferLog({
			scene: notifyScene,
			stage: 'transfer_notify_received',
			withdrawNo: outBillNo,
			openid: safeText(plain.openid || '', 128),
			outBillNo,
			transferState: state,
			message: notifyMsg,
			payload: plain || {}
		});
		if (outBillNo && state === 'SUCCESS') {
			if (withdrawRowNotify) {
				await settleWithdrawSuccess(
					withdrawRowNotify,
					safeText(plain.transfer_bill_no || '', 80),
					'SUCCESS',
					{ arrivalTime: parseWxTransferSuccessTs(plain) || nowTs() }
				);
			} else {
				// H5 充值退款：按子单 out_bill_no 更新 transfer_items，全部子单成功后再 finalize（不涉及积分提现 withdraw 单）
				const refundOrder = refundOrderNotify || (await findRefundTransferOrderByBillNo(outBillNo));
				if (refundOrder) {
					let items = sortTransferItemsBySlice(
						Array.isArray(refundOrder.transfer_items) ? refundOrder.transfer_items.map((x) => ({ ...x })) : []
					);
					const idx = items.findIndex((it) => safeText(it.out_bill_no, 64) === outBillNo);
					if (idx >= 0) {
						items[idx] = {
							...items[idx],
							state: 'SUCCESS',
							transfer_bill_no: safeText(plain.transfer_bill_no || items[idx].transfer_bill_no || '', 80),
							transfer_time: nowTs(),
							query_resp: plain || {}
						};
					} else if (items.length === 1) {
						const first = { ...(items[0] || {}) };
						first.state = 'SUCCESS';
						first.transfer_bill_no = safeText(plain.transfer_bill_no || first.transfer_bill_no || '', 80);
						first.transfer_time = nowTs();
						first.query_resp = plain || {};
						items = [first];
					}
					const batchState = computeMerchantRefundBatchState(items);
					await transferOrderCollection.doc(refundOrder._id).update({
						state: batchState,
						transfer_items: items,
						transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
						update_time: nowTs()
					});
					if (batchState === 'SUCCESS') {
						await finalizeTransferSuccessIfNeeded({ ...refundOrder, state: batchState, transfer_items: items }, {});
					}
				}
			}
		}
		return { code: 0, message: '回调处理成功', data: { ack: wxAckSuccess() } };
	} catch (e) {
		await writeTransferLog({
			scene: 'withdraw',
			stage: 'transfer_notify_error',
			level: 'error',
			message: safeText(e?.message || '微信提现回调处理失败', 180)
		});
		return { code: 500, message: '回调处理失败', data: { ack: wxAckFail(e.message || '回调处理失败') } };
	}
}

/**
 * H5 充值退款：执行商家转账 + 更新 hsy-transfer-orders；成功则 finalize（记流水、清商户充值权益）
 */
async function runRefundMerchantTransferPipeline(transferOrderIn, merchant, event, opts = {}) {
	const wc = opts.wc;
	const openid = safeText(opts.openid, 100);
	const reason = safeText(opts.reason || '用户申请退款', 80);
	const countdownPhase = opts.countdownPhase != null ? String(opts.countdownPhase) : '';
	try {
		const oid = safeText(transferOrderIn && transferOrderIn._id, 80);
		if (!oid || !wc || !openid) return { code: 500, message: '退款打款参数不完整' };
		const freshRes = await transferOrderCollection.doc(oid).get();
		let transferOrder = freshRes.data && freshRes.data[0];
		if (!transferOrder) return { code: 404, message: '退款单不存在' };

		await getBizSettings();
		const refundNoMain = safeText(transferOrder.refund_no, 64);
		const splitCheck = ensureMultiRefundSlicesOnOrder(transferOrder, refundNoMain, transferOrder.final_refund_fen);
		if (splitCheck.changed) {
			await transferOrderCollection.doc(oid).update({
				transfer_items: splitCheck.items,
				transfer_slice_ids: splitCheck.transfer_slice_ids,
				out_bill_no: splitCheck.items[0] ? splitCheck.items[0].out_bill_no : transferOrder.out_bill_no,
				update_time: nowTs()
			});
			transferOrder.transfer_items = splitCheck.items;
			transferOrder.transfer_slice_ids = splitCheck.transfer_slice_ids;
			if (splitCheck.items[0]) transferOrder.out_bill_no = splitCheck.items[0].out_bill_no;
		}

		if (transferOrder.applied && safeText(transferOrder.state) === 'SUCCESS') {
			return {
				code: 0,
				message: '退款已完成',
				data: {
					refundNo: refundNoMain,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdownPhase,
					outBillNo: refundNoMain,
					refundState: 'SUCCESS',
					refundItems: []
				}
			};
		}

		let items = sortTransferItemsBySlice(transferOrder.transfer_items);
		if (!items.length) {
			const fen = Number(transferOrder.final_refund_fen || 0);
			const ob = safeText(transferOrder.out_bill_no || refundNoMain, 64);
			items = [
				{
					slice_index: 0,
					out_bill_no: ob,
					transfer_amount_fen: fen,
					state: 'INIT',
					transfer_bill_no: '',
					last_error: ''
				}
			];
		}

		if (allRefundSlicesSucceeded(items)) {
			const batchState = 'SUCCESS';
			await transferOrderCollection.doc(transferOrder._id).update({
				state: batchState,
				transfer_items: items,
				transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				update_time: nowTs()
			});
			transferOrder.state = batchState;
			transferOrder.transfer_items = items;
			await finalizeTransferSuccessIfNeeded({ ...transferOrder, state: batchState, transfer_items: items }, event);
			return {
				code: 0,
				message: '退款已完成',
				data: {
					refundNo: refundNoMain,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdownPhase,
					outBillNo: refundNoMain,
					refundState: 'SUCCESS',
					refundItems: items.map((it) => ({
						outBillNo: safeText(it.out_bill_no, 64),
						state: it.state,
						transferBillNo: safeText(it.transfer_bill_no || '', 80),
						error: safeText(it.last_error || '', 200)
					}))
				}
			};
		}

		const activeIdx = findActiveRefundSliceIndex(items);
		if (activeIdx < 0) {
			return { code: 500, message: '退款子单状态异常' };
		}
		if (activeIdx > 0) {
			const prevSt = normalizeTransferState(items[activeIdx - 1].state || '');
			if (prevSt !== 'SUCCESS') {
				const prevBill = safeText(items[activeIdx - 1].out_bill_no, 64);
				return {
					code: 409,
					message: '请先完成上一笔微信确认收款后，再发起下一笔',
					data: {
						refundNo: refundNoMain,
						outBillNo: prevBill || refundNoMain,
						refundState: 'PROCESSING',
						refundItems: []
					}
				};
			}
		}

		let first = { ...items[activeIdx] };
		const outBillNo = safeText(first.out_bill_no || transferOrder.out_bill_no, 64);
		let st = normalizeTransferState(first.state || '');
		let transferBillNo = safeText(first.transfer_bill_no || '', 80);
		let transferCreateResp = null;
		if (st !== 'SUCCESS') {
			try {
				if (st === 'INIT') {
					transferCreateResp = await wxPayMerchantTransferToOpenid(wc, {
						appid: wc.appId,
						openid,
						amountFen: Number(first.transfer_amount_fen || 0),
						outBillNo,
						reason
					});
				}
				const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
				st = normalizeTransferState(q?.state || q?.status || st);
				transferBillNo = safeText(q?.transfer_bill_no || transferBillNo, 80);
				first.query_resp = q || {};
				first.last_error = '';
				if (['FAIL', 'FAILED', 'CANCELLED'].includes(st)) {
					first.last_error = safeText(q?.fail_reason || q?.message || st, 200);
				}
			} catch (e) {
				const wxCode = safeText(e?.wxBody?.code || '', 40);
				const detail =
					e && e.name === 'WxPayRequestError' && e.wxBody
						? e.wxBody.message || e.wxBody.code || e.message
						: e.message || 'merchant transfer failed';
				first.last_error = safeText(String(detail), 200);
				if (wxCode === 'NOT_FOUND') {
					try {
						transferCreateResp = await wxPayMerchantTransferToOpenid(wc, {
							appid: wc.appId,
							openid,
							amountFen: Number(first.transfer_amount_fen || 0),
							outBillNo,
							reason
						});
						const q2 = await wxPayQueryMerchantTransfer(wc, outBillNo);
						st = normalizeTransferState(q2?.state || q2?.status || st);
						transferBillNo = safeText(q2?.transfer_bill_no || transferBillNo, 80);
						first.query_resp = q2 || {};
						first.last_error = '';
					} catch (e2) {
						const detail2 =
							e2 && e2.name === 'WxPayRequestError' && e2.wxBody
								? e2.wxBody.message || e2.wxBody.code || e2.message
								: e2?.message || 'merchant transfer create/query failed';
						first.last_error = safeText(String(detail2), 200);
					}
				} else if (String(detail).toLowerCase().includes('out_bill_no')) {
					try {
						const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
						st = normalizeTransferState(q?.state || q?.status || st);
						transferBillNo = safeText(q?.transfer_bill_no || transferBillNo, 80);
						first.query_resp = q || {};
					} catch (qe) {}
				}
			}
		}
		first.state = st;
		first.transfer_bill_no = transferBillNo;
		const packageInfo = safeText(
			pickTransferPackageInfo(first.query_resp) ||
				pickTransferPackageInfo(transferCreateResp) ||
				pickTransferPackageInfo(first) ||
				pickTransferPackageInfo(transferOrder) ||
				transferOrder.package_info ||
				'',
			1200
		);
		if (packageInfo) first.package_info = packageInfo;
		if (st === 'SUCCESS') first.transfer_time = nowTs();
		items[activeIdx] = first;
		if (first.last_error) {
			await maybeNotifyWxOperatingAccountInsufficientWecom(first.last_error, {
				scene: '退款',
				refundNo: refundNoMain,
				outBillNo,
				merchantName: maybeMerchantDisplayName(merchant)
			});
		}

		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_merchant_transfer_slice',
			withdrawNo: refundNoMain,
			merchantUserId: safeText(transferOrder.merchant_user_id, 80),
			outBillNo,
			transferState: st,
			message: `退款商家转账：子单 ${outBillNo} 当前状态=${st}`,
			payload: { sliceIndex: activeIdx, hadCreate: !!transferCreateResp }
		});

		const batchState = computeMerchantRefundBatchState(items);
		const pkgPersist = packageInfo ? { package_info: packageInfo } : {};
		await transferOrderCollection.doc(transferOrder._id).update({
			state: batchState,
			transfer_items: items,
			transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			...pkgPersist,
			update_time: nowTs()
		});
		transferOrder.state = batchState;
		transferOrder.transfer_items = items;
		const itemResults = items.map((it) => ({
			outBillNo: safeText(it.out_bill_no, 64),
			state: it.state,
			transferBillNo: safeText(it.transfer_bill_no || '', 80),
			error: safeText(it.last_error || '', 200)
		}));

		if (batchState === 'SUCCESS') {
			await finalizeTransferSuccessIfNeeded({ ...transferOrder, transfer_items: items }, event);
			return {
				code: 0,
				message: '退款打款成功',
				data: {
					refundNo: refundNoMain,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdownPhase,
					outBillNo: refundNoMain,
					refundState: batchState,
					refundItems: itemResults
				}
			};
		}
		if (batchState === 'FAILED') {
			return {
				code: 500,
				message: '退款打款失败，请稍后重试',
				data: {
					refundNo: refundNoMain,
					outBillNo: safeText(items[activeIdx]?.out_bill_no, 64) || refundNoMain,
					refundState: batchState,
					refundItems: itemResults
				}
			};
		}
		return {
			code: 409,
			message: '退款打款处理中，请稍后查询结果',
			data: {
				refundNo: refundNoMain,
				outBillNo: safeText(items[activeIdx]?.out_bill_no, 64) || refundNoMain,
				refundState: batchState,
				refundItems: itemResults
			}
		};
	} catch (e) {
		console.error('runRefundMerchantTransferPipeline failed', e);
		await maybeNotifyWxOperatingAccountInsufficientWecom(e, {
			scene: '退款',
			refundNo: safeText(transferOrderIn?.refund_no, 64),
			outBillNo: safeText(transferOrderIn?.out_bill_no || transferOrderIn?.refund_no, 64),
			merchantName: merchant ? maybeMerchantDisplayName(merchant) : ''
		});
		return { code: 500, message: safeText(e.message || '退款打款异常', 200) };
	}
}

function buildRefundTransferWhere(data) {
	const {
		userKeyword = '',
		refundNo = '',
		state = '',
		stateList,
		createTimeStart = '',
		createTimeEnd = ''
	} = data || {};
	const parts = [
		{ refund_mode: 'merchant_transfer' },
		db.command.or([{ is_deleted: false }, { state: 'REJECTED' }])
	];
	if (refundNo) {
		const r = new RegExp(escapeReg(refundNo), 'i');
		parts.push(db.command.or([{ refund_no: r }, { out_bill_no: r }]));
	}
	if (userKeyword) {
		const rk = new RegExp(escapeReg(userKeyword), 'i');
		parts.push(
			db.command.or([
				{ merchant_user_id: rk },
				{ merchant_id: rk }
			])
		);
	}
	const stArr = Array.isArray(stateList) ? [...new Set(stateList.map(String))] : [];
	if (stArr.length === 1) {
		parts.push({ state: stArr[0] });
	} else if (stArr.length > 1) {
		parts.push({ state: db.command.in(stArr) });
	} else if (state) {
		parts.push({ state: String(state) });
	}
	if (createTimeStart && createTimeEnd) {
		parts.push(
			db.command.and([
				{ create_time: db.command.gte(Number(createTimeStart)) },
				{ create_time: db.command.lte(Number(createTimeEnd)) }
			])
		);
	} else if (createTimeStart) {
		parts.push({ create_time: db.command.gte(Number(createTimeStart)) });
	} else if (createTimeEnd) {
		parts.push({ create_time: db.command.lte(Number(createTimeEnd)) });
	}
	return parts.length === 1 ? parts[0] : db.command.and(parts);
}

function refundTransferStateText(s) {
	const x = String(s || '');
	if (x === 'SUCCESS') return '已成功';
	if (x === 'FAILED') return '失败';
	if (x === 'PROCESSING') return '处理中';
	if (x === 'PENDING_AUDIT') return '待审核';
	if (x === 'REJECTED') return '已拒绝';
	return x || '-';
}

function mapRefundTransferItem(row, merchantMap = {}) {
	const auditStatus = safeText(row.audit_status || '', 24) || (row.audit_required ? 'pending' : 'none');
	const auditMap = { pending: '待审核', approved: '已同意', rejected: '已拒绝', failed: '失败', none: '-' };
	const items = Array.isArray(row.transfer_items) ? row.transfer_items : [];
	const first = items[0] || {};
	const transferSliceTotal = items.length || 0;
	const transferSliceDone = countRefundSlicesSucceeded(items);
	const transferSliceProgressText = transferSliceTotal > 1 ? `${transferSliceDone}/${transferSliceTotal}` : '';
	const transferErr = safeText(first.last_error || '', 200);
	const m = merchantMap[row.merchant_id] || {};
	const userDisplay = [m.wx_nickname || '', m.mobile || ''].filter(Boolean).join('\n') || row.merchant_user_id || '-';
	return {
		id: row._id,
		refundNo: row.refund_no || row.out_bill_no || '',
		merchantUserId: row.merchant_user_id || '',
		userDisplay,
		refundAmount: Number(row.refund_amount || 0),
		refundAmountText: Number(row.refund_amount || 0).toFixed(2),
		penaltyAmountText: Number(row.penalty_amount || 0).toFixed(2),
		finalRefundAmountText: Number(row.final_refund_amount || 0).toFixed(2),
		batchState: row.state || '',
		batchStateText: refundTransferStateText(row.state),
		auditRequired: !!row.audit_required,
		auditStatus,
		auditStatusText: auditMap[auditStatus] || auditStatus || '-',
		transferError: transferErr,
		transferSliceDone,
		transferSliceTotal,
		transferSliceProgressText,
		reason: safeText(row.reason || '', 120),
		applied: !!row.applied,
		createTime: formatTime(row.create_time),
		updateTime: formatTime(row.update_time)
	};
}

async function refundTransferSummary(whereExpr) {
	try {
		const $ = db.command.aggregate;
		// 统计可计入汇总的退款金额：排除“已拒绝”，其他状态按列表筛选参与统计
		const matchExpr = db.command.and([whereExpr, { state: db.command.neq('REJECTED') }]);
		const res = await transferOrderCollection
			.aggregate()
			.match(matchExpr)
			.group({
				_id: null,
				totalRefund: $.sum('$refund_amount'),
				totalPenalty: $.sum('$penalty_amount'),
				totalFinal: $.sum('$final_refund_amount')
			})
			.end();
		const row = res.data && res.data[0];
		return {
			totalRefund: Number(row && row.totalRefund) || 0,
			totalPenalty: Number(row && row.totalPenalty) || 0,
			totalFinal: Number(row && row.totalFinal) || 0
		};
	} catch (e) {
		console.error('refundTransferSummary failed', e);
		return { totalRefund: 0, totalPenalty: 0, totalFinal: 0 };
	}
}

async function getRefundTransferList(data) {
	try {
		const { page = 1, pageSize = 10 } = data || {};
		const whereExpr = buildRefundTransferWhere(data);
		const countRes = await transferOrderCollection.where(whereExpr).count();
		const total = countRes.total;
		const res = await transferOrderCollection
			.where(whereExpr)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const rows = res.data || [];
		const mids = [...new Set(rows.map((r) => r.merchant_id).filter(Boolean))];
		const merchantMap = {};
		if (mids.length) {
			const mres = await merchantCollection
				.where({ _id: db.command.in(mids.slice(0, 200)) })
				.field({ wx_nickname: true, mobile: true })
				.limit(200)
				.get();
			for (const m of mres.data || []) {
				merchantMap[m._id] = m;
			}
		}
		const list = rows.map((row) => mapRefundTransferItem(row, merchantMap));
		const summary = await refundTransferSummary(whereExpr);
		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page, pageSize, summary }
		};
	} catch (e) {
		console.error('getRefundTransferList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function refundTransferSyncProcessing(data = {}) {
	const limit = Math.min(Math.max(Number(data?.limit || 20), 1), 100);
	const now = nowTs();
	try {
		await getBizSettings();
		const processingStates = ['PROCESSING', 'ACCEPTED', 'WAIT_USER_CONFIRM', 'UNKNOWN'];
		const res = await transferOrderCollection
			.where({
				is_deleted: false,
				refund_mode: 'merchant_transfer',
				state: db.command.in(processingStates)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		let success = 0;
		let failed = 0;
		let processing = 0;
		for (const row of rows) {
			const merchant = await getMerchantByIdOrUserId(row.merchant_id);
			if (!merchant) continue;
			const wc = wxCredentialsByMchId(row.transfer_mch_id) || wxRefundCredentials();
			if (!wc || !wc.mchId) continue;
			try {
				const refundMain = safeText(row.refund_no, 64);
				let items = sortTransferItemsBySlice(
					Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : []
				);
				const splitCheck = ensureMultiRefundSlicesOnOrder(row, refundMain, row.final_refund_fen);
				if (splitCheck.changed) {
					await transferOrderCollection.doc(row._id).update({
						transfer_items: splitCheck.items,
						transfer_slice_ids: splitCheck.transfer_slice_ids,
						out_bill_no: splitCheck.items[0] ? splitCheck.items[0].out_bill_no : row.out_bill_no,
						update_time: nowTs()
					});
					items = sortTransferItemsBySlice(splitCheck.items);
				}
				if (!items.length) continue;
				const activeIdx = findActiveRefundSliceIndex(items);
				if (activeIdx < 0) {
					if (allRefundSlicesSucceeded(items)) {
						await transferOrderCollection.doc(row._id).update({
							state: 'SUCCESS',
							transfer_items: items,
							transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
							update_time: nowTs()
						});
						await finalizeTransferSuccessIfNeeded({ ...row, state: 'SUCCESS', transfer_items: items }, {});
						success += 1;
					}
					continue;
				}
				const pollBill = safeText(items[activeIdx].out_bill_no, 64);
				const q = await wxPayQueryMerchantTransfer(wc, pollBill);
				const state = normalizeTransferState(q?.state || q?.status || '');
				const billNo = safeText(q?.transfer_bill_no || '', 80);
				await writeTransferLog({
					scene: 'refund',
					stage: 'refund_auto_poll_query',
					withdrawNo: row.refund_no,
					merchantUserId: row.merchant_user_id,
					outBillNo: pollBill,
					transferState: state,
					message: '自动轮询 H5 退款商家转账',
					payload: q || {}
				});
				const cur = { ...items[activeIdx] };
				cur.state = state;
				cur.transfer_bill_no = billNo || cur.transfer_bill_no;
				cur.query_resp = q || {};
				if (state === 'SUCCESS') cur.transfer_time = nowTs();
				const polledPkg = pickTransferPackageInfo(q);
				if (polledPkg) cur.package_info = polledPkg;
				if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
					cur.last_error = safeText(q?.fail_reason || q?.message || state, 200);
					await maybeNotifyWxOperatingAccountInsufficientWecom(cur.last_error, {
						scene: '退款',
						refundNo: refundMain,
						outBillNo: pollBill,
						merchantName: maybeMerchantDisplayName(merchant)
					});
				}
				items[activeIdx] = cur;
				const batchState = computeMerchantRefundBatchState(items);
				await transferOrderCollection.doc(row._id).update({
					state: batchState,
					transfer_items: items,
					transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
				if (batchState === 'SUCCESS') {
					await finalizeTransferSuccessIfNeeded({ ...row, state: batchState, transfer_items: items }, {});
					success += 1;
				} else if (batchState === 'FAILED') {
					failed += 1;
				} else {
					processing += 1;
				}
			} catch (e) {
				await maybeNotifyWxOperatingAccountInsufficientWecom(e, {
					scene: '退款',
					refundNo: safeText(row.refund_no, 64),
					outBillNo: safeText(row.out_bill_no || row.refund_no, 64),
					merchantName: merchant ? maybeMerchantDisplayName(merchant) : ''
				});
				await writeTransferLog({
					scene: 'refund',
					stage: 'refund_auto_poll_error',
					level: 'error',
					withdrawNo: row.refund_no,
					message: safeText(e?.message || '退款轮询失败', 180)
				});
			}
		}
		return { code: 0, message: 'ok', data: { total: rows.length, success, failed, processing, at: now } };
	} catch (e) {
		console.error('refundTransferSyncProcessing failed', e);
		return { code: 500, message: safeText(e?.message || '自动轮询失败', 160) };
	}
}

async function refundTransferApprove(data, event) {
	try {
		const id = safeText(data?.id, 80);
		const actionType = safeText(data?.actionType, 20);
		if (!id) return { code: 400, message: '缺少退款单ID' };
		if (!['approve', 'reject', 'forceFail', 'force_fail'].includes(actionType)) return { code: 400, message: '审批动作无效' };
		const oldRes = await transferOrderCollection.doc(id).get();
		const row = oldRes.data && oldRes.data[0];
		if (!row || row.is_deleted) return { code: 404, message: '退款单不存在' };
		if (safeText(row.refund_mode, 40) !== 'merchant_transfer') {
			return { code: 400, message: '非 H5 商家转账退款单' };
		}
		const now = nowTs();
		if (actionType === 'forceFail' || actionType === 'force_fail') {
			if (row.applied || safeText(row.state, 24) === 'SUCCESS') return { code: 400, message: '该退款已完成，不能标记失败' };
			const reason = safeText(data?.reason || '管理员手动标记失败', 180);
			const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
			const nextItems =
				items.length > 0
					? items.map((it) => ({
							...it,
							state: 'FAILED',
							last_error: reason,
							fail_time: now
					  }))
					: [
							{
								out_bill_no: safeText(row.refund_no || row.out_bill_no, 64),
								transfer_amount_fen: Number(row.final_refund_fen || 0),
								state: 'FAILED',
								last_error: reason,
								fail_time: now
							}
					  ];
			await transferOrderCollection.doc(id).update({
				state: 'FAILED',
				transfer_items: nextItems,
				transfer_slice_ids: nextItems.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				update_time: now
			});
			await writeTransferLog({
				scene: 'refund',
				stage: 'refund_admin_force_fail',
				level: 'warn',
				withdrawNo: safeText(row.refund_no || row.out_bill_no, 64),
				merchantUserId: safeText(row.merchant_user_id, 80),
				outBillNo: safeText(row.out_bill_no || row.refund_no, 64),
				transferState: 'FAILED',
				message: reason,
				payload: { operatorUid: String(event?.uid || ''), id: row._id }
			});
			return { code: 0, message: '已标记为失败' };
		}
		if (actionType === 'reject') {
			if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
			const auditStatus = safeText(row.audit_status, 20);
			if (!['pending', 'approved'].includes(auditStatus)) return { code: 400, message: '该记录当前状态不可拒绝' };
			const rowSt = safeText(row.state, 24);
			if (rowSt === 'SUCCESS' || row.applied) {
				return { code: 400, message: '该退款已到账，不能再拒绝' };
			}
			const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
			const nextItems =
				items.length > 0
					? items.map((it) => ({
							...it,
							state: 'REJECTED',
							last_error: '管理员已拒绝退款',
							reject_time: now
					  }))
					: [
							{
								out_bill_no: safeText(row.refund_no || row.out_bill_no, 64),
								state: 'REJECTED',
								last_error: '管理员已拒绝退款',
								reject_time: now
							}
					  ];
			await transferOrderCollection.doc(id).update({
				audit_status: 'rejected',
				audit_time: now,
				state: 'REJECTED',
				transfer_items: nextItems,
				transfer_slice_ids: nextItems.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				update_time: now
			});
			return { code: 0, message: '已拒绝该退款申请，用户可重新发起' };
		}
		if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
		if (safeText(row.audit_status, 20) !== 'pending') return { code: 400, message: '该记录不是待审核状态' };
		if (row.applied) return { code: 400, message: '该退款已完成入账' };
		const rowSt0 = safeText(row.state, 24);
		if (rowSt0 === 'SUCCESS') return { code: 400, message: '该退款已成功' };
		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_admin_approve',
			withdrawNo: row.refund_no,
			merchantUserId: row.merchant_user_id,
			outBillNo: row.out_bill_no,
			message: '管理员同意 H5 充值退款，待商户在 H5 点击提取后发起商家转账',
			payload: { id, actionType }
		});
		await transferOrderCollection.doc(id).update({
			audit_status: 'approved',
			audit_time: now,
			// 保持退款单处于待提取状态，等商户在 H5 点击“提取”后再发起商家转账
			state: 'PENDING_AUDIT',
			update_time: nowTs()
		});
		return { code: 0, message: '已同意退款，请通知商户在H5点击提取' };
	} catch (e) {
		console.error('refundTransferApprove failed', e);
		return { code: 500, message: safeText(e?.message || '审批失败', 200) };
	}
}

async function refundTransferForceFail(data, event) {
	try {
		const id = safeText(data?.id, 80);
		const refundNo = safeText(data?.refundNo, 64);
		const reason = safeText(data?.reason || '管理员手动标记失败', 180);
		let row = null;
		if (id) {
			const r = await transferOrderCollection.doc(id).get();
			row = r.data && r.data[0];
		} else if (refundNo) {
			const _ = db.command;
			const r = await transferOrderCollection
				.where(
					_.and([
						{ is_deleted: false },
						{ refund_mode: 'merchant_transfer' },
						_.or([{ refund_no: refundNo }, { out_bill_no: refundNo }])
					])
				)
				.limit(1)
				.get();
			row = r.data && r.data[0];
		}
		if (!row || row.is_deleted) return { code: 404, message: '退款单不存在' };
		if (safeText(row.refund_mode, 40) !== 'merchant_transfer') return { code: 400, message: '非商家转账退款单' };
		if (row.applied || safeText(row.state, 24) === 'SUCCESS') return { code: 400, message: '该退款已完成，不能标记失败' };

		const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
		const nextItems =
			items.length > 0
				? items.map((it) => ({
						...it,
						state: 'FAILED',
						last_error: reason,
						fail_time: nowTs()
				  }))
				: [
						{
							out_bill_no: safeText(row.refund_no || row.out_bill_no, 64),
							transfer_amount_fen: Number(row.final_refund_fen || 0),
							state: 'FAILED',
							last_error: reason,
							fail_time: nowTs()
						}
				  ];

		await transferOrderCollection.doc(row._id).update({
			state: 'FAILED',
			transfer_items: nextItems,
			transfer_slice_ids: nextItems.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			update_time: nowTs()
		});
		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_admin_force_fail',
			level: 'warn',
			withdrawNo: safeText(row.refund_no || row.out_bill_no, 64),
			merchantUserId: safeText(row.merchant_user_id, 80),
			outBillNo: safeText(row.out_bill_no || row.refund_no, 64),
			transferState: 'FAILED',
			message: reason,
			payload: { operatorUid: String(event?.uid || ''), id: row._id }
		});
		return { code: 0, message: '已标记为失败' };
	} catch (e) {
		console.error('refundTransferForceFail failed', e);
		return { code: 500, message: safeText(e?.message || '操作失败', 200) };
	}
}

async function refundTransferFixRejectedProcessing(data, event) {
	try {
		const id = safeText(data?.id, 80);
		const refundNo = safeText(data?.refundNo, 64);
		let row = null;
		if (id) {
			const r = await transferOrderCollection.doc(id).get();
			row = r.data && r.data[0];
		} else if (refundNo) {
			const _ = db.command;
			const r = await transferOrderCollection
				.where(
					_.and([
						{ refund_mode: 'merchant_transfer' },
						_.or([{ is_deleted: false }, { state: 'REJECTED' }]),
						_.or([{ refund_no: refundNo }, { out_bill_no: refundNo }])
					])
				)
				.limit(1)
				.get();
			row = r.data && r.data[0];
		}
		if (!row) return { code: 404, message: '退款单不存在' };
		if (safeText(row.refund_mode, 40) !== 'merchant_transfer') return { code: 400, message: '非商家转账退款单' };
		if (row.applied || safeText(row.state, 24) === 'SUCCESS') return { code: 400, message: '该退款已到账，无需修复' };
		const auditStatus = safeText(row.audit_status, 20);
		if (auditStatus !== 'rejected') return { code: 400, message: '仅支持修复审核已拒绝的退款单' };
		const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
		const nextItems =
			items.length > 0
				? items.map((it) => ({
						...it,
						state: 'REJECTED',
						last_error: '管理员已拒绝退款',
						reject_time: nowTs()
				  }))
				: [
						{
							out_bill_no: safeText(row.refund_no || row.out_bill_no, 64),
							state: 'REJECTED',
							last_error: '管理员已拒绝退款',
							reject_time: nowTs()
						}
				  ];
		await transferOrderCollection.doc(row._id).update({
			state: 'REJECTED',
			is_deleted: false,
			transfer_items: nextItems,
			transfer_slice_ids: nextItems.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			update_time: nowTs()
		});
		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_admin_fix_rejected_processing',
			level: 'warn',
			withdrawNo: safeText(row.refund_no || row.out_bill_no, 64),
			merchantUserId: safeText(row.merchant_user_id, 80),
			outBillNo: safeText(row.out_bill_no || row.refund_no, 64),
			transferState: 'REJECTED',
			message: '管理员手动修复：已拒绝但显示处理中',
			payload: { operatorUid: String(event?.uid || ''), id: row._id }
		});
		return { code: 0, message: '修复成功，状态已更新为已拒绝' };
	} catch (e) {
		console.error('refundTransferFixRejectedProcessing failed', e);
		return { code: 500, message: safeText(e?.message || '单笔状态修复失败', 200) };
	}
}

async function refundTransferRevokeApproveDev(data, event) {
	try {
		const biz = await getBizSettings();
		if (!biz || !biz.refundApproveRevokeDevEnabled) {
			return {
				code: 403,
				message: '未开启：请在后台「系统业务参数」中打开「允许撤销审核同意（开发联调）」并保存'
			};
		}
		const id = safeText(data?.id, 80);
		if (!id) return { code: 400, message: '缺少退款单ID' };
		const r = await transferOrderCollection.doc(id).get();
		const row = r.data && r.data[0];
		if (!row || row.is_deleted) return { code: 404, message: '退款单不存在' };
		if (safeText(row.refund_mode, 40) !== 'merchant_transfer') {
			return { code: 400, message: '非 H5 商家转账退款单' };
		}
		if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
		if (safeText(row.audit_status, 20) !== 'approved') {
			return { code: 400, message: '仅可撤销「审核已同意」的退款单' };
		}
		if (row.applied || safeText(row.state, 24) === 'SUCCESS') {
			return { code: 400, message: '该退款已完成入账，无法撤销审核' };
		}
		const itemsSorted = Array.isArray(row.transfer_items) ? sortTransferItemsBySlice(row.transfer_items) : [];
		for (const it of itemsSorted) {
			if (normalizeTransferState(it.state || '') === 'SUCCESS') {
				return { code: 400, message: '已有分笔转账成功，无法撤销（请换新退款单测试）' };
			}
		}
		const now = nowTs();
		const refundNo = safeText(row.refund_no || row.out_bill_no, 64);
		const finalFen = Math.round(Number(row.final_refund_fen || 0));
		const nextItems =
			itemsSorted.length > 0
				? itemsSorted.map((it, idx) => ({
						slice_index: Number(it.slice_index ?? idx),
						out_bill_no: safeText(it.out_bill_no, 64),
						transfer_amount_fen: Math.round(Number(it.transfer_amount_fen || 0)),
						state: 'INIT',
						transfer_bill_no: '',
						last_error: ''
				  }))
				: [
						{
							slice_index: 0,
							out_bill_no: safeText(row.out_bill_no || refundNo, 64),
							transfer_amount_fen: finalFen,
							state: 'INIT',
							transfer_bill_no: '',
							last_error: ''
						}
				  ];
		const upd = {
			audit_status: 'pending',
			audit_time: 0,
			state: 'PENDING_AUDIT',
			transfer_items: nextItems,
			transfer_slice_ids: nextItems.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			update_time: now
		};
		if (nextItems[0] && safeText(nextItems[0].out_bill_no, 64)) {
			upd.out_bill_no = safeText(nextItems[0].out_bill_no, 64);
		}
		await transferOrderCollection.doc(id).update(upd);
		await writeTransferLog({
			scene: 'refund',
			stage: 'refund_admin_revoke_approve_dev',
			level: 'warn',
			withdrawNo: refundNo,
			merchantUserId: safeText(row.merchant_user_id, 80),
			outBillNo: safeText(upd.out_bill_no || row.out_bill_no, 64),
			message: '开发环境：撤销审核同意，恢复为待审核',
			payload: { operatorUid: String(event?.uid || ''), id }
		});
		return { code: 0, message: '已恢复为待审核（仅开发）' };
	} catch (e) {
		console.error('refundTransferRevokeApproveDev failed', e);
		return { code: 500, message: safeText(e?.message || '撤销失败', 200) };
	}
}

/**
 * 解析当前商户在「退款与周期」场景下的 bizKey、是否需审核、已存在的转账单等，供 H5 退款页与 h5RefundReset 共用。
 */
async function resolveH5RefundOrderContext(merchant, event, opts = {}) {
	await getBizSettings();
	const cfgW = ensureWxRefundPayConfig();
	if (!cfgW.ok) return { ok: false, code: 500, message: cfgW.message };
	const wc = cfgW.creds;
	const openid = safeText(merchant.wx_openid, 100);
	if (!openid) return { ok: false, code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
	const biz = await getBizSettings();
	const now = nowTs();
	const refundEntryPolicy = resolveRefundEntryPolicy(opts?.tokenRow || null);
	const syncRefund = await syncMerchantMembershipCycles(merchant, { biz, now });
	const member = isH5RechargeMemberForWithdraw(merchant);
	const rtc = biz.refundTransferAudit || {};
	const needRefundAudit = member ? !!rtc.memberRequired : !!rtc.nonMemberRequired;
	const cycleCfg = syncRefund.cycleCfg || resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
	const countdown =
		syncRefund.countdown ||
		computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
	const merchantUserId = merchant.user_id || merchant._id;
	const logs = await operationLogCollection.where({ user_id: merchantUserId, action: 'h5_quota_recharge', refunded: false }).limit(1000).get();
	const rows = logs.data || [];
	let baseRechargeAmount = Number(Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0).toFixed(2));
	if (!Number.isFinite(baseRechargeAmount) || baseRechargeAmount <= 0) {
		baseRechargeAmount = 0;
		rows.forEach((x) => {
			baseRechargeAmount += Number(x.package_price || 0);
		});
		baseRechargeAmount = Number(baseRechargeAmount.toFixed(2));
	}
	let refundAmount = baseRechargeAmount;
	if (refundEntryPolicy.entryType === 'proportional') {
		refundAmount = Number((baseRechargeAmount * refundEntryPolicy.refundPercent / 100).toFixed(2));
	}
	if (refundAmount <= 0) {
		return {
			ok: true,
			refundable: false,
			wc,
			biz,
			needRefundAudit,
			countdown,
			merchantUserId,
			rows,
			baseRechargeAmount,
			refundAmount: 0,
			penaltyAmount: 0,
			finalRefundAmount: 0,
			targetRefundFen: 0,
			bizKey: '',
			transferOrder: null,
			now,
			openid,
			refundEntryPolicy
		};
	}
	const refundPenaltyRate = Math.max(0, Math.min(100, Number(biz.refundPenaltyRate != null ? biz.refundPenaltyRate : DEFAULT_BIZ_SETTINGS.refundPenaltyRate)));
	let penaltyAmount = 0;
	if (!refundEntryPolicy.bypassRefundWindow && countdown.phase === 'lock') {
		penaltyAmount = Number((refundAmount * refundPenaltyRate / 100).toFixed(2));
	}
	const finalRefundAmount = Number((refundAmount - penaltyAmount).toFixed(2));
	const targetRefundFen = Math.round(finalRefundAmount * 100);
	if (targetRefundFen < 1) {
		return {
			ok: true,
			refundable: false,
			wc,
			biz,
			needRefundAudit,
			countdown,
			merchantUserId,
			rows,
			baseRechargeAmount,
			refundAmount,
			penaltyAmount,
			finalRefundAmount,
			targetRefundFen: 0,
			bizKey: '',
			transferOrder: null,
			now,
			openid,
			refundEntryPolicy
		};
	}
	const pctTag = refundEntryPolicy.entryType === 'proportional' ? `_pct${refundEntryPolicy.refundPercent}` : '';
	const bizKey = `${merchant._id}_${targetRefundFen}_${countdown.phase}_${Number(merchant.recharge_cycle_start || 0)}_${refundAmount.toFixed(2)}_${rows
		.map((x) => x._id)
		.sort()
		.join('_')}${pctTag}`;
	const existRes = await transferOrderCollection
		.where({
			biz_key: bizKey,
			is_deleted: false,
			state: db.command.neq('REJECTED')
		})
		.limit(1)
		.get();
	const transferOrder = existRes.data && existRes.data[0];
	return {
		ok: true,
		refundable: true,
		wc,
		biz,
		needRefundAudit,
		countdown,
		merchantUserId,
		rows,
		baseRechargeAmount,
		refundAmount,
		penaltyAmount,
		finalRefundAmount,
		targetRefundFen,
		bizKey,
		transferOrder,
		now,
		openid,
		refundEntryPolicy
	};
}

function buildH5RefundUiFromContext(ctx) {
	const policy = ctx.refundEntryPolicy || resolveRefundEntryPolicy(null);
	const d = {
		phase: 'idle',
		outBillNo: '',
		refundNo: '',
		wxItemState: '',
		batchState: '',
		needRefundAudit: !!ctx.needRefundAudit,
		refundable: ctx.refundable !== false,
		baseRechargeAmount: Number(ctx.baseRechargeAmount || ctx.refundAmount || 0).toFixed(2),
		refundAmount: Number(ctx.refundAmount || 0).toFixed(2),
		penaltyAmount: Number(ctx.penaltyAmount || 0).toFixed(2),
		finalRefundAmount: Number(ctx.finalRefundAmount || 0).toFixed(2),
		refundEntryType: policy.entryType || 'full',
		refundPercent: policy.refundPercent != null ? Number(policy.refundPercent) : null,
		bypassRefundWindow: !!policy.bypassRefundWindow,
		transferSliceTotal: 0,
		transferSliceDone: 0,
		transferSliceIndex: 0
	};
	if (ctx.targetRefundFen > 0) {
		d.transferSliceTotal = buildRefundTransferSlicesFromFen(ctx.targetRefundFen, getRefundTransferSliceMaxYuan()).length;
	}
	if (!ctx.ok || !ctx.refundable) return d;
	const ord = ctx.transferOrder;
	if (!ord) return d;
	const itemsSorted = sortTransferItemsBySlice(Array.isArray(ord.transfer_items) ? ord.transfer_items : []);
	const activeIdx = findActiveRefundSliceIndex(itemsSorted);
	const cur =
		activeIdx >= 0 && itemsSorted[activeIdx] ? itemsSorted[activeIdx] : itemsSorted[0] || {};
	const outBill =
		activeIdx >= 0 && cur && cur.out_bill_no
			? safeText(cur.out_bill_no, 64)
			: safeText(ord.out_bill_no || ord.refund_no, 64);
	d.outBillNo = outBill;
	d.refundNo = safeText(ord.refund_no, 64);
	d.batchState = safeText(ord.state, 24);
	d.transferSliceTotal = itemsSorted.length || 0;
	d.transferSliceDone = countRefundSlicesSucceeded(itemsSorted);
	d.transferSliceIndex = activeIdx >= 0 ? activeIdx + 1 : 0;
	const wxSt = normalizeTransferState(cur.state || '');
	d.wxItemState = wxSt;
	if (ord.audit_required && safeText(ord.audit_status, 20) === 'pending' && d.batchState === 'PENDING_AUDIT') {
		d.phase = 'auditing';
		return d;
	}
	if (safeText(ord.audit_status, 20) === 'rejected' || d.batchState === 'REJECTED') {
		d.phase = 'failed';
		return d;
	}
	if (ord.audit_required && safeText(ord.audit_status, 20) === 'approved' && d.batchState === 'PENDING_AUDIT') {
		d.phase = 'confirm_transfer';
		return d;
	}
	if (ord.applied && d.batchState === 'SUCCESS') {
		d.phase = 'done';
		return d;
	}
	if (d.batchState === 'FAILED') {
		d.phase = 'idle';
		return d;
	}
	if (itemsSorted.length && allRefundSlicesSucceeded(itemsSorted) && !ord.applied && d.batchState === 'SUCCESS') {
		d.phase = 'processing';
		return d;
	}
	// 当前子单：待发起(INIT) 或 待微信确认(WAIT_USER_CONFIRM) → 用户可多次点击「提取」
	if (wxSt === 'INIT' || wxSt === 'WAIT_USER_CONFIRM') {
		d.phase = 'confirm_transfer';
		return d;
	}
	if (d.batchState === 'PROCESSING' || d.batchState === 'INIT' || d.batchState === 'PENDING_AUDIT') {
		d.phase = 'processing';
		return d;
	}
	if (d.batchState === 'SUCCESS' && !ord.applied) {
		d.phase = 'processing';
		return d;
	}
	d.phase = 'processing';
	return d;
}

async function h5RefundConfirmPackage(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const bizRefund = await getBizSettings();
		const syncRefundPkg = await syncMerchantMembershipCycles(merchant, { biz: bizRefund, now: nowTs() });
		merchant = syncRefundPkg.merchant;
		const refundNoIn = safeText(data?.refundNo || data?.outBillNo, 64);
		if (!refundNoIn) return { code: 400, message: '缺少退款单号' };
		let row = await findRefundTransferOrderForMerchant(merchant._id, refundNoIn);
		if (!row) return { code: 404, message: '退款单不存在' };
		const isExistingRechargeRefund =
			safeText(row.refund_mode, 40) === 'merchant_transfer' && Number(row.final_refund_fen || 0) > 0;
		if (!isExistingRechargeRefund && shouldBlockH5RefundForSilverOnly(merchant)) {
			return { code: 400, message: '白银会员不可申请退款' };
		}
		if (!shouldBypassRefundEntryToken(data)) {
			const tokenCheck = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
			if (!tokenCheck.ok) return { code: tokenCheck.code || 403, message: tokenCheck.message || '退款入口无效' };
		}
		await getBizSettings();
		if (safeText(row.state, 24) === 'REJECTED' || safeText(row.audit_status, 20) === 'rejected') {
			return { code: 400, message: '该退款已被管理员拒绝，无法发起确认收款' };
		}
		const wc = wxCredentialsByMchId(row.transfer_mch_id) || wxRefundCredentials();
		if (!wc || !wc.mchId) return { code: 500, message: '未配置退款商户号支付参数' };
		const refundNoMain = safeText(row.refund_no, 64);
		if (row.audit_required && safeText(row.audit_status, 20) !== 'approved') {
			return { code: 400, message: '退款尚未审核通过，请等待管理员处理' };
		}
		if (safeText(row.state, 24) === 'PENDING_AUDIT') {
			const openid = safeText(merchant.wx_openid, 100);
			if (!openid) return { code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
			const reason = safeText(row.reason || '用户申请退款', 80);
			const pipe = await runRefundMerchantTransferPipeline(row, merchant, {}, {
				wc,
				openid,
				reason,
				countdownPhase: ''
			});
			if (pipe.code !== 0 && pipe.code !== 409) {
				const detail =
					safeText(
						(pipe?.data?.refundItems || []).map((x) => x.error).find(Boolean) ||
							pipe?.data?.refundItems?.[0]?.error ||
							pipe?.data?.transferError ||
							'',
						180
					) || '';
				return {
					code: pipe.code || 500,
					message: pipe.message || '发起退款打款失败',
					data: {
						refundNo: refundNoMain,
						outBillNo: pipe?.data?.outBillNo || refundNoIn,
						state: safeText(row.state, 24),
						detail
					}
				};
			}
			const freshRes = await transferOrderCollection.doc(row._id).get();
			const fresh = freshRes.data && freshRes.data[0];
			if (fresh) {
				row.state = fresh.state;
				row.transfer_items = fresh.transfer_items;
				row.package_info = fresh.package_info;
			}
		}

		let items = sortTransferItemsBySlice(
			Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : []
		);
		const splitCheck = ensureMultiRefundSlicesOnOrder(row, refundNoMain, row.final_refund_fen);
		if (splitCheck.changed) {
			await transferOrderCollection.doc(row._id).update({
				transfer_items: splitCheck.items,
				transfer_slice_ids: splitCheck.transfer_slice_ids,
				out_bill_no: splitCheck.items[0] ? splitCheck.items[0].out_bill_no : row.out_bill_no,
				update_time: nowTs()
			});
			items = sortTransferItemsBySlice(splitCheck.items);
			row.transfer_items = items;
		}

		const idxByBill = items.findIndex((it) => safeText(it.out_bill_no, 64) === refundNoIn);
		let sliceIdx = idxByBill >= 0 ? idxByBill : findActiveRefundSliceIndex(items);
		if (sliceIdx < 0) sliceIdx = 0;
		let first = { ...(items[sliceIdx] || { out_bill_no: refundNoIn, state: 'INIT' }) };
		let sliceBill = safeText(first.out_bill_no || refundNoIn, 64);

		let q = null;
		let state = normalizeTransferState(first.state || row.state || '');
		let queryErrorDetail = '';
		try {
			q = await wxPayQueryMerchantTransfer(wc, sliceBill);
			state = normalizeTransferState(q?.state || q?.status || state);
			const qPkgEarly = pickTransferPackageInfo(q);
			first.state = state;
			first.transfer_bill_no = safeText(q?.transfer_bill_no || first.transfer_bill_no || '', 80);
			first.query_resp = q || {};
			items[sliceIdx] = first;
			const batchAfter = computeMerchantRefundBatchState(items);
			await transferOrderCollection.doc(row._id).update({
				state: batchAfter,
				transfer_items: items,
				transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				...(qPkgEarly ? { package_info: safeText(qPkgEarly, 1200) } : {}),
				update_time: nowTs()
			});
		} catch (e) {
			const wxCode = safeText(e?.wxBody?.code || '', 40);
			queryErrorDetail =
				safeText(
					e && e.name === 'WxPayRequestError' && e.wxBody
						? e.wxBody.message || e.wxBody.code || e.message
						: e?.message || '查询退款转账状态失败',
					180
				) || '查询退款转账状态失败';
			first.last_error = queryErrorDetail;
			items[sliceIdx] = first;
			await transferOrderCollection.doc(row._id).update({
				transfer_items: items,
				transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				update_time: nowTs()
			});
			await writeTransferLog({
				scene: 'refund',
				stage: 'h5_refund_confirm_query_error',
				level: 'error',
				withdrawNo: sliceBill,
				merchantUserId: merchant.user_id || merchant._id,
				outBillNo: sliceBill,
				message: queryErrorDetail
			});
			await maybeNotifyWxOperatingAccountInsufficientWecom(queryErrorDetail, {
				scene: '退款',
				refundNo: refundNoMain,
				outBillNo: sliceBill,
				merchantName: maybeMerchantDisplayName(merchant)
			});
			if (wxCode === 'NOT_FOUND' && (!row.audit_required || safeText(row.audit_status, 20) === 'approved') && !row.applied) {
				const openid = safeText(merchant.wx_openid, 100);
				if (openid) {
					const reason = safeText(row.reason || '用户申请退款', 80);
					const pipe = await runRefundMerchantTransferPipeline(row, merchant, {}, {
						wc,
						openid,
						reason,
						countdownPhase: ''
					});
					if (pipe.code !== 0 && pipe.code !== 409) {
						return {
							code: pipe.code || 500,
							message: pipe.message || '发起退款打款失败',
							data: {
								refundNo: refundNoMain,
								outBillNo: pipe?.data?.outBillNo || sliceBill,
								state: safeText(row.state, 24),
								detail:
									safeText(
										(pipe?.data?.refundItems || []).map((x) => x.error).find(Boolean) ||
											pipe?.data?.refundItems?.[0]?.error ||
											pipe?.data?.transferError ||
											'',
										180
									) || queryErrorDetail
							}
						};
					}
					const freshRes = await transferOrderCollection.doc(row._id).get();
					const fresh = freshRes.data && freshRes.data[0];
					if (fresh) {
						row.state = fresh.state;
						row.transfer_items = fresh.transfer_items;
						row.package_info = fresh.package_info;
						items = sortTransferItemsBySlice(
							Array.isArray(fresh.transfer_items) ? fresh.transfer_items.map((x) => ({ ...x })) : []
						);
						sliceIdx = findActiveRefundSliceIndex(items);
						if (sliceIdx < 0) sliceIdx = 0;
						first = { ...(items[sliceIdx] || {}) };
						sliceBill = safeText(first.out_bill_no, 64);
						state = normalizeTransferState(first.state || fresh.state || state);
					}
					try {
						const q2 = await wxPayQueryMerchantTransfer(wc, sliceBill);
						q = q2;
						state = normalizeTransferState(q2?.state || q2?.status || state);
						first.transfer_bill_no = safeText(q2?.transfer_bill_no || first.transfer_bill_no || '', 80);
						first.query_resp = q2 || {};
						queryErrorDetail = '';
						first.last_error = '';
						items[sliceIdx] = first;
						const batchAfter2 = computeMerchantRefundBatchState(items);
						await transferOrderCollection.doc(row._id).update({
							state: batchAfter2,
							transfer_items: items,
							transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
							update_time: nowTs()
						});
					} catch (e2) {
						const detail2 =
							safeText(
								e2 && e2.name === 'WxPayRequestError' && e2.wxBody
									? e2.wxBody.message || e2.wxBody.code || e2.message
									: e2?.message || '补发起后查询失败',
								180
							) || '补发起后查询失败';
						queryErrorDetail = detail2;
						first.last_error = detail2;
						items[sliceIdx] = first;
						await transferOrderCollection.doc(row._id).update({
							transfer_items: items,
							update_time: nowTs()
						});
						await maybeNotifyWxOperatingAccountInsufficientWecom(detail2, {
							scene: '退款',
							refundNo: refundNoMain,
							outBillNo: sliceBill,
							merchantName: maybeMerchantDisplayName(merchant)
						});
					}
				}
			}
		}

		if (state === 'SUCCESS') {
			const batchFin = computeMerchantRefundBatchState(items);
			if (batchFin === 'SUCCESS') {
				await finalizeTransferSuccessIfNeeded({ ...row, state: 'SUCCESS', transfer_items: items }, {});
				return { code: 400, message: '该笔退款已到账，无需再次确认' };
			}
			const nextIdx = findActiveRefundSliceIndex(items);
			const nextBill = safeText((nextIdx >= 0 && items[nextIdx] && items[nextIdx].out_bill_no) || refundNoMain, 64);
			return {
				code: 0,
				message: '本笔已到账，请继续领取下一笔',
				data: {
					refundNo: refundNoMain,
					outBillNo: nextBill,
					state,
					allDone: false
				}
			};
		}
		if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
			const failDetail = safeText(q?.fail_reason || q?.message || first.last_error || state, 200);
			await maybeNotifyWxOperatingAccountInsufficientWecom(failDetail, {
				scene: '退款',
				refundNo: refundNoMain,
				outBillNo: sliceBill,
				merchantName: maybeMerchantDisplayName(merchant)
			});
			return { code: 400, message: `当前状态为${state}，请联系管理员或稍后重试` };
		}
		const packageInfo = safeText(
			pickTransferPackageInfo(q) ||
				pickTransferPackageInfo(first) ||
				pickTransferPackageInfo(first.query_resp) ||
				pickTransferPackageInfo(row) ||
				row.package_info ||
				'',
			1200
		);
		if (state !== 'WAIT_USER_CONFIRM' || !packageInfo) {
			const persistedErr = safeText(first.last_error || '', 180);
			const detail = persistedErr || queryErrorDetail || '';
			const message =
				state && state !== 'UNKNOWN'
					? `当前转账状态为 ${state}，尚未进入待确认收款`
					: (detail || '当前暂无可拉起的确认收款，请稍后再试');
			return {
				code: 409,
				message,
				data: {
					refundNo: refundNoMain,
					outBillNo: sliceBill,
					state,
					detail
				}
			};
		}
		items[sliceIdx] = { ...first, package_info: packageInfo };
		const batchProc = computeMerchantRefundBatchState(items);
		await transferOrderCollection.doc(row._id).update({
			package_info: packageInfo,
			transfer_items: items,
			state: batchProc === 'SUCCESS' ? 'SUCCESS' : 'PROCESSING',
			transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
			update_time: nowTs()
		});
		await writeTransferLog({
			stage: 'h5_refund_confirm_package_ready',
			withdrawNo: sliceBill,
			merchantUserId: merchant.user_id || merchant._id,
			outBillNo: sliceBill,
			transferState: state,
			message: 'H5 退款返回用户确认收款拉起参数',
			payload: { hasPackage: true }
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				mchId: wc.mchId,
				appId: wc.appId,
				package: packageInfo,
				withdrawNo: sliceBill,
				refundNo: refundNoMain,
				state
			}
		};
	} catch (e) {
		console.error('h5RefundConfirmPackage failed', e);
		return { code: 500, message: '获取确认收款参数失败' };
	}
}

async function h5RefundReset(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		let tokenRow = null;
		if (!shouldBypassRefundEntryToken(data)) {
			const tokenCheck = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
			if (!tokenCheck.ok) return { code: tokenCheck.code || 403, message: tokenCheck.message || '退款入口无效' };
			tokenRow = tokenCheck.row || null;
		}
		const ctx = await resolveH5RefundOrderContext(merchant, event, { tokenRow });
		if (!ctx.ok) return { code: ctx.code, message: ctx.message };
		if (!ctx.refundable) {
			return { code: 400, message: '暂无可退款充值金额' };
		}
		const { wc, needRefundAudit, countdown, rows, refundAmount, penaltyAmount, finalRefundAmount, targetRefundFen, now } = ctx;
		let transferOrder = ctx.transferOrder;
		if (
			transferOrder &&
			(safeText(transferOrder.state, 24) === 'REJECTED' || safeText(transferOrder.audit_status, 20) === 'rejected')
		) {
			// 已拒绝记录不再继续走微信转账流程，重新申请时创建新退款单。
			transferOrder = null;
		}
		const openid = ctx.openid;
		const reason = safeText(data?.reason || '用户申请退款', 80);
		if (
			transferOrder &&
			transferOrder.audit_required &&
			safeText(transferOrder.audit_status, 20) === 'pending' &&
			safeText(transferOrder.state, 24) === 'PENDING_AUDIT'
		) {
			return {
				code: 409,
				message: '退款申请已提交，待管理员审核后打款',
				data: {
					refundNo: transferOrder.refund_no,
					outBillNo: transferOrder.refund_no,
					refundState: 'PENDING_AUDIT',
					refundItems: []
				}
			};
		}
		if (!transferOrder) {
			const refundNo = `H5F${now}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
			const initialState = needRefundAudit ? 'PENDING_AUDIT' : 'INIT';
			const maxYuan = getRefundTransferSliceMaxYuan();
			const chunks = buildRefundTransferSlicesFromFen(targetRefundFen, maxYuan);
			let transfer_items;
			let transfer_slice_ids;
			if (chunks.length <= 1) {
				transfer_items = [
					{
						slice_index: 0,
						out_bill_no: refundNo,
						transfer_amount_fen: targetRefundFen,
						state: 'INIT',
						transfer_bill_no: '',
						last_error: ''
					}
				];
				transfer_slice_ids = [refundNo];
			} else {
				const base = safeText(refundNo, 48);
				transfer_items = chunks.map((fen, idx) => ({
					slice_index: idx,
					out_bill_no: makeRefundSliceOutBillNo(base, idx, 64),
					transfer_amount_fen: fen,
					state: 'INIT',
					transfer_bill_no: '',
					last_error: ''
				}));
				transfer_slice_ids = transfer_items.map((x) => x.out_bill_no);
			}
			const firstOutBill = transfer_items[0] ? transfer_items[0].out_bill_no : refundNo;
			const policy = ctx.refundEntryPolicy || resolveRefundEntryPolicy(null);
			const addRes = await transferOrderCollection.add({
				biz_key: ctx.bizKey,
				merchant_id: merchant._id,
				merchant_user_id: merchant.user_id || merchant._id,
				recharge_log_ids: rows.map((x) => x._id).filter(Boolean),
				refund_no: refundNo,
				out_bill_no: firstOutBill,
				transfer_mch_id: wc.mchId,
				refund_mode: 'merchant_transfer',
				transfer_items,
				transfer_slice_ids,
				refund_amount: Number(refundAmount || 0),
				penalty_amount: Number(penaltyAmount || 0),
				final_refund_amount: Number(finalRefundAmount || 0),
				final_refund_fen: targetRefundFen,
				base_recharge_amount: Number(ctx.baseRechargeAmount || 0),
				refund_entry_type: policy.entryType || 'full',
				refund_percent: policy.refundPercent != null ? Number(policy.refundPercent) : null,
				bypass_refund_window: !!policy.bypassRefundWindow,
				reason,
				audit_required: !!needRefundAudit,
				audit_status: needRefundAudit ? 'pending' : 'none',
				state: initialState,
				applied: false,
				is_deleted: false,
				create_time: now,
				update_time: now
			});
			const ordRes = await transferOrderCollection.doc(addRes.id).get();
			transferOrder = ordRes.data && ordRes.data[0];
			if (needRefundAudit) {
				await sendWecomRobotText(`商户${maybeMerchantDisplayName(merchant)}申请H5充值退款，请及时处理。`);
				return {
					code: 0,
					message: '已提交，待管理员审核后打款',
					data: {
						refundNo: transferOrder.refund_no,
						refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
						penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
						finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
						phase: countdown.phase,
						outBillNo: transferOrder.refund_no,
						refundState: 'PENDING_AUDIT',
						refundItems: []
					}
				};
			}
		}
		return await runRefundMerchantTransferPipeline(transferOrder, merchant, event, {
			wc,
			openid,
			reason,
			countdownPhase: countdown.phase
		});
	} catch (e) {
		console.error('h5RefundReset failed', e);
		return { code: 500, message: safeText(e.message || '退款重置失败', 200) };
	}
}

async function h5RefundEntryValidate(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		let exp = 0;
		let tokenRow = null;
		if (!shouldBypassRefundEntryToken(data)) {
			const chk = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
			if (!chk.ok) return { code: chk.code || 403, message: chk.message || '退款入口无效' };
			exp = Number(chk.row?.expire_time || 0);
			tokenRow = chk.row || null;
		}
		const ctx = await resolveH5RefundOrderContext(merchant, {}, { tokenRow });
		if (!ctx.ok) {
			return { code: ctx.code || 500, message: ctx.message || '校验失败' };
		}
		const refundUi = buildH5RefundUiFromContext(ctx);
		return {
			code: 0,
			message: 'ok',
			data: {
				expireAt: exp,
				remainingSec: Math.max(0, Math.floor((exp - nowTs()) / 1000)),
				refundUi
			}
		};
	} catch (e) {
		console.error('h5RefundEntryValidate failed', e);
		return { code: 500, message: '校验失败' };
	}
}

async function h5TransferStatus(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const outBillNo = safeText(data?.outBillNo || data?.refundNo, 64);
		if (!outBillNo) return { code: 400, message: '缺少转账单号' };
		let ord = await findRefundTransferOrderForMerchant(merchant._id, outBillNo);
		if (!ord) {
			const ordRes = await transferOrderCollection
				.where({ out_bill_no: outBillNo, merchant_id: merchant._id, is_deleted: false })
				.limit(1)
				.get();
			ord = ordRes.data && ordRes.data[0];
		}
		if (!ord) return { code: 404, message: '退款单不存在' };
		if (ord.refund_mode === 'merchant_transfer') {
			await getBizSettings();
			const wc = wxCredentialsByMchId(ord.transfer_mch_id) || wxRefundCredentials();
			let items = sortTransferItemsBySlice(
				Array.isArray(ord.transfer_items) ? ord.transfer_items.map((x) => ({ ...x })) : []
			);
			const idxHit = items.findIndex((it) => safeText(it.out_bill_no, 64) === outBillNo);
			let sliceIdx = idxHit >= 0 ? idxHit : findActiveRefundSliceIndex(items);
			if (sliceIdx < 0) sliceIdx = 0;
			let first = {
				...(items[sliceIdx] || {
					out_bill_no: outBillNo,
					state: ord.state || 'PROCESSING'
				})
			};
			const billToQuery = safeText(first.out_bill_no || outBillNo, 64);
			let st = normalizeTransferState(first.state || ord.state || '');
			try {
				const q = await wxPayQueryMerchantTransfer(wc, billToQuery);
				first.query_resp = q || {};
				st = normalizeTransferState(q?.state || q?.status || st);
				first.transfer_bill_no = safeText(q?.transfer_bill_no || first.transfer_bill_no || '', 80);
				const qPkg = safeText(
					pickTransferPackageInfo(q) ||
						pickTransferPackageInfo(first) ||
						pickTransferPackageInfo(ord) ||
						ord.package_info ||
						'',
					1200
				);
				if (qPkg) first.package_info = qPkg;
				first.last_error = '';
				if (st === 'SUCCESS') first.transfer_time = nowTs();
				first.state = st;
				if (sliceIdx >= 0 && items[sliceIdx]) items[sliceIdx] = first;
				else if (!items.length) items = [first];
				await writeTransferLog({
					stage: 'transfer_status_query',
					withdrawNo: billToQuery,
					merchantUserId: merchant.user_id || merchant._id,
					outBillNo: billToQuery,
					transferState: st,
					message: 'h5TransferStatus 查询商家转账状态',
					payload: q || {}
				});
			} catch (e) {
				const detail =
					e && e.name === 'WxPayRequestError' && e.wxBody
						? e.wxBody.message || e.wxBody.code || e.message
						: e.message || 'query merchant transfer failed';
				first.last_error = safeText(String(detail), 200);
				await writeTransferLog({
					stage: 'transfer_status_query_error',
					level: 'error',
					withdrawNo: billToQuery,
					merchantUserId: merchant.user_id || merchant._id,
					outBillNo: billToQuery,
					transferState: st,
					message: first.last_error
				});
			}
			first.state = st;
			if (sliceIdx >= 0 && items[sliceIdx]) items[sliceIdx] = first;
			const batchState = computeMerchantRefundBatchState(items);
			await transferOrderCollection.doc(ord._id).update({
				state: batchState,
				transfer_items: items,
				transfer_slice_ids: items.map((x) => safeText(x.out_bill_no, 64)).filter(Boolean),
				...(first.package_info ? { package_info: safeText(first.package_info, 1200) } : {}),
				update_time: nowTs()
			});
			ord.state = batchState;
			ord.transfer_items = items;
			if (batchState === 'SUCCESS') await finalizeTransferSuccessIfNeeded(ord, event);
			return {
				code: 0,
				message: 'ok',
				data: {
					outBillNo,
					state: ord.state,
					refundNo: ord.refund_no,
					refundState: ord.state,
					wxItemState: st,
					transferMchId: ord.transfer_mch_id,
					transferError: safeText(first.last_error || '', 200),
					transferBillNo: safeText(first.transfer_bill_no || '', 80),
					transferSliceDone: countRefundSlicesSucceeded(items),
					transferSliceTotal: items.length
				}
			};
		}
		const rc = wxCredentialsByMchId(ord.transfer_mch_id) || wxRechargeCredentials();
		let hasFailed = false;
		let hasPending = false;
		const nextItems = [];
		for (const item of Array.isArray(ord.refund_items) ? ord.refund_items : []) {
			const next = { ...item };
			const outRefundNo = safeText(next.out_refund_no, 64);
			if (!outRefundNo) {
				nextItems.push(next);
				continue;
			}
			try {
				const q = await wxPayQueryRefundFor(rc, outRefundNo);
				next.query_resp = q || {};
				next.state = normalizeRefundState(q?.status || q?.refund_status || next.state);
				next.wx_refund_id = safeText(q?.refund_id || next.wx_refund_id || '', 80);
				if (isRefundSuccessState(next.state)) next.refund_time = nowTs();
			} catch (e) {}
			if (isRefundFailedState(next.state)) hasFailed = true;
			if (!isRefundSuccessState(next.state) && !isRefundFailedState(next.state)) hasPending = true;
			nextItems.push(next);
		}
		let batchState = 'PROCESSING';
		if (hasFailed) batchState = 'FAILED';
		else if (!hasPending) batchState = 'SUCCESS';
		await transferOrderCollection.doc(ord._id).update({
			state: batchState,
			refund_items: nextItems,
			update_time: nowTs()
		});
		ord.state = batchState;
		ord.refund_items = nextItems;
		if (batchState === 'SUCCESS') await finalizeTransferSuccessIfNeeded(ord, event);
		return {
			code: 0,
			message: 'ok',
			data: {
				outBillNo,
				state: ord.state,
				refundNo: ord.refund_no,
				refundState: ord.state,
				transferMchId: ord.transfer_mch_id
			}
		};
	} catch (e) {
		console.error('h5TransferStatus failed', e);
		return { code: 500, message: '查询失败' };
	}
}

async function finalizeTransferSuccessIfNeeded(transferOrder, event) {
	if (!transferOrder || transferOrder.applied) return;
	const ti = transferOrder.transfer_items;
	if (Array.isArray(ti) && ti.length && !allRefundSlicesSucceeded(ti)) return;
	const merchantId = safeText(transferOrder.merchant_id, 80);
	if (!merchantId) return;
	const merchant = await getMerchantByIdOrUserId(merchantId);
	if (!merchant) return;
	await resetMerchantAfterRechargeRefund(merchant, transferOrder, event);
}

async function adminRepairMerchantRefundState(data = {}, event = {}) {
	try {
		const key = data?.merchantId || data?.merchantUserId || data?.userId || data?.id;
		if (!key) return { code: 400, message: '请传入 merchantId / userId' };
		const merchant = await getMerchantByIdOrUserId(key);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const ordRes = await transferOrderCollection
			.where({
				merchant_id: merchant._id,
				is_deleted: false,
				refund_mode: 'merchant_transfer',
				state: 'SUCCESS'
			})
			.orderBy('update_time', 'desc')
			.limit(1)
			.get();
		const transferOrder = (ordRes.data && ordRes.data[0]) || null;
		if (!transferOrder) {
			return { code: 400, message: '未找到已成功完成的充值退款单' };
		}
		await resetMerchantAfterRechargeRefund(merchant, transferOrder, event);
		const fresh = await getMerchantByIdOrUserId(merchant._id);
		return {
			code: 0,
			message: '已修复退款后会员状态',
			data: {
				merchantId: merchant._id,
				membershipName: fresh?.membership_name || '',
				rechargeAmount: Number(fresh?.recharge_amount != null ? fresh.recharge_amount : fresh?.recharge_total_yuan || 0),
				transferOrderId: transferOrder._id
			}
		};
	} catch (e) {
		console.error('adminRepairMerchantRefundState failed', e);
		return { code: 500, message: safeText(e?.message || '修复失败', 180) };
	}
}

function addCalendarMonthsYm(ym, delta) {
	const [ys, ms] = String(ym || '').split('-');
	let y = Number(ys);
	let m = Number(ms);
	if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
	let d = Number(delta) || 0;
	m += d;
	while (m > 12) {
		m -= 12;
		y += 1;
	}
	while (m < 1) {
		m += 12;
		y -= 1;
	}
	return `${y}-${String(m).padStart(2, '0')}`;
}

function ymToDisplayLabel(ym) {
	const [ys, ms] = String(ym || '').split('-');
	const m = Number(ms);
	if (!ys || !Number.isFinite(m)) return ym;
	return `${ys}年${m}月`;
}

/**
 * 与 H5「待返积分」相同规则：按流水与分期把返现额摊到各自然月 bucket。
 * @param {Array} tradeRows 已筛好的交易行（含 amount、cashback、release_amount、release_ratio、create_time）
 * @param {number} nowTs
 * @returns {{ buckets: Record<string, number>, curYm: string }}
 */
function computePendingReturnBucketsForTrades(tradeRows, nowTs, optimizeConfig) {
	const curYm = shanghaiYearMonthFromTs(nowTs);
	const buckets = {};
	for (const row of tradeRows || []) {
		const amount = Number(row.amount || 0);
		const cbRaw = row.cashback;
		const cb =
			cbRaw != null && cbRaw !== '' && Number.isFinite(Number(cbRaw))
				? Number(cbRaw)
				: Number((amount * 0.0038).toFixed(4));
		if (!Number.isFinite(cb) || cb <= 0) continue;
		const installments = subsidyEngine.resolveInstallmentCount(amount, row.release_ratio, optimizeConfig);
		if (!subsidyEngine.isSubsidyEligibleTradeAmount(amount, row.release_ratio, optimizeConfig)) continue;
		const raRaw = row.release_amount;
		const r = subsidyEngine.resolveFirstReleaseYuan(amount, raRaw, row.release_ratio, optimizeConfig);
		if (!Number.isFinite(r) || r <= 0) continue;
		const rr = Number(row.release_ratio);
		const nInst = Number.isFinite(rr) && rr >= 99 ? 1 : installments;
		const ts = Number(row.create_time || 0);
		const tradeYm = shanghaiYearMonthFromTs(ts);
		for (let k = 0; k < nInst; k += 1) {
			const targetYm = addCalendarMonthsYm(tradeYm, k);
			if (String(targetYm).localeCompare(curYm) < 0) continue;
			buckets[targetYm] = Number(((buckets[targetYm] || 0) + r).toFixed(4));
		}
	}
	return { buckets, curYm };
}

/**
 * 与「积分明细」同口径：按来源月分片计算应返，再扣除已领取的分期补贴金额，
 * 剩余即为待返；随领取逐步减少，全部领完则该月条目消失。
 */
function computeDeferredPendingReturnBuckets(trades, packets, nowTs, optimizeConfig) {
	const curYm = subsidyEngine.monthNoFromTs(nowTs);
	const sourceSlicesByYm = subsidyEngine.buildDeferredSlicesByMonth(trades, nowTs, 10000, optimizeConfig);
	const dueSlicesByTargetSource = {};
	Object.keys(sourceSlicesByYm || {}).forEach((srcYm) => {
		const slices = sourceSlicesByYm[srcYm] || [];
		for (let k = 1; k <= 4; k += 1) {
			const targetYm = addCalendarMonthsYm(srcYm, k);
			if (!dueSlicesByTargetSource[targetYm]) dueSlicesByTargetSource[targetYm] = {};
			dueSlicesByTargetSource[targetYm][srcYm] = slices.slice();
		}
	});
	const claimedByTargetSource = {};
	for (const p of packets || []) {
		if (String(p.subsidy_kind || '') !== 'release_pool_history') continue;
		if (String(p.status || '') !== 'claimed') continue;
		const targetYm = String(p.month_no || '').trim();
		const sourceYm = String(p.subsidy_flow_month || '').trim();
		if (!targetYm || !sourceYm) continue;
		if (!claimedByTargetSource[targetYm]) claimedByTargetSource[targetYm] = {};
		claimedByTargetSource[targetYm][sourceYm] = Number(
			((claimedByTargetSource[targetYm][sourceYm] || 0) + Number(p.amount || 0)).toFixed(4)
		);
	}
	const buckets = {};
	Object.keys(dueSlicesByTargetSource).forEach((targetYm) => {
		if (String(targetYm).localeCompare(String(curYm)) < 0) return;
		const dueSrc = dueSlicesByTargetSource[targetYm] || {};
		const claimedSrc = claimedByTargetSource[targetYm] || {};
		let remain = 0;
		Object.keys(dueSrc).forEach((sourceYm) => {
			const slices = Array.isArray(dueSrc[sourceYm]) ? dueSrc[sourceYm] : [];
			const duePoints = slices.reduce((s, x) => s + Number(x || 0), 0);
			const claimedPoints = Number(claimedSrc[sourceYm] || 0);
			remain += Math.max(0, duePoints - claimedPoints);
		});
		const pts = Number(remain.toFixed(4));
		if (pts > 0.0001) buckets[targetYm] = pts;
	});
	return { buckets, curYm };
}

/**
 * 后台「冻结金额」：待返积分里分期落在「当前自然月之后」的金额合计（不含本月及已过期月份）。
 */
function sumFutureDeferredFrozenYuanFromBuckets(buckets, curYm) {
	let s = 0;
	for (const ym of Object.keys(buckets || {})) {
		if (String(ym).localeCompare(String(curYm)) > 0) {
			s += Number(buckets[ym] || 0);
		}
	}
	return Number(s.toFixed(2));
}

/** 从 trade_first 红包 dedup_key 解析 trade_no：`trade_${uid}_${tradeNo}` */
function tradeNoFromTradeFirstDedupKey(dedupKey, merchantUserId) {
	const dk = String(dedupKey || '').trim();
	const uid = String(merchantUserId || '').trim();
	if (!dk || !uid) return '';
	const prefix = `trade_${uid}_`;
	if (!dk.startsWith(prefix)) return '';
	return dk.slice(prefix.length).trim();
}

/**
 * 拉取商户已领取首期对应的 trade_no 集合（冻结仅在这些流水上生成）。
 * @returns {Map<string, Set<string>>} uid -> trade_no set
 */
async function loadClaimedTradeFirstTradeNosByUids(uids) {
	const out = new Map();
	const list = Array.isArray(uids) ? uids.map((x) => String(x || '').trim()).filter(Boolean) : [];
	for (const uid of list) out.set(uid, new Set());
	if (!list.length) return out;
	const _ = db.command;
	const rows = await subsidyEngine.fetchAllQueryPages(
		db,
		'hsy-income-packets',
		{
			merchant_user_id: _.in(list),
			subsidy_kind: 'trade_first',
			status: 'claimed',
			is_deleted: _.neq(true)
		},
		{ field: { merchant_user_id: true, dedup_key: true } }
	);
	for (const p of rows || []) {
		const uid = String(p.merchant_user_id || '');
		if (!out.has(uid)) continue;
		const tn = tradeNoFromTradeFirstDedupKey(p.dedup_key, uid);
		if (tn) out.get(uid).add(tn);
	}
	return out;
}

/**
 * 商户列表批量：按流水理论计算「未来月待返」冻结额（不含积分优化）。
 * 仅「首期已领取」的流水才计入后几期；无分片账本时作为回退。
 */
async function batchComputeFutureDeferredFrozenFromTrades(merchantDocs, nowTsVal) {
	const frozenByUid = new Map();
	const rows = Array.isArray(merchantDocs) ? merchantDocs : [];
	if (!rows.length) return frozenByUid;

	const uids = [...new Set(rows.map((m) => String(m.user_id || m._id || '')).filter(Boolean))];
	if (!uids.length) return frozenByUid;

	const _ = db.command;
	const deviceIds = [...new Set(rows.map((m) => String(m.device_id || '').trim()).filter(Boolean))];
	const devBind = new Map();
	if (deviceIds.length) {
		const mRes = await machineCollection
			.where({ device_id: _.in(deviceIds), is_deleted: false })
			.field({ device_id: true, bind_time: true })
			.get();
		for (const mach of mRes.data || []) {
			const k = String(mach.device_id || '');
			if (!k) continue;
			const bt = Number(mach.bind_time || 0);
			devBind.set(k, Math.max(devBind.get(k) || 0, bt));
		}
	}

	const bindTsForMerchant = (m) => {
		let bindTs = Number(m.bind_time || 0);
		const did = String(m.device_id || '').trim();
		if (did && devBind.has(did)) {
			bindTs = Math.max(bindTs, devBind.get(did));
		}
		return bindTs;
	};

	const claimedFirstByUid = await loadClaimedTradeFirstTradeNosByUids(uids);

	const tradePartsBase = [
		{ user_id: _.in(uids) },
		{ trade_type: _.in(['real', 'virtual']) },
		{ stats_eligible: _.neq(false) },
		{ amount: _.gt(0) },
		{ is_deleted: _.neq(true) },
		_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
	];
	const tRes = await machineTradeCollection
		.where(_.and(tradePartsBase))
		.field({
			user_id: true,
			trade_no: true,
			amount: true,
			cashback: true,
			release_amount: true,
			release_ratio: true,
			create_time: true
		})
		.limit(20000)
		.get();

	const rowsByUser = new Map();
	for (const uid of uids) rowsByUser.set(uid, []);
	for (const row of tRes.data || []) {
		const uid = String(row.user_id || '');
		if (!rowsByUser.has(uid)) continue;
		rowsByUser.get(uid).push(row);
	}

	let optimizeConfig = null;
	try {
		const biz = await getBizSettings();
		optimizeConfig = biz.optimizeConfig;
	} catch (e) {}

	for (const m of rows) {
		const uid = String(m.user_id || m._id || '');
		if (!uid) continue;
		const claimedNos = claimedFirstByUid.get(uid) || new Set();
		if (!claimedNos.size) {
			frozenByUid.set(uid, 0);
			continue;
		}
		let userRows = rowsByUser.get(uid) || [];
		const bt = bindTsForMerchant(m);
		if (bt) {
			userRows = userRows.filter((r) => Number(r.create_time || 0) >= bt);
		}
		userRows = userRows.filter((r) => {
			const tn = String(r.trade_no || '').trim();
			return tn && claimedNos.has(tn);
		});
		if (!userRows.length) {
			frozenByUid.set(uid, 0);
			continue;
		}
		const { buckets, curYm } = computePendingReturnBucketsForTrades(userRows, nowTsVal, optimizeConfig);
		frozenByUid.set(uid, sumFutureDeferredFrozenYuanFromBuckets(buckets, curYm));
	}
	return frozenByUid;
}

/**
 * 商户列表批量：「未来月」冻结额。
 * 优先用 hsy-points-slice-state 未领片的 effective_amount（含积分优化后生效值）；
 * 无分片账本的商户回退流水理论口径。
 */
async function batchComputeFutureDeferredFrozenForMerchants(merchantDocs, nowTsVal) {
	const frozenByUid = new Map();
	const rows = Array.isArray(merchantDocs) ? merchantDocs : [];
	if (!rows.length) return frozenByUid;

	const uids = [...new Set(rows.map((m) => String(m.user_id || m._id || '')).filter(Boolean))];
	for (const uid of uids) frozenByUid.set(uid, 0);
	if (!uids.length) return frozenByUid;

	const curYm = shanghaiYearMonthFromTs(nowTsVal || nowTs());
	const _ = db.command;
	const $ = db.command.aggregate;
	const sliceCol = db.collection('hsy-points-slice-state');
	const hasLedger = new Set();
	const CHUNK = 100;

	for (let i = 0; i < uids.length; i += CHUNK) {
		const part = uids.slice(i, i + CHUNK);
		try {
			const anyAgg = await sliceCol
				.aggregate()
				.match(_.and([{ merchant_user_id: _.in(part) }, { is_deleted: _.neq(true) }]))
				.group({ _id: '$merchant_user_id', n: $.sum(1) })
				.end();
			for (const r of (anyAgg && anyAgg.data) || []) {
				const uid = String(r._id || '').trim();
				if (uid) hasLedger.add(uid);
			}

			const sumAgg = await sliceCol
				.aggregate()
				.match(
					_.and([
						{ merchant_user_id: _.in(part) },
						{ is_deleted: _.neq(true) },
						{ is_claimed: _.neq(true) },
						{ target_ym: _.gt(curYm) }
					])
				)
				.group({
					_id: '$merchant_user_id',
					total: $.sum('$effective_amount')
				})
				.end();
			for (const r of (sumAgg && sumAgg.data) || []) {
				const uid = String(r._id || '').trim();
				if (!uid) continue;
				frozenByUid.set(uid, Number(Number(r.total || 0).toFixed(2)));
			}
		} catch (e) {
			console.error('batchComputeFutureDeferredFrozenForMerchants slice', e);
		}
	}

	const needFallback = rows.filter((m) => {
		const uid = String(m.user_id || m._id || '').trim();
		return uid && !hasLedger.has(uid);
	});
	if (needFallback.length) {
		const fb = await batchComputeFutureDeferredFrozenFromTrades(needFallback, nowTsVal);
		for (const [uid, amt] of fb.entries()) {
			frozenByUid.set(uid, Number(amt || 0));
		}
	}
	return frozenByUid;
}

async function recalcAndPersistFrozenAmountForMerchantById(merchantIdOrUserId) {
	const merchant = await getMerchantByIdOrUserId(merchantIdOrUserId);
	if (!merchant) return { ok: false, reason: 'merchant_not_found' };
	const frozenByUid = await batchComputeFutureDeferredFrozenForMerchants([merchant], nowTs());
	const uid = String(merchant.user_id || merchant._id || '');
	const nextFrozen = Number(frozenByUid.get(uid) || 0);
	const now = nowTs();
	await merchantCollection.doc(merchant._id).update({
		frozen_amount: Number(nextFrozen.toFixed(4)),
		update_time: now
	});
	try {
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		const primary = pickPrimaryBoundMachine(merchant, boundMachines);
		if (primary && primary._id) {
			await machineCollection.doc(primary._id).update({
				frozen_amount: Number(nextFrozen.toFixed(4))
			});
		}
	} catch (e) {
		console.error('recalc frozen sync machine', e);
	}
	return { ok: true, frozenAmount: Number(nextFrozen.toFixed(4)), merchantId: merchant._id, userId: uid };
}

/**
 * H5 待返积分汇总口径：
 * - 流水按 5 期释放（每期约 20%），计入交易当月及后续月份；
 * - 单笔低于约 13.16 元（5×0.01÷0.0038）不产生可领取积分。
 * 仅汇总当前月及之后月份（理论值，不含已过期月份）。
 */
async function h5PendingReturnPoints(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const now = nowTs();
		const tradeRows = await subsidyEngine.fetchAllQueryPages(
			db,
			'hsy-machine-trades',
			{
				user_id: merchantUserId,
				trade_type: db.command.in(['real', 'virtual']),
				amount: db.command.gt(0)
			},
			{
				field: { amount: true, cashback: true, release_amount: true, create_time: true },
				orderBy: { field: 'create_time', direction: 'asc' }
			}
		);
		const deferredPackets = await subsidyEngine.fetchAllQueryPages(
			db,
			'hsy-income-packets',
			{
				merchant_user_id: merchantUserId,
				is_deleted: false,
				subsidy_kind: 'release_pool_history'
			},
			{
				field: {
					month_no: true,
					subsidy_flow_month: true,
					subsidy_block_index: true,
					subsidy_kind: true,
					status: true,
					amount: true
				}
			}
		);
		const bizPending = await getBizSettings();
		const { buckets, curYm } = computeDeferredPendingReturnBuckets(
			tradeRows,
			deferredPackets,
			now,
			bizPending.optimizeConfig
		);
		const months = Object.keys(buckets).sort();
		const list = months.map((ym) => {
			const pts = buckets[ym];
			return {
				month: ym,
				monthLabel: ymToDisplayLabel(ym),
				points: Number(pts.toFixed(4))
			};
		});
		let totalUpcoming = 0;
		for (const x of list) totalUpcoming += x.points;
		const futureDeferredFrozenYuan = sumFutureDeferredFrozenYuanFromBuckets(buckets, curYm);
		return {
			code: 0,
			message: 'ok',
			data: {
				currentMonth: curYm,
				list,
				totalUpcoming: Number(totalUpcoming.toFixed(4)),
				futureDeferredFrozenYuan,
				ruleNote:
					'统计说明：待返积分按「积分明细」同口径计算，展示各月应返积分扣除已在「收益」页领取的部分；每领取一部分相应减少，全部领完则不再显示该月。待领取但未领取的额度请在「收益」页查看。'
			}
		};
	} catch (e) {
		console.error('h5PendingReturnPoints failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function syncCouponInstancesForMerchant(merchant, now) {
	const merchantUserId = merchant.user_id || merchant._id;
	const curYm = subsidyEngine.monthNoFromTs(now);
	const { start: curStart, end: curEnd } = subsidyEngine.monthStartEndTs(curYm);
	let flowThisMonth = 0;
	if (curStart && curEnd) {
		try {
			flowThisMonth = await subsidyEngine.sumEligibleRealFlowYuan(db, merchantUserId, curStart, curEnd);
		} catch (e) {
			console.error('syncCouponInstancesForMerchant flow', e);
		}
	}
	const trackingRes = await couponInstanceCollection
		.where({ merchant_user_id: merchantUserId, status: 'tracking' })
		.limit(200)
		.get();
	for (const row of trackingRes.data || []) {
		const validUntil = Number(row.valid_until || 0);
		if (validUntil && now > validUntil) {
			await couponInstanceCollection.doc(row._id).update({
				status: 'expired_no_qualify',
				update_time: now
			});
			continue;
		}
		const need = Number(row.monthly_threshold_yuan || 0);
		if (!(need > 0) || flowThisMonth + 1e-6 < need) continue;
		const amount = Number(row.reward_yuan || 0);
		if (!(amount >= 0.01)) continue;
		const dedupKey = `coupon_inst_${row._id}`;
		const exist = await incomePacketCollection.where({ merchant_user_id: merchantUserId, dedup_key: dedupKey }).limit(1).get();
		if (exist.data && exist.data.length) continue;
		const addRes = await incomePacketCollection.add({
			merchant_user_id: merchantUserId,
			month_no: curYm,
			title: `优惠券奖励：${row.coupon_name || '活动'}`,
			amount,
			status: 'pending',
			claim_open_time: now,
			expire_time: validUntil || null,
			subsidy_kind: 'coupon_reward',
			dedup_key: dedupKey,
			coupon_instance_id: row._id,
			subsidy_flow_month: curYm,
			create_time: now,
			update_time: now,
			is_deleted: false
		});
		const newPacketId =
			typeof addRes === 'string' ? addRes : addRes ? String(addRes.id || addRes._id || '') : '';
		await couponInstanceCollection.doc(row._id).update({
			status: 'reward_issued',
			qualified_at: now,
			qualified_flow_yuan: flowThisMonth,
			income_packet_id: newPacketId,
			update_time: now
		});
	}
}

function couponInstanceStatusText(st) {
	const s = String(st || '');
	if (s === 'tracking') return '考核中';
	if (s === 'reward_issued') return '已达标，请在「收益」领取';
	if (s === 'claimed') return '已领取';
	if (s === 'expired_no_qualify') return '已过期（未达标）';
	return s || '-';
}

async function h5CouponMyList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const now = nowTs();
		try {
			await syncCouponInstancesForMerchant(merchant, now);
		} catch (e) {
			console.error('h5CouponMyList syncCoupon', e);
		}
		const curYm = subsidyEngine.monthNoFromTs(now);
		const { start: curStart, end: curEnd } = subsidyEngine.monthStartEndTs(curYm);
		let flowThisMonth = 0;
		if (curStart && curEnd) {
			try {
				flowThisMonth = await subsidyEngine.sumEligibleRealFlowYuan(db, merchantUserId, curStart, curEnd);
			} catch (e) {
				console.error('h5CouponMyList flow', e);
			}
		}
		const res = await couponInstanceCollection
			.where({ merchant_user_id: merchantUserId })
			.orderBy('issued_at', 'desc')
			.limit(100)
			.get();
		const list = (res.data || []).map((row) => {
			const need = Number(row.monthly_threshold_yuan || 0);
			const pct = need > 0 ? Math.min(100, Math.round((flowThisMonth / need) * 1000) / 10) : 0;
			return {
				id: row._id,
				name: row.coupon_name || '',
				description: row.coupon_description || '',
				monthlyThresholdYuan: need,
				rewardYuan: Number(row.reward_yuan || 0).toFixed(2),
				issuedAtText: row.issued_at ? formatTime(row.issued_at) : '',
				validUntilText: row.valid_until ? formatTime(row.valid_until) : '',
				status: row.status || '',
				statusText: couponInstanceStatusText(row.status),
				currentMonthFlowYuan: Number(flowThisMonth.toFixed(2)),
				monthNo: curYm,
				progressPercent: pct
			};
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				list,
				currentMonthFlowYuan: Number(flowThisMonth.toFixed(2)),
				monthNo: curYm
			}
		};
	} catch (e) {
		console.error('h5CouponMyList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function couponIssue(data, event) {
	try {
		const templateId = safeText(data?.couponId || data?.templateId, 80);
		const scope = safeText(data?.scope || 'selected', 20);
		const rawLines = Array.isArray(data?.merchantKeys) ? data.merchantKeys : [];
		const textBlock = safeText(data?.merchantKeysText, 8000);
		const linesFromText = textBlock
			.split(/[\n,，;；\s]+/)
			.map((x) => String(x || '').trim())
			.filter(Boolean);
		const lines = rawLines.length ? rawLines.map((x) => String(x || '').trim()).filter(Boolean) : linesFromText;
		if (!templateId) return { code: 400, message: '请选择优惠券模板' };
		if (scope !== 'all' && scope !== 'selected') return { code: 400, message: '发放范围无效' };
		if (scope === 'selected' && !lines.length) return { code: 400, message: '请填写至少一个商户（机具号或手机号）' };

		const tplRes = await couponCollection.doc(templateId).get();
		const tplRow = tplRes.data && tplRes.data[0];
		if (!tplRow || tplRow.is_deleted) return { code: 404, message: '优惠券模板不存在' };
		const threshold = Number(tplRow.monthly_threshold || 0);
		const reward = Number(tplRow.amount || 0);
		const validDays = Math.max(1, Number(tplRow.valid_days || 1));
		if (!(threshold > 0)) return { code: 400, message: '模板月流水门槛须大于0' };
		if (!(reward > 0)) return { code: 400, message: '模板奖励积分（元）须大于0' };

		const now = nowTs();
		const validUntil = now + validDays * 86400000;
		const operator = getOperator(event);

		const tryIssueToMerchant = async (merchant) => {
			if (!merchant || !merchant._id) return false;
			const merchantUserId = String(merchant.user_id || merchant._id || '');
			if (!merchantUserId) return false;
			const dup = await couponInstanceCollection
				.where({
					coupon_template_id: templateId,
					merchant_user_id: merchantUserId,
					status: db.command.in(['tracking', 'reward_issued'])
				})
				.limit(1)
				.get();
			if (dup.data && dup.data.length) return false;
			await couponInstanceCollection.add({
				coupon_template_id: templateId,
				merchant_user_id: merchantUserId,
				merchant_id: String(merchant._id),
				coupon_name: tplRow.name || '优惠券',
				coupon_description: tplRow.description || '',
				monthly_threshold_yuan: threshold,
				reward_yuan: reward,
				issued_at: now,
				valid_until: validUntil,
				status: 'tracking',
				create_time: now,
				update_time: now,
				issue_operator: operator
			});
			return true;
		};

		let issued = 0;
		if (scope === 'all') {
			const PAGE = 300;
			let skip = 0;
			for (;;) {
				const mr = await merchantCollection
					.where({ use_status: 1 })
					.field({ _id: true, user_id: true })
					.skip(skip)
					.limit(PAGE)
					.get();
				const rows = mr.data || [];
				if (!rows.length) break;
				for (const m of rows) {
					if (await tryIssueToMerchant(m)) issued += 1;
				}
				skip += PAGE;
				if (rows.length < PAGE) break;
			}
		} else {
			for (const key of lines) {
				const merchant = await getMerchantByIdOrUserId(key);
				if (merchant && (await tryIssueToMerchant(merchant))) issued += 1;
			}
		}
		return { code: 0, message: '发放完成', data: { issued } };
	} catch (e) {
		console.error('couponIssue failed', e);
		return { code: 500, message: '发放失败' };
	}
}

async function internalTradeRefundClawback(data = {}) {
	try {
		const claw = await refundClawback.processTradeRefundClawback(db, {
			refundLogno: data?.refundLogno,
			ologno: data?.ologno,
			refundAmountAbs: data?.refundAmountAbs,
			refundTradeId: data?.refundTradeId,
			merchantUserId: data?.merchantUserId,
			nowTs: data?.nowTs || nowTs()
		});
		let due = null;
		if (claw.ok && !claw.skipped) {
			try {
				due = await refundClawback.applyDueRefundClawbackTasks(db, { nowTs: nowTs(), limit: 100 });
			} catch (e) {
				console.error('applyDueRefundClawbackTasks after clawback', e);
			}
		}
		return { code: 0, message: claw.skipped ? `skipped:${claw.reason}` : 'ok', data: { claw, due } };
	} catch (e) {
		console.error('internalTradeRefundClawback failed', e);
		return { code: 500, message: safeText(e?.message || '退款回冲失败', 180) };
	}
}

async function applyDueRefundClawbackTasksAction(data = {}) {
	try {
		const due = await refundClawback.applyDueRefundClawbackTasks(db, {
			nowTs: data?.nowTs || nowTs(),
			limit: data?.limit
		});
		return { code: 0, message: 'ok', data: due };
	} catch (e) {
		console.error('applyDueRefundClawbackTasksAction failed', e);
		return { code: 500, message: safeText(e?.message || '执行待扣任务失败', 180) };
	}
}

async function h5IncomeList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const now = nowTs();
		const biz = await getBizSettings();
		try {
			const syncRet = await subsidyEngine.syncSubsidyPackets(db, merchant, now, {
				claimValidDays: biz.incomePacketClaimValidDays,
				optimizeConfig: biz.optimizeConfig
			});
			if (syncRet && Number(syncRet.expiredTradeFirst || 0) > 0) {
				try {
					await recalcAndPersistFrozenAmountForMerchantById(merchant._id);
				} catch (e2) {
					console.error('recalc frozen after trade_first expire', e2);
				}
			}
		} catch (e) {
			console.error('syncSubsidyPackets', e);
		}
		try {
			await refundClawback.applyDueRefundClawbackTasks(db, { nowTs: now, limit: 50, merchantUserId });
		} catch (e) {
			console.error('applyDueRefundClawbackTasks', e);
		}
		try {
			await syncCouponInstancesForMerchant(merchant, now);
		} catch (e) {
			console.error('syncCouponInstancesForMerchant', e);
		}
		const allPending = await subsidyEngine.fetchAllQueryPages(
			db,
			'hsy-income-packets',
			{ merchant_user_id: merchantUserId, is_deleted: false, status: 'pending' },
			{
				field: {
					_id: true,
					title: true,
					amount: true,
					month_no: true,
					status: true,
					create_time: true,
					expire_time: true,
					claim_open_time: true,
					unlock_flow_yuan: true
				},
				orderBy: { field: 'create_time', direction: 'desc' }
			}
		);
		const curYm = subsidyEngine.monthNoFromTs(now);
		const { start: curStart, end: curEnd } = subsidyEngine.monthStartEndTs(curYm);
		let flowThisMonth = 0;
		if (curStart && curEnd) {
			try {
				flowThisMonth = await subsidyEngine.sumEligibleRealFlowYuan(db, merchantUserId, curStart, curEnd);
			} catch (e) {
				console.error('h5IncomeList sumEligibleRealFlowYuan', e);
			}
		}
		const pendingRows = allPending.filter((x) => {
			if (x.expire_time && x.expire_time < now) return false;
			if (!Number(x.claim_open_time || 0)) return false;
			if (x.claim_open_time && x.claim_open_time > now) return false;
			if (subsidyEngine.roundPacketAmountYuan(x.amount) < 0.01) return false;
			// 与 claimPackets 一致：分期待返需本月流水达到 unlock_flow_yuan 才可展示/领取
			const need = x.unlock_flow_yuan != null ? Number(x.unlock_flow_yuan) : null;
			if (need != null && Number.isFinite(need) && need > 0 && flowThisMonth + 1e-6 < need) return false;
			return true;
		});
		// syncSubsidyPackets 已按上限失效最早的；此处再截断，保证气泡最多 50 个
		const maxPending =
			Number(subsidyEngine.MAX_PENDING_INCOME_PACKETS) > 0
				? Number(subsidyEngine.MAX_PENDING_INCOME_PACKETS)
				: 50;
		const displayPendingRows = pendingRows.slice(0, maxPending);
		let pendingTotal = 0;
		const packets = displayPendingRows.map((x) => {
			const displayAmt = subsidyEngine.roundPacketAmountYuan(x.amount);
			pendingTotal += displayAmt;
			return {
				id: x._id,
				title: x.title || '手续费补贴',
				amount: displayAmt.toFixed(2),
				monthNo: x.month_no || '',
				status: x.status,
				createTime: formatTime(x.create_time)
			};
		});
		pendingTotal = subsidyEngine.roundPacketAmountYuan(pendingTotal);
		const claimedRes = await incomePacketCollection
			.where({ merchant_user_id: merchantUserId, is_deleted: false, status: 'claimed' })
			.orderBy('claimed_time', 'desc')
			.limit(50)
			.get();
		const detailList = (claimedRes.data || [])
			.filter((x) => subsidyEngine.roundPacketAmountYuan(x.amount) >= 0.01)
			.map((x) => ({
				id: x._id,
				title: x.title || '手续费补贴',
				amount: subsidyEngine.roundPacketAmountYuan(x.amount).toFixed(2),
				timeText: formatTime(x.claimed_time || x.update_time)
			}));
		let subsidyTicker = [];
		try {
			const recentClaimed = await incomePacketCollection
				.where({ is_deleted: false, status: 'claimed' })
				.field({ merchant_user_id: true, amount: true, claimed_time: true, update_time: true })
				.orderBy('claimed_time', 'desc')
				.limit(40)
				.get();
			const recentRows = (recentClaimed.data || []).filter((x) => Number(x.amount || 0) > 0);
			const userIds = [...new Set(recentRows.map((x) => String(x.merchant_user_id || '')).filter(Boolean))];
			const merchantMap = new Map();
			if (userIds.length) {
				const merchantRows = await merchantCollection
					.where({ user_id: db.command.in(userIds) })
					.field({ user_id: true, wx_nickname: true, wx_avatar: true, mobile: true })
					.get();
				(merchantRows.data || []).forEach((m) => {
					merchantMap.set(String(m.user_id || ''), m);
				});
			}
			const displayName = (name, mobile) => {
				const n = String(name || '').trim();
				if (n) return n;
				const m = String(mobile || '').trim();
				if (m) return m;
				return '商户用户';
			};
			subsidyTicker = recentRows.slice(0, 20).map((r, idx) => {
				const userId = String(r.merchant_user_id || '');
				const m = merchantMap.get(userId) || {};
				return {
					id: `${userId || 'u'}_${r.claimed_time || r.update_time || 0}_${idx}`,
					name: displayName(m.wx_nickname, m.mobile),
					avatar: String(m.wx_avatar || ''),
					amount: Number(r.amount || 0).toFixed(2)
				};
			});
		} catch (e) {
			console.error('build subsidyTicker failed', e);
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				packets,
				pendingTotal: pendingTotal.toFixed(2),
				pendingCount: packets.length,
				detailList,
				subsidyTicker,
				servicePhone: safeText(biz?.servicePhone || DEFAULT_BIZ_SETTINGS.servicePhone, 30),
				summary: {
					accountPoints: normalizePendingBalance(merchant).toFixed(2),
					availableReward: h5DisplayWithdrawQuotaRemainingYuan(merchant).toFixed(2)
				}
			}
		};
	} catch (e) {
		console.error('h5IncomeList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function claimPackets(merchant, packetIds) {
	const ids = Array.isArray(packetIds) ? packetIds.filter(Boolean).map(String) : [];
	if (!ids.length) {
		return { claimedCount: 0, claimedAmount: 0, failReason: 'missing_id', failMessage: '缺少红包标识' };
	}
	const now = nowTs();
	const merchantUserId = merchant.user_id || merchant._id;
	// 单条优先 doc 读取，避免 _id $in + 其它条件偶发查不到
	let rows = [];
	if (ids.length === 1) {
		try {
			const one = await incomePacketCollection.doc(ids[0]).get();
			const doc = one.data && one.data[0] ? one.data[0] : null;
			if (
				doc &&
				String(doc.merchant_user_id || '') === String(merchantUserId) &&
				String(doc.status || '') === 'pending' &&
				doc.is_deleted !== true
			) {
				rows = [doc];
			}
		} catch (e) {
			console.error('claimPackets doc get', e);
		}
	}
	if (!rows.length) {
		const res = await incomePacketCollection
			.where({
				_id: db.command.in(ids),
				merchant_user_id: merchantUserId,
				status: 'pending',
				is_deleted: false
			})
			.limit(Math.min(ids.length, subsidyEngine.DB_PAGE_SIZE))
			.get();
		rows = res.data || [];
	}
	if (!rows.length) {
		return {
			claimedCount: 0,
			claimedAmount: 0,
			failReason: 'not_found',
			failMessage: '红包不存在、已领取或不属于当前商户'
		};
	}
	const curYm = subsidyEngine.monthNoFromTs(now);
	const { start: curStart, end: curEnd } = subsidyEngine.monthStartEndTs(curYm);
	let flowThisMonth = 0;
	if (curStart && curEnd) {
		try {
			flowThisMonth = await subsidyEngine.sumEligibleRealFlowYuan(db, merchantUserId, curStart, curEnd);
		} catch (e) {
			console.error('sumEligibleRealFlowYuan', e);
		}
	}
	let claimedAmount = 0;
	const claimedIds = [];
	let blockedUnlock = 0;
	let blockedNotOpen = 0;
	let blockedExpired = 0;
	let minUnlockNeed = null;
	for (const row of rows) {
		if (row.expire_time && row.expire_time < now) {
			blockedExpired += 1;
			continue;
		}
		if (!Number(row.claim_open_time || 0) || (row.claim_open_time && row.claim_open_time > now)) {
			blockedNotOpen += 1;
			continue;
		}
		const need = row.unlock_flow_yuan != null ? Number(row.unlock_flow_yuan) : null;
		if (need != null && Number.isFinite(need) && need > 0 && flowThisMonth + 1e-6 < need) {
			blockedUnlock += 1;
			if (minUnlockNeed == null || need < minUnlockNeed) minUnlockNeed = need;
			continue;
		}
		const amt = subsidyEngine.roundPacketAmountYuan(row.amount);
		if (amt < 0.01) continue;
		claimedAmount += amt;
		claimedIds.push(row._id);
		await incomePacketCollection.doc(row._id).update({
			status: 'claimed',
			amount: amt,
			claimed_time: now,
			update_time: now
		});
		if (row.coupon_instance_id) {
			try {
				await couponInstanceCollection.doc(String(row.coupon_instance_id)).update({
					status: 'claimed',
					claimed_at: now,
					update_time: now
				});
			} catch (e) {
				console.error('couponInstance claimed update', e);
			}
		}
	}
	if (claimedIds.length) {
		const merchantUpd = {
			pending_withdraw: Number((Number(merchant.pending_withdraw || 0) + claimedAmount).toFixed(4)),
			account_points: Number(rawPendingBalance(merchant) || 0) + claimedAmount,
			withdraw_pending_balance: Number(rawPendingBalance(merchant) || 0) + claimedAmount
		};
		await merchantCollection.doc(merchant._id).update(merchantUpd);
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		const m = pickPrimaryBoundMachine(merchant, boundMachines);
		if (m) {
			await machineCollection.doc(m._id).update({
				pending_amount: Number((Number(m.pending_amount || 0) + claimedAmount).toFixed(4))
			});
		}
		await recalcAndPersistFrozenAmountForMerchantById(merchant._id);
		return {
			claimedCount: claimedIds.length,
			claimedAmount: subsidyEngine.roundPacketAmountYuan(claimedAmount),
			flowThisMonth
		};
	}
	let failReason = 'blocked';
	let failMessage = '红包暂不可领取';
	if (blockedUnlock) {
		failReason = 'unlock_flow';
		const needText =
			minUnlockNeed != null ? Number(minUnlockNeed).toFixed(0) : '';
		const flowText = Number(flowThisMonth || 0).toFixed(2);
		failMessage = needText
			? `需本月刷卡流水满 ${needText} 元才可领取（当前约 ${flowText} 元）`
			: `需本月刷卡流水达到解锁条件才可领取（当前约 ${flowText} 元）`;
	} else if (blockedExpired) {
		failReason = 'expired';
		failMessage = '红包已过期';
	} else if (blockedNotOpen) {
		failReason = 'not_open';
		failMessage = '红包尚未到可领取时间';
	}
	return {
		claimedCount: 0,
		claimedAmount: 0,
		failReason,
		failMessage,
		flowThisMonth,
		blockedUnlock,
		blockedExpired,
		blockedNotOpen
	};
}

async function h5IncomeClaim(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const packetId = safeText(data?.packetId, 80);
		if (!packetId) return { code: 400, message: '缺少红包标识' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const result = await claimPackets(merchant, [packetId]);
		if (!result.claimedCount) {
			return {
				code: 400,
				message: result.failMessage || '红包已被领取或不存在',
				data: {
					failReason: result.failReason || '',
					flowThisMonth: result.flowThisMonth
				}
			};
		}
		return { code: 0, message: '领取成功', data: result };
	} catch (e) {
		console.error('h5IncomeClaim failed', e);
		return { code: 500, message: '领取失败' };
	}
}

async function h5IncomeClaimAll(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let totalClaimedCount = 0;
		let totalClaimedAmount = 0;
		for (;;) {
			const merchant = await getMerchantByIdOrUserId(merchantKey);
			if (!merchant) return { code: 404, message: '商户不存在' };
			const merchantUserId = merchant.user_id || merchant._id;
			const pending = await incomePacketCollection
				.where({ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false })
				.limit(subsidyEngine.DB_PAGE_SIZE)
				.get();
			const ids = (pending.data || []).map((x) => x._id);
			if (!ids.length) break;
			const result = await claimPackets(merchant, ids);
			totalClaimedCount += result.claimedCount;
			totalClaimedAmount += result.claimedAmount;
			if (!result.claimedCount) break;
			if ((pending.data || []).length < subsidyEngine.DB_PAGE_SIZE) break;
		}
		return {
			code: 0,
			message: '领取成功',
			data: { claimedCount: totalClaimedCount, claimedAmount: totalClaimedAmount }
		};
	} catch (e) {
		console.error('h5IncomeClaimAll failed', e);
		return { code: 500, message: '领取失败' };
	}
}

async function h5Unbind(data, event) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const reason = safeText(data?.reason || '用户主动解除绑定', 200);
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const machineRes = await machineCollection
			.where({ is_deleted: false, is_bound: 1, bind_user_id: merchantUserId })
			.limit(300)
			.get();
		const machines = machineRes.data || [];
		if (!machines.length) return { code: 400, message: '当前未绑定机具' };
		const now = nowTs();

		await merchantCollection.doc(merchant._id).update({
			device_id: '',
			brand_name: '',
			bind_time: null,
			remaining_quota: 0,
			pending_withdraw: 0,
			withdrawn: 0,
			frozen_amount: 0,
			coupon_count: 0,
			available_reward: 0,
			withdraw_quota_balance: 0,
			estimated_free_quota: 0,
			account_points: 0,
			withdraw_pending_balance: 0
		});

		const deviceIds = machines.map((x) => String(x.device_id || '')).filter(Boolean);
		await machineCollection.where({ device_id: db.command.in(deviceIds), is_deleted: false }).update({
			is_bound: 2,
			bind_time: null,
			unbind_time: now,
			bind_user_id: '',
			bind_user_name: '',
			bind_user_mobile: '',
			total_transaction: 0,
			pending_amount: 0,
			withdrawn_amount: 0,
			frozen_amount: 0,
			is_activated: false,
			activated_time: null,
			merchant: '管理员',
			salesman: '管理员',
			last_reset_reason: reason
		});

		await machineTradeCollection.where({ device_id: db.command.in(deviceIds), is_deleted: db.command.neq(true) }).update({
			is_deleted: true,
			delete_time: now
		});

		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || 'H5用户',
			action: 'unbind',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `H5解除绑定: ${deviceIds.join(',')}`,
			operator_source: 'h5',
			reason,
			before_merchant_snapshot: {
				_id: merchant._id,
				user_id: merchant.user_id || '',
				device_id: merchant.device_id || '',
				brand_name: merchant.brand_name || '',
				remaining_quota: Number(merchant.remaining_quota || 0),
				pending_withdraw: Number(merchant.pending_withdraw || 0),
				withdrawn: Number(merchant.withdrawn || 0),
				frozen_amount: Number(merchant.frozen_amount || 0)
			},
			before_machine_snapshot: machines.slice(0, 10).map((m) => ({
				_id: m._id,
				device_id: m.device_id || '',
				brand_name: m.brand_name || '',
				total_transaction: Number(m.total_transaction || 0),
				pending_amount: Number(m.pending_amount || 0),
				withdrawn_amount: Number(m.withdrawn_amount || 0),
				frozen_amount: Number(m.frozen_amount || 0)
			})),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});

		return { code: 0, message: '解绑成功', data: {} };
	} catch (e) {
		console.error('h5Unbind failed', e);
		return { code: 500, message: '解绑失败' };
	}
}

async function getDataCorrectTaskById(taskId) {
	const id = safeText(taskId, 80);
	if (!id) return null;
	const r = await dataCorrectTaskCollection.doc(id).get();
	return r.data && r.data[0] ? r.data[0] : null;
}

async function runDataCorrectTaskChunk(task, chunkSize = 120) {
	if (!task || safeText(task.status, 20) !== 'running') return task;
	const _ = db.command;
	const size = Math.min(Math.max(Number(chunkSize || 120), 20), 500);
	const cursorId = safeText(task.cursor_id, 80);
	const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
	const res = await merchantCollection
		.where(where)
		.field({
			_id: true,
			user_id: true,
			device_id: true,
			bind_time: true,
			frozen_amount: true,
			withdrawn: true,
			recharge_total_yuan: true,
			recharge_package_reward: true,
			estimated_free_quota: true,
			recharge_package_quota: true,
			recharge_package_price: true,
			available_reward: true,
			withdraw_quota_balance: true,
			account_points: true,
			withdraw_pending_balance: true,
			membership_name: true,
			recharge_update_time: true,
			recharge_cycle_start: true,
			update_time: true,
			silver_member: true,
			silver_member_end_at: true,
			member_tier: true,
			membership_tier: true,
			h5_member_tier: true,
			redeem_code_claimed: true,
			exchange_code_claimed: true
		})
		.orderBy('_id', 'asc')
		.limit(size)
		.get();
	const rows = res.data || [];
	if (!rows.length) {
		await dataCorrectTaskCollection.doc(task._id).update({
			status: 'done',
			finish_time: nowTs(),
			update_time: nowTs(),
			progress: 100
		});
		return await getDataCorrectTaskById(task._id);
	}
	const frozenByUid = await batchComputeFutureDeferredFrozenForMerchants(rows, nowTs());
	const withdrawnByUid = await batchComputeReceivedWithdrawAmountForMerchants(rows);
	let correctedFrozen = Number(task.corrected_frozen || 0);
	let correctedWithdrawn = Number(task.corrected_withdrawn || 0);
	let correctedMerchantBase = Number(task.corrected_merchant_base || 0);
	let scanned = Number(task.scanned || 0);
	for (const row of rows) {
		const uid = String(row.user_id || row._id || '');
		const nextFrozen = Number((frozenByUid.get(uid) || 0).toFixed(4));
		const nextWithdrawn = Number((withdrawnByUid.get(uid) || 0).toFixed(4));
		const curFrozen = Number(Number(row.frozen_amount || 0).toFixed(4));
		const curWithdrawn = Number(Number(row.withdrawn || 0).toFixed(4));
		const patch = {};
		if (Math.abs(nextFrozen - curFrozen) > 0.0001) {
			patch.frozen_amount = nextFrozen;
			correctedFrozen += 1;
		}
		if (Math.abs(nextWithdrawn - curWithdrawn) > 0.0001) {
			patch.withdrawn = nextWithdrawn;
			correctedWithdrawn += 1;
		}
		const totalRechargeYuan = Number(row.recharge_total_yuan || 0);
		const normalizedPending = normalizePendingBalance(row);
		const normalizedRemain = normalizeWithdrawQuotaBalance(row);
		let normalizedMembershipName = safeText(row.membership_name || '', 40);
		let normalizedOpenedAt = Number(row.recharge_update_time || 0);
		if (totalRechargeYuan > 0) {
			if (!normalizedMembershipName || normalizedMembershipName === '普通会员') {
				const reward = Number(row.recharge_package_reward || 0);
				const quota = Number(row.estimated_free_quota || row.recharge_package_quota || 0);
				const price = Number(row.recharge_package_price || 0);
				if (reward >= 7600 || quota >= 2000000 || price >= 1000) normalizedMembershipName = '钻石会员';
				else if (reward >= 5700 || quota >= 1500000 || price >= 800) normalizedMembershipName = '铂金会员';
				else if (reward >= 3800 || quota >= 1000000 || price >= 600 || price === 0.1) normalizedMembershipName = '白金会员';
			}
			if (!normalizedOpenedAt) normalizedOpenedAt = Number(row.recharge_cycle_start || row.update_time || nowTs());
		} else {
			normalizedMembershipName = hasH5SilverMemberIdentity(row) ? (normalizedMembershipName || '白银会员') : '普通会员';
			normalizedOpenedAt = 0;
		}
		if (Math.abs(Number(row.available_reward || 0) - normalizedRemain) > 0.0001) patch.available_reward = Number(normalizedRemain.toFixed(4));
		if (Math.abs(Number(row.withdraw_quota_balance || 0) - normalizedRemain) > 0.0001) patch.withdraw_quota_balance = Number(normalizedRemain.toFixed(4));
		if (Math.abs(Number(rawPendingBalance(row) || 0) - normalizedPending) > 0.0001) {
			patch.account_points = Number(normalizedPending.toFixed(4));
			patch.withdraw_pending_balance = Number(normalizedPending.toFixed(4));
		}
		if (safeText(row.membership_name || '', 40) !== normalizedMembershipName) patch.membership_name = normalizedMembershipName;
		if (Number(row.recharge_update_time || 0) !== Number(normalizedOpenedAt || 0)) patch.recharge_update_time = Number(normalizedOpenedAt || 0);
		if (Object.keys(patch).length) {
			patch.update_time = nowTs();
			await merchantCollection.doc(row._id).update(patch);
			if (
				Object.prototype.hasOwnProperty.call(patch, 'available_reward') ||
				Object.prototype.hasOwnProperty.call(patch, 'withdraw_quota_balance') ||
				Object.prototype.hasOwnProperty.call(patch, 'account_points') ||
				Object.prototype.hasOwnProperty.call(patch, 'withdraw_pending_balance') ||
				Object.prototype.hasOwnProperty.call(patch, 'membership_name') ||
				Object.prototype.hasOwnProperty.call(patch, 'recharge_update_time')
			) {
				correctedMerchantBase += 1;
			}
		}
		scanned += 1;
	}
	const total = Math.max(1, Number(task.total || 0));
	const progress = Math.min(99, Math.floor((scanned / total) * 100));
	await dataCorrectTaskCollection.doc(task._id).update({
		cursor_id: safeText(rows[rows.length - 1]?._id || '', 80),
		scanned,
		corrected_frozen: correctedFrozen,
		corrected_withdrawn: correctedWithdrawn,
		corrected_merchant_base: correctedMerchantBase,
		progress,
		update_time: nowTs()
	});
	return await getDataCorrectTaskById(task._id);
}

async function merchantDataCorrectStart(data = {}, event = {}) {
	try {
		const now = nowTs();
		const totalRes = await merchantCollection.where({ _id: db.command.neq('') }).count();
		const total = Number(totalRes.total || 0);
		const addRes = await dataCorrectTaskCollection.add({
			type: 'merchant_data_correct',
			status: 'running',
			total,
			scanned: 0,
			corrected_frozen: 0,
			corrected_withdrawn: 0,
			corrected_merchant_base: 0,
			progress: 0,
			cursor_id: '',
			error_message: '',
			create_time: now,
			update_time: now,
			start_user: safeText(event?.uid || '', 80)
		});
		return { code: 0, message: '已开始矫正任务', data: { taskId: addRes.id, total } };
	} catch (e) {
		console.error('merchantDataCorrectStart failed', e);
		return { code: 500, message: safeText(e?.message || '启动矫正任务失败', 180) };
	}
}

async function merchantDataCorrectStatus(data = {}) {
	try {
		const taskId = safeText(data?.taskId, 80);
		if (!taskId) return { code: 400, message: '缺少任务ID' };
		let task = await getDataCorrectTaskById(taskId);
		if (!task) return { code: 404, message: '任务不存在' };
		if (safeText(task.status, 20) === 'running') {
			const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 120), 20), 500);
			try {
				task = await runDataCorrectTaskChunk(task, chunkSize);
			} catch (eRun) {
				await dataCorrectTaskCollection.doc(task._id).update({
					status: 'failed',
					error_message: safeText(eRun?.message || '任务执行失败', 180),
					update_time: nowTs(),
					finish_time: nowTs()
				});
				task = await getDataCorrectTaskById(task._id);
			}
		}
		const status = safeText(task.status, 20) || 'running';
		return {
			code: 0,
			message: 'ok',
			data: {
				taskId: task._id,
				status,
				total: Number(task.total || 0),
				scanned: Number(task.scanned || 0),
				progress: Number(task.progress || 0),
				correctedFrozen: Number(task.corrected_frozen || 0),
				correctedWithdrawn: Number(task.corrected_withdrawn || 0),
				correctedMerchantBase: Number(task.corrected_merchant_base || 0),
				errorMessage: safeText(task.error_message || '', 180)
			}
		};
	} catch (e) {
		console.error('merchantDataCorrectStatus failed', e);
		return { code: 500, message: safeText(e?.message || '获取矫正任务状态失败', 180) };
	}
}

async function merchantDataCorrect(data = {}, event = {}) {
	// 兼容旧调用：直接点击“数据矫正”时，改为返回任务ID。
	return await merchantDataCorrectStart(data, event);
}

/**
 * 为历史白银会员（H5 判定为 silver 且非充值档）批量补齐与「兑换码开通白银」相同的待提+剩余额度下限。
 * 仅上调不下调；与 h5ExchangeCouponRedeem 写入字段一致。
 * @param {boolean} data.dryRun 为 true 时只统计/抽样，不写库
 * @param {string} data.cursorId 上一批返回的 nextCursor，首次传空
 * @param {number} data.chunkSize 每批条数 20–500，默认 200
 * @param {number} data.giftYuan 必填正数（不再提供内置默认，避免误跑）
 */
async function adminSilverMemberGiftBackfill(data = {}) {
	try {
		const dryRun = !!data?.dryRun;
		const giftYuan = Number(data?.giftYuan != null && data?.giftYuan !== '' ? data.giftYuan : NaN);
		if (!Number.isFinite(giftYuan) || giftYuan <= 0) {
			return { code: 400, message: '请显式传入 giftYuan（正数）。已取消白银默认礼包，不再使用内置默认值。' };
		}
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 200), 20), 500);
		const cursorId = safeText(data?.cursorId, 80);
		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				account_points: true,
				withdraw_pending_balance: true,
				available_reward: true,
				withdraw_quota_balance: true,
				recharge_total_yuan: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				silver_member: true,
				silver_member_end_at: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				redeem_code_claimed: true,
				exchange_code_claimed: true,
				estimated_free_quota: true,
				recharge_package_quota: true
			})
			.orderBy('_id', 'asc')
			.limit(chunkSize)
			.get();
		const rows = res.data || [];
		const now = nowTs();
		let scanned = 0;
		let eligible = 0;
		let patched = 0;
		const samples = [];
		for (const row of rows) {
			scanned += 1;
			if (isH5RechargeMemberForWithdraw(row)) continue;
			if (!hasH5SilverMemberIdentity(row)) continue;
			eligible += 1;
			const prevQuota = Math.max(0, Number(rawWithdrawQuotaBalance(row) || 0));
			const nextQuota = Math.max(prevQuota, giftYuan);
			const prevPending = Math.max(0, Number(normalizePendingBalance(row) || 0));
			const nextPending = Math.max(prevPending, giftYuan);
			if (nextQuota <= prevQuota + 1e-6 && nextPending <= prevPending + 1e-6) {
				continue;
			}
			if (!dryRun) {
				await merchantCollection.doc(row._id).update({
					available_reward: Number(nextQuota.toFixed(4)),
					withdraw_quota_balance: Number(nextQuota.toFixed(4)),
					account_points: Number(nextPending.toFixed(4)),
					withdraw_pending_balance: Number(nextPending.toFixed(4)),
					update_time: now
				});
			}
			patched += 1;
			if (samples.length < 10) {
				samples.push({
					_id: row._id,
					user_id: row.user_id || '',
					prevQuota,
					nextQuota,
					prevPending,
					nextPending
				});
			}
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run 完成（未写库）' : 'ok',
			data: {
				dryRun,
				giftYuan,
				chunkSize,
				scanned,
				eligible,
				patched,
				done,
				nextCursor: done ? '' : nextCursor,
				samples
			}
		};
	} catch (e) {
		console.error('adminSilverMemberGiftBackfill failed', e);
		return { code: 500, message: safeText(e?.message || '批量回补失败', 180) };
	}
}

/**
 * 撤销「白银礼包」里对剩余额度的写入：只清零 available_reward / withdraw_quota_balance，不改待提现。
 * 命中条件：白银 + 非充值档，且两额度字段均≈giftYuan（默认 1900，来自当时礼包脚本）。
 */
async function adminSilverMemberGiftRevert(data = {}) {
	try {
		const dryRun = !!data?.dryRun;
		const giftYuan = Number(
			data?.giftYuan != null && data?.giftYuan !== '' ? data.giftYuan : 1900
		);
		if (!Number.isFinite(giftYuan) || giftYuan <= 0) {
			return { code: 400, message: 'giftYuan 须为大于 0 的数字' };
		}
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 200), 20), 500);
		const cursorId = safeText(data?.cursorId, 80);
		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				account_points: true,
				withdraw_pending_balance: true,
				available_reward: true,
				withdraw_quota_balance: true,
				recharge_total_yuan: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				silver_member: true,
				silver_member_end_at: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				redeem_code_claimed: true,
				exchange_code_claimed: true,
				estimated_free_quota: true,
				recharge_package_quota: true
			})
			.orderBy('_id', 'asc')
			.limit(chunkSize)
			.get();
		const rows = res.data || [];
		const now = nowTs();
		let scanned = 0;
		let eligible = 0;
		let patched = 0;
		const samples = [];
		const matches = (v) => Math.abs(Number(v || 0) - giftYuan) < 0.02;
		for (const row of rows) {
			scanned += 1;
			if (isH5RechargeMemberForWithdraw(row)) continue;
			if (!hasH5SilverMemberIdentity(row)) continue;
			eligible += 1;
			if (!matches(row.available_reward) || !matches(row.withdraw_quota_balance)) {
				continue;
			}
			if (!dryRun) {
				await merchantCollection.doc(row._id).update({
					available_reward: 0,
					withdraw_quota_balance: 0,
					update_time: now
				});
			}
			patched += 1;
			if (samples.length < 10) {
				samples.push({ _id: row._id, user_id: row.user_id || '', giftYuan });
			}
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run 完成（未写库）' : 'ok',
			data: {
				dryRun,
				giftYuan,
				chunkSize,
				scanned,
				eligible,
				patched,
				done,
				nextCursor: done ? '' : nextCursor,
				samples
			}
		};
	} catch (e) {
		console.error('adminSilverMemberGiftRevert failed', e);
		return { code: 500, message: safeText(e?.message || '礼包回滚失败', 180) };
	}
}

/**
 * 管理员直接改写「待提现」积分（与 H5 账号积分 / 列表待提现同口径）。
 * 只写 account_points + withdraw_pending_balance，不改冻结金额、剩余额度、已提现。
 */
async function adminMerchantRecoverPendingBalance(data = {}, event = {}) {
	try {
		const key = data?.userId || data?.user_id || data?.merchantId || data?.merchantUserId;
		const merchant = await getMerchantByIdOrUserId(key);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const raw = data?.pendingYuan != null && data?.pendingYuan !== '' ? data.pendingYuan : data?.pendingWithdraw;
		const pendingYuan = typeof raw === 'string' ? Number(String(raw).trim().replace(/[￥,\s]/g, '')) : Number(raw);
		if (!Number.isFinite(pendingYuan) || pendingYuan < 0) {
			return { code: 400, message: '待提现积分须为大于等于 0 的数字' };
		}
		const v = Number(pendingYuan.toFixed(4));
		const before = Number(Number(rawPendingBalance(merchant) || 0).toFixed(4));
		const reason = safeText(data?.reason || data?.remark || '管理员修改待提现积分', 200);
		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			account_points: v,
			withdraw_pending_balance: v,
			update_time: now
		});
		try {
			await operationLogCollection.add({
				user_id: merchant.user_id || merchant._id,
				user_name: merchant.wx_nickname || merchant.mobile || '商户',
				action: 'admin_set_pending_balance',
				module: 'merchant',
				target_id: merchant._id,
				target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
				content: `${reason}：${before} -> ${v}`,
				operator_source: 'admin',
				operator: getOperator(event),
				before_pending_balance: before,
				after_pending_balance: v,
				ip: event?.context?.CLIENTIP || '',
				create_time: now
			});
		} catch (e) {
			console.error('adminMerchantRecoverPendingBalance op log', e);
		}
		await invalidateH5MerchantCaches(merchant);
		return {
			code: 0,
			message: '保存成功',
			data: {
				userId: merchant.user_id || '',
				merchantId: merchant._id,
				beforePendingYuan: before,
				pendingYuan: v
			}
		};
	} catch (e) {
		console.error('adminMerchantRecoverPendingBalance failed', e);
		return { code: 500, message: safeText(e?.message || '修改待提现失败', 180) };
	}
}

async function listMerchantQuotaRechargeLogs(merchant) {
	const merchantUserId = String(merchant?.user_id || merchant?._id || '');
	if (!merchantUserId) return [];
	const logRes = await operationLogCollection
		.where({
			user_id: merchantUserId,
			action: 'h5_quota_recharge',
			is_deleted: db.command.neq(true)
		})
		.field({
			platform_no: true,
			package_price: true,
			package_title: true,
			refunded: true,
			create_time: true
		})
		.orderBy('create_time', 'asc')
		.limit(100)
		.get();
	return (logRes.data || []).map((row) => ({
		logId: row._id,
		platformNo: safeText(row.platform_no, 80),
		packagePrice: Number(Number(row.package_price || 0).toFixed(2)),
		packageTitle: safeText(row.package_title, 80),
		refunded: !!row.refunded,
		createTime: formatTime(row.create_time)
	}));
}

function sumActiveQuotaRechargeLogs(logRows) {
	const seenTradeNo = new Set();
	let total = 0;
	(logRows || []).forEach((row, idx) => {
		if (row.refunded) return;
		const tradeNo = safeText(row.platformNo || '', 80) || `idx_${idx}`;
		if (seenTradeNo.has(tradeNo)) return;
		seenTradeNo.add(tradeNo);
		total += Number(row.packagePrice || 0);
	});
	return Number(total.toFixed(2));
}

/**
 * 管理端手动修正商户 recharge_amount / recharge_total_yuan（uniCloud 控制台云函数调试专用）。
 * 默认 dryRun 仅预览；传 apply:true 才真正写库。
 * 可选 markRefundedLogIds：将指定 h5_quota_recharge 日志标记 refunded，避免 ensureMerchantRechargeAmountAccurate 按日志回写覆盖。
 */
async function adminSetMerchantRechargeAmount(data = {}, event = {}) {
	try {
		const key =
			data?.merchantId ||
			data?.id ||
			data?.merchantUserId ||
			data?.userId ||
			data?.user_id ||
			data?.deviceNo ||
			data?.deviceId ||
			data?.device_id ||
			data?.wxOpenid ||
			data?.wx_openid ||
			data?.mobile;
		if (!key) {
			return {
				code: 400,
				message: '请传入 merchantId / userId / deviceNo / wxOpenid 之一（mobile 可选）'
			};
		}
		const applyExplicit =
			data?.apply === true ||
			data?.apply === 1 ||
			String(data?.apply || '').toLowerCase() === 'true';
		const dryRun = !applyExplicit && data?.dryRun !== false && data?.dryRun !== 0;
		const rawYuan = data?.rechargeYuan != null && data?.rechargeYuan !== '' ? data.rechargeYuan : data?.rechargeAmount;
		const rechargeYuan = typeof rawYuan === 'string' ? Number(String(rawYuan).trim()) : Number(rawYuan);
		if (!Number.isFinite(rechargeYuan) || rechargeYuan < 0) {
			return { code: 400, message: 'rechargeYuan 须为大于等于 0 的数字' };
		}
		const targetYuan = Number(rechargeYuan.toFixed(2));
		const markRefundedLogIds = [...new Set((Array.isArray(data?.markRefundedLogIds) ? data.markRefundedLogIds : []).map((x) => safeText(x, 80)).filter(Boolean))];
		const reason = safeText(data?.reason || data?.remark || '管理员手动修正充值金额', 200);
		let merchant = await getMerchantByIdOrUserId(key);
		if (!merchant) {
			const openid = safeText(data?.wxOpenid || data?.wx_openid, 120);
			if (openid) {
				const openRes = await merchantCollection.where({ wx_openid: openid }).limit(1).get();
				merchant = (openRes.data || [])[0] || null;
			}
		}
		if (!merchant) return { code: 404, message: '商户不存在，请核对 merchantId / userId / deviceNo / wxOpenid' };
		const beforeAmount = Number(
			Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0).toFixed(2)
		);
		const rechargeLogs = await listMerchantQuotaRechargeLogs(merchant);
		const trackedByLogs = sumActiveQuotaRechargeLogs(
			rechargeLogs.map((x) => ({
				platformNo: x.platformNo,
				packagePrice: x.packagePrice,
				refunded: markRefundedLogIds.includes(x.logId) ? true : x.refunded
			}))
		);
		const preview = {
			merchantId: merchant._id,
			userId: merchant.user_id || '',
			deviceNo: merchant.device_id || '',
			mobile: merchant.mobile || '',
			wxNickname: merchant.wx_nickname || '',
			wxOpenid: merchant.wx_openid || '',
			beforeAmount,
			targetAmount: targetYuan,
			trackedByLogsAfterMark: trackedByLogs,
			willBeOverwrittenLater: Math.abs(trackedByLogs - targetYuan) >= 0.0001 && trackedByLogs > 0,
			rechargeLogs,
			markRefundedLogIds
		};
		if (dryRun) {
			return {
				code: 0,
				message: 'dryRun 预览（未写库）。确认无误后传 apply:true 执行。',
				data: preview
			};
		}
		const now = nowTs();
		if (markRefundedLogIds.length) {
			await operationLogCollection.where({ _id: db.command.in(markRefundedLogIds) }).update({
				refunded: true,
				refund_time: now
			});
		}
		await merchantCollection.doc(merchant._id).update({
			recharge_amount: targetYuan,
			recharge_total_yuan: targetYuan,
			recharge_update_time: now,
			update_time: now
		});
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || '商户',
			action: 'admin_set_recharge_amount',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `${reason}：${beforeAmount} -> ${targetYuan}`,
			operator_source: 'admin',
			operator: getOperator(event),
			before_recharge_amount: beforeAmount,
			after_recharge_amount: targetYuan,
			mark_refunded_log_ids: markRefundedLogIds,
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});
		return {
			code: 0,
			message: 'ok',
			data: {
				...preview,
				applied: true
			}
		};
	} catch (e) {
		console.error('adminSetMerchantRechargeAmount failed', e);
		return { code: 500, message: safeText(e?.message || '修正充值金额失败', 180) };
	}
}

/**
 * 按 hsy-income-packets 中「已领取」记录金额合计，将商户待提现相关字段写回（与 H5 领取成功时写库口径一致：pending_withdraw / account_points / withdraw_pending_balance）。
 * 不修改机具 frozen、商户 frozen_amount、available_reward 等其它字段。默认 dryRun 仅预览；白银会员可 requireSilver 校验。
 * 注意：若该商户在领取后曾提现/兑换扣过待提现，则「已领金额之和」可能高于真实应有余额，请结合业务再点应用。
 */
async function adminRestorePendingFromClaimedPackets(data = {}, event = {}) {
	try {
		const key = data?.userId || data?.user_id || data?.merchantId || data?.merchantUserId;
		if (!key) return { code: 400, message: '请传入 userId / merchantUserId' };
		const applyExplicit =
			data?.apply === true ||
			data?.apply === 1 ||
			String(data?.apply || '').toLowerCase() === 'true';
		const dryRun =
			!applyExplicit && data?.dryRun !== false && data?.dryRun !== 0;
		const requireSilver = data?.requireSilver !== false && data?.requireSilver !== 0;
		const merchant = await getMerchantByIdOrUserId(key);
		if (!merchant) return { code: 404, message: '商户不存在' };
		if (requireSilver && !hasH5SilverMemberIdentity(merchant)) {
			return { code: 400, message: '非白银会员身份（可传 requireSilver:false 跳过校验）' };
		}
		const uid = String(merchant.user_id || merchant._id || '');
		if (!uid) return { code: 400, message: '商户缺少 user_id' };

		const _ = db.command;
		const $ = db.command.aggregate;
		const packetWhere = _.and([
			{ merchant_user_id: uid },
			{ status: 'claimed' },
			_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])
		]);

		let claimedCount = 0;
		try {
			const c = await incomePacketCollection.where(packetWhere).count();
			claimedCount = Number(c.total || 0);
		} catch (e) {
			console.error('adminRestorePendingFromClaimedPackets count', e);
		}

		let sumClaimed = 0;
		try {
			const agg = await incomePacketCollection
				.aggregate()
				.match(packetWhere)
				.group({
					_id: null,
					total: $.sum('$amount')
				})
				.end();
			const row = agg.data && agg.data[0];
			sumClaimed = Number(row && row.total) || 0;
		} catch (e) {
			console.error('adminRestorePendingFromClaimedPackets aggregate', e);
			return { code: 500, message: '统计已领取红包失败' };
		}

		sumClaimed = Number(sumClaimed.toFixed(4));
		const curPw = Number(merchant.pending_withdraw || 0);
		const curRaw = Number(rawPendingBalance(merchant) || 0);
		const curAp = Number(merchant.account_points || 0);
		const curWpb = Number(merchant.withdraw_pending_balance != null ? merchant.withdraw_pending_balance : curAp);

		const payload = {
			merchantUserId: uid,
			merchantDocId: merchant._id,
			requireSilver,
			claimedPacketCount: claimedCount,
			sumClaimedYuan: sumClaimed,
			current: {
				pending_withdraw: curPw,
				account_points: curAp,
				withdraw_pending_balance: merchant.withdraw_pending_balance != null ? curWpb : null,
				rawPendingBalance: curRaw
			},
			proposed: {
				pending_withdraw: sumClaimed,
				account_points: sumClaimed,
				withdraw_pending_balance: sumClaimed
			},
			dryRun,
			note:
				'仅写入 pending_withdraw、account_points、withdraw_pending_balance；不改机具/冻结/剩余额度。若曾提现或兑换，合计可能偏大，请先 dryRun 核对。'
		};

		if (dryRun) {
			return {
				code: 0,
				message: 'dry-run（未写库）。确认后请传 dryRun:false 或 apply:true',
				data: {
					...payload,
					applied: false
				}
			};
		}

		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			pending_withdraw: sumClaimed,
			account_points: sumClaimed,
			withdraw_pending_balance: sumClaimed,
			update_time: now
		});
		try {
			await operationLogCollection.add({
				user_id: merchant.user_id || merchant._id,
				user_name: merchant.wx_nickname || merchant.mobile || '商户',
				action: 'admin_restore_pending_from_claimed',
				module: 'merchant',
				target_id: merchant._id,
				target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
				content: safeText(
					`按已领取积分红包恢复待提现 sum=${sumClaimed} count=${claimedCount} ` +
						`before pending_withdraw=${curPw} raw=${curRaw}`,
					500
				),
				operator_source: 'admin',
				operator: getOperator(event),
				ip: event?.context?.CLIENTIP || '',
				create_time: now
			});
		} catch (e) {
			console.error('adminRestorePendingFromClaimedPackets op log', e);
		}

		return {
			code: 0,
			message: '已按已领取记录写回待提现相关字段',
			data: {
				...payload,
				applied: true
			}
		};
	} catch (e) {
		console.error('adminRestorePendingFromClaimedPackets failed', e);
		return { code: 500, message: safeText(e?.message || '恢复失败', 180) };
	}
}

/**
 * 汇总指定自然月内、与 subsidy「流水首期补贴」一致口径的首期返现积分（每笔：release_amount 若存在否则全额 0.38%）。
 * 交易筛选与 H5 白银当月流水一致：绑定时间之后、stats_eligible、风控通过。
 */
async function sumFirstReleasePointsForMerchantMonth(merchant, flowMonth) {
	const uid = String(merchant.user_id || merchant._id || '');
	if (!uid) return 0;
	const { start, end } = subsidyEngine.monthStartEndTs(flowMonth);
	if (!start || !end) return NaN;
	let bindTs = Number(merchant.bind_time || 0);
	const boundMachines = await listBoundMachinesByMerchant(merchant);
	for (const mach of boundMachines) {
		if (mach && mach.bind_time) bindTs = Math.max(bindTs, Number(mach.bind_time || 0));
	}
	const rangeStart = Math.max(start, bindTs || 0);
	if (rangeStart > end) return 0;
	const _ = db.command;
	const where = _.and([
		{ user_id: uid },
		{ trade_type: _.in(['real', 'virtual']) },
		{ stats_eligible: _.neq(false) },
		{ amount: _.gt(0) },
		{ is_deleted: _.neq(true) },
		_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }]),
		{ create_time: _.gte(rangeStart).and(_.lte(end)) }
	]);
	let sum = 0;
	await subsidyEngine.forEachQueryPage(
		db,
		'hsy-machine-trades',
		where,
		{ field: { amount: true, release_amount: true } },
		(rows) => {
			for (const t of rows) {
				const amount = Number(t.amount || 0);
				if (!(amount > 0)) continue;
				const total = Number((amount * 0.0038).toFixed(4));
				const firstRelease = Number(t.release_amount != null ? t.release_amount : total);
				if (!(firstRelease > 0)) continue;
				sum += Number(Number(firstRelease).toFixed(4));
			}
		}
	);
	return Number(sum.toFixed(4));
}

/**
 * 白银（非充值档）指定自然月刷卡：按首期返现积分补差计入待提现（account_points / withdraw_pending_balance 同步）。
 * 分期待返、冻结金额口径不改写——不更新 merchant.frozen_amount、机具 frozen_amount，不调用 recalcAndPersistFrozenAmountForMerchantById。
 * 快照字段 admin_silver_first_release_applied[flowMonth] 存当月首期合计 S；差额 delta=S-上次快照，可重复跑直至无新流水。
 */
async function adminSilverFlowMonthFirstReleaseCreditPending(data = {}, event = {}) {
	try {
		const flowMonth = safeText(data?.flowMonth || data?.yearMonth, 10);
		if (!/^\d{4}-\d{2}$/.test(flowMonth)) {
			return { code: 400, message: 'flowMonth 须为 YYYY-MM，例如 2026-05' };
		}
		const dryRun = !!data?.dryRun;
		const allowNegativeDelta = !!data?.allowNegativeDelta;
		const singleKey = safeText(data?.userId || data?.user_id || data?.merchantUserId || '', 80);
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 120), 20), 400);
		const cursorId = safeText(data?.cursorId, 80);
		const now = nowTs();

		const processOne = async (mrow) => {
			const row = mrow;
			if (isH5RechargeMemberForWithdraw(row)) {
				return { status: 'skip', reason: 'recharge_member', userId: row.user_id || '' };
			}
			if (!hasH5SilverMemberIdentity(row)) {
				return { status: 'skip', reason: 'not_silver', userId: row.user_id || '' };
			}
			const S = await sumFirstReleasePointsForMerchantMonth(row, flowMonth);
			if (Number.isNaN(S)) {
				return { status: 'skip', reason: 'bad_month', userId: row.user_id || '' };
			}
			const credObj = row.admin_silver_first_release_applied && typeof row.admin_silver_first_release_applied === 'object'
				? { ...row.admin_silver_first_release_applied }
				: {};
			const prevApplied = Number(credObj[flowMonth] || 0);
			let delta = Number((S - prevApplied).toFixed(4));
			if (!allowNegativeDelta && delta <= 1e-6) {
				return {
					status: 'skip',
					reason: delta < -1e-6 ? 'would_need_negative_delta' : 'no_change',
					userId: row.user_id || '',
					S,
					prevApplied,
					delta
				};
			}
			if (allowNegativeDelta && Math.abs(delta) <= 1e-6) {
				return { status: 'skip', reason: 'no_change', userId: row.user_id || '', S, prevApplied, delta };
			}
			const curRaw = Number(rawPendingBalance(row) || 0);
			const nextRaw = Math.max(0, Number((curRaw + delta).toFixed(4)));
			if (!dryRun) {
				credObj[flowMonth] = S;
				await merchantCollection.doc(row._id).update({
					account_points: nextRaw,
					withdraw_pending_balance: nextRaw,
					admin_silver_first_release_applied: credObj,
					update_time: now
				});
				await operationLogCollection.add({
					user_id: row.user_id || row._id,
					user_name: row.wx_nickname || row.mobile || '商户',
					action: 'silver_flow_month_credit_pending',
					module: 'merchant',
					target_id: row._id,
					target_name: row.wx_nickname || row.mobile || row._id,
					content: `${flowMonth} 首期返现补待提现 ${dryRun ? '[dry-run]' : ''} delta=${delta} S=${S} prevSnap=${prevApplied} -> pending ${curRaw}→${nextRaw}（未改冻结）`,
					operator_source: 'admin',
					operator: getOperator(event),
					ip: event?.context?.CLIENTIP || '',
					create_time: now
				});
			}
			return {
				status: 'ok',
				userId: row.user_id || '',
				S,
				prevApplied,
				delta,
				pendingBefore: curRaw,
				pendingAfter: nextRaw
			};
		};

		if (singleKey) {
			const merchant = await getMerchantByIdOrUserId(singleKey);
			if (!merchant) return { code: 404, message: '商户不存在' };
			const one = await processOne(merchant);
			return {
				code: 0,
				message: 'ok',
				data: {
					flowMonth,
					dryRun,
					frozenAmountUnchanged: true,
					single: true,
					result: one
				}
			};
		}

		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection.where(where).orderBy('_id', 'asc').limit(chunkSize).get();
		const rows = res.data || [];
		const results = [];
		let applied = 0;
		let skipped = 0;
		for (const row of rows) {
			const r = await processOne(row);
			results.push(r);
			if (r.status === 'ok') applied += 1;
			else skipped += 1;
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run（未写库）' : 'ok',
			data: {
				flowMonth,
				dryRun,
				frozenAmountUnchanged: true,
				note: '仅更新待提现双字段与 admin_silver_first_release_applied；未修改 frozen_amount。',
				chunkSize,
				scanned: rows.length,
				applied,
				skipped,
				done,
				nextCursor: done ? '' : nextCursor,
				results: results.slice(0, 25)
			}
		};
	} catch (e) {
		console.error('adminSilverFlowMonthFirstReleaseCreditPending failed', e);
		return { code: 500, message: safeText(e?.message || '首期返现补待提现失败', 180) };
	}
}

/** 历史白银会员（含已过期）：非充值档，用于额度补写筛选 */
function isHistoricalSilverMemberRowForQuotaBackfill(row) {
	if (!row || isH5RechargeMemberForWithdraw(row)) return false;
	if (row.exchange_code_claimed === true || row.redeem_code_claimed === true) return true;
	if (row.silver_member === true) return true;
	const tag = String(row.member_tier || row.membership_tier || row.h5_member_tier || '').toLowerCase();
	if (tag === 'silver' || tag === 'white_silver' || tag === 'silver_member') return true;
	const name = String(row.membership_name || '').trim();
	if (
		name.includes('白银') &&
		Number(row.recharge_total_yuan || 0) <= 0 &&
		Number(row.recharge_cycle_start || 0) <= 0
	) {
		return true;
	}
	return false;
}

/** 白银额度核算：仍占用额度的提现单（未退回、未拒绝）按状态分档 */
function classifySilverWithdrawAmountBucket(row) {
	const audit = safeText(row?.audit_status, 24);
	const arrival = safeText(row?.arrival_status, 24);
	const isPaid = !!row?.is_paid;
	if (audit === 'pending') return 'auditing';
	if (arrival === 'received' || isPaid) return 'paid';
	return 'unpaid';
}

function emptySilverWithdrawQuotaBreakdown() {
	return { total: 0, paid: 0, unpaid: 0, auditing: 0 };
}

function normalizeSilverWithdrawQuotaBreakdown(raw) {
	const paid = Math.max(0, Number(raw?.paid || 0));
	const unpaid = Math.max(0, Number(raw?.unpaid || 0));
	const auditing = Math.max(0, Number(raw?.auditing || 0));
	const total = Math.max(0, Number((paid + unpaid + auditing).toFixed(2)));
	return { total, paid, unpaid, auditing };
}

/**
 * 批量统计白银商户仍占用的提现积分：已打款 + 未打款 + 审核中（互斥分档，合计为 total）。
 * 排除 arrival_status=returned/expired、audit_status=rejected（已退回/已失效额度）。
 */
async function batchSumSilverWithdrawQuotaBreakdown(merchantUserIds) {
	const map = new Map();
	const ids = [...new Set((merchantUserIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
	if (!ids.length) return map;
	const _ = db.command;
	try {
		const res = await withdrawCollection
			.where({
				merchant_user_id: _.in(ids),
				is_deleted: _.neq(true),
				arrival_status: _.nin(['returned', 'expired']),
				audit_status: _.neq('rejected')
			})
			.field({
				merchant_user_id: true,
				amount: true,
				audit_status: true,
				arrival_status: true,
				is_paid: true
			})
			.limit(10000)
			.get();
		for (const row of res.data || []) {
			const uid = String(row.merchant_user_id || '');
			const amt = Number(row.amount || 0);
			if (!uid || !(amt > 0)) continue;
			const bucket = classifySilverWithdrawAmountBucket(row);
			if (!map.has(uid)) map.set(uid, emptySilverWithdrawQuotaBreakdown());
			const o = map.get(uid);
			o[bucket] = Number((o[bucket] + amt).toFixed(2));
			o.total = Number((o.total + amt).toFixed(2));
		}
	} catch (e) {
		console.error('batchSumSilverWithdrawQuotaBreakdown failed', e);
	}
	return map;
}

/** @deprecated 使用 batchSumSilverWithdrawQuotaBreakdown；仅返回 total */
async function batchSumWithdrawPointsConsumed(merchantUserIds) {
	const breakdownMap = await batchSumSilverWithdrawQuotaBreakdown(merchantUserIds);
	const map = new Map();
	for (const [uid, br] of breakdownMap.entries()) {
		map.set(uid, Number(br.total || 0));
	}
	return map;
}

function formatSilverQuotaRecalcFormula(grantYuan, breakdown) {
	const br = normalizeSilverWithdrawQuotaBreakdown(breakdown);
	const next = calcSilverQuotaRemainByWithdrawn(grantYuan, br.total);
	return `${grantYuan} - ${br.paid}(已打款) - ${br.unpaid}(未打款) - ${br.auditing}(审核中) = ${next}`;
}

/**
 * 历史白银会员「剩余额度」为 0 的补写：仅写入 grantYuan（默认 1000），不动已有非 0 额度（含手动修正、部分剩余）。
 * 已提现累计达到 grantYuan 的视为额度用尽，默认跳过。
 * @param {boolean} data.dryRun true 时只预览不写库（建议先跑）
 * @param {string} data.cursorId 上一批 nextCursor，首次留空
 * @param {number} data.chunkSize 每批 20–500，默认 200
 * @param {number} data.grantYuan 补写额度，默认 1000
 * @param {boolean} data.skipExhaustedCheck 为 true 时不校验提现累计是否已用尽
 */
async function adminSilverMembersQuotaZeroBackfill(data = {}, event = {}) {
	try {
		const dryRun = data?.dryRun !== false && data?.dryRun !== 0 && data?.apply !== true;
		const grantYuan = Number(
			data?.grantYuan != null && data?.grantYuan !== '' ? data.grantYuan : H5_SILVER_EXCHANGE_HIDDEN_QUOTA_YUAN
		);
		if (!Number.isFinite(grantYuan) || grantYuan <= 0) {
			return { code: 400, message: 'grantYuan 须为正数' };
		}
		const skipExhaustedCheck = !!data?.skipExhaustedCheck;
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 200), 20), 500);
		const cursorId = safeText(data?.cursorId, 80);
		const now = nowTs();
		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				available_reward: true,
				withdraw_quota_balance: true,
				recharge_total_yuan: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				recharge_cycle_start: true,
				silver_member: true,
				silver_member_end_at: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				redeem_code_claimed: true,
				exchange_code_claimed: true,
				estimated_free_quota: true,
				recharge_package_quota: true
			})
			.orderBy('_id', 'asc')
			.limit(chunkSize)
			.get();
		const rows = res.data || [];
		const silverRows = [];
		for (const row of rows) {
			if (!isHistoricalSilverMemberRowForQuotaBackfill(row)) continue;
			const prevQuota = Math.max(0, Number(rawWithdrawQuotaBalance(row) || 0));
			if (prevQuota > 1e-6) continue;
			silverRows.push(row);
		}
		const withdrawConsumedMap = await batchSumSilverWithdrawQuotaBreakdown(
			silverRows.map((row) => String(row.user_id || row._id || ''))
		);
		let scanned = rows.length;
		let eligible = 0;
		let patched = 0;
		let skippedHasQuota = 0;
		let skippedNotSilver = 0;
		let skippedRecharge = 0;
		let skippedExhausted = 0;
		const samples = [];
		const skippedSamples = [];
		for (const row of rows) {
			if (isH5RechargeMemberForWithdraw(row)) {
				skippedRecharge += 1;
				continue;
			}
			if (!isHistoricalSilverMemberRowForQuotaBackfill(row)) {
				skippedNotSilver += 1;
				continue;
			}
			eligible += 1;
			const prevQuota = Math.max(0, Number(rawWithdrawQuotaBalance(row) || 0));
			if (prevQuota > 1e-6) {
				skippedHasQuota += 1;
				if (skippedSamples.length < 8) {
					skippedSamples.push({
						_id: row._id,
						user_id: row.user_id || '',
						reason: 'already_has_quota',
						prevQuota
					});
				}
				continue;
			}
			const merchantUserId = String(row.user_id || row._id || '');
			const br = normalizeSilverWithdrawQuotaBreakdown(withdrawConsumedMap.get(merchantUserId));
			const consumed = br.total;
			if (!skipExhaustedCheck && consumed >= grantYuan - 1e-6) {
				skippedExhausted += 1;
				if (skippedSamples.length < 8) {
					skippedSamples.push({
						_id: row._id,
						user_id: merchantUserId,
						reason: 'quota_exhausted_by_withdraw',
						consumedPoints: consumed,
						withdrawBreakdown: br
					});
				}
				continue;
			}
			if (!dryRun) {
				await merchantCollection.doc(row._id).update({
					available_reward: Number(grantYuan.toFixed(4)),
					withdraw_quota_balance: Number(grantYuan.toFixed(4)),
					update_time: now
				});
				await operationLogCollection.add({
					user_id: row.user_id || row._id,
					user_name: row.wx_nickname || row.mobile || '商户',
					action: 'silver_quota_zero_backfill',
					module: 'merchant',
					target_id: row._id,
					target_name: row.wx_nickname || row.mobile || row._id,
					content: `历史白银会员剩余额度补写 ${prevQuota}→${grantYuan}（占用合计${consumed}=已打款${br.paid}+未打款${br.unpaid}+审核中${br.auditing}）`,
					operator_source: 'admin',
					operator: getOperator(event),
					ip: event?.context?.CLIENTIP || '',
					create_time: now
				});
			}
			patched += 1;
			if (samples.length < 12) {
				samples.push({
					_id: row._id,
					user_id: merchantUserId,
					prevQuota,
					nextQuota: grantYuan,
					consumedPoints: consumed,
					withdrawBreakdown: br,
					formula: formatSilverQuotaRecalcFormula(grantYuan, br)
				});
			}
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run 完成（未写库）。确认后传 apply:true 执行写库。' : 'ok',
			data: {
				dryRun,
				grantYuan,
				chunkSize,
				scanned,
				eligible,
				patched,
				skippedHasQuota,
				skippedExhausted,
				skippedRecharge,
				skippedNotSilver,
				done,
				nextCursor: done ? '' : nextCursor,
				samples,
				skippedSamples
			}
		};
	} catch (e) {
		console.error('adminSilverMembersQuotaZeroBackfill failed', e);
		return { code: 500, message: safeText(e?.message || '白银剩余额度补写失败', 180) };
	}
}

/** 白银可提现剩余 = max(0, grantYuan - 已提现积分累计) */
function calcSilverQuotaRemainByWithdrawn(grantYuan, consumedPoints) {
	const grant = Math.max(0, Number(grantYuan || 0));
	const consumed = Math.max(0, Number(consumedPoints || 0));
	return Math.max(0, Number((grant - consumed).toFixed(2)));
}

/**
 * 历史白银会员按「1000 - 已打款 - 未打款 - 审核中」重算剩余额度（默认仅处理当前剩余额度 > 0）。
 * nextQuota = max(0, grantYuan - 占用合计)；占用含已到账、未打款处理中、待审核单（未退回）。
 * @param {boolean} data.dryRun 默认 true 预览；传 apply:true 写库
 * @param {boolean} data.onlyNonZero 默认 true，仅处理剩余额度 > 0（与 zeroBackfill 互补）
 * @param {number} data.grantYuan 授予总额，默认 1000
 */
async function adminSilverMembersQuotaRecalcByWithdrawn(data = {}, event = {}) {
	try {
		const dryRun = data?.dryRun !== false && data?.dryRun !== 0 && data?.apply !== true;
		const grantYuan = Number(
			data?.grantYuan != null && data?.grantYuan !== '' ? data.grantYuan : H5_SILVER_EXCHANGE_HIDDEN_QUOTA_YUAN
		);
		if (!Number.isFinite(grantYuan) || grantYuan <= 0) {
			return { code: 400, message: 'grantYuan 须为正数' };
		}
		const onlyNonZero = data?.onlyNonZero !== false && data?.onlyNonZero !== 0;
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 200), 20), 500);
		const cursorId = safeText(data?.cursorId, 80);
		const now = nowTs();
		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				available_reward: true,
				withdraw_quota_balance: true,
				recharge_total_yuan: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				recharge_cycle_start: true,
				silver_member: true,
				silver_member_end_at: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				redeem_code_claimed: true,
				exchange_code_claimed: true,
				estimated_free_quota: true,
				recharge_package_quota: true
			})
			.orderBy('_id', 'asc')
			.limit(chunkSize)
			.get();
		const rows = res.data || [];
		const silverRows = rows.filter((row) => isHistoricalSilverMemberRowForQuotaBackfill(row));
		const withdrawConsumedMap = await batchSumSilverWithdrawQuotaBreakdown(
			silverRows.map((row) => String(row.user_id || row._id || ''))
		);
		let scanned = rows.length;
		let eligible = 0;
		let patched = 0;
		let skippedUnchanged = 0;
		let skippedZeroQuota = 0;
		let skippedNotSilver = 0;
		let skippedRecharge = 0;
		const samples = [];
		const skippedSamples = [];
		for (const row of rows) {
			if (isH5RechargeMemberForWithdraw(row)) {
				skippedRecharge += 1;
				continue;
			}
			if (!isHistoricalSilverMemberRowForQuotaBackfill(row)) {
				skippedNotSilver += 1;
				continue;
			}
			eligible += 1;
			const prevQuota = Math.max(0, Number(rawWithdrawQuotaBalance(row) || 0));
			if (onlyNonZero && prevQuota <= 1e-6) {
				skippedZeroQuota += 1;
				continue;
			}
			const merchantUserId = String(row.user_id || row._id || '');
			const br = normalizeSilverWithdrawQuotaBreakdown(withdrawConsumedMap.get(merchantUserId));
			const consumed = br.total;
			const nextQuota = calcSilverQuotaRemainByWithdrawn(grantYuan, consumed);
			if (Math.abs(prevQuota - nextQuota) <= 1e-6) {
				skippedUnchanged += 1;
				if (skippedSamples.length < 8) {
					skippedSamples.push({
						_id: row._id,
						user_id: merchantUserId,
						reason: 'unchanged',
						prevQuota,
						nextQuota,
						consumedPoints: consumed,
						withdrawBreakdown: br
					});
				}
				continue;
			}
			if (!dryRun) {
				await merchantCollection.doc(row._id).update({
					available_reward: Number(nextQuota.toFixed(4)),
					withdraw_quota_balance: Number(nextQuota.toFixed(4)),
					update_time: now
				});
				await operationLogCollection.add({
					user_id: row.user_id || row._id,
					user_name: row.wx_nickname || row.mobile || '商户',
					action: 'silver_quota_recalc_by_withdrawn',
					module: 'merchant',
					target_id: row._id,
					target_name: row.wx_nickname || row.mobile || row._id,
					content: `白银剩余额度重算 ${prevQuota}→${nextQuota}（${grantYuan}-已打款${br.paid}-未打款${br.unpaid}-审核中${br.auditing}）`,
					operator_source: 'admin',
					operator: getOperator(event),
					ip: event?.context?.CLIENTIP || '',
					create_time: now
				});
			}
			patched += 1;
			if (samples.length < 12) {
				samples.push({
					_id: row._id,
					user_id: merchantUserId,
					prevQuota,
					nextQuota,
					consumedPoints: consumed,
					withdrawBreakdown: br,
					formula: formatSilverQuotaRecalcFormula(grantYuan, br)
				});
			}
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run 完成（未写库）。确认后传 apply:true 执行写库。' : 'ok',
			data: {
				dryRun,
				grantYuan,
				onlyNonZero,
				formula: 'max(0, grantYuan - paid - unpaid - auditing)',
				chunkSize,
				scanned,
				eligible,
				patched,
				skippedUnchanged,
				skippedZeroQuota,
				skippedRecharge,
				skippedNotSilver,
				done,
				nextCursor: done ? '' : nextCursor,
				samples,
				skippedSamples
			}
		};
	} catch (e) {
		console.error('adminSilverMembersQuotaRecalcByWithdrawn failed', e);
		return { code: 500, message: safeText(e?.message || '白银剩余额度重算失败', 180) };
	}
}

/**
 * 已兑换白银会员（exchange_code_claimed 或 redeem_code_claimed）且为白银身份、非充值档：
 * 将剩余额度 available_reward / withdraw_quota_balance 提升至至少 floorYuan（默认 1000），只升不降。
 */
async function adminSilverExchangeMerchantsQuotaFloor(data = {}, event = {}) {
	try {
		const dryRun = !!data?.dryRun;
		const floorYuan = Number(data?.floorYuan != null && data?.floorYuan !== '' ? data.floorYuan : 1000);
		if (!Number.isFinite(floorYuan) || floorYuan <= 0) {
			return { code: 400, message: 'floorYuan 须为正数' };
		}
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 200), 20), 500);
		const cursorId = safeText(data?.cursorId, 80);
		const now = nowTs();
		const _ = db.command;
		const where = cursorId ? { _id: _.gt(cursorId) } : { _id: _.neq('') };
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				available_reward: true,
				withdraw_quota_balance: true,
				recharge_total_yuan: true,
				recharge_package_id: true,
				recharge_package_price: true,
				recharge_package_reward: true,
				silver_member: true,
				silver_member_end_at: true,
				membership_name: true,
				member_tier: true,
				membership_tier: true,
				h5_member_tier: true,
				redeem_code_claimed: true,
				exchange_code_claimed: true,
				estimated_free_quota: true,
				recharge_package_quota: true
			})
			.orderBy('_id', 'asc')
			.limit(chunkSize)
			.get();
		const rows = res.data || [];
		let scanned = 0;
		let eligible = 0;
		let patched = 0;
		const samples = [];
		for (const row of rows) {
			scanned += 1;
			if (isH5RechargeMemberForWithdraw(row)) continue;
			if (!hasH5SilverMemberIdentity(row)) continue;
			if (!row.exchange_code_claimed && !row.redeem_code_claimed) continue;
			eligible += 1;
			const prevQuota = Math.max(0, Number(rawWithdrawQuotaBalance(row) || 0));
			const nextQuota = Math.max(prevQuota, floorYuan);
			if (nextQuota <= prevQuota + 1e-6) continue;
			if (!dryRun) {
				await merchantCollection.doc(row._id).update({
					available_reward: Number(nextQuota.toFixed(4)),
					withdraw_quota_balance: Number(nextQuota.toFixed(4)),
					update_time: now
				});
				await operationLogCollection.add({
					user_id: row.user_id || row._id,
					user_name: row.wx_nickname || row.mobile || '商户',
					action: 'silver_exchange_quota_floor',
					module: 'merchant',
					target_id: row._id,
					target_name: row.wx_nickname || row.mobile || row._id,
					content: `已兑换白银会员剩余额度下限 ${floorYuan}，${prevQuota}→${nextQuota}`,
					operator_source: 'admin',
					operator: getOperator(event),
					ip: event?.context?.CLIENTIP || '',
					create_time: now
				});
			}
			patched += 1;
			if (samples.length < 12) {
				samples.push({
					_id: row._id,
					user_id: row.user_id || '',
					prevQuota,
					nextQuota
				});
			}
		}
		const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = rows.length < chunkSize;
		return {
			code: 0,
			message: dryRun ? 'dry-run 完成（未写库）' : 'ok',
			data: {
				dryRun,
				floorYuan,
				chunkSize,
				scanned,
				eligible,
				patched,
				done,
				nextCursor: done ? '' : nextCursor,
				samples
			}
		};
	} catch (e) {
		console.error('adminSilverExchangeMerchantsQuotaFloor failed', e);
		return { code: 500, message: safeText(e?.message || '白银兑换额度配置失败', 180) };
	}
}

/**
 * 用「最后领取积分时间」回填 login_time（未领取过的商户不改）。
 * 控制台分批：dryRun 预览 → apply 写库，用 nextCursor 续跑。
 */
async function adminLoginTimeBackfillFromLastClaim(data = {}, event = {}) {
	try {
		const dryRun = data.apply !== true && data.dryRun !== false;
		const apply = data.apply === true;
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 100), 10), 300);
		const cursorId = safeText(data?.cursorId || data?.cursor || '', 80);
		const onlyUid = safeText(data?.merchantUserId || data?.userId || '', 80);
		const now = nowTs();
		const _ = db.command;

		let rows = [];
		if (onlyUid) {
			const m = await getMerchantByIdOrUserId(onlyUid);
			if (!m) return { code: 404, message: '商户不存在' };
			rows = [m];
		} else {
			const where = cursorId ? { _id: _.gt(cursorId) } : {};
			const res = await merchantCollection
				.where(where)
				.field({
					_id: true,
					user_id: true,
					wx_nickname: true,
					mobile: true,
					login_time: true,
					create_time: true
				})
				.orderBy('_id', 'asc')
				.limit(chunkSize)
				.get();
			rows = res.data || [];
		}

		let scanned = 0;
		let updated = 0;
		let skippedNoClaim = 0;
		let skippedSame = 0;
		const samples = [];

		for (const row of rows) {
			scanned += 1;
			const uid = String(row.user_id || row._id || '').trim();
			if (!uid) {
				skippedNoClaim += 1;
				continue;
			}
			const uidOr = [uid];
			const docId = String(row._id || '');
			if (docId && docId !== uid) uidOr.push(docId);

			let lastClaimTs = 0;
			try {
				const pr = await incomePacketCollection
					.where(
						_.and([
							{ merchant_user_id: uidOr.length === 1 ? uidOr[0] : _.in(uidOr) },
							{ is_deleted: _.neq(true) },
							{ status: 'claimed' }
						])
					)
					.field({ claimed_time: true, update_time: true })
					.orderBy('claimed_time', 'desc')
					.limit(1)
					.get();
				const pkt = (pr.data || [])[0];
				if (pkt) {
					lastClaimTs = Number(pkt.claimed_time || pkt.update_time || 0) || 0;
				}
				// claimed_time 可能为空/未建索引排到前面：再按 update_time 兜底取一条
				if (!(lastClaimTs > 0)) {
					const pr2 = await incomePacketCollection
						.where(
							_.and([
								{ merchant_user_id: uidOr.length === 1 ? uidOr[0] : _.in(uidOr) },
								{ is_deleted: _.neq(true) },
								{ status: 'claimed' }
							])
						)
						.field({ claimed_time: true, update_time: true })
						.orderBy('update_time', 'desc')
						.limit(5)
						.get();
					for (const p of pr2.data || []) {
						const ts = Number(p.claimed_time || p.update_time || 0) || 0;
						if (ts > lastClaimTs) lastClaimTs = ts;
					}
				}
			} catch (e) {
				console.error('adminLoginTimeBackfillFromLastClaim packet query', uid, e);
				continue;
			}

			if (!(lastClaimTs > 0)) {
				skippedNoClaim += 1;
				continue;
			}

			const prevLogin = Number(row.login_time) || 0;
			if (prevLogin === lastClaimTs) {
				skippedSame += 1;
				continue;
			}

			if (apply && !dryRun) {
				await merchantCollection.doc(row._id).update({
					login_time: lastClaimTs,
					update_time: now
				});
			}

			updated += 1;
			if (samples.length < 15) {
				samples.push({
					_id: row._id,
					user_id: uid,
					nickname: row.wx_nickname || '',
					prevLoginTime: prevLogin,
					prevLoginText: prevLogin ? formatTime(prevLogin) : '',
					lastClaimTime: lastClaimTs,
					lastClaimText: formatTime(lastClaimTs)
				});
			}
		}

		const nextCursor = onlyUid ? '' : rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = onlyUid ? true : rows.length < chunkSize;
		return {
			code: 0,
			message: apply && !dryRun ? 'ok' : 'dry-run 完成（未写库）',
			data: {
				dryRun: !(apply && !dryRun),
				apply: !!(apply && !dryRun),
				chunkSize,
				scanned,
				updated,
				skippedNoClaim,
				skippedSame,
				done,
				nextCursor: done ? '' : nextCursor,
				samples,
				operator: typeof getOperator === 'function' ? getOperator(event) : ''
			}
		};
	} catch (e) {
		console.error('adminLoginTimeBackfillFromLastClaim failed', e);
		return { code: 500, message: safeText(e?.message || '回填 login_time 失败', 180) };
	}
}

/**
 * 存量：把 hsy-merchant-users.agreement_img 内嵌 base64 迁到云存储，库内只留 cloud://fileID。
 * 控制台分批：dryRun 预览 → apply 写库，用 nextCursor 续跑。建议 chunkSize≤10（单文档可达数 MB）。
 */
async function adminAgreementImgMigrateToCloud(data = {}, event = {}) {
	try {
		const dryRun = data.apply !== true && data.dryRun !== false;
		const apply = data.apply === true;
		const chunkSize = Math.min(Math.max(Number(data?.chunkSize || 8), 1), 30);
		const cursorId = safeText(data?.cursorId || data?.cursor || '', 80);
		const onlyUid = safeText(data?.merchantUserId || data?.userId || data?.merchantId || '', 80);
		const now = nowTs();
		const _ = db.command;

		let rows = [];
		if (onlyUid) {
			const m = await getMerchantByIdOrUserId(onlyUid, { includeAgreementImg: true });
			if (!m) return { code: 404, message: '商户不存在' };
			rows = [m];
		} else {
			const parts = [{ agreement_img: new RegExp('^data:image/', 'i') }];
			if (cursorId) parts.push({ _id: _.gt(cursorId) });
			const where = parts.length === 1 ? parts[0] : _.and(parts);
			const res = await merchantCollection
				.where(where)
				.field({
					_id: true,
					user_id: true,
					wx_nickname: true,
					mobile: true,
					agreement_img: true
				})
				.orderBy('_id', 'asc')
				.limit(chunkSize)
				.get();
			rows = res.data || [];
		}

		let scanned = 0;
		let updated = 0;
		let skippedOk = 0;
		let skippedEmpty = 0;
		let failed = 0;
		const samples = [];
		const errors = [];

		for (const row of rows) {
			scanned += 1;
			const img = String(row.agreement_img || '').trim();
			if (!img) {
				skippedEmpty += 1;
				continue;
			}
			if (isAgreementImgCloudFileId(img) || isAgreementImgHttpUrl(img)) {
				skippedOk += 1;
				continue;
			}
			if (!isAgreementImgInlineData(img)) {
				skippedOk += 1;
				continue;
			}

			const prevBytes = Buffer.byteLength(img, 'utf8');
			if (!(apply && !dryRun)) {
				updated += 1;
				if (samples.length < 12) {
					samples.push({
						_id: row._id,
						user_id: row.user_id || '',
						nickname: row.wx_nickname || '',
						prevBytes,
						newRef: '(dry-run)',
						uploaded: false
					});
				}
				continue;
			}

			const persisted = await persistAgreementImageRef(row._id, img);
			if (!persisted.ok) {
				failed += 1;
				if (errors.length < 10) {
					errors.push({
						_id: row._id,
						user_id: row.user_id || '',
						message: persisted.message || 'upload failed'
					});
				}
				continue;
			}

			await merchantCollection.doc(row._id).update({
				agreement_img: persisted.ref,
				update_time: now
			});

			updated += 1;
			if (samples.length < 12) {
				samples.push({
					_id: row._id,
					user_id: row.user_id || '',
					nickname: row.wx_nickname || '',
					prevBytes,
					newRef: persisted.ref,
					uploaded: !!persisted.uploaded
				});
			}
		}

		const nextCursor = onlyUid ? '' : rows.length ? String(rows[rows.length - 1]._id || '') : '';
		const done = onlyUid ? true : rows.length < chunkSize;
		return {
			code: 0,
			message: apply && !dryRun ? 'ok' : 'dry-run 完成（未写库）',
			data: {
				dryRun: !(apply && !dryRun),
				apply: !!(apply && !dryRun),
				chunkSize,
				scanned,
				updated,
				skippedOk,
				skippedEmpty,
				failed,
				done,
				nextCursor: done ? '' : nextCursor,
				samples,
				errors,
				operator: typeof getOperator === 'function' ? getOperator(event) : ''
			}
		};
	} catch (e) {
		console.error('adminAgreementImgMigrateToCloud failed', e);
		return { code: 500, message: safeText(e?.message || '协议图迁移失败', 180) };
	}
}

async function feedbackFindOpenTicket(merchantId) {
	const r = await feedbackTicketCollection
		.where({ merchant_id: merchantId, status: 'open', is_deleted: false })
		.limit(1)
		.get();
	return r.data && r.data[0] ? r.data[0] : null;
}

function feedbackPreviewFromPayload(text, images, video) {
	const t = safeText(text || '', 2000).trim();
	if (t) return t.slice(0, 80);
	if (images && images.length) return `[图片×${images.length}]`;
	if (video) return '[视频]';
	return '反馈';
}

async function feedbackMapMessageRow(row) {
	const images = (row.images || []).filter(Boolean);
	const imgResolved = [];
	if (images.length) {
		const cloudIds = [];
		for (const idRaw of images) {
			const id = String(idRaw || '').trim();
			if (!id) continue;
			if (id.startsWith('http://') || id.startsWith('https://')) {
				imgResolved.push({ fileID: '', url: id });
			} else {
				cloudIds.push(id);
			}
		}
		try {
			const r = cloudIds.length ? await uniCloud.getTempFileURL({ fileList: cloudIds }) : { fileList: [] };
			const list = r.fileList || [];
			for (let i = 0; i < cloudIds.length; i++) {
				const id = cloudIds[i];
				const f = list.find((x) => x.fileID === id) || list[i];
				imgResolved.push({
					fileID: id,
					url: (f && (f.tempFileURL || f.url)) || ''
				});
			}
		} catch (e) {
			console.error('feedbackMapMessageRow images', e);
			cloudIds.forEach((id) => imgResolved.push({ fileID: id, url: '' }));
		}
	}
	let videoUrl = '';
	if (row.video) {
		try {
			const vr = await uniCloud.getTempFileURL({ fileList: [row.video] });
			const vf = vr.fileList && vr.fileList[0];
			videoUrl = (vf && (vf.tempFileURL || vf.url)) || '';
		} catch (e) {
			console.error('feedbackMapMessageRow video', e);
		}
	}
	return {
		id: row._id,
		role: row.role,
		content: row.content || '',
		refundEntryPath: safeText(row.refund_entry_path || '', 500),
		refundEntryUrl: safeText(row.refund_entry_url || '', 1000),
		refundEntryExpireTime: Number(row.refund_entry_expire_time || 0),
		images: imgResolved,
		videoUrl,
		videoFileID: row.video || '',
		// admin_name 仅存库追溯；对 H5/管理端接口统一展示「客服」
		adminName: row.role === 'admin' ? '客服' : '',
		createTime: row.create_time,
		createTimeText: formatTime(row.create_time)
	};
}

async function feedbackLoadMessagesMapped(feedbackId) {
	const r = await feedbackMessageCollection
		.where({ feedback_id: feedbackId, is_deleted: false })
		.orderBy('create_time', 'asc')
		.get();
	const rows = r.data || [];
	const out = [];
	for (const row of rows) {
		out.push(await feedbackMapMessageRow(row));
	}
	return out;
}

async function h5FeedbackSummary(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const ticket = await feedbackFindOpenTicket(merchant._id);
		if (!ticket) return { code: 0, data: { hasOpen: false, unreadReply: false } };
		return {
			code: 0,
			data: { hasOpen: true, unreadReply: !!ticket.user_unread_reply }
		};
	} catch (e) {
		console.error('h5FeedbackSummary failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function h5FeedbackGetOpen(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const ticket = await feedbackFindOpenTicket(merchant._id);
		if (!ticket) {
			return { code: 0, data: { ticket: null, messages: [] } };
		}
		const messages = await feedbackLoadMessagesMapped(ticket._id);
		await feedbackTicketCollection.doc(ticket._id).update({
			user_unread_reply: false,
			update_time: nowTs()
		});
		return {
			code: 0,
			data: {
				ticket: {
					id: ticket._id,
					status: ticket.status,
					previewText: ticket.preview_text || '',
					lastMessageAt: ticket.last_message_at
				},
				messages
			}
		};
	} catch (e) {
		console.error('h5FeedbackGetOpen failed', e);
		return { code: 500, message: '加载失败' };
	}
}

async function h5FeedbackSend(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const text = safeText(data?.text || '', 2000);
		const images = Array.isArray(data?.images)
			? data.images.map((x) => safeText(x, 2000)).filter(Boolean).slice(0, 9)
			: [];
		const video = safeText(data?.video || '', 2000);
		if (!text.trim() && !images.length && !video) {
			return { code: 400, message: '请输入内容或上传图片/视频' };
		}
		if (images.length && video) {
			return { code: 400, message: '每条消息仅支持图片或视频之一' };
		}
		let ticket = await feedbackFindOpenTicket(merchant._id);
		const now = nowTs();
		const preview = feedbackPreviewFromPayload(text, images, video);
		if (!ticket) {
			const addT = await feedbackTicketCollection.add({
				merchant_id: merchant._id,
				merchant_user_id: String(merchant.user_id || merchant._id),
				status: 'open',
				admin_unread: true,
				user_unread_reply: false,
				preview_text: preview.slice(0, 80),
				last_message_at: now,
				create_time: now,
				update_time: now,
				is_deleted: false
			});
			ticket = { _id: addT.id };
		}
		await feedbackMessageCollection.add({
			feedback_id: ticket._id,
			role: 'user',
			content: text,
			images,
			video: video || '',
			admin_name: '',
			create_time: now,
			is_deleted: false
		});
		await feedbackTicketCollection.doc(ticket._id).update({
			admin_unread: true,
			preview_text: preview.slice(0, 80),
			last_message_at: now,
			update_time: now
		});
		const merchantName = maybeMerchantDisplayName(merchant);
		await sendWecomRobotText(`收到商户 ${merchantName} 的售后反馈，请及时在「反馈管理」处理！`);
		const messages = await feedbackLoadMessagesMapped(ticket._id);
		return {
			code: 0,
			message: 'ok',
			data: {
				ticket: {
					id: ticket._id,
					status: 'open',
					previewText: preview.slice(0, 80),
					lastMessageAt: now
				},
				messages
			}
		};
	} catch (e) {
		console.error('h5FeedbackSend failed', e);
		return { code: 500, message: '发送失败' };
	}
}

async function h5FeedbackClose(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const ticket = await feedbackFindOpenTicket(merchant._id);
		if (!ticket) return { code: 400, message: '当前没有进行中的反馈' };
		const now = nowTs();
		await feedbackTicketCollection.doc(ticket._id).update({
			status: 'closed',
			update_time: now
		});
		return { code: 0, message: '已结束反馈' };
	} catch (e) {
		console.error('h5FeedbackClose failed', e);
		return { code: 500, message: '操作失败' };
	}
}

/** 后台客服反馈：不在此校验 uni-id；由 uni-admin 登录 + 菜单/路由权限控制谁能打开页面 */
async function feedbackAdminList(data) {
	try {
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 10)));
		const keyword = safeText(data?.keyword || '', 60);
		const where = { is_deleted: false };
		if (keyword) {
			where.preview_text = new RegExp(escapeReg(keyword), 'i');
		}
		const totalRes = await feedbackTicketCollection.where(where).count();
		const listRes = await feedbackTicketCollection
			.where(where)
			.orderBy('last_message_at', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const rows = listRes.data || [];
		const list = [];
		for (const t of rows) {
			let merchantRow = null;
			try {
				const m = await merchantCollection.doc(t.merchant_id).get();
				merchantRow = m.data && m.data[0] ? m.data[0] : null;
			} catch (e) {
				merchantRow = null;
			}
			list.push({
				id: t._id,
				status: t.status,
				previewText: t.preview_text || '',
				adminUnread: !!t.admin_unread,
				userUnreadReply: !!t.user_unread_reply,
				lastMessageAt: formatTime(t.last_message_at),
				createTime: formatTime(t.create_time),
				merchantWx: merchantRow ? merchantRow.wx_nickname || '-' : '-',
				merchantMobile: merchantRow ? merchantRow.mobile || '-' : '-',
				merchantId: t.merchant_id || ''
			});
		}
		return {
			code: 0,
			data: { list, total: totalRes.total || 0, page, pageSize }
		};
	} catch (e) {
		console.error('feedbackAdminList failed', e);
		return { code: 500, message: '获取列表失败' };
	}
}

async function feedbackAdminMessages(data) {
	try {
		const fid = safeText(data?.feedbackId, 80);
		if (!fid) return { code: 400, message: '缺少工单ID' };
		const t = await feedbackTicketCollection.doc(fid).get();
		const ticket = t.data && t.data[0];
		if (!ticket || ticket.is_deleted) return { code: 404, message: '工单不存在' };
		const merchantRes = await merchantCollection.doc(safeText(ticket.merchant_id, 80)).get();
		const merchant = merchantRes.data && merchantRes.data[0];
		const rechargePackages = await loadRechargePackagesFromQuota();
		const membership = merchant ? h5MembershipInfo(merchant, rechargePackages) : { tier: 'normal', name: '普通会员' };
		const biz = await getBizSettings();
		const rta = biz?.refundTransferAudit || {};
		const needRefundAudit = membership.tier !== 'normal' ? !!rta.memberRequired : !!rta.nonMemberRequired;
		const messages = await feedbackLoadMessagesMapped(fid);
		await feedbackTicketCollection.doc(fid).update({ admin_unread: false, update_time: nowTs() });
		return {
			code: 0,
			data: {
				ticket: {
					id: ticket._id,
					status: ticket.status,
					previewText: ticket.preview_text || '',
					merchantId: ticket.merchant_id
				},
				merchant: merchant
					? {
							id: merchant._id,
							name: safeText(merchant.wx_nickname || merchant.mobile || merchant.user_id || merchant._id, 80),
							avatar: safeText(merchant.wx_avatar || '', 500),
							membershipTier: membership.tier || 'normal',
							membershipName: membership.name || '普通会员',
							isMember: membership.tier !== 'normal',
							rechargeAmount: Number(
								Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0).toFixed(2)
							),
							canSendRefundEntry: !!needRefundAudit
					  }
					: null,
				messages
			}
		};
	} catch (e) {
		console.error('feedbackAdminMessages failed', e);
		return { code: 500, message: '加载失败' };
	}
}

async function feedbackAdminReply(data, event, context) {
	try {
		const fid = safeText(data?.feedbackId, 80);
		const text = safeText(data?.text || '', 2000);
		const rawImages = Array.isArray(data?.images) ? data.images : [];
		const images = rawImages.map((x) => safeText(x, 2000)).filter(Boolean).slice(0, 9);
		const video = safeText(data?.video || '', 2000);
		if (!fid) return { code: 400, message: '缺少工单ID' };
		if (!text.trim() && !images.length && !video) return { code: 400, message: '请输入回复内容或上传图片/视频' };
		const t = await feedbackTicketCollection.doc(fid).get();
		const ticket = t.data && t.data[0];
		if (!ticket || ticket.is_deleted) return { code: 404, message: '工单不存在' };
		if (ticket.status !== 'open') return { code: 400, message: '工单已结束' };
		const now = nowTs();
		const operator = await getAdminDisplayName(event, context, data);
		const preview = feedbackPreviewFromPayload(text, images, video);
		await feedbackMessageCollection.add({
			feedback_id: fid,
			role: 'admin',
			content: text,
			images,
			video,
			admin_name: operator,
			create_time: now,
			is_deleted: false
		});
		await feedbackTicketCollection.doc(fid).update({
			user_unread_reply: true,
			admin_unread: false,
			preview_text: preview,
			last_message_at: now,
			update_time: now
		});
		const messages = await feedbackLoadMessagesMapped(fid);
		return { code: 0, message: 'ok', data: { messages } };
	} catch (e) {
		console.error('feedbackAdminReply failed', e);
		return { code: 500, message: '回复失败' };
	}
}

async function feedbackAdminSendRefundEntry(data, event, context) {
	try {
		const fid = safeText(data?.feedbackId, 80);
		if (!fid) return { code: 400, message: '缺少工单ID' };
		const t = await feedbackTicketCollection.doc(fid).get();
		const ticket = t.data && t.data[0];
		if (!ticket || ticket.is_deleted) return { code: 404, message: '工单不存在' };
		if (ticket.status !== 'open') return { code: 400, message: '工单已结束' };
		const merchantId = safeText(ticket.merchant_id, 80);
		if (!merchantId) return { code: 400, message: '工单缺少商户信息' };
		const mRes = await merchantCollection.doc(merchantId).get();
		const merchant = mRes.data && mRes.data[0];
		if (!merchant) return { code: 404, message: '商户不存在' };
		const rechargePackages = await loadRechargePackagesFromQuota();
		const membership = h5MembershipInfo(merchant, rechargePackages);
		const biz = await getBizSettings();
		const rta = biz?.refundTransferAudit || {};
		const needRefundAudit = membership.tier !== 'normal' ? !!rta.memberRequired : !!rta.nonMemberRequired;
		if (!needRefundAudit) {
			return { code: 400, message: '当前未开启该商户对应的退款审核，无需发送退款入口' };
		}
		const now = nowTs();
		const expireAt = now + 3 * 24 * 60 * 60 * 1000;
		const operator = await getAdminDisplayName(event, context, data);
		const token = `${randomStr(24)}${randomStr(12)}${String(now).slice(-6)}`;
		await refundEntryTokenCollection.where({
			feedback_id: fid,
			merchant_id: merchantId,
			status: 'active',
			is_deleted: false
		}).update({
			status: 'expired',
			update_time: now
		});
		await refundEntryTokenCollection.add({
			token,
			feedback_id: fid,
			merchant_id: merchantId,
			merchant_user_id: safeText(merchant.user_id || merchant._id, 80),
			status: 'active',
			create_time: now,
			update_time: now,
			expire_time: expireAt,
			create_user: operator,
			is_deleted: false
		});
		const entryPath = buildRefundEntryPath(token);
		const entryUrl = buildRefundEntryUrl(token);
		const text =
			`已为您发送退款入口：\n${entryUrl}\n` +
			`当前商户退款流程需管理员审核；该入口有效期为3天，过期后将自动失效。`;
		await feedbackMessageCollection.add({
			feedback_id: fid,
			role: 'admin',
			content: text,
			images: [],
			video: '',
			admin_name: operator,
			refund_entry_path: entryPath,
			refund_entry_url: entryUrl,
			refund_entry_expire_time: expireAt,
			create_time: now,
			is_deleted: false
		});
		await feedbackTicketCollection.doc(fid).update({
			user_unread_reply: true,
			admin_unread: false,
			preview_text: '已发送退款入口（审核模式有效）',
			last_message_at: now,
			update_time: now
		});
		const messages = await feedbackLoadMessagesMapped(fid);
		return { code: 0, message: 'ok', data: { entryUrl, entryPath, expireAt, messages } };
	} catch (e) {
		console.error('feedbackAdminSendRefundEntry failed', e);
		return { code: 500, message: '发送退款入口失败' };
	}
}

async function feedbackAdminSendProportionalRefundEntry(data, event, context) {
	try {
		const fid = safeText(data?.feedbackId, 80);
		if (!fid) return { code: 400, message: '缺少工单ID' };
		const refundPercent = parseRefundPercentInput(data?.refundPercent ?? data?.percent);
		if (!Number.isFinite(refundPercent) || refundPercent <= 0 || refundPercent > 100) {
			return { code: 400, message: '请输入 1-100 之间的退款比例' };
		}
		const t = await feedbackTicketCollection.doc(fid).get();
		const ticket = t.data && t.data[0];
		if (!ticket || ticket.is_deleted) return { code: 404, message: '工单不存在' };
		if (ticket.status !== 'open') return { code: 400, message: '工单已结束' };
		const merchantId = safeText(ticket.merchant_id, 80);
		if (!merchantId) return { code: 400, message: '工单缺少商户信息' };
		const mRes = await merchantCollection.doc(merchantId).get();
		const merchant = mRes.data && mRes.data[0];
		if (!merchant) return { code: 404, message: '商户不存在' };
		const rechargePackages = await loadRechargePackagesFromQuota();
		const membership = h5MembershipInfo(merchant, rechargePackages);
		const biz = await getBizSettings();
		const rta = biz?.refundTransferAudit || {};
		const needRefundAudit = membership.tier !== 'normal' ? !!rta.memberRequired : !!rta.nonMemberRequired;
		if (!needRefundAudit) {
			return { code: 400, message: '当前未开启该商户对应的退款审核，无需发送退款入口' };
		}
		const baseRechargeAmount = Number(
			Number(merchant.recharge_amount != null ? merchant.recharge_amount : merchant.recharge_total_yuan || 0).toFixed(2)
		);
		if (!(baseRechargeAmount > 0)) {
			return { code: 400, message: '该商户暂无可退充值金额' };
		}
		const refundYuan = Number((baseRechargeAmount * refundPercent / 100).toFixed(2));
		if (refundYuan < 0.01) {
			return { code: 400, message: '按该比例计算退款金额不足 0.01 元' };
		}
		const sliceCount = buildRefundTransferSlicesFromFen(Math.round(refundYuan * 100), getRefundTransferSliceMaxYuan()).length;
		const now = nowTs();
		const expireAt = now + 3 * 24 * 60 * 60 * 1000;
		const operator = await getAdminDisplayName(event, context, data);
		const token = `${randomStr(24)}${randomStr(12)}${String(now).slice(-6)}`;
		await refundEntryTokenCollection.where({
			feedback_id: fid,
			merchant_id: merchantId,
			status: 'active',
			is_deleted: false
		}).update({
			status: 'expired',
			update_time: now
		});
		await refundEntryTokenCollection.add({
			token,
			feedback_id: fid,
			merchant_id: merchantId,
			merchant_user_id: safeText(merchant.user_id || merchant._id, 80),
			refund_entry_type: 'proportional',
			refund_percent: refundPercent,
			bypass_refund_window: true,
			status: 'active',
			create_time: now,
			update_time: now,
			expire_time: expireAt,
			create_user: operator,
			is_deleted: false
		});
		const entryPath = buildRefundEntryPath(token);
		const entryUrl = buildRefundEntryUrl(token);
		const pctText = Number(refundPercent) === Math.floor(refundPercent) ? String(Math.floor(refundPercent)) : String(refundPercent);
		const text =
			`已为您发送按比例退款入口（${pctText}%）：\n` +
			`预计退款 ${refundYuan.toFixed(2)} 元（充值 ${baseRechargeAmount.toFixed(2)} 元），将分 ${sliceCount} 笔转账。\n` +
			`${entryUrl}\n` +
			`该入口不受充值周期/180天窗口限制，无违约金；有效期3天，过期后将自动失效。`;
		await feedbackMessageCollection.add({
			feedback_id: fid,
			role: 'admin',
			content: text,
			images: [],
			video: '',
			admin_name: operator,
			refund_entry_path: entryPath,
			refund_entry_url: entryUrl,
			refund_entry_expire_time: expireAt,
			refund_entry_type: 'proportional',
			refund_percent: refundPercent,
			create_time: now,
			is_deleted: false
		});
		await feedbackTicketCollection.doc(fid).update({
			user_unread_reply: true,
			admin_unread: false,
			preview_text: `已发送按比例退款入口（${pctText}%）`,
			last_message_at: now,
			update_time: now
		});
		const messages = await feedbackLoadMessagesMapped(fid);
		return {
			code: 0,
			message: 'ok',
			data: {
				entryUrl,
				entryPath,
				expireAt,
				refundPercent,
				baseRechargeAmount,
				refundYuan,
				sliceCount,
				messages
			}
		};
	} catch (e) {
		console.error('feedbackAdminSendProportionalRefundEntry failed', e);
		return { code: 500, message: '发送按比例退款入口失败' };
	}
}

function randomExchangeCode(len = 12) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let out = '';
	for (let i = 0; i < len; i += 1) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}

async function generateUniqueExchangeCode() {
	for (let i = 0; i < 20; i += 1) {
		const code = randomExchangeCode(12);
		const r = await exchangeCouponCollection.where({ code, is_deleted: false }).limit(1).get();
		if (!(r.data && r.data.length)) return code;
	}
	return `${randomExchangeCode(8)}${String(Date.now()).slice(-4)}`;
}

async function exchangeCouponGenerate(data, event) {
	try {
		const count = Math.min(200, Math.max(1, Number(data?.count || 1)));
		const memberDays = Math.max(1, Number(data?.memberDays || 30));
		const now = nowTs();
		const validFrom = Number(data?.validFrom || now);
		const validTo = Number(data?.validTo || (validFrom + 90 * 24 * 60 * 60 * 1000));
		if (validTo <= validFrom) return { code: 400, message: '有效期结束时间必须大于开始时间' };
		const operator = getOperator(event);
		const rows = [];
		for (let i = 0; i < count; i += 1) {
			const code = await generateUniqueExchangeCode();
			rows.push({
				code,
				generate_time: now,
				valid_from: validFrom,
				valid_to: validTo,
				member_days: memberDays,
				used: false,
				used_merchant_id: '',
				used_merchant_name: '',
				used_time: 0,
				generate_user: operator,
				is_deleted: false,
				create_time: now,
				update_time: now
			});
		}
		await exchangeCouponCollection.add(rows);
		return { code: 0, message: '生成成功', data: { count, rows } };
	} catch (e) {
		console.error('exchangeCouponGenerate failed', e);
		return { code: 500, message: '生成失败' };
	}
}

async function exchangeCouponList(data) {
	try {
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(100, Math.max(1, Number(data?.pageSize || 20)));
		const codeKeyword = safeText(data?.codeKeyword || '', 80);
		const used = safeText(data?.used || '', 20);
		const memberStart = Number(data?.memberStart || 0);
		const memberEnd = Number(data?.memberEnd || 0);
		const where = [{ is_deleted: false }];
		if (codeKeyword) where.push({ code: new RegExp(escapeReg(codeKeyword), 'i') });
		if (used === '0' || used === '1') where.push({ used: used === '1' });
		if (memberStart) where.push({ member_days: db.command.gte(memberStart) });
		if (memberEnd) where.push({ member_days: db.command.lte(memberEnd) });
		const whereExpr = where.length === 1 ? where[0] : db.command.and(where);
		const totalRes = await exchangeCouponCollection.where(whereExpr).count();
		const listRes = await exchangeCouponCollection
			.where(whereExpr)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (listRes.data || []).map((x) => ({
			id: x._id,
			code: x.code || '',
			generateTime: formatTime(x.generate_time || x.create_time),
			validFrom: formatTime(x.valid_from || 0),
			validTo: formatTime(x.valid_to || 0),
			memberDays: Number(x.member_days || 0),
			used: !!x.used,
			usedText: x.used ? '已兑换' : '否',
			usedMerchantName: safeText(x.used_merchant_name || '', 80),
			usedTime: formatTime(x.used_time || 0),
			generateUser: safeText(x.generate_user || '', 80)
		}));
		return { code: 0, message: 'ok', data: { list, total: totalRes.total || 0, page, pageSize } };
	} catch (e) {
		console.error('exchangeCouponList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function h5ExchangeCouponRedeem(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		merchant.__curAgreement = await getCurrentAgreement();
		const redeemNeedSign = requireH5AgreementSigned(merchant);
		if (redeemNeedSign) return redeemNeedSign;
		if (!canMerchantUseH5ExchangeCoupon(merchant)) {
			return { code: 400, message: '当前会员类型暂不支持兑换码' };
		}
		const code = safeText(String(data?.code || '').trim().toUpperCase(), 30);
		if (!code) return { code: 400, message: '请输入兑换码' };
		const now = nowTs();
		const r = await exchangeCouponCollection.where({ code, is_deleted: false }).limit(1).get();
		const cp = r.data && r.data[0];
		if (!cp) return { code: 404, message: '兑换码不存在' };
		if (cp.used) return { code: 400, message: '该兑换码已被使用' };
		const validFrom = Number(cp.valid_from || 0);
		const validTo = Number(cp.valid_to || 0);
		if (validFrom && now < validFrom) return { code: 400, message: '兑换码尚未生效' };
		if (validTo && now > validTo) return { code: 400, message: '兑换码已过期' };
		const memberDays = Math.max(1, Number(cp.member_days || 30));
		const isFirstSilverFromNormal = isNormalMemberForUpgradePointsClear(merchant);
		const isSilverQuotaReset = !isFirstSilverFromNormal;
		const prevQuota = normalizeWithdrawQuotaBalance(merchant);
		const nextQuota = resolveSilverExchangeQuotaOnRedeem(merchant);
		const startAt = now;
		const endAt = now + memberDays * 24 * 60 * 60 * 1000;
		if (isFirstSilverFromNormal) {
			await clearNormalMemberPointsAndFrozenOnUpgrade(merchant, {
				now,
				upgradeKind: 'exchange_code_silver',
				targetMembershipName: '白银会员',
				redeemCode: code,
				operatorSource: 'h5',
				operator: 'exchange_coupon'
			});
		}
		await exchangeCouponCollection.doc(cp._id).update({
			used: true,
			used_merchant_id: merchant._id,
			used_merchant_name: safeText(merchant.wx_nickname || merchant.mobile || merchant.user_id || merchant._id, 80),
			used_time: now,
			update_time: now
		});
		await merchantCollection.doc(merchant._id).update({
			silver_member: true,
			silver_member_start_at: startAt,
			silver_member_end_at: endAt,
			exchange_code_claimed: true,
			membership_name: '白银会员',
			available_reward: Number(nextQuota.toFixed(4)),
			withdraw_quota_balance: Number(nextQuota.toFixed(4)),
			update_time: now
		});
		const logContent = isSilverQuotaReset
			? `兑换码续兑白银会员，剩余提现额度重置为 ${nextQuota} 元（原 ${prevQuota}，非累加）`
			: `兑换码开通白银会员，授予提现额度 ${nextQuota} 元`;
		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
			action: isSilverQuotaReset ? 'exchange_code_silver_quota_reset' : 'exchange_code_silver_quota',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: logContent,
			operator_source: 'h5',
			operator: 'exchange_coupon',
			create_time: now
		});
		return {
			code: 0,
			message: isSilverQuotaReset ? '兑换成功，提现额度已重置为 1000 元' : '兑换成功',
			data: {
				memberDays,
				startAt,
				endAt,
				quotaReset: isSilverQuotaReset,
				prevQuota,
				nextQuota
			}
		};
	} catch (e) {
		console.error('h5ExchangeCouponRedeem failed', e);
		return { code: 500, message: '兑换失败' };
	}
}

async function productList(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			name = '',
			intro = '',
			isEnabled = '',
			sortOrder = '',
			updateTimeStart = '',
			updateTimeEnd = '',
			createTimeStart = '',
			createTimeEnd = ''
		} = data || {};
		const where = { is_deleted: false };
		if (name) where.name = new RegExp(escapeReg(name), 'i');
		if (intro) where.intro = new RegExp(escapeReg(intro), 'i');
		if (isEnabled !== '' && isEnabled !== undefined && isEnabled !== null) where.is_enabled = String(isEnabled) === '1';
		if (sortOrder !== '' && sortOrder !== undefined && sortOrder !== null) where.sort_order = parseSortOrder(sortOrder);
		if (updateTimeStart && updateTimeEnd) where.update_time = db.command.and([db.command.gte(Number(updateTimeStart)), db.command.lte(Number(updateTimeEnd))]);
		else if (updateTimeStart) where.update_time = db.command.gte(Number(updateTimeStart));
		else if (updateTimeEnd) where.update_time = db.command.lte(Number(updateTimeEnd));
		if (createTimeStart && createTimeEnd) where.create_time = db.command.and([db.command.gte(Number(createTimeStart)), db.command.lte(Number(createTimeEnd))]);
		else if (createTimeStart) where.create_time = db.command.gte(Number(createTimeStart));
		else if (createTimeEnd) where.create_time = db.command.lte(Number(createTimeEnd));
		const totalRes = await productCollection.where(where).count();
		const listRes = await productCollection
			.where(where)
			.orderBy('sort_order', 'asc')
			.orderBy('create_time', 'desc')
			.skip((Number(page) - 1) * Number(pageSize))
			.limit(Number(pageSize))
			.get();
		const list = (listRes.data || []).map((item) => ({
			id: item._id,
			name: safeText(item.name, 80),
			intro: safeText(item.intro, 500),
			images: Array.isArray(item.images) ? item.images : [],
			image: Array.isArray(item.images) && item.images.length ? item.images[0] : '',
			isEnabled: item.is_enabled !== false,
			isEnabledText: item.is_enabled === false ? '下架' : '上架',
			sortOrder: Number(item.sort_order || 0),
			createTime: formatTime(item.create_time),
			updateTime: formatTime(item.update_time)
		}));
		return { code: 0, message: 'ok', data: { list, total: totalRes.total || 0, page: Number(page), pageSize: Number(pageSize) } };
	} catch (error) {
		console.error('productList failed:', error);
		return { code: 500, message: '获取商品列表失败' };
	}
}

async function productSave(data) {
	try {
		const now = nowTs();
		const id = safeText(data?.id, 80);
		const images = Array.isArray(data?.images)
			? data.images.map((x) => safeText(x, 500)).filter(Boolean)
			: String(data?.imagesText || '')
					.split('\n')
					.map((x) => safeText(x, 500))
					.filter(Boolean);
		const payload = {
			name: safeText(data?.name, 80),
			intro: safeText(data?.intro, 500),
			images,
			is_enabled: data?.isEnabled === false ? false : String(data?.isEnabled) === '0' ? false : true,
			sort_order: parseSortOrder(data?.sortOrder, 0),
			update_time: now
		};
		if (!payload.name) return { code: 400, message: '请输入商品名称' };
		if (!payload.intro) return { code: 400, message: '请输入商品介绍' };
		if (!payload.images.length) return { code: 400, message: '请至少提供一张商品图片' };
		if (id) {
			await productCollection.doc(id).update(payload);
			await invalidateProductsListCache();
			await invalidateH5QuotaPackagesCache();
			return { code: 0, message: '更新成功' };
		}
		await productCollection.add({
			...payload,
			is_deleted: false,
			create_time: now
		});
		await invalidateProductsListCache();
		await invalidateH5QuotaPackagesCache();
		return { code: 0, message: '新增成功' };
	} catch (error) {
		console.error('productSave failed:', error);
		return { code: 500, message: '保存失败' };
	}
}

async function productDelete(data, event) {
	try {
		const ids = Array.isArray(data?.ids) ? data.ids.map((x) => safeText(x, 80)).filter(Boolean) : [];
		if (!ids.length) return { code: 400, message: '请选择要删除的记录' };
		const now = nowTs();
		const operator = getOperator(event);
		await productCollection.where({ _id: db.command.in(ids) }).update({
			is_deleted: true,
			update_time: now,
			delete_time: now,
			delete_user: operator
		});
		await invalidateProductsListCache();
		await invalidateH5QuotaPackagesCache();
		return { code: 0, message: '删除成功' };
	} catch (error) {
		console.error('productDelete failed:', error);
		return { code: 500, message: '删除失败' };
	}
}

async function couponList(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			name = '',
			description = '',
			type = '',
			amount = '',
			monthlyThreshold = '',
			validDays = '',
			updateTimeStart = '',
			updateTimeEnd = '',
			createTimeStart = '',
			createTimeEnd = ''
		} = data || {};
		const where = { is_deleted: false };
		if (name) where.name = new RegExp(escapeReg(name), 'i');
		if (description) where.description = new RegExp(escapeReg(description), 'i');
		if (type) where.type = String(type);
		if (amount !== '' && amount !== null && amount !== undefined) where.amount = Number(amount);
		if (monthlyThreshold !== '' && monthlyThreshold !== null && monthlyThreshold !== undefined) where.monthly_threshold = Number(monthlyThreshold);
		if (validDays !== '' && validDays !== null && validDays !== undefined) where.valid_days = Number(validDays);
		if (updateTimeStart && updateTimeEnd) {
			where.update_time = db.command.and([db.command.gte(Number(updateTimeStart)), db.command.lte(Number(updateTimeEnd))]);
		} else if (updateTimeStart) where.update_time = db.command.gte(Number(updateTimeStart));
		else if (updateTimeEnd) where.update_time = db.command.lte(Number(updateTimeEnd));
		if (createTimeStart && createTimeEnd) {
			where.create_time = db.command.and([db.command.gte(Number(createTimeStart)), db.command.lte(Number(createTimeEnd))]);
		} else if (createTimeStart) where.create_time = db.command.gte(Number(createTimeStart));
		else if (createTimeEnd) where.create_time = db.command.lte(Number(createTimeEnd));
		const totalRes = await couponCollection.where(where).count();
		const listRes = await couponCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip((Number(page) - 1) * Number(pageSize))
			.limit(Number(pageSize))
			.get();
		const list = (listRes.data || []).map((item) => ({
			id: item._id,
			name: item.name || '',
			description: item.description || '',
			type: item.type || 'cash',
			typeText: item.type === 'discount' ? '折扣券' : '现金券',
			amount: Number(item.amount || 0),
			monthlyThreshold: Number(item.monthly_threshold || 0),
			validDays: Number(item.valid_days || 0),
			createTime: formatTime(item.create_time),
			updateTime: formatTime(item.update_time)
		}));
		return {
			code: 0,
			message: 'ok',
			data: {
				list,
				total: totalRes.total || 0,
				page: Number(page),
				pageSize: Number(pageSize)
			}
		};
	} catch (error) {
		console.error('couponList failed:', error);
		return { code: 500, message: '获取优惠券列表失败' };
	}
}

async function couponRedemptionList(data) {
	try {
		const couponId = safeText(data?.couponId || data?.id || data?.templateId, 80);
		if (!couponId) return { code: 400, message: '缺少优惠券模板ID' };
		const page = Math.max(1, Number(data?.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(data?.pageSize) || 20));

		const tplRes = await couponCollection.doc(couponId).get();
		const tplRow = tplRes.data && tplRes.data[0];
		if (!tplRow || tplRow.is_deleted) return { code: 404, message: '优惠券模板不存在' };

		const where = { coupon_template_id: couponId, status: 'claimed' };
		const totalRes = await couponInstanceCollection.where(where).count();
		const total = Number(totalRes.total || 0);
		const instRes = await couponInstanceCollection
			.where(where)
			.orderBy('claimed_at', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const rows = instRes.data || [];
		const userIds = [...new Set(rows.map((r) => String(r.merchant_user_id || '').trim()).filter(Boolean))];
		const merchantMap = new Map();
		if (userIds.length) {
			const mRes = await merchantCollection
				.where({ user_id: db.command.in(userIds) })
				.field({ user_id: true, wx_nickname: true, mobile: true, device_id: true })
				.limit(Math.min(userIds.length, 100))
				.get();
			(mRes.data || []).forEach((m) => {
				merchantMap.set(String(m.user_id || ''), m);
			});
			const missing = userIds.filter((uid) => !merchantMap.has(uid));
			if (missing.length) {
				const m2 = await merchantCollection
					.where({ _id: db.command.in(missing.slice(0, 100)) })
					.field({ _id: true, user_id: true, wx_nickname: true, mobile: true, device_id: true })
					.get();
				(m2.data || []).forEach((m) => {
					const key = String(m.user_id || m._id || '');
					if (key) merchantMap.set(key, m);
				});
			}
		}

		const list = rows.map((row) => {
			const uid = String(row.merchant_user_id || '');
			const m = merchantMap.get(uid) || {};
			const nickname = safeText(m.wx_nickname || '', 80);
			const mobile = safeText(m.mobile || '', 30);
			return {
				instanceId: row._id,
				merchantUserId: uid,
				userDisplay: [nickname || '-', mobile || '-'].filter((x) => x && x !== '-').join('\n') || uid || '-',
				deviceId: safeText(m.device_id || '', 80) || '-',
				monthlyThresholdYuan: Number(row.monthly_threshold_yuan || tplRow.monthly_threshold || 0),
				rewardYuan: Number(row.reward_yuan || tplRow.amount || 0),
				qualifiedFlowYuan: Number(row.qualified_flow_yuan || 0),
				qualifiedAt: row.qualified_at ? formatTime(row.qualified_at) : '-',
				claimedAt: row.claimed_at ? formatTime(row.claimed_at) : '-',
				issuedAt: row.issued_at ? formatTime(row.issued_at) : '-'
			};
		});

		return {
			code: 0,
			message: 'ok',
			data: {
				coupon: {
					id: couponId,
					name: tplRow.name || '',
					monthlyThreshold: Number(tplRow.monthly_threshold || 0),
					rewardYuan: Number(tplRow.amount || 0)
				},
				list,
				total,
				page,
				pageSize
			}
		};
	} catch (error) {
		console.error('couponRedemptionList failed:', error);
		return { code: 500, message: '获取兑现情况失败' };
	}
}

async function couponSave(data) {
	try {
		const now = nowTs();
		const id = safeText(data?.id, 80);
		const payload = {
			name: safeText(data?.name, 60),
			description: safeText(data?.description, 200),
			type: safeText(data?.type || 'cash', 20) === 'discount' ? 'discount' : 'cash',
			amount: Number(data?.amount || 0),
			monthly_threshold: Number(data?.monthlyThreshold || 0),
			valid_days: Number(data?.validDays || 0),
			update_time: now
		};
		if (!payload.name) return { code: 400, message: '请输入名称' };
		if (payload.amount <= 0) return { code: 400, message: '达标积分（元）必须大于0' };
		if (payload.monthly_threshold < 0) return { code: 400, message: '月流水门槛不能小于0' };
		if (payload.valid_days < 0) return { code: 400, message: '有效天数不能小于0' };

		if (id) {
			await couponCollection.doc(id).update(payload);
			return { code: 0, message: '更新成功' };
		}
		await couponCollection.add({
			...payload,
			is_deleted: false,
			create_time: now
		});
		return { code: 0, message: '新增成功' };
	} catch (error) {
		console.error('couponSave failed:', error);
		return { code: 500, message: '保存失败' };
	}
}

async function couponDelete(data, event) {
	try {
		const ids = Array.isArray(data?.ids) ? data.ids.map((x) => safeText(x, 80)).filter(Boolean) : [];
		if (!ids.length) return { code: 400, message: '请选择要删除的记录' };
		const now = nowTs();
		const operator = getOperator(event);
		await couponCollection.where({ _id: db.command.in(ids) }).update({
			is_deleted: true,
			update_time: now,
			delete_time: now,
			delete_user: operator
		});
		return { code: 0, message: '删除成功' };
	} catch (error) {
		console.error('couponDelete failed:', error);
		return { code: 500, message: '删除失败' };
	}
}

async function quotaList(data) {
	try {
		await ensureDefaultQuotaPackages();
		const {
			page = 1,
			pageSize = 10,
			packageId = '',
			title = '',
			bonusQuota = '',
			realQuota = '',
			price = '',
			sortOrder = '',
			briefIntro = '',
			description = '',
			membershipName = '',
			pickTotal = '',
			pickRequired = '',
			updateTimeStart = '',
			updateTimeEnd = '',
			createTimeStart = '',
			createTimeEnd = ''
		} = data || {};
		const where = { is_deleted: false };
		if (packageId) where.package_id = new RegExp(escapeReg(packageId), 'i');
		if (title) where.title = new RegExp(escapeReg(title), 'i');
		if (bonusQuota) where.bonus_quota = new RegExp(escapeReg(bonusQuota), 'i');
		if (briefIntro) where.brief_intro = new RegExp(escapeReg(briefIntro), 'i');
		if (description) where.description = new RegExp(escapeReg(description), 'i');
		if (membershipName) where.membership_name = new RegExp(escapeReg(membershipName), 'i');
		if (realQuota !== '' && realQuota !== null && realQuota !== undefined) where.real_quota = Number(realQuota);
		if (price !== '' && price !== null && price !== undefined) where.price = Number(price);
		if (pickTotal !== '' && pickTotal !== null && pickTotal !== undefined) where.pick_total = Number(pickTotal);
		if (pickRequired !== '' && pickRequired !== null && pickRequired !== undefined) where.pick_required = Number(pickRequired);
		if (sortOrder !== '' && sortOrder !== null && sortOrder !== undefined) where.sort_order = parseSortOrder(sortOrder);
		if (updateTimeStart && updateTimeEnd) {
			where.update_time = db.command.and([db.command.gte(Number(updateTimeStart)), db.command.lte(Number(updateTimeEnd))]);
		} else if (updateTimeStart) where.update_time = db.command.gte(Number(updateTimeStart));
		else if (updateTimeEnd) where.update_time = db.command.lte(Number(updateTimeEnd));
		if (createTimeStart && createTimeEnd) {
			where.create_time = db.command.and([db.command.gte(Number(createTimeStart)), db.command.lte(Number(createTimeEnd))]);
		} else if (createTimeStart) where.create_time = db.command.gte(Number(createTimeStart));
		else if (createTimeEnd) where.create_time = db.command.lte(Number(createTimeEnd));
		const totalRes = await quotaCollection.where(where).count();
		const listRes = await quotaCollection
			.where(where)
			.orderBy('sort_order', 'asc')
			.orderBy('create_time', 'desc')
			.skip((Number(page) - 1) * Number(pageSize))
			.limit(Number(pageSize))
			.get();
		const list = (listRes.data || []).map((item) => ({
			id: item._id,
			packageId: item.package_id || '',
			title: item.title || '',
			bonusQuota: item.bonus_quota || '',
			realQuota: Number(item.real_quota || 0),
			price: Number(item.price || 0),
			sortOrder: parseSortOrder(item.sort_order, Number(item.price || 0)),
			description: item.description || '',
			briefIntro: item.brief_intro || '',
			membershipName: item.membership_name || '',
			relatedProductIds: Array.isArray(item.related_product_ids) ? item.related_product_ids : [],
			pickTotal: Number(item.pick_total || 0),
			pickRequired: Number(item.pick_required || 0),
			createTime: formatTime(item.create_time),
			updateTime: formatTime(item.update_time)
		}));
		return {
			code: 0,
			message: 'ok',
			data: { list, total: totalRes.total || 0, page: Number(page), pageSize: Number(pageSize) }
		};
	} catch (error) {
		console.error('quotaList failed:', error);
		return { code: 500, message: '获取额度包列表失败' };
	}
}

async function quotaSave(data) {
	try {
		const now = nowTs();
		const id = safeText(data?.id, 80);
		const price = Number(data?.price || 0);
		const packageId = `pkg_${String(price).replace('.', '_')}`;
		const title = buildQuotaPackageTitle(price);
		const bonusQuotaRaw = Number(data?.bonusQuota || 0);
		const sortOrder = parseSortOrder(data?.sortOrder, price);
		const relatedProductIds = Array.isArray(data?.relatedProductIds)
			? data.relatedProductIds.map((x) => safeText(x, 80)).filter(Boolean)
			: [];
		const pickTotal = Math.max(0, parseSortOrder(data?.pickTotal, 0));
		const pickRequired = Math.max(0, parseSortOrder(data?.pickRequired, 0));
		const payload = {
			package_id: safeText(packageId, 40),
			title: safeText(title, 80),
			bonus_quota: `¥${bonusQuotaRaw.toFixed(2)}`,
			real_quota: Number(data?.realQuota || 0),
			price,
			sort_order: sortOrder,
			related_product_ids: relatedProductIds,
			pick_total: pickTotal,
			pick_required: pickRequired,
			description: safeText(data?.description, 300),
			brief_intro: safeText(data?.briefIntro, 300),
			membership_name: safeText(data?.membershipName, 40),
			update_time: now
		};
		if (!Number.isFinite(payload.price) || payload.price <= 0) return { code: 400, message: '套餐价格需大于0' };
		if (!Number.isFinite(bonusQuotaRaw) || bonusQuotaRaw < 0) return { code: 400, message: '免额度不能小于0' };
		if (payload.real_quota < 0) return { code: 400, message: '实际额度不能小于0' };
		if (payload.price < 0) return { code: 400, message: '套餐价格不能小于0' };
		if (!payload.description) return { code: 400, message: '请输入套餐说明' };
		if (payload.pick_required > payload.pick_total) return { code: 400, message: '选中数量不能大于可选数量' };
		if (payload.pick_total > payload.related_product_ids.length) return { code: 400, message: '可选数量不能大于关联商品数量' };

		const dupWhere = { package_id: payload.package_id, is_deleted: false };
		if (id) dupWhere._id = db.command.neq(id);
		const dup = await quotaCollection.where(dupWhere).limit(1).get();
		if (dup.data && dup.data.length) return { code: 400, message: '套餐id已存在，请勿重复' };

		if (id) {
			await quotaCollection.doc(id).update(payload);
			await invalidateH5QuotaPackagesCache();
			return { code: 0, message: '更新成功' };
		}
		await quotaCollection.add({
			...payload,
			is_deleted: false,
			create_time: now
		});
		await invalidateH5QuotaPackagesCache();
		return { code: 0, message: '新增成功' };
	} catch (error) {
		console.error('quotaSave failed:', error);
		return { code: 500, message: '保存失败' };
	}
}

async function quotaDelete(data, event) {
	try {
		const ids = Array.isArray(data?.ids) ? data.ids.map((x) => safeText(x, 80)).filter(Boolean) : [];
		if (!ids.length) return { code: 400, message: '请选择要删除的记录' };
		const now = nowTs();
		const operator = getOperator(event);
		await quotaCollection.where({ _id: db.command.in(ids) }).update({
			is_deleted: true,
			update_time: now,
			delete_time: now,
			delete_user: operator
		});
		await invalidateH5QuotaPackagesCache();
		return { code: 0, message: '删除成功' };
	} catch (error) {
		console.error('quotaDelete failed:', error);
		return { code: 500, message: '删除失败' };
	}
}

async function h5UiStyleGet() {
	try {
		const biz = await getBizSettings();
		return {
			code: 0,
			message: 'ok',
			data: {
				h5UiStyle: String(biz.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A'
			}
		};
	} catch (e) {
		console.error('h5UiStyleGet failed', e);
		return { code: 0, message: 'ok', data: { h5UiStyle: 'A' } };
	}
}

function pickBizSettingDoc(rows) {
	const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
	if (!list.length) return null;
	list.sort((a, b) => Number(b.update_time || b.create_time || 0) - Number(a.update_time || a.create_time || 0));
	return list[0];
}

function resolveBizRawFromDoc(doc) {
	if (!doc) return {};
	const raw = Object.assign({}, doc.value && typeof doc.value === 'object' ? doc.value : {});
	// 独立字段优先：避免 value 对象合并/截断导致限额丢失
	if (doc.biz_period_limits && typeof doc.biz_period_limits === 'object') {
		raw.withdrawPeriodLimits = doc.biz_period_limits;
	}
	return raw;
}

async function bizConfigGet() {
	try {
		// 后台配置页必须直读数据库，避免 Redis/内存缓存导致「已保存又回弹默认值」
		let raw = {};
		let docRedisUpdatedAt = 0;
		try {
			const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(20).get();
			const doc = pickBizSettingDoc(r.data || []);
			raw = resolveBizRawFromDoc(doc);
			docRedisUpdatedAt = Number(doc && (doc.redis_updated_at || doc.update_time)) || 0;
		} catch (e) {
			console.error('bizConfigGet db read failed, fallback getBizSettings', e);
			raw = await getBizSettings();
		}
		const value = sanitizeBizSettings(raw);
		const periodOverride = await loadPeriodLimitsFromStore();
		if (periodOverride) {
			value.withdrawPeriodLimits = periodOverride;
		}
		const wxPayMch = value.wxPayMch || sanitizeWxPayMchSelection(null, resolveDefaultWxPayMchIds());
		const wxPayMchEffective = WX_PAY_MCH_OPTIONS.map((opt) => ({
			mchId: opt.mchId,
			label: opt.label,
			recharge: wxPayMch.recharge === opt.mchId,
			refund: wxPayMch.refund === opt.mchId,
			withdraw: wxPayMch.withdraw === opt.mchId
		}));
		const redisMeta = await readBizRedisMeta();
		const redisUpdatedAt = Number(redisMeta.updatedAt || docRedisUpdatedAt) || 0;
		return {
			code: 0,
			message: 'ok',
			data: {
				...value,
				cfBuild: MERCHANT_CF_BUILD,
				wxPayMch,
				wxPayMchOptions: WX_PAY_MCH_OPTIONS,
				wxPayMchDefaults: resolveDefaultWxPayMchIds(),
				wxPayMchEffective,
				redisUpdatedAt,
				redisUpdatedAtText: redisUpdatedAt ? formatTime(redisUpdatedAt) : '',
				redisAlive: !!redisMeta.redisAlive
			}
		};
	} catch (error) {
		console.error('bizConfigGet failed:', error);
		return { code: 500, message: '获取参数配置失败' };
	}
}

async function bizConfigSave(data, event) {
	try {
		const now = nowTs();
		const operator = getOperator(event);
		const exist = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(20).get();
		const rows = Array.isArray(exist.data) ? exist.data : [];
		const primary = pickBizSettingDoc(rows);
		const prev = resolveBizRawFromDoc(primary);
		const incoming = data && typeof data === 'object' ? data : {};

		const periodFromIncoming =
			incoming.withdrawPeriodLimits && typeof incoming.withdrawPeriodLimits === 'object'
				? incoming.withdrawPeriodLimits
				: prev.withdrawPeriodLimits;

		const mergedRaw = Object.assign({}, prev, incoming, {
			withdrawPeriodLimits: periodFromIncoming,
			// 显式带上扁平字段，sanitize 内会优先用它们覆盖
			periodExchangeDay: incoming.periodExchangeDay != null ? incoming.periodExchangeDay : undefined,
			periodExchangeWeek: incoming.periodExchangeWeek != null ? incoming.periodExchangeWeek : undefined,
			periodGoldDay: incoming.periodGoldDay != null ? incoming.periodGoldDay : undefined,
			periodGoldWeek: incoming.periodGoldWeek != null ? incoming.periodGoldWeek : undefined,
			periodDiamondDay: incoming.periodDiamondDay != null ? incoming.periodDiamondDay : undefined,
			periodDiamondWeek: incoming.periodDiamondWeek != null ? incoming.periodDiamondWeek : undefined,
			withdrawRange: Object.assign({}, prev.withdrawRange || {}, incoming.withdrawRange || {}),
			withdrawMinByCount: Object.assign({}, prev.withdrawMinByCount || {}, incoming.withdrawMinByCount || {}),
			optimizeConfig: Object.assign({}, prev.optimizeConfig || {}, incoming.optimizeConfig || {}),
			refundCycle: Object.assign({}, prev.refundCycle || {}, incoming.refundCycle || {}),
			withdrawAudit: Object.assign({}, prev.withdrawAudit || {}, incoming.withdrawAudit || {}),
			refundTransferAudit: Object.assign({}, prev.refundTransferAudit || {}, incoming.refundTransferAudit || {}),
			wxPayMch: Object.assign({}, prev.wxPayMch || {}, incoming.wxPayMch || {}),
			riskRates: Object.assign({}, prev.riskRates || {}, incoming.riskRates || {})
		});
		const val = sanitizeBizSettings(mergedRaw);
		// 优先写入独立表：即使旧版 system-settings 合并失败，限额也能落库
		const periodLimits = await savePeriodLimitsToStore(val.withdrawPeriodLimits, operator);
		val.withdrawPeriodLimits = periodLimits;
		const _ = db.command;
		const patch = {
			value: _.set(val),
			biz_period_limits: _.set(periodLimits),
			update_time: now,
			redis_updated_at: now,
			update_user: operator
		};

		let updated = 0;
		if (rows.length) {
			for (const row of rows) {
				try {
					const ur = await systemSettingCollection.doc(row._id).update(patch);
					updated += Number(ur && ur.updated != null ? ur.updated : 1);
				} catch (e) {
					console.error('bizConfigSave update row failed', row._id, e);
				}
			}
		} else {
			await systemSettingCollection.add({
				key: BIZ_SETTING_KEY,
				value: val,
				biz_period_limits: periodLimits,
				create_time: now,
				update_time: now,
				redis_updated_at: now,
				update_user: operator
			});
			updated = 1;
		}

		// 若 update 未生效，强制删后重建主文档
		let verifyDoc = null;
		{
			const vr = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(20).get();
			verifyDoc = pickBizSettingDoc(vr.data || []);
			const verifyRaw = resolveBizRawFromDoc(verifyDoc);
			const verifyVal = sanitizeBizSettings(verifyRaw);
			const want = Number(periodLimits.paidDiamond.weekMax);
			const got = Number(verifyVal.withdrawPeriodLimits.paidDiamond.weekMax);
			if (got !== want) {
				console.error('bizConfigSave verify mismatch, force rewrite', { want, got, updated });
				for (const row of vr.data || []) {
					try {
						await systemSettingCollection.doc(row._id).remove();
					} catch (e) {}
				}
				await systemSettingCollection.add({
					key: BIZ_SETTING_KEY,
					value: val,
					biz_period_limits: periodLimits,
					create_time: now,
					update_time: now,
					redis_updated_at: now,
					update_user: operator
				});
				const vr2 = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(1).get();
				verifyDoc = pickBizSettingDoc(vr2.data || []);
			}
		}

		const finalRaw = resolveBizRawFromDoc(verifyDoc);
		const finalVal = sanitizeBizSettings(finalRaw);
		finalVal.withdrawPeriodLimits = periodLimits;

		bizSettingsCache = finalVal;
		bizSettingsCacheAt = Date.now();
		const redisPush = await pushBizSettingsToRedis(finalVal, now, { touchMeta: true });
		try {
			h5HomeDashboardCache.clear();
		} catch (e) {}

		const debug = {
			incomingHasPeriod: !!(incoming && incoming.withdrawPeriodLimits),
			incomingDiamondWeek:
				incoming && incoming.withdrawPeriodLimits && incoming.withdrawPeriodLimits.paidDiamond
					? incoming.withdrawPeriodLimits.paidDiamond.weekMax
					: incoming.periodDiamondWeek,
			flatDiamondWeek: incoming.periodDiamondWeek,
			savedDiamondWeek: periodLimits.paidDiamond.weekMax,
			dbDiamondWeek: finalVal.withdrawPeriodLimits.paidDiamond.weekMax,
			updated,
			docId: verifyDoc && verifyDoc._id,
			redisOk: redisPush.ok
		};

		return {
			code: 0,
			message: '保存成功',
			data: {
				...finalVal,
				cfBuild: MERCHANT_CF_BUILD,
				_savedWithdrawPeriodLimits: finalVal.withdrawPeriodLimits,
				_debugPeriod: debug,
				redisUpdatedAt: now,
				redisUpdatedAtText: formatTime(now),
				redisAlive: !!redisPush.ok
			}
		};
	} catch (error) {
		console.error('bizConfigSave failed:', error);
		return { code: 500, message: '保存参数配置失败: ' + safeText(error && error.message, 120) };
	}
}

async function debugGetEgressIp() {
	const urls = ['https://api64.ipify.org?format=json', 'https://api.ipify.org?format=json', 'https://ifconfig.me/ip'];
	const results = [];
	for (const url of urls) {
		try {
			const resp = await uniCloud.httpclient.request(url, {
				method: 'GET',
				dataType: 'text',
				timeout: 1800
			});
			const raw = String(resp.data || '').trim();
			let ip = '';
			try {
				const json = JSON.parse(raw);
				ip = String(json.ip || json.ip_addr || '').trim();
			} catch (e) {
				const m = raw.match(/(\d{1,3}\.){3}\d{1,3}/);
				ip = m ? String(m[0]) : '';
			}
			results.push({ url, status: Number(resp.status || 0), ip, raw: raw.slice(0, 120) });
			if (ip) {
				return { code: 0, message: 'ok', data: { ip, probes: results } };
			}
		} catch (e) {
			results.push({ url, status: 0, ip: '', raw: safeText(e.message || 'request failed', 120) });
		}
	}
	return { code: 500, message: '未获取到出口IP，请稍后重试', data: { ip: '', probes: results } };
}

exports.main = async (event, context) => {
	const { action, data, params } = event;
	const actualData = data || params;

	switch (action) {
		case 'list':
			return await listMerchants(actualData);
		case 'updateSwitch':
			return await updateSwitch(actualData);
		case 'merchantPointsMonthlyInsight':
			return await merchantPointsMonthlyInsight(actualData);
		case 'merchantAgreementImage':
			return await merchantAgreementImage(actualData);
		case 'merchantAgreementClear':
			return await merchantAgreementClear(actualData, event);
		case 'simulateRegister':
			return await simulateRegister(actualData);
		case 'offlineFirstRechargeLookup':
			return await offlineFirstRechargeLookup(actualData);
		case 'offlineFirstRecharge':
			return await offlineFirstRecharge(actualData, event);
		case 'withdrawList':
			return await getWithdrawList(actualData);
		case 'withdrawSyncProcessing':
			return await withdrawSyncProcessing(actualData);
		case 'withdrawAutoExpireUnpaid':
			return await withdrawAutoExpireUnpaid(actualData);
		case 'withdrawDiagnose':
			return await withdrawDiagnose(actualData);
		case 'withdrawRepairExpired':
			return await withdrawRepairExpired(actualData);
		case 'withdrawRepairExpiredBatch':
			return await withdrawRepairExpiredBatch(actualData);
		case 'withdrawReconcileArrivalFromWx':
			return await withdrawReconcileArrivalFromWx(actualData);
		case 'withdrawForceMarkReceived':
			return await withdrawForceMarkReceived(actualData);
		case 'withdrawFailDetail':
			return await withdrawFailDetail(actualData);
		case 'refundTransferList':
			return await getRefundTransferList(actualData);
		case 'refundTransferSyncProcessing':
			return await refundTransferSyncProcessing(actualData);
		case 'refundTransferApprove':
			return await refundTransferApprove(actualData, event);
		case 'refundTransferForceFail':
			return await refundTransferForceFail(actualData, event);
		case 'refundTransferFixRejectedProcessing':
			return await refundTransferFixRejectedProcessing(actualData, event);
		case 'refundTransferRevokeApproveDev':
			return await refundTransferRevokeApproveDev(actualData, event);
		case 'tradeBillList':
			return await tradeBillList(actualData);
		case 'tradeBillDelete':
			return await tradeBillDelete(actualData, event);
		case 'tradeBillMarkManualRefund':
			return await tradeBillMarkManualRefund(actualData, event);
		case 'adminDashboardTrend30d':
			return await adminDashboardTrend30d(actualData);
		case 'adminHomeSummary':
			return await adminHomeSummary(actualData);
		case 'adminHomeCacheGet':
			return await adminHomeCacheGet(actualData);
		case 'adminHomeCacheRefresh':
			return await adminHomeCacheRefresh(actualData);
		case 'adminHomeBackfillBuckets':
			return await adminHomeBackfillBuckets(actualData);
		case 'adminMerchantRefundWindow':
			return await adminMerchantRefundWindow(actualData);
		case 'financeMerchantFlowList':
			return await financeMerchantFlowList(actualData);
		case 'withdrawExportCsv':
			return await exportWithdrawCsv(actualData);
		case 'withdrawApprove':
			return await withdrawApprove(actualData);
		case 'withdrawDelete':
			return await withdrawDelete(actualData, event);
		case 'merchantDataCorrect':
			return await merchantDataCorrect(actualData, event);
		case 'merchantDataCorrectStart':
			return await merchantDataCorrectStart(actualData, event);
		case 'merchantDataCorrectStatus':
			return await merchantDataCorrectStatus(actualData);
		case 'adminSyncPendingRechargeFromWx':
			return await adminSyncPendingRechargeFromWx(actualData);
		case 'adminSilverMemberGiftBackfill':
			return await adminSilverMemberGiftBackfill(actualData);
		case 'adminSilverMemberGiftRevert':
			return await adminSilverMemberGiftRevert(actualData);
		case 'adminMerchantRecoverPendingBalance':
			return await adminMerchantRecoverPendingBalance(actualData, event);
		case 'adminRepairMerchantRefundState':
			return await adminRepairMerchantRefundState(actualData, event);
		case 'adminSetMerchantRechargeAmount':
			return await adminSetMerchantRechargeAmount(actualData, event);
		case 'adminRestorePendingFromClaimedPackets':
			return await adminRestorePendingFromClaimedPackets(actualData, event);
		case 'adminSilverFlowMonthFirstReleaseCreditPending':
			return await adminSilverFlowMonthFirstReleaseCreditPending(actualData, event);
		case 'adminSilverExchangeMerchantsQuotaFloor':
			return await adminSilverExchangeMerchantsQuotaFloor(actualData, event);
		case 'adminSilverMembersQuotaZeroBackfill':
			return await adminSilverMembersQuotaZeroBackfill(actualData, event);
		case 'adminSilverMembersQuotaRecalcByWithdrawn':
			return await adminSilverMembersQuotaRecalcByWithdrawn(actualData, event);
		case 'adminLoginTimeBackfillFromLastClaim':
			return await adminLoginTimeBackfillFromLastClaim(actualData, event);
		case 'adminAgreementImgMigrateToCloud':
			return await adminAgreementImgMigrateToCloud(actualData, event);
		case 'rechargeGiftShipmentList':
			return await rechargeGiftShipmentList(actualData);
		case 'rechargeGiftShipmentUpdate':
			return await rechargeGiftShipmentUpdate(actualData, event);
		case 'h5AuthSync':
			return await h5AuthSync(actualData);
		case 'h5UiStyleGet':
			return await h5UiStyleGet();
		case 'h5WechatLogin':
			return await h5WechatLogin(actualData);
		case 'h5SendBindMobileCode':
			return await h5SendBindMobileCode(actualData);
		case 'h5BindMobileVerify':
			return await h5BindMobileVerify(actualData);
		case 'h5SetMobileDirect':
			return await h5SetMobileDirect(actualData);
		case 'h5BindMachine':
			return await h5BindMachine(actualData, event);
		case 'h5MachineBindingList':
			return await h5MachineBindingList(actualData);
		case 'h5UnbindMachine':
			return await h5UnbindMachine(actualData, event);
		case 'h5MachineBindLogList':
			return await h5MachineBindLogList(actualData);
		case 'adminMerchantMachineList':
			return await h5MachineBindingList(actualData);
		case 'adminMerchantMachineBind':
			return await h5BindMachine({ ...actualData, operatorSource: 'admin' }, event);
		case 'adminMerchantMachineUnbind':
			return await h5UnbindMachine({ ...actualData, operatorSource: 'admin' }, event);
		case 'adminMerchantMachineSetPrimary':
			return await adminMerchantMachineSetPrimary(actualData, event);
		case 'adminMerchantMachineReplace':
			return await adminMerchantMachineReplace(actualData, event);
		case 'adminMerchantMachineBindLogList':
			return await h5MachineBindLogList(actualData);
		case 'h5FinanceRecords':
			return await h5FinanceRecords(actualData);
		case 'h5MineInfo':
			return await applyH5GzipIfRequested(await h5MineInfo(actualData), actualData);
		case 'h5AgreementSignedSnapshot':
			return await h5AgreementSignedSnapshot(actualData);
		case 'h5WithdrawInfo':
			return await h5WithdrawInfo(actualData);
		case 'h5WithdrawApply':
			return await h5WithdrawApply(actualData);
		case 'h5WithdrawConfirmPackage':
			return await h5WithdrawConfirmPackage(actualData);
		case 'h5WithdrawSyncAfterConfirm':
			return await h5WithdrawSyncAfterConfirm(actualData);
		case 'h5WithdrawSyncMine':
			return await h5WithdrawSyncMine(actualData);
		case 'h5HomeDashboard':
			return await applyH5GzipIfRequested(await h5HomeDashboard(actualData), actualData);
		case 'h5SignAgreement':
			return await h5SignAgreement(actualData, event);
		case 'h5RechargeOptions':
			return await h5RechargeOptions(actualData);
		case 'h5RechargeCreate':
			return await h5RechargeCreate(actualData, event);
		case 'h5RechargeConfirm':
			return await h5RechargeConfirm(actualData);
		case 'h5WxPayNotify':
			return await h5WxPayNotify(actualData);
		case 'h5WxRefundNotify':
			return await h5WxRefundNotify(actualData);
		case 'h5WxTransferNotify':
			return await h5WxTransferNotify(actualData);
		case 'h5RefundReset':
			return await h5RefundReset(actualData, event);
		case 'h5RefundEntryValidate':
			return await h5RefundEntryValidate(actualData);
		case 'h5RefundConfirmPackage':
			return await h5RefundConfirmPackage(actualData);
		case 'h5TransferStatus':
			return await h5TransferStatus(actualData, event);
		case 'h5PendingReturnPoints':
			return await h5PendingReturnPoints(actualData);
		case 'internalTradeRefundClawback':
			return await internalTradeRefundClawback(actualData);
		case 'applyDueRefundClawbackTasks':
			return await applyDueRefundClawbackTasksAction(actualData);
		case 'h5IncomeList':
			return await h5IncomeList(actualData);
		case 'h5IncomeClaim':
			return await h5IncomeClaim(actualData);
		case 'h5IncomeClaimAll':
			return await h5IncomeClaimAll(actualData);
		case 'h5Unbind':
			return await h5Unbind(actualData, event);
		case 'couponList':
			return await couponList(actualData);
		case 'couponSave':
			return await couponSave(actualData);
		case 'couponDelete':
			return await couponDelete(actualData, event);
		case 'couponIssue':
			return await couponIssue(actualData, event);
		case 'couponRedemptionList':
			return await couponRedemptionList(actualData);
		case 'productList':
			return await productList(actualData);
		case 'productSave':
			return await productSave(actualData);
		case 'productDelete':
			return await productDelete(actualData, event);
		case 'h5CouponMyList':
			return await h5CouponMyList(actualData);
		case 'exchangeCouponGenerate':
			return await exchangeCouponGenerate(actualData, event);
		case 'exchangeCouponList':
			return await exchangeCouponList(actualData);
		case 'h5ExchangeCouponRedeem':
			return await h5ExchangeCouponRedeem(actualData);
		case 'quotaList':
			return await quotaList(actualData);
		case 'quotaSave':
			return await quotaSave(actualData);
		case 'quotaDelete':
			return await quotaDelete(actualData, event);
		case 'h5FeedbackSummary':
			return await h5FeedbackSummary(actualData);
		case 'h5FeedbackGetOpen':
			return await h5FeedbackGetOpen(actualData);
		case 'h5FeedbackSend':
			return await h5FeedbackSend(actualData);
		case 'h5FeedbackClose':
			return await h5FeedbackClose(actualData);
		case 'feedbackAdminList':
			return await feedbackAdminList(actualData);
		case 'feedbackAdminMessages':
			return await feedbackAdminMessages(actualData);
		case 'feedbackAdminReply':
			return await feedbackAdminReply(actualData, event, context);
		case 'feedbackAdminSendRefundEntry':
			return await feedbackAdminSendRefundEntry(actualData, event, context);
		case 'feedbackAdminSendProportionalRefundEntry':
			return await feedbackAdminSendProportionalRefundEntry(actualData, event, context);
		case 'bizConfigGet':
			return await bizConfigGet();
		case 'bizConfigSave':
			return await bizConfigSave(actualData, event);
		case 'recalcFrozenAmount':
			return await (async () => {
				const key = actualData?.merchantId || actualData?.merchantUserId || actualData?.userId;
				const r = await recalcAndPersistFrozenAmountForMerchantById(key);
				if (!r.ok) return { code: 404, message: '商户不存在', data: r };
				return { code: 0, message: 'ok', data: r };
			})();
		case 'debugGetEgressIp':
			return await debugGetEgressIp();
		default:
			return { code: 400, message: '无效的操作' };
	}
};

