'use strict';

const db = uniCloud.database();
const merchantCollection = db.collection('opendb-merchant-users');
const withdrawCollection = db.collection('opendb-withdraw-records');
const couponCollection = db.collection('opendb-coupons');
const quotaCollection = db.collection('opendb-quota-packages');
const machineCollection = db.collection('opendb-machine');
const operationLogCollection = db.collection('opendb-operation-logs');
const incomePacketCollection = db.collection('opendb-income-packets');
const machineTradeCollection = db.collection('opendb-machine-trades');
const uniPayOrderCollection = db.collection('uni-pay-orders');

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

	const logWhereParts = [{ action: 'offline_first_recharge' }, db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])];
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
			await operationLogCollection.where({ _id: db.command.in(offlineIds), action: 'offline_first_recharge' }).update({
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
		await withdrawCollection.doc(id).update({
			arrival_status: nextStatus,
			arrival_time: nextStatus === 'received' ? now : row.arrival_time || null,
			update_time: now
		});
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
		default:
			return { code: 400, message: '无效的操作' };
	}
};

