'use strict';

const db = uniCloud.database();
const merchantCollection = db.collection('hsy-merchant-users');
const withdrawCollection = db.collection('hsy-withdraw-records');
const couponCollection = db.collection('hsy-coupons');
const quotaCollection = db.collection('hsy-quota-packages');
const machineCollection = db.collection('hsy-machine');
const operationLogCollection = db.collection('hsy-operation-logs');
const incomePacketCollection = db.collection('hsy-income-packets');
const machineTradeCollection = db.collection('hsy-machine-trades');
const uniPayOrderCollection = db.collection('uni-pay-orders');
const mobileCodeCollection = db.collection('hsy-h5-mobile-codes');
const feedbackTicketCollection = db.collection('hsy-h5-feedback');
const feedbackMessageCollection = db.collection('hsy-h5-feedback-messages');
const systemSettingCollection = db.collection('hsy-system-settings');
const transferOrderCollection = db.collection('hsy-transfer-orders');
const subsidyEngine = require('./subsidy-engine.js');

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

function formatTime(timestamp) {
	if (!timestamp) return '';
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function toMoney(amount) {
	const num = Number(amount || 0);
	return `￥${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
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
			microMerchant = '',
			loginTimeStart = '',
			loginTimeEnd = ''
		} = data || {};

		let query = merchantCollection;

		const where = {};
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

		if (loginTimeStart) where.login_time = db.command.gte(Number(loginTimeStart));
		if (loginTimeEnd) {
			where.login_time = where.login_time
				? db.command.and([where.login_time, db.command.lte(Number(loginTimeEnd))])
				: db.command.lte(Number(loginTimeEnd));
		}

		query = query.where(where);

		const countRes = await query.count();
		const total = countRes.total;

		const res = await query
			.orderBy('login_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();

		const list = res.data.map(item => ({
			id: item._id,
			userId: item.user_id || item._id,
			avatar: item.wx_avatar || '',
			agreement: item.agreement_img || '',
			deviceNo: item.device_id,
			deviceDisplay: `${item.device_id}/${item.brand_name || '-'}`,
			wxUser: `${item.wx_nickname || '-'}${item.mobile ? '/' + item.mobile : ''}`,
			remainingQuota: toMoney(item.remaining_quota),
			pendingWithdraw: toMoney(item.pending_withdraw),
			withdrawn: toMoney(item.withdrawn),
			frozenAmount: toMoney(item.frozen_amount),
			couponCount: item.coupon_count || 0,
			status: !!item.status,
			flag1: !!item.flag1,
			flag2: !!item.flag2,
			flag3: !!item.flag3,
			microMerchant: !!item.micro_merchant,
			useStatus: item.use_status === 1 ? '正常' : '异常',
			loginTime: formatTime(item.login_time)
		}));

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

async function withdrawApprove(data) {
	try {
		const id = safeText(data?.id, 80);
		const actionType = safeText(data?.actionType, 20); // pay | arrival | returned | expired
		if (!id) return { code: 400, message: '缺少提现记录ID' };
		if (!['pay', 'arrival', 'returned', 'expired'].includes(actionType)) {
			return { code: 400, message: '审批动作无效' };
		}

		const oldRes = await withdrawCollection.doc(id).get();
		const row = oldRes.data && oldRes.data[0];
		if (!row) return { code: 404, message: '提现记录不存在' };

		const now = nowTs();
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
		// 兼容代理/网关常见包裹：{success,data} / {code,data} / {result,data}
		for (let i = 0; i < 3; i++) {
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
		if (Object.prototype.hasOwnProperty.call(resp, 'success') && Object.prototype.hasOwnProperty.call(resp, 'data')) {
			payload = resp.data;
		}
		if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
			const nestedStatus = Number(payload.statusCode || payload.status || 0);
			if (nestedStatus) status = nestedStatus;
			payload = payload.data;
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
			const r = await uniCloud.httpProxyForEip.get(base, params);
			return normalizeProxyResp(r);
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
	const body = {
		appid: safeText(appid, 80),
		out_bill_no: safeText(outBillNo, 64),
		transfer_scene_id: safeText(WX_TRANSFER_SCENE_ID, 20),
		openid: safeText(openid, 128),
		transfer_amount: Math.round(Number(amountFen || 0)),
		transfer_remark: safeText(reason || 'H5退款补偿打款', 32)
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
	const grantDelta = Math.max(
		0,
		Number((grantYuanByRechargePrice(targetPrice, biz.rechargeRules) - grantYuanByRechargePrice(beforePrice, biz.rechargeRules)).toFixed(2))
	);
	const prevRem = Number(merchant.remaining_quota || 0);
	const afterRem = Number((prevRem + grantDelta).toFixed(2));
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
		estimated_free_quota: Number(custom.target_quota || 0),
		recharge_package_id: custom.package_id || '',
		recharge_package_price: targetPrice,
		recharge_package_quota: Number(custom.target_quota || 0),
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
	let res = await merchantCollection.where({ _id: val }).limit(1).get();
	if (res.data && res.data.length) return res.data[0];
	res = await merchantCollection.where({ user_id: val }).limit(1).get();
	return res.data && res.data.length ? res.data[0] : null;
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
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: 'wechat',
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !merchant.device_id,
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
		return {
			code: 0,
			message: '绑定成功',
			data: {
				needBindMobile: needBindMobileFlag(latest),
				needBind: !latest.device_id,
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
		return {
			code: 0,
			message: '登录成功',
			data: {
				authMode: profile.authMode,
				isNew: upsertRes.created,
				needBindMobile: false,
				needBind: !merchant.device_id,
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
		if (oldDeviceId && oldDeviceId === deviceId) {
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

		if (oldDeviceId) {
			const oldRes = await machineCollection.where({ device_id: oldDeviceId, is_deleted: false }).limit(1).get();
			if (oldRes.data && oldRes.data.length) {
				const oldM = oldRes.data[0];
				if (oldM.bind_user_id && oldM.bind_user_id !== (merchant.user_id || merchant._id)) {
					return { code: 400, message: '当前账号与已绑定机具不一致，请刷新后重试' };
				}
				await machineCollection.doc(oldM._id).update({
					is_bound: 2,
					bind_time: null,
					unbind_time: now,
					bind_user_id: '',
					bind_user_name: '',
					bind_user_mobile: '',
					last_reset_reason: 'H5换绑码牌'
				});
			}
		}

		await merchantCollection.doc(merchant._id).update({
			device_id: deviceId,
			brand_name: machine.brand_name || '',
			bind_time: now,
			login_time: now
		});
		await machineCollection.doc(machine._id).update({
			is_bound: 1,
			bind_time: now,
			bind_user_id: merchant.user_id || merchant._id,
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
			content: oldDeviceId ? `换绑码牌：${oldDeviceId} → ${deviceId}` : `绑定码牌：${deviceId}`,
			operator_source: 'h5',
			operator: getOperator(event),
			ip: event?.context?.CLIENTIP || '',
			create_time: now
		});

		const latest = await getMerchantByIdOrUserId(merchant._id);
		return { code: 0, message: oldDeviceId ? '换绑成功' : '绑定成功', data: { merchant: compactMerchantInfo(latest) } };
	} catch (e) {
		console.error('h5BindMachine failed', e);
		return { code: 500, message: '绑定失败' };
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
				action: db.command.in(['h5_bind_machine', 'unbind'])
			})
			.orderBy('create_time', 'desc')
			.limit(500)
			.get();

		const all = res.data || [];
		const total = all.length;
		const slice = all.slice(skip, skip + pageSize);
		const list = slice.map((row) => ({
			id: String(row._id),
			action: row.action === 'unbind' ? 'unbind' : 'bind',
			actionText: row.action === 'unbind' ? '解除绑定' : '绑定/换绑',
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

/** H5：财务流水（充值、退款、提现），支持时间与类型筛选 */
async function h5FinanceRecords(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const type = safeText(data?.recordType || data?.type || 'all', 20);
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 20)));
		const now = nowTs();
		let winStart = Number(data?.startTs || 0);
		let winEnd = Number(data?.endTs || 0);
		if (!winEnd) winEnd = now;
		if (!winStart) winStart = winEnd - 365 * 24 * 60 * 60 * 1000;

		const merged = [];

		const needRecharge = type === 'all' || type === 'recharge';
		const needRefund = type === 'all' || type === 'refund';
		const needWithdraw = type === 'all' || type === 'withdraw';

		if (needRecharge) {
			const r = await operationLogCollection
				.where({ user_id: merchantUserId, action: 'h5_quota_recharge' })
				.orderBy('create_time', 'desc')
				.limit(800)
				.get();
			for (const row of r.data || []) {
				const t = Number(row.create_time || 0);
				if (t < winStart || t > winEnd) continue;
				merged.push({
					recordType: 'recharge',
					id: `r_${row._id}`,
					time: t,
					timeText: formatTime(t),
					title: safeText(row.package_title || '额度充值', 80),
					subtitle: row.refunded ? '已退款' : '支付成功',
					amount: Number(row.package_price || 0).toFixed(2),
					amountLabel: '支付(元)',
					status: row.refunded ? '已退款' : '有效',
					extra: { platformNo: row.platform_no || '' }
				});
			}
		}

		if (needRefund) {
			const r = await operationLogCollection
				.where({ user_id: merchantUserId, action: 'h5_refund_reset' })
				.orderBy('create_time', 'desc')
				.limit(200)
				.get();
			for (const row of r.data || []) {
				const t = Number(row.create_time || 0);
				if (t < winStart || t > winEnd) continue;
				merged.push({
					recordType: 'refund',
					id: `f_${row._id}`,
					time: t,
					timeText: formatTime(t),
					title: 'H5退款',
					subtitle: safeText(row.content || '', 120),
					amount: Number(row.refund_final_amount || 0).toFixed(2),
					amountLabel: '实际返还(元)',
					status: '已发起',
					extra: {
						refundNo: row.platform_no || '',
						refundAmount: Number(row.refund_amount || 0).toFixed(2),
						penaltyAmount: Number(row.refund_penalty_amount || 0).toFixed(2)
					}
				});
			}
		}

		if (needWithdraw) {
			const r = await withdrawCollection
				.where({ merchant_user_id: merchantUserId, is_deleted: false })
				.orderBy('create_time', 'desc')
				.limit(500)
				.get();
			for (const row of r.data || []) {
				const t = Number(row.create_time || 0);
				if (t < winStart || t > winEnd) continue;
				let st = '处理中';
				if (row.is_paid) st = '已打款';
				else if (row.arrival_status === 'received') st = '已到账';
				else if (row.arrival_status === 'returned') st = '已退回';
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
						deviceId: row.device_id || ''
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

async function h5MineInfo(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		let merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		const unapplied = await uniPayOrderCollection
			.where({ user_id: merchantUserId, type: 'h5_quota_recharge', status: 1, user_order_success: true })
			.orderBy('create_date', 'desc')
			.limit(20)
			.get();
		for (const o of unapplied.data || []) {
			if (!(o.custom && o.custom.recharge_applied)) {
				await applyRechargeByOrder(o);
			}
		}
		merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const biz = await getBizSettings();
		const rewardByPackage = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		const rechargeRewardYuan = Number(rewardByPackage || 0);
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: compactMerchantInfo(merchant),
				account: {
					availableReward: Number(rechargeRewardYuan || 0).toFixed(2),
					estimatedFreeQuota: Number(merchant.estimated_free_quota || 0).toFixed(2),
					accountPoints: Number(merchant.account_points || 0).toFixed(2)
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
	{ price: 1000, rewardYuan: 7600, quota: 2000000, tip: '1000元配置200万交易量，等于补贴市场价的7600元手续费' }
];
const DEFAULT_BIZ_SETTINGS = {
	rechargeRules: DEFAULT_RECHARGE_RULES,
	withdrawRange: { memberMin: 10, memberMax: 200, nonMemberMin: 30, nonMemberMax: 200 },
	optimizeConfig: { enabled: true, thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 1 },
	refundCycle: { cycleDays: 180, windowDays: 3 },
	riskRates: { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 }
};

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
	return { rechargeRules: normRules, withdrawRange, optimizeConfig, refundCycle, riskRates };
}

async function getBizSettings() {
	try {
		const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(1).get();
		if (r.data && r.data.length) return sanitizeBizSettings(r.data[0].value || {});
	} catch (e) {
		console.error('getBizSettings failed', e);
	}
	return sanitizeBizSettings(DEFAULT_BIZ_SETTINGS);
}

function grantYuanByRechargePrice(price, rechargeRules = DEFAULT_RECHARGE_RULES) {
	let p = Number(price || 0);
	const defaultRules = (Array.isArray(DEFAULT_RECHARGE_RULES) ? DEFAULT_RECHARGE_RULES : []).slice().sort((a, b) => a.price - b.price);
	const rules = (Array.isArray(rechargeRules) ? rechargeRules : DEFAULT_RECHARGE_RULES).slice().sort((a, b) => a.price - b.price);
	// 0.1 元测试档与 600 档同权益：奖励计算按首档正式套餐金额处理
	if (p === 0.1 && rules.length) {
		p = Number(rules[0].price || 0);
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
	const quota = Number(merchant?.estimated_free_quota || merchant?.recharge_package_quota || 0);
	// H5 固定业务档位：100万=3800，150万=5700，200万=7600（不受后台误配置影响）
	if (quota >= 2000000) return 7600;
	if (quota >= 1500000) return 5700;
	if (quota >= 1000000) return 3800;
	const price = resolveRechargePriceForReward(merchant, rechargeRules);
	return grantYuanByRechargePrice(price, rechargeRules);
}

function h5MembershipInfo(merchant) {
	const pkg = pickRechargePackage(merchant.recharge_package_id) || getRechargePackageByPrice(merchant.recharge_package_price);
	const price = Number((pkg && pkg.price) || merchant.recharge_package_price || 0);
	if (price >= 1000) {
		return { tier: 'diamond', name: '钻石会员', accent: '#38bdf8' };
	}
	if (price >= 800) {
		return { tier: 'platinum', name: '铂金会员', accent: '#c084fc' };
	}
	if (price >= 600 || price === 0.1) {
		return { tier: 'white_gold', name: '白金会员', accent: '#fcd34d' };
	}
	return { tier: 'normal', name: '普通会员', accent: '#94a3b8' };
}

const H5_WITHDRAW_FEE_YUAN = 3;
const H5_WITHDRAW_MAX_POINTS = 200;

function isH5RechargeMemberForWithdraw(merchant) {
	return h5MembershipInfo(merchant).tier !== 'normal';
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
		const member = isH5RechargeMemberForWithdraw(merchant);
		const biz = await getBizSettings();
		const ar = Number(merchant.available_reward || 0);
		const ap = Number(merchant.account_points || 0);
		const redeemable = Math.floor(Math.min(ar, ap));
		const minPoints = member ? Number(biz.withdrawRange.memberMin || 10) : Number(biz.withdrawRange.nonMemberMin || 30);
		const maxPoints = member ? Number(biz.withdrawRange.memberMax || H5_WITHDRAW_MAX_POINTS) : Number(biz.withdrawRange.nonMemberMax || H5_WITHDRAW_MAX_POINTS);
		const mship = h5MembershipInfo(merchant);
		return {
			code: 0,
			message: 'ok',
			data: {
				serverTime: now,
				redeemablePoints: redeemable,
				isRechargeMember: member,
				membershipName: mship.name,
				minPoints,
				maxPoints,
				feePerOrderYuan: H5_WITHDRAW_FEE_YUAN,
				inBusinessHours: isH5WithdrawBusinessHours(now),
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
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const now = nowTs();
		if (!isH5WithdrawBusinessHours(now)) {
			return { code: 400, message: h5WithdrawOutsideHoursMessage() };
		}
		const raw = data?.points;
		const n = typeof raw === 'string' ? Number(String(raw).trim()) : Number(raw);
		if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
			return { code: 400, message: '兑换积分须为大于 0 的整数' };
		}
		const points = n;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const member = isH5RechargeMemberForWithdraw(merchant);
		const biz = await getBizSettings();
		const minP = member ? Number(biz.withdrawRange.memberMin || 10) : Number(biz.withdrawRange.nonMemberMin || 30);
		const maxP = member ? Number(biz.withdrawRange.memberMax || H5_WITHDRAW_MAX_POINTS) : Number(biz.withdrawRange.nonMemberMax || H5_WITHDRAW_MAX_POINTS);
		if (points < minP) {
			return { code: 400, message: `单次兑换最低为 ${minP} 积分（${member ? '充值会员' : '非充值会员'}）` };
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
		const payable = Number((points - fee).toFixed(2));
		if (payable <= 0) {
			return { code: 400, message: '兑换积分扣除手续费后金额需大于 0' };
		}

		const merchantUserId = String(merchant.user_id || merchant._id || '');
		let company = '-';
		let salesman = '-';
		let machine = null;
		if (merchant.device_id) {
			const mRes = await machineCollection.where({ device_id: merchant.device_id, is_deleted: false }).limit(1).get();
			machine = mRes.data && mRes.data[0];
			if (machine) {
				company = String(machine.company || '').trim() || '-';
				salesman = String(machine.salesman || '').trim() || '-';
			}
		}

		const withdrawNo = `H5${now}${randomStr(8)}`;
		const addRes = await withdrawCollection.add({
			withdraw_no: withdrawNo,
			merchant_user_id: merchantUserId,
			user_nickname: safeText(merchant.wx_nickname, 80),
			user_mobile: safeText(merchant.mobile, 20),
			device_id: safeText(merchant.device_id, 80),
			company,
			salesman,
			amount: points,
			fee_tax: fee,
			payable,
			is_paid: false,
			arrival_status: 'pending',
			create_time: now,
			update_time: now,
			is_deleted: false
		});
		const newWithdrawId = addRes.id;
		const pendingWithdrawBefore = Number(merchant.pending_withdraw || 0);
		const machinePendingBefore = machine ? Number(machine.pending_amount || 0) : 0;
		try {
			if (machine) {
				await machineCollection.doc(machine._id).update({
					pending_amount: Number((machinePendingBefore + payable).toFixed(4))
				});
			}
			await merchantCollection.doc(merchant._id).update({
				available_reward: Number((ar - points).toFixed(4)),
				account_points: Number((ap - points).toFixed(4)),
				pending_withdraw: Number((pendingWithdrawBefore + payable).toFixed(4)),
				update_time: now
			});
		} catch (err) {
			try {
				if (newWithdrawId) await withdrawCollection.doc(newWithdrawId).remove();
			} catch (e2) {
				console.error('h5WithdrawApply rollback withdraw failed', e2);
			}
			if (machine) {
				try {
					await machineCollection.doc(machine._id).update({
						pending_amount: Number(machinePendingBefore.toFixed(4))
					});
				} catch (e3) {
					console.error('h5WithdrawApply rollback machine pending failed', e3);
				}
			}
			try {
				await merchantCollection.doc(merchant._id).update({
					available_reward: Number(ar.toFixed(4)),
					account_points: Number(ap.toFixed(4)),
					pending_withdraw: Number(pendingWithdrawBefore.toFixed(4)),
					update_time: nowTs()
				});
			} catch (e4) {
				console.error('h5WithdrawApply rollback merchant failed', e4);
			}
			throw err;
		}

		return {
			code: 0,
			message: '提交成功',
			data: { withdrawNo, points, feeTax: fee, payable }
		};
	} catch (e) {
		console.error('h5WithdrawApply failed', e);
		return { code: 500, message: '提交失败' };
	}
}

async function h5HomeDashboard(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const now = nowTs();
		const biz = await getBizSettings();
		const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		let countdown = computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
		if (countdown.normalized && Number(merchant.recharge_cycle_start || 0) !== Number(countdown.start || 0)) {
			await merchantCollection.doc(merchant._id).update({
				recharge_cycle_start: Number(countdown.start || 0),
				update_time: now
			});
			const m2 = await getMerchantByIdOrUserId(merchant._id);
			if (m2) merchant.recharge_cycle_start = m2.recharge_cycle_start;
			countdown = computeRechargeCountdown(merchant.recharge_cycle_start, now, cycleCfg.cycleDays, cycleCfg.windowDays);
		}
		// 提现单 merchant_user_id 与商户 user_id 一致（见 withdrawApprove）
		const withdrawMerchantKey = String(merchant.user_id || merchant._id || '');
		const dayR = chinaRangeMs('day', now);
		const monthR = chinaRangeMs('month', now);
		const yearR = chinaRangeMs('year', now);
		const [daySum, monthSum, yearSum] = await Promise.all([
			withdrawSummary(buildWithdrawReceivedInRange(withdrawMerchantKey, dayR.start, dayR.end)),
			withdrawSummary(buildWithdrawReceivedInRange(withdrawMerchantKey, monthR.start, monthR.end)),
			withdrawSummary(buildWithdrawReceivedInRange(withdrawMerchantKey, yearR.start, yearR.end))
		]);
		const membership = h5MembershipInfo(merchant);
		const withdrawQuotaTotalYuan = h5WithdrawQuotaTotalYuan(merchant, biz.rechargeRules);
		const withdrawnYuan = Number(merchant.withdrawn || 0);
		const pendingWithdrawYuan = Number(merchant.pending_withdraw || 0);
		const usedQuotaYuan =
			withdrawQuotaTotalYuan > 0 ? Math.max(0, Number((withdrawnYuan + pendingWithdrawYuan).toFixed(2))) : 0;
		const remainingQuota =
			withdrawQuotaTotalYuan > 0 ? Math.max(0, Number((withdrawQuotaTotalYuan - usedQuotaYuan).toFixed(2))) : 0;
		return {
			code: 0,
			message: 'ok',
			data: {
				serverTime: now,
				merchant: compactMerchantInfo(merchant),
				membership,
				withdraw: {
					today: Number(daySum.totalWithdraw || 0).toFixed(2),
					month: Number(monthSum.totalWithdraw || 0).toFixed(2),
					year: Number(yearSum.totalWithdraw || 0).toFixed(2)
				},
				pendingWithdraw: Number(merchant.pending_withdraw || 0).toFixed(2),
				quota: {
					remaining: remainingQuota.toFixed(2),
					totalGrantedYuan: withdrawQuotaTotalYuan,
					usedYuan: usedQuotaYuan.toFixed(2)
				},
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
		const agreementVersion = safeText(data?.agreementVersion || '2026-03-27-v1', 40);
		if (!signatureImage) return { code: 400, message: '请先签名' };
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
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


// 与 600 元档同等权益（100 万额度等），标价 0.1 元用于正式环境小额支付/回调验收；列在首位便于选择
const H5_RECHARGE_PKG_TEST_01 = {
	id: 'pkg_0_1',
	title: '0.1元（支付测试）',
	price: 0.1,
	quota: 1000000,
	benefitTip: '与600元档同等100万额度；标价0.1元仅用于正式环境走通微信支付与回调'
};

const H5_RECHARGE_PACKAGES = [
	H5_RECHARGE_PKG_TEST_01,
	{ id: 'pkg_600', title: '600元', price: 600, quota: 1000000, benefitTip: '600元配置100万交易量，等于补贴市场价的3800元手续费' },
	{ id: 'pkg_800', title: '800元', price: 800, quota: 1500000, benefitTip: '800元配置150万交易量，等于补贴市场价的5700元手续费' },
	{ id: 'pkg_1000', title: '1000元', price: 1000, quota: 2000000, benefitTip: '1000元配置200万交易量，等于补贴市场价的7600元手续费' }
];

function buildRechargePackagesFromRules(rechargeRules = DEFAULT_RECHARGE_RULES) {
	const core = (Array.isArray(rechargeRules) ? rechargeRules : DEFAULT_RECHARGE_RULES)
		.map((x) => ({
			id: `pkg_${String(Number(x.price || 0)).replace('.', '_')}`,
			title: `${Number(x.price || 0)}元`,
			price: Number(x.price || 0),
			quota: Number(x.quota || 0),
			benefitTip: String(x.tip || '').trim()
		}))
		.filter((x) => x.price > 0)
		.sort((a, b) => a.price - b.price);
	if (!core.length) return H5_RECHARGE_PACKAGES;
	return [H5_RECHARGE_PKG_TEST_01, ...core];
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
	const ok = String(merchant?.agreement_img || '').trim();
	if (ok) return null;
	return { code: 403, message: '请先签署优惠活动计划书后再进行额度充值', needAgreement: true };
}

async function h5RechargeOptions(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const needSign = requireH5AgreementSigned(merchant);
		if (needSign) return needSign;
		const biz = await getBizSettings();
		const cycleCfg = resolveMerchantRefundCycleDays(merchant, biz.refundCycle);
		const rechargePackages = buildRechargePackagesFromRules(biz.rechargeRules);
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
							quota: currentPkg.quota
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
		const biz = await getBizSettings();
		const rechargePackages = buildRechargePackagesFromRules(biz.rechargeRules);
		const pkg = pickRechargePackage(data?.packageId, rechargePackages);
		if (!pkg) return { code: 400, message: '请选择有效充值套餐' };
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
				add_quota: Number(addQuota || 0),
				paid_amount: Number(payAmount || 0),
				wx_pay_profile: 'recharge',
				wx_pay_mchid: rc.mchId
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

async function h5RefundReset(data, event) {
	try {
		const cfgR = ensureWxRechargePayConfig();
		if (!cfgR.ok) return { code: 500, message: cfgR.message };

		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const biz = await getBizSettings();
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
			return { code: 400, message: '暂无可退款充值金额' };
		}
		let penaltyAmount = 0;
		if (countdown.phase === 'lock') {
			penaltyAmount = Number((refundAmount * 0.5).toFixed(2));
		}
		const finalRefundAmount = Number((refundAmount - penaltyAmount).toFixed(2));
		const targetRefundFen = Math.round(finalRefundAmount * 100);
		if (targetRefundFen < 1) {
			return { code: 400, message: '计算应退金额过小，无法发起商家转账' };
		}
		const reason = safeText(data?.reason || '用户申请H5额度充值退款', 80);
		const rc = wxRechargeCredentials();
		const bizKey = `${merchant._id}_${targetRefundFen}_${countdown.phase}_${Number(merchant.recharge_cycle_start || 0)}_${refundAmount.toFixed(2)}_${rows
			.map((x) => x._id)
			.sort()
			.join('_')}`;
		const existRes = await transferOrderCollection.where({ biz_key: bizKey, is_deleted: false }).limit(1).get();
		let transferOrder = existRes.data && existRes.data[0];
		if (!transferOrder) {
			const orderNos = Array.from(new Set(rows.map((x) => safeText(x.platform_no || '', 40)).filter(Boolean)));
			const orderWhere = {
				type: 'h5_quota_recharge',
				user_id: merchant.user_id || merchant._id,
				user_order_success: true,
				status: db.command.in([1, 2])
			};
			if (orderNos.length) orderWhere.out_trade_no = db.command.in(orderNos);
			const orderRes = await uniPayOrderCollection.where(orderWhere).limit(1000).get();
			const orders = (orderRes.data || [])
				.filter((o) => Number(o.total_fee || 0) - Number(o.refund_fee || 0) > 0)
				.sort((a, b) => Number(a.create_date || 0) - Number(b.create_date || 0));
			if (!orders.length) return { code: 400, message: '未找到可原路退款订单或订单已退款完成' };
			const parts = distributeRefundFenAcrossOrders(orders, targetRefundFen);
			const refundItems = orders
				.map((o, idx) => {
					const refundFen = Number(parts[idx] || 0);
					if (refundFen <= 0) return null;
					const outRefundNo = `H5RF${now}${String(idx).padStart(2, '0')}${randomStr(4).toUpperCase()}`.slice(0, 64);
					return {
						out_trade_no: safeText(o.out_trade_no, 40),
						order_id: o._id,
						total_fee: Number(o.total_fee || 0),
						refund_fee: Number(o.refund_fee || 0),
						apply_refund_fen: refundFen,
						out_refund_no: outRefundNo,
						state: 'INIT',
						wx_refund_id: ''
					};
				})
				.filter(Boolean);
			if (!refundItems.length) return { code: 400, message: '计算退款金额失败，请稍后重试' };
			const refundNo = `H5F${now}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
			const addRes = await transferOrderCollection.add({
				biz_key: bizKey,
				merchant_id: merchant._id,
				merchant_user_id: merchant.user_id || merchant._id,
				recharge_log_ids: rows.map((x) => x._id).filter(Boolean),
				refund_no: refundNo,
				out_bill_no: refundNo,
				transfer_mch_id: rc.mchId,
				refund_mode: 'domestic_refund',
				refund_items: refundItems,
				refund_amount: Number(refundAmount || 0),
				penalty_amount: Number(penaltyAmount || 0),
				final_refund_amount: Number(finalRefundAmount || 0),
				final_refund_fen: targetRefundFen,
				reason,
				state: 'INIT',
				applied: false,
				is_deleted: false,
				create_time: now,
				update_time: now
			});
			const ordRes = await transferOrderCollection.doc(addRes.id).get();
			transferOrder = ordRes.data && ordRes.data[0];
		}
		let items = Array.isArray(transferOrder.refund_items) ? transferOrder.refund_items : [];
		const itemResults = [];
		let hasFailed = false;
		let hasPending = false;
		for (let i = 0; i < items.length; i += 1) {
			const item = items[i] || {};
			const outRefundNo = safeText(item.out_refund_no, 64);
			if (!outRefundNo) continue;
			let st = normalizeRefundState(item.state);
			let queryResp = item.query_resp || null;
			if (!isRefundSuccessState(st)) {
				try {
					if (st === 'INIT') {
						const created = await wxPayCreateRefundFor(rc, {
							outTradeNo: item.out_trade_no,
							outRefundNo,
							refundFen: Number(item.apply_refund_fen || 0),
							totalFen: Number(item.total_fee || 0),
							reason
						});
						queryResp = created || {};
					} else {
						const queried = await wxPayQueryRefundFor(rc, outRefundNo);
						queryResp = queried || {};
					}
					st = normalizeRefundState(queryResp.status || queryResp.refund_status || st);
					item.state = st;
					item.query_resp = queryResp;
					item.wx_refund_id = safeText(queryResp.refund_id || item.wx_refund_id || '', 80);
				} catch (e) {
					const detail =
						e && e.name === 'WxPayRequestError' && e.wxBody
							? e.wxBody.message || e.wxBody.code || e.message
							: e.message || 'refund request failed';
					item.last_error = safeText(String(detail), 200);
					if (String(detail).toLowerCase().includes('out_refund_no')) {
						try {
							const queried = await wxPayQueryRefundFor(rc, outRefundNo);
							queryResp = queried || {};
							st = normalizeRefundState(queryResp.status || queryResp.refund_status || item.state);
							item.state = st;
							item.query_resp = queryResp;
							item.wx_refund_id = safeText(queryResp.refund_id || item.wx_refund_id || '', 80);
						} catch (qe) {
							hasFailed = true;
						}
					} else {
						hasFailed = true;
					}
				}
			}
			if (isRefundSuccessState(item.state)) item.refund_time = nowTs();
			if (isRefundFailedState(item.state)) hasFailed = true;
			if (!isRefundSuccessState(item.state) && !isRefundFailedState(item.state)) hasPending = true;
			itemResults.push({
				outRefundNo,
				outTradeNo: item.out_trade_no,
				state: item.state
			});
		}
		items = items.map((x) => x);
		let batchState = 'PROCESSING';
		if (hasFailed) batchState = 'FAILED';
		else if (!hasPending) batchState = 'SUCCESS';
		await transferOrderCollection.doc(transferOrder._id).update({
			state: batchState,
			refund_items: items,
			update_time: nowTs()
		});
		transferOrder.state = batchState;
		transferOrder.refund_items = items;

		if (batchState === 'SUCCESS') {
			await finalizeTransferSuccessIfNeeded(transferOrder, event);
			return {
				code: 0,
				message: '原路退款成功',
				data: {
					refundNo: transferOrder.refund_no,
					refundAmount: Number(transferOrder.refund_amount || 0).toFixed(2),
					penaltyAmount: Number(transferOrder.penalty_amount || 0).toFixed(2),
					finalRefundAmount: Number(transferOrder.final_refund_amount || 0).toFixed(2),
					phase: countdown.phase,
					outBillNo: transferOrder.refund_no,
					refundState: batchState,
					refundItems: itemResults
				}
			};
		}
		if (batchState === 'FAILED') {
			return {
				code: 500,
				message: '部分原路退款失败，请稍后重试',
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
			message: '原路退款处理中，请稍后查询结果',
			data: {
				refundNo: transferOrder.refund_no,
				outBillNo: transferOrder.refund_no,
				refundState: batchState,
				refundItems: itemResults
			}
		};
	} catch (e) {
		console.error('h5RefundReset failed', e);
		return { code: 500, message: safeText(e.message || '退款重置失败', 200) };
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
			.where({ out_bill_no: outBillNo, merchant_id: merchant._id, is_deleted: false, refund_mode: 'domestic_refund' })
			.limit(1)
			.get();
		const ord = ordRes.data && ordRes.data[0];
		if (!ord) return { code: 404, message: '退款单不存在' };
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
 * H5：按合理流水返现规则，将每笔返现的 1/5（约等于月返 20%）分摊到交易所在月起连续 5 个自然月，
 * 汇总「当前月及之后」各月待返积分（理论值，不含已过期月份）。
 */
async function h5PendingReturnPoints(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const now = nowTs();
		const curYm = shanghaiYearMonthFromTs(now);
		let bindTs = Number(merchant.bind_time || 0);
		const deviceId = String(merchant.device_id || '').trim();
		if (deviceId) {
			const mRes = await machineCollection.where({ device_id: deviceId, is_deleted: false }).limit(1).get();
			const mach = mRes.data && mRes.data[0];
			if (mach && mach.bind_time) {
				bindTs = Math.max(bindTs, Number(mach.bind_time || 0));
			}
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
			.field({ amount: true, cashback: true, release_amount: true, create_time: true })
			.limit(8000)
			.get();
		const buckets = {};
		for (const row of tRes.data || []) {
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
					: Number((cb / 5).toFixed(4));
			if (!Number.isFinite(r) || r <= 0) continue;
			const ts = Number(row.create_time || 0);
			const tradeYm = shanghaiYearMonthFromTs(ts);
			for (let k = 0; k < 5; k += 1) {
				const targetYm = addCalendarMonthsYm(tradeYm, k);
				if (String(targetYm).localeCompare(curYm) < 0) continue;
				buckets[targetYm] = Number(((buckets[targetYm] || 0) + r).toFixed(4));
			}
		}
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
		return {
			code: 0,
			message: 'ok',
			data: {
				currentMonth: curYm,
				list,
				totalUpcoming: Number(totalUpcoming.toFixed(2)),
				ruleNote:
					'统计说明：按每笔合理流水的返现金额拆为 5 期（每期约为总返现的 20%，与交易上「释放」口径一致），分别计入交易所在月及之后第 2～5 个自然月。仅展示当前月及未来月份合计；已过去的月份不再计入。实际可领额度以「收益」页系统生成的待领取记录为准。'
			}
		};
	} catch (e) {
		console.error('h5PendingReturnPoints failed', e);
		return { code: 500, message: '获取失败' };
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
		return {
			code: 0,
			message: 'ok',
			data: {
				packets,
				pendingTotal: pendingTotal.toFixed(2),
				pendingCount: pendingRows.length,
				detailList,
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
	}
	if (claimedIds.length) {
		const merchantUpd = {
			pending_withdraw: Number((Number(merchant.pending_withdraw || 0) + claimedAmount).toFixed(4)),
			available_reward: Number(merchant.available_reward || 0) + claimedAmount,
			account_points: Number(merchant.account_points || 0) + claimedAmount
		};
		await merchantCollection.doc(merchant._id).update(merchantUpd);
		if (merchant.device_id) {
			const mRes = await machineCollection.where({ device_id: merchant.device_id, is_deleted: false }).limit(1).get();
			const m = mRes.data && mRes.data[0];
			if (m) {
				const nextFrozen = Math.max(0, Number(Number(m.frozen_amount || 0) - claimedAmount).toFixed(4));
				await machineCollection.doc(m._id).update({
					frozen_amount: nextFrozen,
					pending_amount: Number((Number(m.pending_amount || 0) + claimedAmount).toFixed(4))
				});
			}
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
		if (!merchant.device_id) return { code: 400, message: '当前未绑定机具' };

		const machineRes = await machineCollection.where({ device_id: merchant.device_id, is_deleted: false }).limit(1).get();
		if (!machineRes.data || !machineRes.data.length) return { code: 404, message: '机具不存在' };
		const machine = machineRes.data[0];
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

		await machineCollection.doc(machine._id).update({
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

		await machineTradeCollection.where({ device_id: machine.device_id, is_deleted: db.command.neq(true) }).update({
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
			content: `H5解除绑定: ${machine.device_id}`,
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
			before_machine_snapshot: {
				_id: machine._id,
				device_id: machine.device_id || '',
				brand_name: machine.brand_name || '',
				total_transaction: Number(machine.total_transaction || 0),
				pending_amount: Number(machine.pending_amount || 0),
				withdrawn_amount: Number(machine.withdrawn_amount || 0),
				frozen_amount: Number(machine.frozen_amount || 0)
			},
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
		try {
			const r = await uniCloud.getTempFileURL({ fileList: images });
			const list = r.fileList || [];
			for (let i = 0; i < images.length; i++) {
				const id = images[i];
				const f = list.find((x) => x.fileID === id) || list[i];
				imgResolved.push({
					fileID: id,
					url: (f && (f.tempFileURL || f.url)) || ''
				});
			}
		} catch (e) {
			console.error('feedbackMapMessageRow images', e);
			images.forEach((id) => imgResolved.push({ fileID: id, url: '' }));
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
			? data.images.map((x) => safeText(x, 500)).filter(Boolean).slice(0, 9)
			: [];
		const video = safeText(data?.video || '', 500);
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
		if (!fid) return { code: 400, message: '缺少工单ID' };
		if (!text.trim()) return { code: 400, message: '请输入回复内容' };
		const t = await feedbackTicketCollection.doc(fid).get();
		const ticket = t.data && t.data[0];
		if (!ticket || ticket.is_deleted) return { code: 404, message: '工单不存在' };
		if (ticket.status !== 'open') return { code: 400, message: '工单已结束' };
		const now = nowTs();
		const operator = getOperator({ context });
		await feedbackMessageCollection.add({
			feedback_id: fid,
			role: 'admin',
			content: text,
			images: [],
			video: '',
			admin_name: operator,
			create_time: now,
			is_deleted: false
		});
		await feedbackTicketCollection.doc(fid).update({
			user_unread_reply: true,
			admin_unread: false,
			preview_text: text.slice(0, 80),
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
		if (payload.amount <= 0) return { code: 400, message: '金额必须大于0' };
		if (payload.monthly_threshold < 0) return { code: 400, message: '月需消费总额不能小于0' };
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
		const {
			page = 1,
			pageSize = 10,
			packageId = '',
			title = '',
			bonusQuota = '',
			realQuota = '',
			price = '',
			description = '',
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
		if (realQuota !== '' && realQuota !== null && realQuota !== undefined) where.real_quota = Number(realQuota);
		if (price !== '' && price !== null && price !== undefined) where.price = Number(price);
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
			description: item.description || '',
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
		const payload = {
			package_id: safeText(data?.packageId, 40),
			title: safeText(data?.title, 80),
			bonus_quota: safeText(data?.bonusQuota, 120),
			real_quota: Number(data?.realQuota || 0),
			price: Number(data?.price || 0),
			description: safeText(data?.description, 300),
			update_time: now
		};
		if (!payload.package_id) return { code: 400, message: '请输入套餐id' };
		if (!payload.title) return { code: 400, message: '请输入标题' };
		if (payload.real_quota < 0) return { code: 400, message: '实际额度不能小于0' };
		if (payload.price < 0) return { code: 400, message: '套餐价格不能小于0' };
		if (!payload.description) return { code: 400, message: '请输入套餐说明' };

		const dupWhere = { package_id: payload.package_id, is_deleted: false };
		if (id) dupWhere._id = db.command.neq(id);
		const dup = await quotaCollection.where(dupWhere).limit(1).get();
		if (dup.data && dup.data.length) return { code: 400, message: '套餐id已存在，请勿重复' };

		if (id) {
			await quotaCollection.doc(id).update(payload);
			return { code: 0, message: '更新成功' };
		}
		await quotaCollection.add({
			...payload,
			is_deleted: false,
			create_time: now
		});
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
		case 'simulateRegister':
			return await simulateRegister(actualData);
		case 'offlineFirstRecharge':
			return await offlineFirstRecharge(actualData, event);
		case 'withdrawList':
			return await getWithdrawList(actualData);
		case 'tradeBillList':
			return await tradeBillList(actualData);
		case 'tradeBillDelete':
			return await tradeBillDelete(actualData, event);
		case 'withdrawExportCsv':
			return await exportWithdrawCsv(actualData);
		case 'withdrawApprove':
			return await withdrawApprove(actualData);
		case 'withdrawDelete':
			return await withdrawDelete(actualData, event);
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
		case 'h5MachineBindLogList':
			return await h5MachineBindLogList(actualData);
		case 'h5FinanceRecords':
			return await h5FinanceRecords(actualData);
		case 'h5MineInfo':
			return await h5MineInfo(actualData);
		case 'h5WithdrawInfo':
			return await h5WithdrawInfo(actualData);
		case 'h5WithdrawApply':
			return await h5WithdrawApply(actualData);
		case 'h5HomeDashboard':
			return await h5HomeDashboard(actualData);
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
		case 'h5RefundReset':
			return await h5RefundReset(actualData, event);
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

