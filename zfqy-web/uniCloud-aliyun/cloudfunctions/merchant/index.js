'use strict';

const db = uniCloud.database();
const merchantCollection = db.collection('opendb-merchant-users');

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
		default:
			return { code: 400, message: '无效的操作' };
	}
};

