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
const agreementCollection = db.collection('hsy-agreements');
const transferOrderCollection = db.collection('hsy-transfer-orders');
const exchangeCouponCollection = db.collection('hsy-exchange-coupons');
const transferLogCollection = db.collection('hsy-transfer-logs');
const robotPushLogCollection = db.collection('hsy-robot-push-logs');
const refundEntryTokenCollection = db.collection('hsy-refund-entry-tokens');
const adminUserCollection = db.collection('uni-id-users');
const zlib = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const subsidyEngine = require('./subsidy-engine.js');
const redisH5 = require('./redis-h5.js');
/** Redis 键：与云函数多实例共享热点，未开通 Redis 时自动跳过 */
const REDIS_KEY_QUOTA_PKGS = 'hsy:h5:quota:pkgs';
const REDIS_KEY_PRODUCTS = 'hsy:products:list';
const REDIS_KEY_BIZ = 'hsy:biz:settings';
const REDIS_KEY_AGR = 'hsy:h5:agreement:current';
const REDIS_EX_QUOTA_SEC = 90;
const REDIS_EX_PRODUCTS_SEC = 90;
const REDIS_EX_BIZ_SEC = 55;
const REDIS_EX_AGR_SEC = 40;
const REDIS_EX_WD_SUM_SEC = 28;
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

async function getAdminDisplayName(context = {}) {
	try {
		const nick = safeText(context?.userInfo?.nickname || '', 80);
		if (nick) return nick;
		const uid = safeText(context?.uid || context?.userInfo?._id || '', 80);
		if (uid) {
			const r = await adminUserCollection.doc(uid).get();
			const row = r.data && r.data[0];
			if (row) return safeText(row.nickname || row.username || '', 80) || 'system';
		}
		const uname = safeText(context?.userInfo?.username || '', 80);
		if (uname) {
			const ru = await adminUserCollection.where({ username: uname }).limit(1).get();
			const rowU = ru.data && ru.data[0];
			if (rowU) return safeText(rowU.nickname || rowU.username || '', 80) || 'system';
			return uname;
		}
		return 'system';
	} catch (e) {
		return safeText(context?.userInfo?.username || '', 80) || 'system';
	}
}

function formatTime(timestamp) {
	if (!timestamp) return '';
	try {
		// hourCycle: 'h23' 避免部分 ICU 在 hour12:false 时输出 24:xx（应用为次日 0 点~0:59 的误显）
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Shanghai',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			hourCycle: 'h23'
		}).formatToParts(new Date(Number(timestamp)));
		const pick = (type) => (parts.find((x) => x.type === type) || {}).value || '';
		return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
	} catch (e) {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
			is_deleted: false
		});
	} catch (e) {
		console.error('writeTransferLog failed', e);
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

function isWxBalanceInsufficientError(err) {
	const txt = String(
		err?.message ||
			err?.wxBody?.message ||
			err?.wxBody?.code ||
			err?.wxBody?.detail ||
			err?.wxBody?.err_code_des ||
			''
	).toLowerCase();
	if (!txt) return false;
	const keys = ['余额不足', '账户余额不足', '可用余额不足', 'insufficient', 'not enough', 'balance not enough'];
	return keys.some((k) => txt.includes(k));
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

		let query = merchantCollection;

		const where = {};
		const whereParts = [];
		if (mobile) where.mobile = new RegExp(String(mobile));
		if (deviceId) where.device_id = new RegExp(String(deviceId));
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

		whereParts.unshift(where);
		const finalWhere = whereParts.length > 1 ? db.command.and(whereParts) : where;
		query = query.where(finalWhere);

		const [countRes, res, biz] = await Promise.all([
			query.count(),
			query
				.orderBy('login_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.field({
					user_id: true,
					wx_avatar: true,
					agreement_img: true,
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
					recharge_package_quota: true,
					recharge_package_reward: true,
					estimated_free_quota: true,
					frozen_amount: true
				})
				.get(),
			getBizSettings()
		]);
		const total = countRes.total;
		const rows = res.data || [];

		// pendingWithdraw：与 H5 待提现金额/账号积分一致 = account_points（已领取未发起提现扣减的积分，1:1 元）
		const list = rows.map((item) => {
			const frozenYuan = Number(item.frozen_amount || 0);
			const totalGrantedYuan = h5WithdrawQuotaTotalYuan(item, biz.rechargeRules);
			const withdrawnYuan = Number(item.withdrawn || 0);
			const remainingQuotaYuan = totalGrantedYuan > 0
				? Math.max(0, Number((totalGrantedYuan - withdrawnYuan).toFixed(2)))
				: 0;
			const membership = resolveMerchantMembershipForAdmin(item, rechargePackages);
			return {
			id: item._id,
			userId: item.user_id || item._id,
			avatar: item.wx_avatar || '',
			agreement: item.agreement_img || '',
			deviceNo: item.device_id,
			deviceDisplay: `${item.device_id || '-'}\n${item.brand_name || '-'}`,
			wxUser: `${item.wx_nickname || '-'}\n${item.mobile || '-'}`,
			remainingQuota: toMoney(remainingQuotaYuan),
			pendingWithdraw: toMoney(item.account_points),
			withdrawn: toMoney(item.withdrawn),
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
			loginTime: formatTime(item.login_time)
			};
		});

		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page, pageSize }
		};
	} catch (error) {
		console.error('获取商户列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
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
	if (merchant?.silver_member === true && (!silverEndAt || silverEndAt > now)) {
		return { level: '白银会员', openedAt: silverStartAt };
	}
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
	// 与 H5 首页保持同源判定：优先使用动态额度包（含后台新增套餐）
	const m = h5MembershipInfo(merchant, Array.isArray(rechargePackages) && rechargePackages.length ? rechargePackages : null);
	if (m && m.tier && m.tier !== 'normal') {
		return {
			level: String(m.name || '会员'),
			openedAt: Number(merchant?.recharge_update_time || merchant?.recharge_cycle_start || 0)
		};
	}
	// 历史数据兜底：部分老商户未记录 package_id/price，但记录了奖励额度或目标额度
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

async function merchantPointsMonthlyInsight(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const uid = String(merchant.user_id || merchant._id || '');
		if (!uid) return { code: 400, message: '商户标识无效' };
		const now = nowTs();
		const curYm = subsidyEngine.monthNoFromTs(now);
		const tRes = await machineTradeCollection
			.where({ user_id: uid, trade_type: 'real', amount: db.command.gt(0) })
			.field({ amount: true, cashback: true, release_amount: true, create_time: true })
			.orderBy('create_time', 'asc')
			.limit(20000)
			.get();
		const trades = tRes.data || [];
		const genByYm = {};
		const flowByYm = {};
		for (const t of trades) {
			const amount = Number(t.amount || 0);
			if (!(amount > 0)) continue;
			const tradeYm = subsidyEngine.monthNoFromTs(Number(t.create_time || now));
			const total = Number((amount * 0.0038).toFixed(4));
			const first = Number(t.release_amount != null ? t.release_amount : total);
			genByYm[tradeYm] = Number(((genByYm[tradeYm] || 0) + total).toFixed(4));
			flowByYm[tradeYm] = Number(((flowByYm[tradeYm] || 0) + amount).toFixed(2));
		}
		const sourceSlicesByYm = subsidyEngine.buildDeferredSlicesByMonth(trades, now, 10000);
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
			.field({ month_no: true, subsidy_flow_month: true, subsidy_kind: true, amount: true, status: true, expire_time: true })
			.limit(20000)
			.get();
		const packets = packetRes.data || [];
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
		const historyYmSet = new Set([...Object.keys(genByYm), ...Object.keys(dueSlicesByTargetSource), ...Object.keys(releasedSlotsByTargetSource)]);
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
					generatedPoints: Number(Number(genByYm[ym] || 0).toFixed(4)),
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
			...Object.keys(genByYm),
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
					generatedPoints: Number(Number(genByYm[ym] || 0).toFixed(4)),
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
						const duePoints = slices.reduce((s, x) => s + Number(x || 0), 0);
						const releasedSliceCount = Number(relSlotsSrc[sourceYm] || 0);
						const releasedPoints = Number(relPtsSrc[sourceYm] || 0);
						const lostSliceCount = monthEnded ? Math.max(0, dueSliceCount - releasedSliceCount) : 0;
						const lostPoints = monthEnded ? Math.max(0, Number((duePoints - releasedPoints).toFixed(4))) : 0;
						sliceDetails.push({
							targetYm,
							sourceYm,
							dueSliceCount,
							duePoints: Number(duePoints.toFixed(4)),
							releasedSliceCount,
							releasedPoints: Number(releasedPoints.toFixed(4)),
							lostSliceCount,
							lostPoints: Number(lostPoints.toFixed(4)),
							slicePreview: slices.slice(0, 12).map((x) => Number(Number(x || 0).toFixed(4)))
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

		const doc = {
			user_id: userId,
			device_id: deviceId,
			mobile: String(mobile || '').trim(),
			wx_nickname: String(wx_nickname || '').trim() || '模拟用户',
			wx_avatar: String(wx_avatar || '').trim(),
			agreement_img: String(agreement_img || '').trim(),
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

async function offlineFirstRecharge(data, event) {
	try {
		const mobile = safeText(data?.mobile, 20);
		const packageId = safeText(data?.packageId, 80);
		if (!mobile) return { code: 400, message: '请输入手机号' };
		if (!packageId) return { code: 400, message: '请选择套餐' };

		const merchantRes = await merchantCollection.where({ mobile }).limit(1).get();
		if (!merchantRes.data || !merchantRes.data.length) {
			return { code: 404, message: '未找到该手机号对应的商户' };
		}
		const merchant = merchantRes.data[0];

		let pkgRes = await quotaCollection.where({ package_id: packageId, is_deleted: false }).limit(1).get();
		if (!pkgRes.data || !pkgRes.data.length) {
			pkgRes = await quotaCollection.where({ _id: packageId, is_deleted: false }).limit(1).get();
		}
		if (!pkgRes.data || !pkgRes.data.length) {
			return { code: 404, message: '套餐不存在或已删除' };
		}
		const pkg = pkgRes.data[0];
		const quota = Number(pkg.real_quota || 0);
		if (!Number.isFinite(quota) || quota <= 0) {
			return { code: 400, message: '套餐额度无效' };
		}

		const now = nowTs();
		const offlineOrderNo = `XX${now}${Math.random().toString().slice(2, 10)}`;
		const beforeQuota = Number(merchant.remaining_quota || 0);
		const afterQuota = beforeQuota + quota;
		await merchantCollection.doc(merchant._id).update({
			remaining_quota: afterQuota,
			update_time: now
		});

		await operationLogCollection.add({
			user_id: merchant.user_id || merchant._id,
			user_name: merchant.wx_nickname || merchant.mobile || '商户',
			action: 'offline_first_recharge',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `线下首冲额度: 手机号 ${mobile}，套餐 ${pkg.title || pkg.package_id || pkg._id}，额度 +${quota}`,
			operator_source: 'admin',
			operator: getOperator(event),
			offline_order_no: offlineOrderNo,
			mobile,
			package_id: pkg.package_id || pkg._id,
			package_title: pkg.title || '',
			package_price: Number(pkg.price || 0),
			package_quota: quota,
			before_remaining_quota: beforeQuota,
			after_remaining_quota: afterQuota,
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});

		return {
			code: 0,
			message: '充值成功',
			data: {
				merchantId: merchant._id,
				mobile,
				packageId: pkg.package_id || pkg._id,
				offlineOrderNo,
				packageTitle: pkg.title || '',
				addedQuota: quota,
				remainingQuota: afterQuota
			}
		};
	} catch (error) {
		console.error('offlineFirstRecharge failed:', error);
		return { code: 500, message: '充值失败' };
	}
}

async function buildTradeBillListData(data) {
	const {
		page = 1,
		pageSize = 10,
		salesmanKeyword = '',
		firstCharge = '',
		userKeyword = '',
		platformNo = '',
		wxTradeNo = '',
		refunded = '',
		payTimeStart = '',
		payTimeEnd = ''
	} = data || {};

	const payWhereParts = [{ status: db.command.in([1, 2, 3]) }, db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])];
	if (platformNo) {
		const r = new RegExp(escapeReg(platformNo), 'i');
		payWhereParts.push(db.command.or([{ out_trade_no: r }, { order_no: r }]));
	}
	if (wxTradeNo) payWhereParts.push({ transaction_id: new RegExp(escapeReg(wxTradeNo), 'i') });
	if (payTimeStart && payTimeEnd) {
		payWhereParts.push(
			db.command.or([
				db.command.and([{ pay_date: db.command.gte(Number(payTimeStart)) }, { pay_date: db.command.lte(Number(payTimeEnd)) }]),
				db.command.and([{ create_date: db.command.gte(Number(payTimeStart)) }, { create_date: db.command.lte(Number(payTimeEnd)) }])
			])
		);
	} else if (payTimeStart) {
		payWhereParts.push(db.command.or([{ pay_date: db.command.gte(Number(payTimeStart)) }, { create_date: db.command.gte(Number(payTimeStart)) }]));
	} else if (payTimeEnd) {
		payWhereParts.push(db.command.or([{ pay_date: db.command.lte(Number(payTimeEnd)) }, { create_date: db.command.lte(Number(payTimeEnd)) }]));
	}
	const payWhere = payWhereParts.length === 1 ? payWhereParts[0] : db.command.and(payWhereParts);

	const logWhereParts = [
		{ action: db.command.in(['offline_first_recharge', 'h5_quota_recharge', 'h5_refund_reset']) },
		db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])
	];
	if (platformNo) logWhereParts.push({ target_id: new RegExp(escapeReg(platformNo), 'i') });
	if (payTimeStart && payTimeEnd) {
		logWhereParts.push(db.command.and([{ create_time: db.command.gte(Number(payTimeStart)) }, { create_time: db.command.lte(Number(payTimeEnd)) }]));
	} else if (payTimeStart) {
		logWhereParts.push({ create_time: db.command.gte(Number(payTimeStart)) });
	} else if (payTimeEnd) {
		logWhereParts.push({ create_time: db.command.lte(Number(payTimeEnd)) });
	}
	const logWhere = logWhereParts.length === 1 ? logWhereParts[0] : db.command.and(logWhereParts);

	const [payRes, logRes] = await Promise.all([
		uniPayOrderCollection.where(payWhere).orderBy('create_date', 'desc').limit(10000).get(),
		operationLogCollection.where(logWhere).orderBy('create_time', 'desc').limit(10000).get()
	]);
	const payRows = payRes.data || [];
	const logRows = logRes.data || [];

	const merchantIds = [...new Set(logRows.map((x) => String(x.target_id || '')).filter(Boolean))];
	const userIds = [...new Set(payRows.map((x) => String(x.user_id || '')).filter(Boolean))];
	const merchantMap = {};
	if (merchantIds.length) {
		const r = await merchantCollection.where({ _id: db.command.in(merchantIds) }).limit(10000).get();
		(r.data || []).forEach((m) => {
			merchantMap[String(m._id)] = m;
		});
	}
	if (userIds.length) {
		const r = await merchantCollection.where({ user_id: db.command.in(userIds) }).limit(10000).get();
		(r.data || []).forEach((m) => {
			merchantMap[String(m.user_id || '')] = m;
		});
	}

	const payList = payRows.map((row) => {
		const merchant = merchantMap[String(row.user_id || '')] || null;
		const ts = Number(row.pay_date || row.create_date || 0);
		const amount = Number(row.total_fee || 0) / 100;
		const platformNo = row.transaction_id || row.out_trade_no || row.order_no || row._id;
		return {
			recordKey: `pay:${row._id}`,
			source: 'h5_recharge',
			salesman: merchant?.salesman || '-',
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
				salesman: merchant?.salesman || '-',
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
				salesman: merchant?.salesman || '-',
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
			salesman: merchant?.salesman || '-',
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
	if (salesmanKeyword) merged = merged.filter((x) => String(x.salesman || '').toLowerCase().includes(String(salesmanKeyword).toLowerCase()));
	if (firstCharge !== '') merged = merged.filter((x) => x.firstCharge === (String(firstCharge) === '1' ? '是' : '否'));
	if (userKeyword) merged = merged.filter((x) => String(x.tradeUser || '').toLowerCase().includes(String(userKeyword).toLowerCase()));
	if (platformNo) merged = merged.filter((x) => String(x.platformNo || '').toLowerCase().includes(String(platformNo).toLowerCase()));
	if (wxTradeNo) merged = merged.filter((x) => String(x.wxTradeNo || '').toLowerCase().includes(String(wxTradeNo).toLowerCase()));
	if (refunded !== '') merged = merged.filter((x) => x.refunded === (String(refunded) === '1' ? '是' : '否'));
	if (payTimeStart) merged = merged.filter((x) => Number(x._ts || 0) >= Number(payTimeStart));
	if (payTimeEnd) merged = merged.filter((x) => Number(x._ts || 0) <= Number(payTimeEnd));

	merged.sort((a, b) => Number(b._ts || 0) - Number(a._ts || 0));
	const total = merged.length;
	const s = (Number(page) - 1) * Number(pageSize);
	const e = s + Number(pageSize);
	const list = merged.slice(s, e).map(({ _ts, ...rest }) => rest);
	return { list, total, page: Number(page), pageSize: Number(pageSize) };
}

async function tradeBillList(data) {
	try {
		const result = await buildTradeBillListData(data);
		return { code: 0, message: 'ok', data: result };
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
		const _ = db.command;
		const logWhereParts = [
			{ action: _.in(['offline_first_recharge', 'h5_quota_recharge', 'h5_refund_reset']) },
			_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])
		];
		if (timeStart && timeEnd) {
			logWhereParts.push(_.and([{ create_time: _.gte(Number(timeStart)) }, { create_time: _.lte(Number(timeEnd)) }]));
		} else if (timeStart) {
			logWhereParts.push({ create_time: _.gte(Number(timeStart)) });
		} else if (timeEnd) {
			logWhereParts.push({ create_time: _.lte(Number(timeEnd)) });
		}
		const logWhere = logWhereParts.length === 1 ? logWhereParts[0] : _.and(logWhereParts);

		const wdWhereParts = [
			{ is_deleted: _.neq(true) },
			{ is_paid: true },
			{ arrival_status: 'received' }
		];
		if (timeStart && timeEnd) {
			wdWhereParts.push(
				_.or([
					_.and([{ arrival_time: _.gte(Number(timeStart)) }, { arrival_time: _.lte(Number(timeEnd)) }]),
					_.and([{ pay_time: _.gte(Number(timeStart)) }, { pay_time: _.lte(Number(timeEnd)) }]),
					_.and([{ create_time: _.gte(Number(timeStart)) }, { create_time: _.lte(Number(timeEnd)) }])
				])
			);
		} else if (timeStart) {
			wdWhereParts.push(
				_.or([{ arrival_time: _.gte(Number(timeStart)) }, { pay_time: _.gte(Number(timeStart)) }, { create_time: _.gte(Number(timeStart)) }])
			);
		} else if (timeEnd) {
			wdWhereParts.push(
				_.or([{ arrival_time: _.lte(Number(timeEnd)) }, { pay_time: _.lte(Number(timeEnd)) }, { create_time: _.lte(Number(timeEnd)) }])
			);
		}
		const wdWhere = wdWhereParts.length === 1 ? wdWhereParts[0] : _.and(wdWhereParts);

		const [logRes, wdRes] = await Promise.all([
			operationLogCollection.where(logWhere).orderBy('create_time', 'desc').limit(20000).get(),
			withdrawCollection.where(wdWhere).orderBy('create_time', 'desc').limit(20000).get()
		]);
		const logs = logRes.data || [];
		const withdraws = wdRes.data || [];

		const merchantKeys = [
			...new Set([
				...logs.map((x) => String(x.target_id || '')).filter(Boolean),
				...withdraws.map((x) => String(x.merchant_user_id || '')).filter(Boolean)
			])
		];
		const merchantMap = {};
		if (merchantKeys.length) {
			const [byId, byUserId] = await Promise.all([
				merchantCollection.where({ _id: _.in(merchantKeys) }).limit(20000).get(),
				merchantCollection.where({ user_id: _.in(merchantKeys) }).limit(20000).get()
			]);
			(byId.data || []).forEach((m) => {
				merchantMap[String(m._id)] = m;
			});
			(byUserId.data || []).forEach((m) => {
				merchantMap[String(m.user_id || '')] = m;
			});
		}

		const rows = [];
		for (const row of logs) {
			const merchant = merchantMap[String(row.target_id || '')] || null;
			const merchantName = merchant?.wx_nickname || merchant?.mobile || row.target_name || '-';
			const merchantMobile = merchant?.mobile || '-';
			const ts = Number(row.create_time || 0);
			if (row.action === 'offline_first_recharge' || row.action === 'h5_quota_recharge') {
				const amount = Number(row.package_price || 0);
				const order = safeText(row.platform_no || row.offline_order_no || '', 80) || '-';
				rows.push({
					recordKey: `in:${row._id}`,
					bizType: '充值',
					direction: '入账',
					merchantDisplay: `${merchantName}\n${merchantMobile}`,
					changeAmount: amount,
					changeAmountText: `￥${amount.toFixed(2)}`,
					actualAmount: amount,
					actualAmountText: `￥${amount.toFixed(2)}`,
					orderNo: order,
					remark: row.action === 'offline_first_recharge' ? '线下首冲额度' : (safeText(row.package_title || '', 80) || 'H5额度充值'),
					finishTime: formatTime(ts),
					_ts: ts
				});
				continue;
			}
			if (row.action === 'h5_refund_reset') {
				const outAmount = Number(row.refund_final_amount || row.refund_amount || 0);
				const refundAmount = Number(row.refund_amount || 0);
				const penalty = Number(row.refund_penalty_amount || 0);
				const order = safeText(row.platform_no || '', 80) || '-';
				rows.push({
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
				});
			}
		}

		for (const wd of withdraws) {
			const merchant = merchantMap[String(wd.merchant_user_id || '')] || null;
			const merchantName = merchant?.wx_nickname || wd.user_nickname || wd.user_mobile || '-';
			const merchantMobile = merchant?.mobile || wd.user_mobile || '-';
			const ts = Number(wd.arrival_time || wd.pay_time || wd.create_time || 0);
			const amount = Number(wd.amount || 0);
			const payable = Number(wd.payable || 0);
			rows.push({
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
			});
		}

		let filtered = rows;
		if (bizType) filtered = filtered.filter((x) => x.bizType === String(bizType));
		if (merchantKeyword) {
			const kw = String(merchantKeyword).toLowerCase();
			filtered = filtered.filter((x) => String(x.merchantDisplay || '').toLowerCase().includes(kw));
		}
		if (orderNo) {
			const kw = String(orderNo).toLowerCase();
			filtered = filtered.filter((x) => String(x.orderNo || '').toLowerCase().includes(kw));
		}
		filtered.sort((a, b) => Number(b._ts || 0) - Number(a._ts || 0));
		const total = filtered.length;
		const s = (Number(page) - 1) * Number(pageSize);
		const e = s + Number(pageSize);
		const list = filtered.slice(s, e).map(({ _ts, ...rest }) => rest);
		return { code: 0, message: 'ok', data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
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
		expired: '已过期'
	};
	return m[s] || s || '-';
}

function mapWithdrawItem(item) {
	const auditStatus = safeText(item.audit_status || '', 24) || (item.audit_required ? 'pending' : 'none');
	const auditMap = { pending: '待审核', approved: '已同意', rejected: '已拒绝', failed: '审核失败', none: '-' };
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
		isPaidText: item.is_paid ? '已打款' : '未打款',
		wxTradeNo: item.wx_trade_no || '',
		transferState: safeText(item.transfer_state || '', 40),
		transferError: safeText(item.transfer_error || '', 200),
		auditRequired: !!item.audit_required,
		auditStatus,
		auditStatusText: auditMap[auditStatus] || auditStatus || '-',
		payTime: formatTime(item.pay_time),
		arrivalStatus: item.arrival_status || 'pending',
		arrivalStatusText: arrivalStatusText(item.arrival_status),
		arrivalTime: formatTime(item.arrival_time),
		createTime: formatTime(item.create_time)
	};
}

function buildWithdrawWhere(data) {
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
	if (deviceId) {
		parts.push({ device_id: new RegExp(escapeReg(deviceId), 'i') });
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

async function getWithdrawList(data) {
	try {
		const { page = 1, pageSize = 10 } = data || {};
		const whereExpr = buildWithdrawWhere(data);
		const countRes = await withdrawCollection.where(whereExpr).count();
		const total = countRes.total;
		const res = await withdrawCollection
			.where(whereExpr)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (res.data || []).map((row) => mapWithdrawItem(row));
		const summary = await withdrawSummary(whereExpr);
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

async function settleWithdrawSuccess(withdrawRow, wxTradeNo = '', transferState = 'SUCCESS') {
	if (!withdrawRow) return;
	if (withdrawRow.is_paid || safeText(withdrawRow.arrival_status, 20) === 'received') return;
	const settleAmt = Number(withdrawRow.payable != null ? withdrawRow.payable : withdrawRow.amount || 0);
	const amountPoints = Number(withdrawRow.amount || 0);
	const merchantUserId = safeText(withdrawRow.merchant_user_id, 80);
	const merchantRes = merchantUserId
		? await merchantCollection.where({ user_id: merchantUserId }).limit(1).get()
		: { data: [] };
	const merchant = merchantRes.data && merchantRes.data[0];
	const machineRes = withdrawRow.device_id
		? await machineCollection.where({ device_id: withdrawRow.device_id, is_deleted: false }).limit(1).get()
		: { data: [] };
	const machine = machineRes.data && machineRes.data[0];
	await withdrawCollection.doc(withdrawRow._id).update({
		audit_status: 'approved',
		audit_time: Number(withdrawRow.audit_time || nowTs()),
		is_paid: true,
		arrival_status: 'received',
		pay_time: Number(withdrawRow.pay_time || nowTs()),
		arrival_time: nowTs(),
		wx_trade_no: safeText(wxTradeNo || withdrawRow.wx_trade_no || '', 80),
		transfer_state: safeText(transferState || 'SUCCESS', 40),
		update_time: nowTs()
	});
	if (merchant) {
		const merchantUpdate = {
			pending_withdraw: Number(Math.max(0, Number(merchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
			withdrawn: Number((Number(merchant.withdrawn || 0) + settleAmt).toFixed(4)),
			update_time: nowTs()
		};
		// 非审核提现在申请时未冻结积分，这里补扣，确保与“需审核”路径口径一致
		if (!withdrawRow.audit_required) {
			merchantUpdate.available_reward = Number(Math.max(0, Number(merchant.available_reward || 0) - amountPoints).toFixed(4));
			merchantUpdate.account_points = Number(Math.max(0, Number(merchant.account_points || 0) - amountPoints).toFixed(4));
		}
		await merchantCollection.doc(merchant._id).update(merchantUpdate);
	}
	if (machine) {
		await machineCollection.doc(machine._id).update({
			pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4)),
			withdrawn_amount: Number((Number(machine.withdrawn_amount || 0) + settleAmt).toFixed(4))
		});
	}
}

async function withdrawSyncProcessing(data = {}) {
	const limit = Math.min(Math.max(Number(data?.limit || 20), 1), 100);
	const now = nowTs();
	try {
		const processingStates = ['PROCESSING', 'ACCEPTED', 'WAIT_USER_CONFIRM', 'UNKNOWN'];
		const res = await withdrawCollection
			.where({
				is_deleted: false,
				audit_required: true,
				audit_status: 'pending',
				transfer_state: db.command.in(processingStates)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		let success = 0;
		let failed = 0;
		let processing = 0;
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
					await settleWithdrawSuccess(row, billNo, state);
					success += 1;
					continue;
				}
				if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
					await withdrawCollection.doc(row._id).update({
						audit_status: 'pending',
						arrival_status: 'pending',
						transfer_state: 'RETRYABLE_FAIL',
						transfer_error: safeText(q?.fail_reason || q?.message || state, 180),
						wx_trade_no: billNo,
						update_time: nowTs()
					});
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
		return { code: 0, message: 'ok', data: { total: rows.length, success, failed, processing, at: now } };
	} catch (e) {
		console.error('withdrawSyncProcessing failed:', e);
		return { code: 500, message: safeText(e?.message || '自动轮询失败', 160) };
	}
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
			const merchantARBefore = Number(merchant.available_reward || 0);
			const merchantAPBefore = Number(merchant.account_points || 0);
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
							audit_status: 'pending',
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
				// PROCESSING 等非终态：记录处理中，保持冻结额度，等待后续状态确认
				await withdrawCollection.doc(id).update({
					audit_status: 'pending',
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
				if (isWxBalanceInsufficientError(e)) {
					await sendWecomRobotText('商户号运营账户余额不足，请及时充值。');
				}
				await withdrawCollection.doc(id).update({
					audit_status: 'pending',
					arrival_status: 'pending',
					transfer_state: 'RETRYABLE_FAIL',
					transfer_error: reason,
					update_time: nowTs()
				});
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
			if (!['', 'PENDING_AUDIT', 'RETRYABLE_FAIL', 'FAIL', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(stateNow)) {
				return { code: 400, message: '当前微信提现处理中或已成功，暂不可不同意提现' };
			}
			const merchantUserId = safeText(row.merchant_user_id, 80);
			const settleAmt = Number(row.payable != null ? row.payable : row.amount || 0);
			const amountPoints = Number(row.amount || 0);
			const merchantRes = merchantUserId
				? await merchantCollection.where({ user_id: merchantUserId }).limit(1).get()
				: { data: [] };
			const merchant = merchantRes.data && merchantRes.data[0];
			if (!merchant) return { code: 404, message: '商户不存在' };
			const machineRes = row.device_id
				? await machineCollection.where({ device_id: row.device_id, is_deleted: false }).limit(1).get()
				: { data: [] };
			const machine = machineRes.data && machineRes.data[0];

			await withdrawCollection.doc(id).update({
				audit_status: 'rejected',
				arrival_status: 'returned',
				transfer_state: 'REJECTED',
				transfer_error: safeText(data?.reason || '管理员不同意提现', 180),
				update_time: now
			});
			await merchantCollection.doc(merchant._id).update({
				available_reward: Number((Number(merchant.available_reward || 0) + amountPoints).toFixed(4)),
				account_points: Number((Number(merchant.account_points || 0) + amountPoints).toFixed(4)),
				pending_withdraw: Number(Math.max(0, Number(merchant.pending_withdraw || 0) - settleAmt).toFixed(4)),
				update_time: now
			});
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number(Math.max(0, Number(machine.pending_amount || 0) - settleAmt).toFixed(4))
				});
			}
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
		const whereExpr = buildWithdrawWhere(data);
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
		raw.forEach((item) => {
			const m = mapWithdrawItem(item);
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

function wxWithdrawCredentials() {
	return {
		mchId: WX_PAY_MCH_ID,
		appId: WX_PAY_APPID,
		mchApiV3Key: WX_PAY_MCH_API_V3_KEY,
		mchSerialNo: WX_PAY_MCH_SERIAL_NO,
		privateKey: WX_PAY_PRIVATE_KEY,
		platformCert: WX_PAY_PLATFORM_CERT
	};
}

function wxRechargeCredentials() {
	const fallback = wxWithdrawCredentials();
	return {
		mchId: WX_PAY_RECHARGE_MCH_ID || fallback.mchId,
		appId: WX_PAY_RECHARGE_APPID || fallback.appId,
		mchApiV3Key: WX_PAY_RECHARGE_MCH_API_V3_KEY || fallback.mchApiV3Key,
		mchSerialNo: WX_PAY_RECHARGE_MCH_SERIAL_NO || fallback.mchSerialNo,
		privateKey: WX_PAY_RECHARGE_PRIVATE_KEY || fallback.privateKey,
		platformCert: WX_PAY_RECHARGE_PLATFORM_CERT || fallback.platformCert
	};
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
	const rc = wxRechargeCredentials();
	if (id === rc.mchId) return rc;
	const wc = wxWithdrawCredentials();
	if (id === wc.mchId) return wc;
	return null;
}

function isWxOrderNotExistsError(e) {
	const msg = String(e?.wxBody?.message || e?.wxBody?.code || e?.message || '').toLowerCase();
	return msg.includes('订单不存在') || msg.includes('order_not_exist') || msg.includes('resource_not_exists');
}

function ensureWxWithdrawPayConfig() {
	const c = wxWithdrawCredentials();
	if (!c.mchId || !c.appId || !c.mchSerialNo || !c.privateKey) {
		return { ok: false, message: '提现商户微信支付参数未配置完整（WX_PAY_*：商户号/AppID/证书序列号/私钥）' };
	}
	if (!c.mchApiV3Key || String(c.mchApiV3Key).length !== 32) {
		return { ok: false, message: '提现商户 WX_PAY_MCH_API_V3_KEY 必须是32位 APIv3 密钥（不是 PUB_KEY_ID）' };
	}
	if (!c.platformCert) {
		return { ok: false, message: '提现商户未配置 WX_PAY_PLATFORM_CERT，无法校验回调签名' };
	}
	return { ok: true, creds: c };
}

function ensureWxRechargePayConfig() {
	const c = wxRechargeCredentials();
	if (!c.mchId || !c.appId || !c.mchSerialNo || !c.privateKey) {
		return {
			ok: false,
			message:
				'充值商户微信支付参数未配置完整（WX_PAY_RECHARGE_* 未填时回退 WX_PAY_*：商户号/AppID/证书序列号/私钥）'
		};
	}
	if (!c.mchApiV3Key || String(c.mchApiV3Key).length !== 32) {
		return {
			ok: false,
			message: '充值商户 APIv3 密钥必须是32位（WX_PAY_RECHARGE_MCH_API_V3_KEY 或回退的 WX_PAY_MCH_API_V3_KEY）'
		};
	}
	if (!c.platformCert) {
		return {
			ok: false,
			message: '充值商户未配置微信平台证书（WX_PAY_RECHARGE_PLATFORM_CERT 或回退的 WX_PAY_PLATFORM_CERT）'
		};
	}
	if (!isValidNotifyUrl(H5_PAY_NOTIFY_URL)) {
		return { ok: false, message: 'WX_PAY_NOTIFY_URL 必须是可公网访问的 https 接口地址，且不能包含 # 哈希路由' };
	}
	if (H5_REFUND_NOTIFY_URL && !isValidNotifyUrl(H5_REFUND_NOTIFY_URL)) {
		return { ok: false, message: 'WX_PAY_REFUND_NOTIFY_URL 必须是可公网访问的 https 接口地址，且不能包含 # 哈希路由' };
	}
	return { ok: true, creds: c };
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
	const r = ensureWxRechargePayConfig().ok ? verifyWxCallbackSignatureFor(wxRechargeCredentials(), headers, rawBody) : { ok: false };
	if (r.ok) return { ok: true, creds: wxRechargeCredentials() };
	const w = ensureWxWithdrawPayConfig().ok ? verifyWxCallbackSignatureFor(wxWithdrawCredentials(), headers, rawBody) : { ok: false };
	if (w.ok) return { ok: true, creds: wxWithdrawCredentials() };
	return { ok: false, message: r.message || w.message || '回调签名校验失败' };
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
	const custom = orderDoc.custom || {};
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
	// 统一口径：H5首页「剩余提现额度」/我的「可用奖励」/后台「剩余额度」均使用 available_reward
	// 兼容历史数据：若 available_reward 尚未初始化，则以 remaining_quota 作为基线。
	const prevAvailableRewardRaw = Number(merchant.available_reward || 0);
	const prevAvailableReward = prevAvailableRewardRaw > 0 ? prevAvailableRewardRaw : prevRem;
	const nextAvailableReward = Number((prevAvailableReward + grantDelta).toFixed(2));
	const volAdd = Number(custom.add_quota || 0);
	const addPaidYuan = Number(Number(custom.paid_amount || 0).toFixed(2));
	const prevTrackedTotal = Number(merchant.recharge_total_yuan || 0);
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
	await merchantCollection.doc(merchant._id).update({
		remaining_quota: afterRem,
		available_reward: nextAvailableReward,
		estimated_free_quota: Number(custom.target_quota || 0),
		recharge_package_id: custom.package_id || '',
		recharge_package_price: targetPrice,
		recharge_package_quota: Number(custom.target_quota || 0),
		recharge_package_reward: Number((targetReward > 0 ? targetReward : grantYuanByRechargePrice(targetPrice, biz.rechargeRules)) || 0),
		recharge_cycle_start: now,
		recharge_cycle_days: Number(refundCycle.cycleDays || 180),
		recharge_window_days: Number(refundCycle.windowDays || 3),
		recharge_total_yuan: nextRechargeTotalYuan,
		recharge_update_time: now,
		update_time: now
	});
	await operationLogCollection.add({
		user_id: merchant.user_id || merchant._id,
		user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
		action: 'h5_quota_recharge',
		module: 'finance',
		target_id: merchant._id,
		target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
		content: `H5额度充值: ${custom.package_title || ''}, 免门槛权益额度+${grantDelta}元(交易量配置+${volAdd})`,
		operator_source: 'h5',
		operator: 'wxpay_notify',
		platform_no: orderDoc.out_trade_no || orderDoc.order_no || '',
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
	if (orderDoc._id) {
		try {
			await maybeCreateRechargeGiftShipment(orderDoc, merchant, now);
		} catch (e) {
			console.error('maybeCreateRechargeGiftShipment failed', e);
		}
		await uniPayOrderCollection.doc(orderDoc._id).update({
			custom: {
				...custom,
				recharge_applied: true,
				recharge_applied_at: now
			},
			update_date: now
		});
	}
}

function pickAuthProfile(data) {
	const authMode = safeText(data?.authMode || 'mock', 20) || 'mock';
	if (authMode === 'wechat') {
		// 真授权阶段由网关完成 code->openid/手机号换取；这里保留兼容入参。
		const openid = safeText(data?.openid, 80);
		const nickname = safeText(data?.wxNickname || data?.nickname, 60);
		const avatar = safeText(data?.wxAvatar || data?.avatar, 500);
		const mobile = safeText(data?.mobile, 20);
		return { authMode, openid, nickname, avatar, mobile };
	}
	const mockMobile = safeText(data?.mobile || '', 20);
	return {
		authMode: 'mock',
		openid: safeText(data?.openid || `mock_${mockMobile || Math.random().toString(36).slice(2, 10)}`, 80),
		nickname: safeText(data?.wxNickname || data?.nickname || '微信用户', 60),
		avatar: safeText(data?.wxAvatar || data?.avatar || '', 500),
		mobile: mockMobile
	};
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
			login_time: now
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
		remaining_quota: 0,
		pending_withdraw: 0,
		withdrawn: 0,
		frozen_amount: 0,
		coupon_count: 0,
		available_reward: 0,
		estimated_free_quota: 0,
		account_points: 0,
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

async function getMerchantByIdOrUserId(key) {
	const val = safeText(key, 120);
	if (!val) return null;
	const ors = [{ _id: val }, { user_id: val }];
	if (isValidCnMobile(val)) ors.push({ mobile: val });
	const res = await merchantCollection.where(db.command.or(ors)).limit(1).get();
	if (res.data && res.data.length) return res.data[0];
	return null;
}

function compactMerchantInfo(row) {
	return {
		id: row._id,
		userId: row.user_id || row._id,
		wxNickname: row.wx_nickname || '',
		wxAvatar: row.wx_avatar || '',
		mobile: row.mobile || '',
		deviceId: row.device_id || '',
		brandName: row.brand_name || '',
		agreementImg: row.agreement_img || '',
		agreementSignedAt: formatTime(row.agreement_signed_at),
		agreementVersion: row.agreement_version || '',
		availableReward: Number(row.available_reward || 0),
		estimatedFreeQuota: Number(row.estimated_free_quota || 0),
		accountPoints: Number(row.account_points || 0)
	};
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
	if (!agreement) return hasSignedImage;
	if (!hasSignedImage) return false;
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
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: 'wechat',
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !hasBound,
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
		if (!profile.openid) {
			return { code: 400, message: '未获取到用户身份信息，请重试' };
		}
		const upsertRes = await upsertMerchantByAuth(profile);
		const merchant = await getMerchantByIdOrUserId(upsertRes.id);
		const hasBound = await merchantHasBoundMachine(merchant);
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: profile.authMode,
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !hasBound,
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
			action: 'h5_bind_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: oldDeviceId ? `新增绑定码牌：${deviceId}（主码牌：${oldDeviceId}）` : `绑定码牌：${deviceId}`,
			operator_source: 'h5',
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
			action: 'h5_unbind_machine',
			module: 'merchant',
			target_id: merchant._id,
			target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
			content: `解绑码牌：${deviceId}`,
			operator_source: 'h5',
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
				action: db.command.in(['h5_bind_machine', 'h5_unbind_machine', 'unbind'])
			})
			.orderBy('create_time', 'desc')
			.limit(500)
			.get();

		const all = res.data || [];
		const total = all.length;
		const slice = all.slice(skip, skip + pageSize);
		const list = slice.map((row) => ({
			id: String(row._id),
			action: row.action === 'unbind' || row.action === 'h5_unbind_machine' ? 'unbind' : 'bind',
			actionText: row.action === 'unbind' || row.action === 'h5_unbind_machine' ? '解除绑定' : '绑定',
			content: safeText(row.content || '', 500),
			time: row.create_time,
			timeText: formatTime(row.create_time),
			reason: safeText(row.reason || '', 200)
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
			await settleWithdrawSuccess(row, safeText(q?.transfer_bill_no || row.wx_trade_no || '', 80), state);
			return { code: 400, message: '该笔提现已到账，无需确认收款' };
		}
		if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
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
		const [boundMachines, biz, curAgreement, openTicket] = await Promise.all([
			listBoundMachinesByMerchant(merchant),
			getBizSettings(),
			getCurrentAgreement(),
			feedbackFindOpenTicket(merchant._id)
		]);
		const boundDeviceIds = [...new Set(boundMachines.map((m) => safeText(m.device_id, 80)).filter(Boolean))];
		const deviceDisplay = boundDeviceIds.length
			? `${boundDeviceIds.length}个码牌：${boundDeviceIds.join('、')}`
			: (safeText(merchant.device_id, 80) || '未绑定');
		const agreementNeedSign = !isMerchantAgreementSatisfied(merchant, curAgreement);
		const totalGrantedYuan = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		// 可用奖励口径：按提现申请积分总额扣减（与税费/到账净额无关）
		const showAvailableReward = Math.max(0, Number(Number(merchant.available_reward || 0).toFixed(2)));
		const now = nowTs();
		const silverEndAt = Number(merchant.silver_member_end_at || 0);
		const silverActive = isH5SilverMemberForWithdraw(merchant) && silverEndAt > now;
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: compactMerchantInfo(merchant),
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
					accountPoints: Number(merchant.account_points || 0).toFixed(2)
				},
				silver: {
					active: silverActive,
					expireAt: silverEndAt,
					remainingSec: silverActive ? Math.max(0, Math.floor((silverEndAt - now) / 1000)) : 0
				},
				feedback: {
					unreadReply: openTicket ? !!openTicket.user_unread_reply : false
				}
			}
		};
	} catch (e) {
		console.error('h5MineInfo failed', e);
		return { code: 500, message: '获取失败' };
	}
}

const BIZ_SETTING_KEY = 'h5_biz_params';
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
const DEFAULT_BIZ_SETTINGS = {
	rechargeRules: DEFAULT_RECHARGE_RULES,
	withdrawRange: { memberMin: 10, memberMax: 200, nonMemberMin: 30, nonMemberMax: 200 },
	withdrawMinByCount: {
		memberFirst3: 10,
		member4To6: 30,
		member7Plus: 50,
		nonMemberFirst3: 30,
		nonMember4To6: 50,
		nonMember7Plus: 100
	},
	withdrawAudit: { memberRequired: false, nonMemberRequired: false },
	/** H5 充值全额退款（商家转账）：与提现审核开关独立，逻辑一致（会员/非会员是否需后台同意后再打款） */
	refundTransferAudit: { memberRequired: false, nonMemberRequired: false },
	optimizeConfig: { enabled: true, thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 1 },
	refundCycle: { cycleDays: 180, windowDays: 3 },
	riskRates: { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 },
	testMerchantIds: []
};
const BIZ_SETTINGS_CACHE_TTL_MS = 60000;
let bizSettingsCache = null;
let bizSettingsCacheAt = 0;

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
	const withdrawMinByCount = {
		memberFirst3: Math.max(1, Number(wm.memberFirst3 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.memberFirst3)),
		member4To6: Math.max(1, Number(wm.member4To6 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.member4To6)),
		member7Plus: Math.max(1, Number(wm.member7Plus || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.member7Plus)),
		nonMemberFirst3: Math.max(1, Number(wm.nonMemberFirst3 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMemberFirst3)),
		nonMember4To6: Math.max(1, Number(wm.nonMember4To6 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMember4To6)),
		nonMember7Plus: Math.max(1, Number(wm.nonMember7Plus || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMember7Plus))
	};
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
	const rc = raw.refundCycle || {};
	const refundCycle = {
		cycleDays: Math.max(1, Number(rc.cycleDays || DEFAULT_BIZ_SETTINGS.refundCycle.cycleDays)),
		windowDays: Math.max(1, Number(rc.windowDays || DEFAULT_BIZ_SETTINGS.refundCycle.windowDays))
	};
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
	return {
		rechargeRules: normRules,
		withdrawRange,
		withdrawMinByCount,
		withdrawAudit,
		refundTransferAudit,
		optimizeConfig,
		refundCycle,
		riskRates,
		testMerchantIds
	};
}

function resolveWithdrawMinPoints(member, biz, historyCount) {
	const wm = biz?.withdrawMinByCount || DEFAULT_BIZ_SETTINGS.withdrawMinByCount;
	const nextNo = Math.max(1, Number(historyCount || 0) + 1);
	if (member) {
		if (nextNo <= 3) return Number(wm.memberFirst3 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.memberFirst3);
		if (nextNo <= 6) return Number(wm.member4To6 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.member4To6);
		return Number(wm.member7Plus || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.member7Plus);
	}
	if (nextNo <= 3) return Number(wm.nonMemberFirst3 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMemberFirst3);
	if (nextNo <= 6) return Number(wm.nonMember4To6 || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMember4To6);
	return Number(wm.nonMember7Plus || DEFAULT_BIZ_SETTINGS.withdrawMinByCount.nonMember7Plus);
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
	if (bizSettingsCache && now - bizSettingsCacheAt < BIZ_SETTINGS_CACHE_TTL_MS) {
		return bizSettingsCache;
	}
	const rRedis = await redisH5.h5RedisGetJson(REDIS_KEY_BIZ);
	if (rRedis && rRedis.rechargeRules && Array.isArray(rRedis.rechargeRules)) {
		bizSettingsCache = rRedis;
		bizSettingsCacheAt = now;
		return bizSettingsCache;
	}
	try {
		const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(1).get();
		if (r.data && r.data.length) {
			bizSettingsCache = sanitizeBizSettings(r.data[0].value || {});
			bizSettingsCacheAt = now;
			await redisH5.h5RedisSetJson(REDIS_KEY_BIZ, bizSettingsCache, REDIS_EX_BIZ_SEC);
			return bizSettingsCache;
		}
	} catch (e) {
		console.error('getBizSettings failed', e);
	}
	bizSettingsCache = sanitizeBizSettings(DEFAULT_BIZ_SETTINGS);
	bizSettingsCacheAt = now;
	await redisH5.h5RedisSetJson(REDIS_KEY_BIZ, bizSettingsCache, REDIS_EX_BIZ_SEC);
	return bizSettingsCache;
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
	return out;
}

const H5_WITHDRAW_FEE_YUAN = 3;
const H5_WITHDRAW_TAX_RATE = 0.08;
const H5_WITHDRAW_MAX_POINTS = 200;
const H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN = 50000;

function isH5RechargeMemberForWithdraw(merchant) {
	return h5MembershipInfo(merchant).tier !== 'normal';
}

function isH5SilverMemberForWithdraw(merchant) {
	if (!merchant) return false;
	const now = nowTs();
	const endAt = Number(merchant.silver_member_end_at || 0);
	if (merchant.silver_member === true && endAt > now) return true;
	const tag = String(merchant.member_tier || merchant.membership_tier || merchant.h5_member_tier || '').toLowerCase();
	if (tag === 'silver' || tag === 'white_silver' || tag === 'silver_member') return true;
	if (merchant.silver_member === true && !endAt) return true;
	if (merchant.redeem_code_claimed === true || merchant.exchange_code_claimed === true) return true;
	const name = String(merchant.membership_name || '').trim();
	if (name.includes('白银')) return true;
	return false;
}

function resolveH5WithdrawRole(merchant) {
	if (isH5RechargeMemberForWithdraw(merchant)) return 'recharge_member';
	if (isH5SilverMemberForWithdraw(merchant)) return 'silver_member';
	return 'normal_member';
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
			{ trade_type: 'real' },
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

async function h5WithdrawInfo(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const now = nowTs();
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const isRechargeMember = withdrawRole === 'recharge_member';
		const monthTradeYuan = withdrawRole === 'silver_member' ? await getH5CurrentMonthTradeYuan(merchant, now) : 0;
		const silverCanWithdraw = monthTradeYuan >= H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN;
		const canWithdraw = withdrawRole === 'recharge_member' || (withdrawRole === 'silver_member' && silverCanWithdraw);
		let withdrawHint = '';
		if (withdrawRole === 'normal_member') {
			withdrawHint = '当前账号仅可领取积分，暂不支持提现。请联系在线客服领取兑换码后升级白银会员。';
		} else if (withdrawRole === 'silver_member' && !silverCanWithdraw) {
			withdrawHint = `白银会员需当月流水达到${H5_SILVER_WITHDRAW_MONTHLY_TRADE_MIN_YUAN}元后可提现，当前为${monthTradeYuan.toFixed(2)}元。`;
		}
		const biz = await getBizSettings();
		const auditCfg = biz.withdrawAudit || {};
		const testMerchant = isTestMerchantByBiz(merchant, biz);
		// 测试商户仅豁免提现门槛与时间限制，不豁免审核开关
		const needAudit = isRechargeMember ? !!auditCfg.memberRequired : !!auditCfg.nonMemberRequired;
		const ar = Number(merchant.available_reward || 0);
		const ap = Number(merchant.account_points || 0);
		const redeemable = Math.floor(Math.min(ar, ap));
		const withdrawTimes = await countMerchantWithdrawTimes(String(merchant.user_id || merchant._id || ''));
		const minPoints = testMerchant ? 1 : resolveWithdrawMinPoints(isRechargeMember, biz, withdrawTimes);
		const maxPoints = isRechargeMember ? Number(biz.withdrawRange.memberMax || H5_WITHDRAW_MAX_POINTS) : Number(biz.withdrawRange.nonMemberMax || H5_WITHDRAW_MAX_POINTS);
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
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const openid = safeText(merchant.wx_openid, 100);
		if (!openid) return { code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const isRechargeMember = withdrawRole === 'recharge_member';
		const biz = await getBizSettings();
		const auditCfg = biz.withdrawAudit || {};
		const testMerchant = isTestMerchantByBiz(merchant, biz);
		// 测试商户仅豁免提现门槛与时间限制，不豁免审核开关
		const needAudit = isRechargeMember ? !!auditCfg.memberRequired : !!auditCfg.nonMemberRequired;
		if (withdrawRole === 'normal_member') {
			return { code: 400, message: '当前账号暂不支持提现，请联系在线客服领取兑换码后升级白银会员。' };
		}
		if (withdrawRole === 'silver_member') {
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
		const ar = Number(merchant.available_reward || 0);
		const ap = Number(merchant.account_points || 0);
		if (points > ar + 1e-6 || points > ap + 1e-6) {
			return { code: 400, message: '可兑换积分不足' };
		}
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
			is_deleted: false
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
		try {
			if (needAudit) {
				// 待审核提现：先冻结额度/积分并生成订单，等待后台“同意提现”后才商家打款
				await merchantCollection.doc(merchant._id).update({
					available_reward: Number((ar - points).toFixed(4)),
					account_points: Number((ap - points).toFixed(4)),
					pending_withdraw: Number((pendingWithdrawBefore + payable).toFixed(4)),
					update_time: now
				});
				if (machine) {
					await machineCollection.doc(machine._id).update({
						pending_amount: Number((machinePendingBefore + payable).toFixed(4))
					});
				}
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
				if (isWxBalanceInsufficientError(e)) {
					await sendWecomRobotText('商户号运营账户余额不足，请及时充值。');
				}
				await withdrawCollection.doc(newWithdrawId).update({
					arrival_status: 'returned',
					update_time: nowTs(),
					transfer_error: msg
				});
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
				if (machine) {
					await machineCollection.doc(machine._id).update({
						withdrawn_amount: Number((machineWithdrawnBefore + payable).toFixed(4))
					});
				}
				await merchantCollection.doc(merchant._id).update({
					available_reward: Number((ar - points).toFixed(4)),
					account_points: Number((ap - points).toFixed(4)),
					withdrawn: Number((withdrawnBefore + payable).toFixed(4)),
					update_time: now
				});
				await withdrawCollection.doc(newWithdrawId).update({
					is_paid: true,
					arrival_status: 'received',
					pay_time: nowTs(),
					arrival_time: nowTs(),
					update_time: nowTs(),
					wx_trade_no: transferBillNo,
					transfer_state: transferState,
					...(withdrawPackageInfo ? { package_info: withdrawPackageInfo } : {})
				});
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
				await withdrawCollection.doc(newWithdrawId).update({
					arrival_status: 'returned',
					update_time: nowTs(),
					wx_trade_no: transferBillNo,
					transfer_state: transferState,
					transfer_error: failMsg
				});
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
					available_reward: Number(ar.toFixed(4)),
					account_points: Number(ap.toFixed(4)),
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
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const now = nowTs();
		const withdrawMerchantKey = String(merchant.user_id || merchant._id || '');
		const [boundMachines, biz, withdrawSums, rechargePackages] = await Promise.all([
			listBoundMachinesByMerchant(merchant),
			getBizSettings(),
			getH5WithdrawSummaryCached(withdrawMerchantKey, now),
			loadRechargePackagesFromQuota()
		]);
		const { daySum, monthSum, yearSum } = withdrawSums;
		const boundDeviceIds = [...new Set(boundMachines.map((m) => safeText(m.device_id, 80)).filter(Boolean))];
		const deviceDisplay = boundDeviceIds.length
			? `${boundDeviceIds.length}个码牌：${boundDeviceIds.join('、')}`
			: (safeText(merchant.device_id, 80) || '未绑定');
		const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		let countdown = computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
		if (countdown.normalized && Number(merchant.recharge_cycle_start || 0) !== Number(countdown.start || 0)) {
			const newStart = Number(countdown.start || 0);
			merchant.recharge_cycle_start = newStart;
			countdown = computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
			void merchantCollection
				.doc(merchant._id)
				.update({ recharge_cycle_start: newStart, update_time: now })
				.catch((e) => console.error('h5HomeDashboard cycle norm', e));
		}
		const membership = h5MembershipInfo(merchant, rechargePackages);
		const withdrawRole = resolveH5WithdrawRole(merchant);
		const silverMonthTradeYuan = withdrawRole === 'silver_member' ? await getH5CurrentMonthTradeYuan(merchant, now) : 0;
		const withdrawQuotaTotalYuan = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		// 统一展示：剩余提现额度/可用奖励按“提现申请积分总额”扣减，不受税费/到账净额影响
		const availableRewardYuan = Math.max(0, Number(Number(merchant.available_reward || 0).toFixed(2)));
		// 与 H5「账号积分」、后台「待提现」同一口径：已领取（入账）且尚未通过提现申请扣减的积分余额，1 积分=1 元，随账号
		const accountPointsYuan = Number(merchant.account_points || 0);
		const usedQuotaYuan =
			withdrawQuotaTotalYuan > 0
				? Math.max(0, Number((withdrawQuotaTotalYuan - availableRewardYuan).toFixed(2)))
				: 0;
		return {
			code: 0,
			message: 'ok',
			data: {
				serverTime: now,
				merchant: compactMerchantInfo(merchant),
				device: {
					boundCount: boundDeviceIds.length,
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
					benefitTip: safeText(x.benefitTip || '', 300),
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
				}
			}
		};
	} catch (e) {
		console.error('h5HomeDashboard failed', e);
		return { code: 500, message: '获取首页数据失败' };
	}
}

async function h5SignAgreement(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const signatureImage = String(data?.signatureImage || '').trim();
		if (!signatureImage) return { code: 400, message: '请先签名' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const curAgreement = await getCurrentAgreement();
		const agreementVersion = safeText(data?.agreementVersion || curAgreement?.version || 'legacy', 40);
		const now = nowTs();
		await merchantCollection.doc(merchant._id).update({
			agreement_img: signatureImage,
			agreement_signed_at: now,
			agreement_version: agreementVersion
		});
		return { code: 0, message: '签署成功', data: { agreementImg: signatureImage, agreementSignedAt: now } };
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
		title: '600元套餐',
		bonus_quota: '¥1000000.00',
		real_quota: 3800,
		price: 600,
		description: '六百元限时享一百万奖励额度，提现额度高达3800',
		membership_name: '白金会员'
	},
	{
		package_id: 'pkg_800',
		title: '800元套餐',
		bonus_quota: '¥1500000.00',
		real_quota: 5700,
		price: 800,
		description: '八百元限时享一百五十万奖励额度，提现额度高达5700',
		membership_name: '铂金会员'
	},
	{
		package_id: 'pkg_1000',
		title: '1000元套餐',
		bonus_quota: '¥2000000.00',
		real_quota: 7600,
		price: 1000,
		description: '一千元限时享两百万奖励额度，提现额度高达7600',
		membership_name: '钻石会员'
	}
];

function parseBonusQuotaYuan(raw) {
	const s = String(raw == null ? '' : raw);
	const n = Number(s.replace(/[^\d.]/g, ''));
	return Number.isFinite(n) && n > 0 ? n : 0;
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
			title: safeText(x.title, 80) || `${Number(x.price || 0)}元套餐`,
			price: Number(x.price || 0),
			sortOrder: parseSortOrder(x.sort_order, Number(x.price || 0)),
			quota: parseBonusQuotaYuan(x.bonus_quota),
			rewardYuan: Number(x.real_quota || 0),
			benefitTip: safeText(x.description, 300),
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
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		merchant.__curAgreement = await getCurrentAgreement();
		const needSign = requireH5AgreementSigned(merchant);
		if (needSign) return needSign;
		const biz = await getBizSettings();
		const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		const rechargePackages = await loadRechargePackagesFromQuota();
		const countdown = computeRechargeCountdown(merchant.recharge_cycle_start, nowTs(), cycleCfg.cycleDays, cycleCfg.windowDays);
		if (countdown.normalized && Number(merchant.recharge_cycle_start || 0) !== Number(countdown.start || 0)) {
			await merchantCollection.doc(merchant._id).update({
				recharge_cycle_start: Number(countdown.start || 0),
				update_time: nowTs()
			});
		}
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
		const wxRes = await wxPayRequestFor(rc, 'POST', '/v3/pay/transactions/jsapi', createBody);
		const prepayId = safeText(wxRes.prepay_id, 120);
		if (!prepayId) {
			const maybeMsg = safeText(
				String(wxRes.message || wxRes.errmsg || wxRes.code || wxRes.errcode || wxRes._raw || ''),
				180
			);
			console.error('[h5RechargeCreate] missing prepay_id wxRes=', JSON.stringify(wxRes));
			return { code: 500, message: maybeMsg ? `微信下单失败：${maybeMsg}` : '微信下单失败：未返回 prepay_id' };
		}

		await uniPayOrderCollection.add({
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
			return { code: 0, message: '支付成功', data: { paid: true } };
		}

		const payCreds = wxCredentialsForPayOrder(order);
		const queryPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(payCreds.mchId)}`;
		const q = await wxPayRequestFor(payCreds, 'GET', queryPath, null);
		if (q.trade_state !== 'SUCCESS') {
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
		return { code: 0, message: '支付成功', data: { paid: true } };
	} catch (e) {
		console.error('h5RechargeConfirm failed', e);
		if (e && e.name === 'WxPayRequestError' && e.wxBody) {
			console.error('[h5RechargeConfirm] wechat_json', JSON.stringify(e.wxBody));
			const out = {
				code: 500,
				message: safeText(e.message || '确认支付失败', 180),
				data: { wxPayError: e.wxBody }
			};
			return out;
		}
		return { code: 500, message: '确认支付失败' };
	}
}

async function h5WxPayNotify(data) {
	try {
		const headers = data?.headers || {};
		const rawBody = String(data?.rawBody || JSON.stringify(data?.body || {}));
		const verifyRes = verifyWxCallbackSignatureDual(headers, rawBody);
		if (!verifyRes.ok) {
			return { code: 400, message: verifyRes.message, data: { ack: wxAckFail(verifyRes.message) } };
		}
		const bodyObj = data?.body && typeof data.body === 'object' ? data.body : JSON.parse(rawBody || '{}');
		if (bodyObj.event_type !== 'TRANSACTION.SUCCESS') {
			return { code: 0, message: '忽略非支付成功通知', data: { ack: wxAckSuccess() } };
		}
		const plain = decryptWxResourceFor(verifyRes.creds, bodyObj.resource || {});
		const outTradeNo = safeText(plain.out_trade_no, 40);
		if (!outTradeNo) return { code: 400, message: '回调缺少订单号', data: { ack: wxAckFail('订单号缺失') } };
		const res = await uniPayOrderCollection.where({ out_trade_no: outTradeNo }).limit(1).get();
		const order = res.data && res.data[0];
		if (!order) return { code: 0, message: '订单不存在，忽略', data: { ack: wxAckSuccess() } };
		if (Number(order.status) === 1 && order.user_order_success) {
			if (!(order.custom && order.custom.recharge_applied)) {
				await applyRechargeByOrder(order);
			}
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
		return { code: 0, message: '回调处理成功', data: { ack: wxAckSuccess() } };
	} catch (e) {
		console.error('h5WxPayNotify failed', e);
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
		await writeTransferLog({
			stage: 'transfer_notify_received',
			withdrawNo: outBillNo,
			openid: safeText(plain.openid || '', 128),
			outBillNo,
			transferState: state,
			message: '收到微信提现到账通知',
			payload: plain || {}
		});
		if (outBillNo && state === 'SUCCESS') {
			const r = await withdrawCollection.where({ withdraw_no: outBillNo, is_deleted: false }).limit(1).get();
			const row = r.data && r.data[0];
			if (row) {
				await settleWithdrawSuccess(row, safeText(plain.transfer_bill_no || '', 80), 'SUCCESS');
			}
		}
		return { code: 0, message: '回调处理成功', data: { ack: wxAckSuccess() } };
	} catch (e) {
		await writeTransferLog({
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
		if (transferOrder.applied && safeText(transferOrder.state) === 'SUCCESS') {
			return {
				code: 0,
				message: '退款已完成',
				data: {
					refundNo: transferOrder.refund_no,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdownPhase,
					outBillNo: transferOrder.refund_no,
					refundState: 'SUCCESS',
					refundItems: []
				}
			};
		}
		let items = Array.isArray(transferOrder.transfer_items) ? transferOrder.transfer_items.map((x) => ({ ...x })) : [];
		if (!items.length) {
			items = [
				{
					out_bill_no: safeText(transferOrder.out_bill_no, 64),
					transfer_amount_fen: Number(transferOrder.final_refund_fen || 0),
					state: 'INIT',
					transfer_bill_no: '',
					last_error: ''
				}
			];
		}
		const first = { ...(items[0] || {}) };
		const outBillNo = safeText(first.out_bill_no || transferOrder.out_bill_no, 64);
		let st = normalizeTransferState(first.state || '');
		let transferBillNo = safeText(first.transfer_bill_no || '', 80);
		let hasFailed = false;
		let hasPending = false;
		if (st !== 'SUCCESS') {
			try {
				if (st === 'INIT') {
					await wxPayMerchantTransferToOpenid(wc, {
						appid: wc.appId,
						openid,
						amountFen: Number(first.transfer_amount_fen || transferOrder.final_refund_fen || 0),
						outBillNo,
						reason
					});
				}
				const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
				st = normalizeTransferState(q?.state || q?.status || st);
				transferBillNo = safeText(q?.transfer_bill_no || transferBillNo, 80);
				first.query_resp = q || {};
				first.last_error = '';
			} catch (e) {
				const detail =
					e && e.name === 'WxPayRequestError' && e.wxBody
						? e.wxBody.message || e.wxBody.code || e.message
						: e.message || 'merchant transfer failed';
				first.last_error = safeText(String(detail), 200);
				if (String(detail).toLowerCase().includes('out_bill_no')) {
					try {
						const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
						st = normalizeTransferState(q?.state || q?.status || st);
						transferBillNo = safeText(q?.transfer_bill_no || transferBillNo, 80);
						first.query_resp = q || {};
					} catch (qe) {
						hasFailed = true;
					}
				} else {
					hasFailed = true;
				}
			}
		}
		first.state = st;
		first.transfer_bill_no = transferBillNo;
		if (st === 'SUCCESS') first.transfer_time = nowTs();
		if (['FAIL', 'FAILED', 'CANCELLED'].includes(st)) hasFailed = true;
		if (st !== 'SUCCESS' && !['FAIL', 'FAILED', 'CANCELLED'].includes(st)) hasPending = true;
		items = [first];
		let batchState = 'PROCESSING';
		if (hasFailed) batchState = 'FAILED';
		else if (!hasPending) batchState = 'SUCCESS';
		await transferOrderCollection.doc(transferOrder._id).update({
			state: batchState,
			transfer_items: items,
			update_time: nowTs()
		});
		transferOrder.state = batchState;
		transferOrder.transfer_items = items;
		const itemResults = [
			{
				outBillNo,
				state: first.state,
				transferBillNo: transferBillNo || '',
				error: first.last_error || ''
			}
		];

		if (batchState === 'SUCCESS') {
			await finalizeTransferSuccessIfNeeded(transferOrder, event);
			return {
				code: 0,
				message: '退款打款成功',
				data: {
					refundNo: transferOrder.refund_no,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdownPhase,
					outBillNo: transferOrder.refund_no,
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
					refundNo: transferOrder.refund_no,
					outBillNo: transferOrder.refund_no,
					refundState: batchState,
					refundItems: itemResults
				}
			};
		}
		return {
			code: 409,
			message: '退款打款处理中，请稍后查询结果',
			data: {
				refundNo: transferOrder.refund_no,
				outBillNo: transferOrder.refund_no,
				refundState: batchState,
				refundItems: itemResults
			}
		};
	} catch (e) {
		console.error('runRefundMerchantTransferPipeline failed', e);
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
	const parts = [{ is_deleted: false, refund_mode: 'merchant_transfer' }];
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
		reason: safeText(row.reason || '', 120),
		applied: !!row.applied,
		createTime: formatTime(row.create_time),
		updateTime: formatTime(row.update_time)
	};
}

async function refundTransferSummary(whereExpr) {
	try {
		const $ = db.command.aggregate;
		// 仅统计已完成的退款（处理中/待审核等不计入顶部合计）
		const matchExpr = db.command.and([whereExpr, { state: 'SUCCESS', applied: true }]);
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
		const processingStates = ['PROCESSING', 'ACCEPTED', 'WAIT_USER_CONFIRM', 'UNKNOWN'];
		const res = await transferOrderCollection
			.where({
				is_deleted: false,
				refund_mode: 'merchant_transfer',
				audit_required: true,
				audit_status: 'pending',
				state: db.command.in(processingStates)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get();
		const rows = res.data || [];
		let success = 0;
		let failed = 0;
		let processing = 0;
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) throw new Error(cfg.message);
		const wc = cfg.creds;
		for (const row of rows) {
			const merchant = await getMerchantByIdOrUserId(row.merchant_id);
			if (!merchant) continue;
			const openid = safeText(merchant.wx_openid, 100);
			if (!openid) continue;
			const reason = safeText(row.reason || '用户申请退款', 80);
			try {
				const q = await wxPayQueryMerchantTransfer(wc, safeText(row.out_bill_no || row.refund_no, 64));
				const state = normalizeTransferState(q?.state || q?.status || '');
				const billNo = safeText(q?.transfer_bill_no || '', 80);
				await writeTransferLog({
					stage: 'refund_auto_poll_query',
					withdrawNo: row.refund_no,
					merchantUserId: row.merchant_user_id,
					outBillNo: row.out_bill_no,
					transferState: state,
					message: '自动轮询 H5 退款商家转账',
					payload: q || {}
				});
				if (state === 'SUCCESS') {
					const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
					const first = { ...(items[0] || {}) };
					first.state = 'SUCCESS';
					first.transfer_bill_no = billNo;
					first.query_resp = q || {};
					first.transfer_time = nowTs();
					await transferOrderCollection.doc(row._id).update({
						state: 'SUCCESS',
						transfer_items: [first],
						update_time: nowTs()
					});
					const merged = { ...row, state: 'SUCCESS', transfer_items: [first] };
					await finalizeTransferSuccessIfNeeded(merged, {});
					success += 1;
					continue;
				}
				if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
					const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
					const first = { ...(items[0] || {}) };
					first.state = state;
					first.last_error = safeText(q?.fail_reason || q?.message || state, 200);
					await transferOrderCollection.doc(row._id).update({
						state: 'FAILED',
						transfer_items: [first],
						update_time: nowTs()
					});
					failed += 1;
					continue;
				}
				const polledPkg = pickTransferPackageInfo(q);
				const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
				const first = { ...(items[0] || {}) };
				first.state = state || 'PROCESSING';
				first.transfer_bill_no = billNo;
				if (polledPkg) first.query_resp = q || {};
				await transferOrderCollection.doc(row._id).update({
					state: 'PROCESSING',
					transfer_items: [first],
					...(polledPkg ? { package_info: safeText(polledPkg, 1200) } : {}),
					update_time: nowTs()
				});
				processing += 1;
			} catch (e) {
				await writeTransferLog({
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
		if (!['approve', 'reject'].includes(actionType)) return { code: 400, message: '审批动作无效' };
		const oldRes = await transferOrderCollection.doc(id).get();
		const row = oldRes.data && oldRes.data[0];
		if (!row || row.is_deleted) return { code: 404, message: '退款单不存在' };
		if (safeText(row.refund_mode, 40) !== 'merchant_transfer') {
			return { code: 400, message: '非 H5 商家转账退款单' };
		}
		const now = nowTs();
		if (actionType === 'reject') {
			if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
			if (safeText(row.audit_status, 20) !== 'pending') return { code: 400, message: '该记录不是待审核状态' };
			const rowSt = safeText(row.state, 24);
			if (rowSt === 'SUCCESS' || rowSt === 'PROCESSING') {
				return { code: 400, message: '打款处理中或已成功，请稍后再试或联系技术' };
			}
			await transferOrderCollection.doc(id).update({
				audit_status: 'rejected',
				audit_time: now,
				state: 'REJECTED',
				is_deleted: true,
				update_time: now
			});
			return { code: 0, message: '已拒绝该退款申请，用户可重新发起' };
		}
		if (!row.audit_required) return { code: 400, message: '该记录无需审核' };
		if (safeText(row.audit_status, 20) !== 'pending') return { code: 400, message: '该记录不是待审核状态' };
		if (row.applied) return { code: 400, message: '该退款已完成入账' };
		const rowSt0 = safeText(row.state, 24);
		if (rowSt0 === 'SUCCESS') return { code: 400, message: '该退款已成功' };
		const merchant = await getMerchantByIdOrUserId(row.merchant_id);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const openid = safeText(merchant.wx_openid, 100);
		if (!openid) return { code: 400, message: '商户缺少 openid，无法打款' };
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		const reason = safeText(row.reason || '用户申请退款', 80);
		await writeTransferLog({
			stage: 'refund_admin_approve',
			withdrawNo: row.refund_no,
			merchantUserId: row.merchant_user_id,
			outBillNo: row.out_bill_no,
			message: '管理员同意 H5 充值退款并发起商家转账',
			payload: { id, actionType }
		});
		const pipe = await runRefundMerchantTransferPipeline(row, merchant, event, {
			wc,
			openid,
			reason,
			countdownPhase: ''
		});
		if (pipe.code === 0) {
			await transferOrderCollection.doc(id).update({
				audit_status: 'approved',
				audit_time: now,
				update_time: nowTs()
			});
			return pipe;
		}
		if (pipe.code === 409) {
			return pipe;
		}
		return pipe;
	} catch (e) {
		console.error('refundTransferApprove failed', e);
		return { code: 500, message: safeText(e?.message || '审批失败', 200) };
	}
}

/**
 * 解析当前商户在「退款与周期」场景下的 bizKey、是否需审核、已存在的转账单等，供 H5 退款页与 h5RefundReset 共用。
 */
async function resolveH5RefundOrderContext(merchant, event) {
	const cfgW = ensureWxWithdrawPayConfig();
	if (!cfgW.ok) return { ok: false, code: 500, message: cfgW.message };
	const wc = cfgW.creds;
	const openid = safeText(merchant.wx_openid, 100);
	if (!openid) return { ok: false, code: 400, message: '当前账号缺少微信openid，请重新登录后再试' };
	const biz = await getBizSettings();
	const member = isH5RechargeMemberForWithdraw(merchant);
	const rtc = biz.refundTransferAudit || {};
	const needRefundAudit = member ? !!rtc.memberRequired : !!rtc.nonMemberRequired;
	const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
	const countdown = computeRechargeCountdown(merchant.recharge_cycle_start, nowTs(), cycleCfg.cycleDays, cycleCfg.windowDays);
	const merchantUserId = merchant.user_id || merchant._id;
	const logs = await operationLogCollection.where({ user_id: merchantUserId, action: 'h5_quota_recharge', refunded: false }).limit(1000).get();
	const rows = logs.data || [];
	const now = nowTs();
	let refundAmount = Number(Number(merchant.recharge_total_yuan || 0).toFixed(2));
	if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
		refundAmount = 0;
		rows.forEach((x) => {
			refundAmount += Number(x.package_price || 0);
		});
		refundAmount = Number(refundAmount.toFixed(2));
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
			refundAmount: 0,
			penaltyAmount: 0,
			finalRefundAmount: 0,
			targetRefundFen: 0,
			bizKey: '',
			transferOrder: null,
			now
		};
	}
	let penaltyAmount = 0;
	if (countdown.phase === 'lock') {
		penaltyAmount = Number((refundAmount * 0.5).toFixed(2));
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
			refundAmount,
			penaltyAmount,
			finalRefundAmount,
			targetRefundFen: 0,
			bizKey: '',
			transferOrder: null,
			now
		};
	}
	const bizKey = `${merchant._id}_${targetRefundFen}_${countdown.phase}_${Number(merchant.recharge_cycle_start || 0)}_${refundAmount.toFixed(2)}_${rows
		.map((x) => x._id)
		.sort()
		.join('_')}`;
	const existRes = await transferOrderCollection.where({ biz_key: bizKey, is_deleted: false }).limit(1).get();
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
		refundAmount,
		penaltyAmount,
		finalRefundAmount,
		targetRefundFen,
		bizKey,
		transferOrder,
		now,
		openid
	};
}

function buildH5RefundUiFromContext(ctx) {
	const d = {
		phase: 'idle',
		outBillNo: '',
		refundNo: '',
		wxItemState: '',
		batchState: '',
		needRefundAudit: !!ctx.needRefundAudit,
		refundable: ctx.refundable !== false,
		refundAmount: Number(ctx.refundAmount || 0).toFixed(2),
		penaltyAmount: Number(ctx.penaltyAmount || 0).toFixed(2),
		finalRefundAmount: Number(ctx.finalRefundAmount || 0).toFixed(2)
	};
	if (!ctx.ok || !ctx.refundable) return d;
	const ord = ctx.transferOrder;
	if (!ord) return d;
	const outBillNo = safeText(ord.out_bill_no || ord.refund_no, 64);
	d.outBillNo = outBillNo;
	d.refundNo = safeText(ord.refund_no, 64);
	d.batchState = safeText(ord.state, 24);
	const items = Array.isArray(ord.transfer_items) ? ord.transfer_items : [];
	const first = items[0] || {};
	d.wxItemState = normalizeTransferState(first.state || '');
	if (ord.audit_required && safeText(ord.audit_status, 20) === 'pending' && d.batchState === 'PENDING_AUDIT') {
		d.phase = 'auditing';
		return d;
	}
	if (ord.applied && d.batchState === 'SUCCESS') {
		d.phase = 'done';
		return d;
	}
	if (d.batchState === 'FAILED') {
		// 与未申请时一致：允许用户再次点击「申请退款」重试
		d.phase = 'idle';
		return d;
	}
	if (d.wxItemState === 'WAIT_USER_CONFIRM') {
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
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		if (isH5SilverMemberForWithdraw(merchant)) {
			return { code: 400, message: '白银会员不可申请退款' };
		}
		const tokenCheck = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
		if (!tokenCheck.ok) return { code: tokenCheck.code || 403, message: tokenCheck.message || '退款入口无效' };
		const refundNo = safeText(data?.refundNo || data?.outBillNo, 64);
		if (!refundNo) return { code: 400, message: '缺少退款单号' };
		const ordRes = await transferOrderCollection
			.where({ merchant_id: merchant._id, out_bill_no: refundNo, is_deleted: false, refund_mode: 'merchant_transfer' })
			.limit(1)
			.get();
		const row = ordRes.data && ordRes.data[0];
		if (!row) return { code: 404, message: '退款单不存在' };
		const cfg = ensureWxWithdrawPayConfig();
		if (!cfg.ok) return { code: 500, message: cfg.message };
		const wc = cfg.creds;
		let q = null;
		const items = Array.isArray(row.transfer_items) ? row.transfer_items.map((x) => ({ ...x })) : [];
		let first = { ...(items[0] || { out_bill_no: refundNo, state: 'INIT' }) };
		let state = normalizeTransferState(first.state || row.state || '');
		try {
			q = await wxPayQueryMerchantTransfer(wc, refundNo);
			state = normalizeTransferState(q?.state || q?.status || state);
			const qPkgEarly = pickTransferPackageInfo(q);
			first.state = state;
			first.transfer_bill_no = safeText(q?.transfer_bill_no || first.transfer_bill_no || '', 80);
			first.query_resp = q || {};
			await transferOrderCollection.doc(row._id).update({
				state: state === 'SUCCESS' ? 'SUCCESS' : state === 'WAIT_USER_CONFIRM' ? 'PROCESSING' : row.state,
				transfer_items: [first],
				...(qPkgEarly ? { package_info: safeText(qPkgEarly, 1200) } : {}),
				update_time: nowTs()
			});
		} catch (e) {
			await writeTransferLog({
				stage: 'h5_refund_confirm_query_error',
				level: 'error',
				withdrawNo: refundNo,
				merchantUserId: merchant.user_id || merchant._id,
				outBillNo: refundNo,
				message: safeText(e?.message || '查询退款转账状态失败', 180)
			});
		}
		if (state === 'SUCCESS') {
			const merged = { ...row, state: 'SUCCESS', transfer_items: [first] };
			await finalizeTransferSuccessIfNeeded(merged, {});
			return { code: 400, message: '该笔退款已到账，无需再次确认' };
		}
		if (['FAIL', 'FAILED', 'CANCELLED'].includes(state)) {
			return { code: 400, message: `当前状态为${state}，请联系管理员或稍后重试` };
		}
		const packageInfo = safeText(
			pickTransferPackageInfo(q) || pickTransferPackageInfo(row) || row.package_info || '',
			1200
		);
		if (state !== 'WAIT_USER_CONFIRM' || !packageInfo) {
			return { code: 400, message: '当前暂无可拉起的确认收款，请稍后再试' };
		}
		await transferOrderCollection.doc(row._id).update({
			package_info: packageInfo,
			transfer_items: [first],
			state: 'PROCESSING',
			update_time: nowTs()
		});
		await writeTransferLog({
			stage: 'h5_refund_confirm_package_ready',
			withdrawNo: refundNo,
			merchantUserId: merchant.user_id || merchant._id,
			outBillNo: refundNo,
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
				withdrawNo: refundNo,
				refundNo,
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
		const tokenCheck = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
		if (!tokenCheck.ok) return { code: tokenCheck.code || 403, message: tokenCheck.message || '退款入口无效' };
		const ctx = await resolveH5RefundOrderContext(merchant, event);
		if (!ctx.ok) return { code: ctx.code, message: ctx.message };
		if (!ctx.refundable) {
			return { code: 400, message: '暂无可退款充值金额' };
		}
		const { wc, needRefundAudit, countdown, rows, refundAmount, penaltyAmount, finalRefundAmount, targetRefundFen, now } = ctx;
		let transferOrder = ctx.transferOrder;
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
			const addRes = await transferOrderCollection.add({
				biz_key: ctx.bizKey,
				merchant_id: merchant._id,
				merchant_user_id: merchant.user_id || merchant._id,
				recharge_log_ids: rows.map((x) => x._id).filter(Boolean),
				refund_no: refundNo,
				out_bill_no: refundNo,
				transfer_mch_id: wc.mchId,
				refund_mode: 'merchant_transfer',
				transfer_items: [
					{
						out_bill_no: refundNo,
						transfer_amount_fen: targetRefundFen,
						state: 'INIT',
						transfer_bill_no: '',
						last_error: ''
					}
				],
				refund_amount: Number(refundAmount || 0),
				penalty_amount: Number(penaltyAmount || 0),
				final_refund_amount: Number(finalRefundAmount || 0),
				final_refund_fen: targetRefundFen,
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
		const chk = await validateRefundEntryToken(merchant._id, pickRefundEntryToken(data));
		if (!chk.ok) return { code: chk.code || 403, message: chk.message || '退款入口无效' };
		const exp = Number(chk.row?.expire_time || 0);
		const ctx = await resolveH5RefundOrderContext(merchant, {});
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
		const ordRes = await transferOrderCollection
			.where({ out_bill_no: outBillNo, merchant_id: merchant._id, is_deleted: false })
			.limit(1)
			.get();
		const ord = ordRes.data && ordRes.data[0];
		if (!ord) return { code: 404, message: '退款单不存在' };
		if (ord.refund_mode === 'merchant_transfer') {
			const wc = wxCredentialsByMchId(ord.transfer_mch_id) || wxWithdrawCredentials();
			const first = Array.isArray(ord.transfer_items) && ord.transfer_items.length ? { ...ord.transfer_items[0] } : {
				out_bill_no: outBillNo,
				state: ord.state || 'PROCESSING'
			};
			let st = normalizeTransferState(first.state || ord.state || '');
			try {
				const q = await wxPayQueryMerchantTransfer(wc, outBillNo);
				first.query_resp = q || {};
				st = normalizeTransferState(q?.state || q?.status || st);
				first.transfer_bill_no = safeText(q?.transfer_bill_no || first.transfer_bill_no || '', 80);
				first.last_error = '';
				if (st === 'SUCCESS') first.transfer_time = nowTs();
				await writeTransferLog({
					stage: 'transfer_status_query',
					withdrawNo: outBillNo,
					merchantUserId: merchant.user_id || merchant._id,
					outBillNo,
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
					withdrawNo: outBillNo,
					merchantUserId: merchant.user_id || merchant._id,
					outBillNo,
					transferState: st,
					message: first.last_error
				});
			}
			first.state = st;
			const batchState = st === 'SUCCESS' ? 'SUCCESS' : (['FAIL', 'FAILED', 'CANCELLED'].includes(st) ? 'FAILED' : 'PROCESSING');
			await transferOrderCollection.doc(ord._id).update({
				state: batchState,
				transfer_items: [first],
				update_time: nowTs()
			});
			ord.state = batchState;
			ord.transfer_items = [first];
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
					transferBillNo: safeText(first.transfer_bill_no || '', 80)
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

function monthNo(ts) {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

async function finalizeTransferSuccessIfNeeded(transferOrder, event) {
	if (!transferOrder || transferOrder.applied) return;
	const merchantId = safeText(transferOrder.merchant_id, 80);
	if (!merchantId) return;
	const merchant = await getMerchantByIdOrUserId(merchantId);
	if (!merchant) return;
	const now = nowTs();
	const rechargeLogIds = Array.isArray(transferOrder.recharge_log_ids) ? transferOrder.recharge_log_ids.filter(Boolean) : [];
	if (rechargeLogIds.length) {
		await operationLogCollection.where({ _id: db.command.in(rechargeLogIds) }).update({ refunded: true, refund_time: now });
	}
	await merchantCollection.doc(merchant._id).update({
		remaining_quota: 0,
		estimated_free_quota: 0,
		recharge_package_id: '',
		recharge_package_price: 0,
		recharge_package_quota: 0,
		recharge_cycle_start: 0,
		recharge_total_yuan: 0,
		update_time: now
	});
	await operationLogCollection.add({
		user_id: merchant.user_id || merchant._id,
		user_name: merchant.wx_nickname || merchant.mobile || 'H5用户',
		action: 'h5_refund_reset',
		module: 'finance',
		target_id: merchant._id,
		target_name: merchant.wx_nickname || merchant.mobile || merchant._id,
		content: 'H5退款：原路退款成功并清空充值权益额度（待提现/历史提现/奖励/积分不变）',
		operator_source: 'h5',
		operator: getOperator(event),
		platform_no: transferOrder.out_bill_no || transferOrder.refund_no || '',
		refund_amount: Number(transferOrder.refund_amount || 0),
		refund_penalty_amount: Number(transferOrder.penalty_amount || 0),
		refund_final_amount: Number(transferOrder.final_refund_amount || 0),
		refund_reason: safeText(transferOrder.reason || '', 80),
		create_time: now
	});
	await transferOrderCollection.doc(transferOrder._id).update({
		applied: true,
		applied_at: now,
		update_time: now
	});
}

/** 自然月 YYYY-MM（北京时间） */
function shanghaiYearMonthFromTs(ts) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit'
	}).formatToParts(new Date(Number(ts)));
	let y = '';
	let mo = '';
	for (const p of parts) {
		if (p.type === 'year') y = p.value;
		if (p.type === 'month') mo = p.value;
	}
	if (!y || mo === '') return monthNo(ts);
	return `${y}-${String(mo).padStart(2, '0')}`;
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
function computePendingReturnBucketsForTrades(tradeRows, nowTs) {
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
		const raRaw = row.release_amount;
		const r =
			raRaw != null && raRaw !== '' && Number.isFinite(Number(raRaw))
				? Number(raRaw)
				: Number((cb / (amount > 300 ? 5 : 1)).toFixed(4));
		if (!Number.isFinite(r) || r <= 0) continue;
		const rr = Number(row.release_ratio);
		const installments = Number.isFinite(rr) && rr >= 99 ? 1 : (amount > 300 ? 5 : 1);
		const ts = Number(row.create_time || 0);
		const tradeYm = shanghaiYearMonthFromTs(ts);
		for (let k = 0; k < installments; k += 1) {
			const targetYm = addCalendarMonthsYm(tradeYm, k);
			if (String(targetYm).localeCompare(curYm) < 0) continue;
			buckets[targetYm] = Number(((buckets[targetYm] || 0) + r).toFixed(4));
		}
	}
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

/**
 * 商户列表批量：按账号 user_id 计算「未来月待返」冻结额（与 h5PendingReturnPoints 同一套交易口径）。
 */
async function batchComputeFutureDeferredFrozenForMerchants(merchantDocs, nowTs) {
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

	const tradePartsBase = [
		{ user_id: _.in(uids) },
		{ trade_type: 'real' },
		{ stats_eligible: _.neq(false) },
		{ amount: _.gt(0) },
		{ is_deleted: _.neq(true) },
		_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
	];
	const tRes = await machineTradeCollection
		.where(_.and(tradePartsBase))
		.field({
			user_id: true,
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

	for (const m of rows) {
		const uid = String(m.user_id || m._id || '');
		if (!uid) continue;
		let userRows = rowsByUser.get(uid) || [];
		const bt = bindTsForMerchant(m);
		if (bt) {
			userRows = userRows.filter((r) => Number(r.create_time || 0) >= bt);
		}
		const { buckets, curYm } = computePendingReturnBucketsForTrades(userRows, nowTs);
		frozenByUid.set(uid, sumFutureDeferredFrozenYuanFromBuckets(buckets, curYm));
	}
	return frozenByUid;
}

/**
 * H5 待返积分汇总口径：
 * - 300元以下（含300）流水：首期返现100%，仅计入当月；
 * - 300元以上流水：按5期（每期约20%）计入交易当月及后续月份。
 * 仅汇总当前月及之后月份（理论值，不含已过期月份）。
 */
async function h5PendingReturnPoints(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const now = nowTs();
		let bindTs = Number(merchant.bind_time || 0);
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		for (const mach of boundMachines) {
			if (mach && mach.bind_time) bindTs = Math.max(bindTs, Number(mach.bind_time || 0));
		}
		const _ = db.command;
		const tradeParts = [
			{ user_id: merchantUserId },
			{ trade_type: 'real' },
			{ stats_eligible: _.neq(false) },
			{ amount: _.gt(0) },
			{ is_deleted: _.neq(true) },
			_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
		];
		if (bindTs) tradeParts.push({ create_time: _.gte(bindTs) });
		const tradeWhere = _.and(tradeParts);
		const tRes = await machineTradeCollection
			.where(tradeWhere)
			.field({ amount: true, cashback: true, release_amount: true, release_ratio: true, create_time: true })
			.limit(8000)
			.get();
		const { buckets, curYm } = computePendingReturnBucketsForTrades(tRes.data || [], now);
		const months = Object.keys(buckets).sort();
		const list = months.map((ym) => {
			const pts = buckets[ym];
			return {
				month: ym,
				monthLabel: ymToDisplayLabel(ym),
				points: Number(pts.toFixed(2))
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
				totalUpcoming: Number(totalUpcoming.toFixed(2)),
				futureDeferredFrozenYuan,
				ruleNote:
					'统计说明：300元以下（含300）流水首期返现100%仅计入当月；300元以上流水按5期（每期约20%）计入交易当月及后续月份。仅展示当前月及未来月份；已过去月份不计入。实际可领额度以「收益」页待领取记录为准。'
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
		if (!(amount > 0)) continue;
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
		if (scope === 'selected' && !lines.length) return { code: 400, message: '请填写至少一个商户（user_id 或手机号）' };

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

async function h5IncomeList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const now = nowTs();
		try {
			await subsidyEngine.syncSubsidyPackets(db, merchant, now);
		} catch (e) {
			console.error('syncSubsidyPackets', e);
		}
		try {
			await syncCouponInstancesForMerchant(merchant, now);
		} catch (e) {
			console.error('syncCouponInstancesForMerchant', e);
		}
		const pendingRes = await incomePacketCollection
			.where({ merchant_user_id: merchantUserId, is_deleted: false, status: 'pending' })
			.orderBy('create_time', 'desc')
			.limit(100)
			.get();
		const pendingRows = (pendingRes.data || []).filter((x) => {
			if (x.expire_time && x.expire_time < now) return false;
			if (!Number(x.claim_open_time || 0)) return false;
			if (x.claim_open_time && x.claim_open_time > now) return false;
			return true;
		});
		let pendingTotal = 0;
		for (const x of pendingRows) {
			pendingTotal += Number(x.amount || 0);
		}
		const packets = pendingRows.map((x) => ({
			id: x._id,
			title: x.title || '手续费补贴',
			amount: Number(x.amount || 0).toFixed(2),
			monthNo: x.month_no || '',
			status: x.status,
			createTime: formatTime(x.create_time)
		}));
		const claimedRes = await incomePacketCollection
			.where({ merchant_user_id: merchantUserId, is_deleted: false, status: 'claimed' })
			.orderBy('claimed_time', 'desc')
			.limit(50)
			.get();
		const detailList = (claimedRes.data || []).map((x) => ({
			id: x._id,
			title: x.title || '手续费补贴',
			amount: Number(x.amount || 0).toFixed(2),
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
				pendingCount: pendingRows.length,
				detailList,
				subsidyTicker,
				summary: {
					accountPoints: Number(merchant.account_points || 0).toFixed(2),
					availableReward: Number(merchant.available_reward || 0).toFixed(2)
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
	if (!ids.length) return { claimedCount: 0, claimedAmount: 0 };
	const now = nowTs();
	const merchantUserId = merchant.user_id || merchant._id;
	const res = await incomePacketCollection
		.where({ _id: db.command.in(ids), merchant_user_id: merchantUserId, status: 'pending', is_deleted: false })
		.get();
	const rows = res.data || [];
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
	for (const row of rows) {
		if (row.expire_time && row.expire_time < now) continue;
		if (!Number(row.claim_open_time || 0)) continue;
		if (row.claim_open_time && row.claim_open_time > now) continue;
		const need = row.unlock_flow_yuan != null ? Number(row.unlock_flow_yuan) : null;
		if (need != null && Number.isFinite(need) && flowThisMonth + 1e-6 < need) continue;
		const amt = Number(row.amount || 0);
		claimedAmount += amt;
		claimedIds.push(row._id);
		await incomePacketCollection.doc(row._id).update({
			status: 'claimed',
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
			available_reward: Number(merchant.available_reward || 0) + claimedAmount,
			account_points: Number(merchant.account_points || 0) + claimedAmount
		};
		await merchantCollection.doc(merchant._id).update(merchantUpd);
		const boundMachines = await listBoundMachinesByMerchant(merchant);
		const m = pickPrimaryBoundMachine(merchant, boundMachines);
		if (m) {
			const nextFrozen = Math.max(0, Number(Number(m.frozen_amount || 0) - claimedAmount).toFixed(4));
			await machineCollection.doc(m._id).update({
				frozen_amount: nextFrozen,
				pending_amount: Number((Number(m.pending_amount || 0) + claimedAmount).toFixed(4))
			});
		}
	}
	return { claimedCount: claimedIds.length, claimedAmount };
}

async function h5IncomeClaim(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const packetId = safeText(data?.packetId, 80);
		if (!packetId) return { code: 400, message: '缺少红包标识' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const result = await claimPackets(merchant, [packetId]);
		if (!result.claimedCount) return { code: 400, message: '红包已被领取或不存在' };
		return { code: 0, message: '领取成功', data: result };
	} catch (e) {
		console.error('h5IncomeClaim failed', e);
		return { code: 500, message: '领取失败' };
	}
}

async function h5IncomeClaimAll(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const pending = await incomePacketCollection
			.where({ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false })
			.limit(100)
			.get();
		const ids = (pending.data || []).map((x) => x._id);
		const result = await claimPackets(merchant, ids);
		return { code: 0, message: '领取成功', data: result };
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
			estimated_free_quota: 0,
			account_points: 0
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
		adminName: row.admin_name || '',
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

async function feedbackAdminReply(data, context) {
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
		const operator = await getAdminDisplayName(context);
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

async function feedbackAdminSendRefundEntry(data, context) {
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
		const expireAt = 0;
		const operator = await getAdminDisplayName(context);
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
			`当前商户退款流程需管理员审核，入口在审核开启期间可持续使用；` +
			`若后续关闭退款审核，入口将自动失效。`;
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
		const startAt = now;
		const endAt = now + memberDays * 24 * 60 * 60 * 1000;
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
			update_time: now
		});
		return { code: 0, message: '兑换成功', data: { memberDays, startAt, endAt } };
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
		const title = `${price}元套餐`;
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

async function bizConfigGet() {
	try {
		const value = await getBizSettings();
		return { code: 0, message: 'ok', data: value };
	} catch (error) {
		console.error('bizConfigGet failed:', error);
		return { code: 500, message: '获取参数配置失败' };
	}
}

async function bizConfigSave(data, event) {
	try {
		const now = nowTs();
		const val = sanitizeBizSettings(data || {});
		const operator = getOperator(event);
		const exist = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(1).get();
		if (exist.data && exist.data.length) {
			await systemSettingCollection.doc(exist.data[0]._id).update({
				value: val,
				update_time: now,
				update_user: operator
			});
		} else {
			await systemSettingCollection.add({
				key: BIZ_SETTING_KEY,
				value: val,
				create_time: now,
				update_time: now,
				update_user: operator
			});
		}
		bizSettingsCache = null;
		bizSettingsCacheAt = 0;
		await redisH5.h5RedisDel(REDIS_KEY_BIZ);
		return { code: 0, message: '保存成功' };
	} catch (error) {
		console.error('bizConfigSave failed:', error);
		return { code: 500, message: '保存参数配置失败' };
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
		case 'simulateRegister':
			return await simulateRegister(actualData);
		case 'offlineFirstRecharge':
			return await offlineFirstRecharge(actualData, event);
		case 'withdrawList':
			return await getWithdrawList(actualData);
		case 'withdrawSyncProcessing':
			return await withdrawSyncProcessing(actualData);
		case 'refundTransferList':
			return await getRefundTransferList(actualData);
		case 'refundTransferSyncProcessing':
			return await refundTransferSyncProcessing(actualData);
		case 'refundTransferApprove':
			return await refundTransferApprove(actualData, event);
		case 'tradeBillList':
			return await tradeBillList(actualData);
		case 'tradeBillDelete':
			return await tradeBillDelete(actualData, event);
		case 'financeMerchantFlowList':
			return await financeMerchantFlowList(actualData);
		case 'withdrawExportCsv':
			return await exportWithdrawCsv(actualData);
		case 'withdrawApprove':
			return await withdrawApprove(actualData);
		case 'withdrawDelete':
			return await withdrawDelete(actualData, event);
		case 'rechargeGiftShipmentList':
			return await rechargeGiftShipmentList(actualData);
		case 'rechargeGiftShipmentUpdate':
			return await rechargeGiftShipmentUpdate(actualData, event);
		case 'h5AuthSync':
			return await h5AuthSync(actualData);
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
		case 'h5FinanceRecords':
			return await h5FinanceRecords(actualData);
		case 'h5MineInfo':
			return await applyH5GzipIfRequested(await h5MineInfo(actualData), actualData);
		case 'h5WithdrawInfo':
			return await h5WithdrawInfo(actualData);
		case 'h5WithdrawApply':
			return await h5WithdrawApply(actualData);
		case 'h5WithdrawConfirmPackage':
			return await h5WithdrawConfirmPackage(actualData);
		case 'h5HomeDashboard':
			return await applyH5GzipIfRequested(await h5HomeDashboard(actualData), actualData);
		case 'h5SignAgreement':
			return await h5SignAgreement(actualData);
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
			return await feedbackAdminReply(actualData, context);
		case 'feedbackAdminSendRefundEntry':
			return await feedbackAdminSendRefundEntry(actualData, context);
		case 'bizConfigGet':
			return await bizConfigGet();
		case 'bizConfigSave':
			return await bizConfigSave(actualData, event);
		case 'debugGetEgressIp':
			return await debugGetEgressIp();
		default:
			return { code: 400, message: '无效的操作' };
	}
};

