'use strict';

const db = uniCloud.database();
const merchantCollection = db.collection('opendb-merchant-users');
const withdrawCollection = db.collection('opendb-withdraw-records');
const machineCollection = db.collection('opendb-machine');
const operationLogCollection = db.collection('opendb-operation-logs');
const incomePacketCollection = db.collection('opendb-income-packets');
const machineTradeCollection = db.collection('opendb-machine-trades');

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

		let brandName = brand_name || '';
		if (!brandName) {
			const machineRes = await db.collection('opendb-machine').where({ device_id: deviceId }).get();
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
		const machineCollection = db.collection('opendb-machine');
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
		arrivalTime: formatTime(item.arrival_time)
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
		arrivalTimeEnd = ''
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

async function h5AuthSync(data) {
	try {
		const profile = pickAuthProfile(data);
		if (!profile.openid && !profile.mobile) {
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
				needBind: !merchant.device_id,
				merchant: compactMerchantInfo(merchant)
			}
		};
	} catch (e) {
		console.error('h5AuthSync failed', e);
		return { code: 500, message: '登录失败' };
	}
}

async function h5BindMachine(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const deviceId = safeText(data?.deviceId, 80);
		if (!merchantKey) return { code: 400, message: '缺少商户标识' };
		if (!deviceId) return { code: 400, message: '请输入机具号码' };

		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };

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
		await machineCollection.where({ _id: machine._id }).update({
			is_bound: 1,
			bind_time: now,
			bind_user_id: merchant.user_id || merchant._id,
			bind_user_name: merchant.wx_nickname || '',
			bind_user_mobile: merchant.mobile || ''
		});
		const latest = await getMerchantByIdOrUserId(merchant._id);
		return { code: 0, message: '绑定成功', data: { merchant: compactMerchantInfo(latest) } };
	} catch (e) {
		console.error('h5BindMachine failed', e);
		return { code: 500, message: '绑定失败' };
	}
}

async function h5MineInfo(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: compactMerchantInfo(merchant),
				account: {
					availableReward: Number(merchant.available_reward || 0).toFixed(2),
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

function monthNo(ts) {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

async function ensureMockIncomePackets(merchantUserId) {
	const exists = await incomePacketCollection.where({ merchant_user_id: merchantUserId, is_deleted: false }).limit(1).get();
	if (exists.data && exists.data.length) return;
	const now = nowTs();
	const docs = [];
	for (let i = 0; i < 10; i += 1) {
		docs.push({
			merchant_user_id: merchantUserId,
			month_no: monthNo(now),
			title: `奖励红包${i + 1}`,
			amount: Number((Math.random() * 2 + 0.2).toFixed(2)),
			status: 'pending',
			create_time: now - i * 60000,
			update_time: now,
			is_deleted: false
		});
	}
	for (const d of docs) {
		await incomePacketCollection.add(d);
	}
}

async function h5IncomeList(data) {
	try {
		const merchantKey = data?.merchantId || data?.merchantUserId || data?.userId;
		const merchant = await getMerchantByIdOrUserId(merchantKey);
		if (!merchant) return { code: 404, message: '商户不存在' };
		const merchantUserId = merchant.user_id || merchant._id;
		await ensureMockIncomePackets(merchantUserId);
		const res = await incomePacketCollection
			.where({ merchant_user_id: merchantUserId, is_deleted: false, status: 'pending' })
			.orderBy('create_time', 'desc')
			.limit(20)
			.get();
		const packets = (res.data || []).map((x) => ({
			id: x._id,
			title: x.title || '奖励红包',
			amount: Number(x.amount || 0).toFixed(2),
			monthNo: x.month_no || '',
			status: x.status
		}));
		return { code: 0, message: 'ok', data: { packets } };
	} catch (e) {
		console.error('h5IncomeList failed', e);
		return { code: 500, message: '获取失败' };
	}
}

async function claimPackets(merchant, packetIds) {
	const ids = Array.isArray(packetIds) ? packetIds.filter(Boolean).map(String) : [];
	if (!ids.length) return { claimedCount: 0, claimedAmount: 0 };
	const now = nowTs();
	const res = await incomePacketCollection
		.where({ _id: db.command.in(ids), merchant_user_id: merchant.user_id || merchant._id, status: 'pending', is_deleted: false })
		.get();
	const rows = res.data || [];
	let claimedAmount = 0;
	for (const row of rows) {
		claimedAmount += Number(row.amount || 0);
		await incomePacketCollection.doc(row._id).update({
			status: 'claimed',
			claimed_time: now,
			update_time: now
		});
	}
	if (rows.length) {
		await merchantCollection.doc(merchant._id).update({
			available_reward: Number(merchant.available_reward || 0) + claimedAmount,
			account_points: Number(merchant.account_points || 0) + claimedAmount
		});
	}
	return { claimedCount: rows.length, claimedAmount };
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

		await machineTradeCollection.where({ device_id: machine.device_id }).remove();

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
		case 'withdrawList':
			return await getWithdrawList(actualData);
		case 'withdrawExportCsv':
			return await exportWithdrawCsv(actualData);
		case 'h5AuthSync':
			return await h5AuthSync(actualData);
		case 'h5BindMachine':
			return await h5BindMachine(actualData);
		case 'h5MineInfo':
			return await h5MineInfo(actualData);
		case 'h5SignAgreement':
			return await h5SignAgreement(actualData);
		case 'h5IncomeList':
			return await h5IncomeList(actualData);
		case 'h5IncomeClaim':
			return await h5IncomeClaim(actualData);
		case 'h5IncomeClaimAll':
			return await h5IncomeClaimAll(actualData);
		case 'h5Unbind':
			return await h5Unbind(actualData, event);
		default:
			return { code: 400, message: '无效的操作' };
	}
};

