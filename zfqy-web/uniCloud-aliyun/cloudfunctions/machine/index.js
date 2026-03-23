'use strict';
const db = uniCloud.database();
const machineCollection = db.collection('opendb-machine');
const brandCollection = db.collection('opendb-brand');
const operationLogCollection = db.collection('opendb-operation-logs');
const tradeCollection = db.collection('opendb-machine-trades');
const merchantCollection = db.collection('opendb-merchant-users');

// 格式化时间
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

function generateTradeNo() {
	const ts = Date.now();
	const rnd = Math.floor(Math.random() * 9000) + 1000;
	return `MOCK${ts}${rnd}`;
}

// 记录操作日志
async function recordOperationLog(event, action, targetId, targetName, content) {
	try {
		const { context } = event;
		const logData = {
			user_id: context.OPENID || '',
			user_name: context.userInfo?.username || '未知用户',
			action: action,
			module: 'machine',
			target_id: targetId,
			target_name: targetName,
			content: content,
			ip: context.CLIENTIP || '',
			create_time: new Date().getTime()
		};
		await operationLogCollection.add(logData);
	} catch (error) {
		console.error('记录操作日志失败:', error);
	}
}

// 获取品牌列表（用于下拉框）
async function getBrandList() {
	try {
		const result = await brandCollection.where({ is_deleted: false }).get();
		const brandList = result.data.map(item => ({
			value: item.brand_id,
			label: item.brand_name
		}));
		return {
			code: 0,
			message: '获取成功',
			data: brandList
		};
	} catch (error) {
		console.error('获取品牌列表失败:', error);
		return {
			code: 500,
			message: '获取失败'
		};
	}
}

// 获取机具列表（带搜索和分页）
async function getMachineList(data) {
	try {
		const { 
			page = 1, 
			pageSize = 10, 
			deviceId = '', 
			brandId = '', 
			speakerId = '', 
			isBound = '', 
			bindTimeStart = '', 
			bindTimeEnd = '', 
			bindUserId = '', 
			isActivated = '', 
			activatedTimeStart = '', 
			activatedTimeEnd = '', 
			inStockTimeStart = '', 
			inStockTimeEnd = '' 
		} = data || {};
		
		// 构建查询条件
		let query = machineCollection.where({ is_deleted: false });
		
		if (deviceId) {
			query = query.where({ device_id: new RegExp(deviceId) });
		}
		
		if (brandId) {
			query = query.where({ brand_id: brandId });
		}
		
		if (speakerId) {
			query = query.where({ speaker_id: new RegExp(speakerId) });
		}
		
		if (isBound !== '' && isBound !== undefined) {
			query = query.where({ is_bound: parseInt(isBound) });
		}
		
		if (bindTimeStart) {
			query = query.where({ bind_time: db.command.gte(parseInt(bindTimeStart)) });
		}
		
		if (bindTimeEnd) {
			query = query.where({ bind_time: db.command.lte(parseInt(bindTimeEnd)) });
		}
		
		if (bindUserId) {
			query = query.where({ bind_user_id: bindUserId });
		}
		
		if (isActivated !== '' && isActivated !== undefined) {
			query = query.where({ is_activated: isActivated === '1' });
		}
		
		if (activatedTimeStart) {
			query = query.where({ activated_time: db.command.gte(parseInt(activatedTimeStart)) });
		}
		
		if (activatedTimeEnd) {
			query = query.where({ activated_time: db.command.lte(parseInt(activatedTimeEnd)) });
		}
		
		if (inStockTimeStart) {
			query = query.where({ in_stock_time: db.command.gte(parseInt(inStockTimeStart)) });
		}
		
		if (inStockTimeEnd) {
			query = query.where({ in_stock_time: db.command.lte(parseInt(inStockTimeEnd)) });
		}
		
		// 计算总数
		const countResult = await query.count();
		const total = countResult.total;
		
		// 分页查询
		const result = await query
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.orderBy('in_stock_time', 'desc')
			.get();
		
		// 格式化数据
		const machineList = result.data.map(item => ({
			id: item.device_id,
			deviceId: item.device_id,
			brandId: item.brand_id,
			brandName: item.brand_name,
			speakerId: item.speaker_id || '-',
			isBound: item.is_bound,
			isBoundText: item.is_bound === 0 ? '未绑定' : (item.is_bound === 1 ? '已绑定' : '已解绑'),
			bindTime: formatTime(item.bind_time),
			bindUserId: item.bind_user_id || '',
			bindUserName: item.bind_user_name || '',
			bindUserMobile: item.bind_user_mobile || '',
			isActivated: item.is_activated,
			isActivatedText: item.is_activated ? '已激活' : '未激活',
			activatedTime: formatTime(item.activated_time),
			totalTransaction: `￥${item.total_transaction.toFixed(2)}`,
			pendingWithdrawn: `￥${item.pending_amount.toFixed(2)}/${item.withdrawn_amount.toFixed(2)}`,
			frozenAmount: `￥${item.frozen_amount.toFixed(2)}`,
			merchant: item.merchant || '管理员',
			salesman: item.salesman || '管理员',
			inStockTime: formatTime(item.in_stock_time)
		}));
		
		return {
			code: 0,
			message: '获取成功',
			data: {
				list: machineList,
				total,
				page,
				pageSize
			}
		};
	} catch (error) {
		console.error('获取机具列表失败:', error);
		return {
			code: 500,
			message: '获取失败'
		};
	}
}

// 虚拟刷卡（模拟流水）
async function virtualSwipe(data, event) {
	try {
		const { deviceId, amount } = data || {};
		const swipeAmount = Number(amount);
		if (!deviceId) {
			return { code: 400, message: '缺少机具编号' };
		}
		if (!Number.isFinite(swipeAmount) || swipeAmount <= 0) {
			return { code: 400, message: '刷卡金额必须为正数' };
		}

		const machineRes = await machineCollection.where({
			device_id: deviceId,
			is_deleted: false
		}).get();
		if (machineRes.data.length === 0) {
			return { code: 404, message: '机具不存在' };
		}
		const machine = machineRes.data[0];
		if (machine.is_bound !== 1 || !machine.bind_user_id) {
			return { code: 403, message: '未绑定用户不允许刷卡' };
		}

		const newTotal = Number((Number(machine.total_transaction || 0) + swipeAmount).toFixed(2));
		await machineCollection.where({ device_id: deviceId, is_deleted: false }).update({
			total_transaction: newTotal
		});

		const tradeNo = generateTradeNo();
		const now = Date.now();
		await tradeCollection.add({
			device_id: deviceId,
			trade_no: tradeNo,
			user_id: machine.bind_user_id,
			user_name: machine.bind_user_name || '',
			user_mobile: '',
			trade_type: 'virtual',
			amount: swipeAmount,
			is_activated: !!machine.is_activated,
			total_transaction: newTotal,
			cashback: null,
			release_amount: null,
			company: machine.merchant || '管理员',
			create_time: now
		});

		await recordOperationLog(event, 'virtualSwipe', deviceId, deviceId, `虚拟刷卡: ${deviceId} 金额￥${swipeAmount}`);

		return { code: 0, message: '刷卡成功', data: { totalTransaction: newTotal, tradeNo } };
	} catch (error) {
		console.error('虚拟刷卡失败:', error);
		return { code: 500, message: '刷卡失败' };
	}
}

// 获取交易流水列表（虚拟刷卡/真实刷卡）
async function getTradeList(data) {
	try {
		const { deviceId, page = 1, pageSize = 10 } = data || {};
		if (!deviceId) {
			return { code: 400, message: '缺少机具编号' };
		}

		const query = tradeCollection.where({ device_id: deviceId });
		const countRes = await query.count();
		const total = countRes.total;
		const res = await query
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();

		const list = res.data.map(item => ({
			deviceId: item.device_id,
			tradeNo: item.trade_no,
			userInfo: item.user_name ? `${item.user_name}${item.user_mobile ? '\n' + item.user_mobile : ''}` : '',
			tradeType: item.trade_type === 'real' ? '真实刷卡' : '虚拟刷卡',
			isActivated: item.is_activated ? '是' : '否',
			totalTransaction: `￥${Number(item.total_transaction || 0).toFixed(2)}`,
			cashback: '',
			releaseAmount: '',
			createTime: formatTime(item.create_time),
			company: item.company ? `${item.company}\n(${item.company})` : ''
		}));

		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page, pageSize }
		};
	} catch (error) {
		console.error('获取交易流水失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

// 刷卡记录列表（多条件筛选 + 品牌/商户关联）
async function getCardRecordList(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			deviceId = '',
			brandId = '',
			tradeNo = '',
			merchantUserId = '',
			isActivated = '',
			isCashback = '',
			releaseAmount = '',
			riskStatus = '',
			timeStart = '',
			timeEnd = '',
			tradeType = ''
		} = data || {};

		let query = tradeCollection;

		if (brandId) {
			const machines = await machineCollection.where({ brand_id: brandId, is_deleted: false }).field({ device_id: true }).get();
			const deviceIds = (machines.data || []).map(m => m.device_id);
			if (deviceIds.length === 0) {
				return { code: 0, message: '获取成功', data: { list: [], total: 0, totalAmount: 0, page, pageSize } };
			}
			query = query.where({ device_id: db.command.in(deviceIds) });
		}

		if (deviceId) {
			query = query.where({ device_id: new RegExp(String(deviceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
		}
		if (tradeNo) {
			query = query.where({ trade_no: new RegExp(String(tradeNo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
		}
		if (merchantUserId) {
			query = query.where({ user_id: merchantUserId });
		}
		if (isActivated === '1') {
			query = query.where({ is_activated: true });
		} else if (isActivated === '0') {
			query = query.where({ is_activated: false });
		}
		if (isCashback === '1') {
			query = query.where({ cashback: db.command.gt(0) });
		} else if (isCashback === '0') {
			query = query.where(db.command.or([{ cashback: 0 }, { cashback: null }]));
		}
		if (releaseAmount !== '' && releaseAmount !== undefined) {
			const num = Number(releaseAmount);
			if (Number.isFinite(num) && num > 0) {
				query = query.where({ release_amount: db.command.gte(num) });
			}
		}
		if (riskStatus === 'risk') {
			query = query.where({ risk_control_status: 'risk' });
		} else if (riskStatus === 'release') {
			query = query.where({ risk_control_status: 'release' });
		} else if (riskStatus === 'no') {
			query = query.where(db.command.or([{ risk_control_status: 'no' }, { risk_control_status: null }]));
		}
		if (timeStart) {
			query = query.where({ create_time: db.command.gte(Number(timeStart)) });
		}
		if (timeEnd) {
			query = query.where({ create_time: db.command.lte(Number(timeEnd)) });
		}
		if (tradeType === 'virtual') {
			query = query.where({ trade_type: 'virtual' });
		} else if (tradeType === 'real') {
			query = query.where({ trade_type: 'real' });
		}

		const countRes = await query.count();
		const total = countRes.total;

		const res = await query
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();

		const trades = res.data || [];
		const deviceIds = [...new Set(trades.map(t => t.device_id))];
		let brandMap = {};
		if (deviceIds.length > 0) {
			const machines = await machineCollection.where({ device_id: db.command.in(deviceIds), is_deleted: false }).field({ device_id: true, brand_name: true }).get();
			(machines.data || []).forEach(m => { brandMap[m.device_id] = m.brand_name || ''; });
		}

		const list = trades.map(item => {
			const amount = Number(item.amount || 0);
			const totalTx = Number(item.total_transaction || 0);
			const cashback = Number(item.cashback || 0);
			const releaseAmt = Number(item.release_amount || 0);
			const releaseRatio = item.release_ratio != null ? item.release_ratio : (totalTx > 0 && releaseAmt > 0 ? (releaseAmt / totalTx * 100) : 0);
			const ssfl = totalTx > 0 ? (amount / totalTx * 100).toFixed(2) + '%' : '-';
			return {
				id: item._id,
				deviceId: item.device_id,
				deviceDisplay: brandMap[item.device_id] ? `(${brandMap[item.device_id]})${item.device_id}` : item.device_id,
				tradeNo: item.trade_no,
				userInfo: item.user_name ? `${item.user_name || ''}${item.user_mobile ? '\n' + item.user_mobile : ''}` : (item.user_mobile || '-'),
				tradeTypeText: item.trade_type === 'real' ? '实际消费' : '虚拟刷卡',
				tradeType: item.trade_type,
				amount,
				amountText: `￥${amount.toFixed(2)}`,
				isActivated: !!item.is_activated,
				isActivatedText: item.is_activated ? '是' : '否',
				activatedTime: item.is_activated ? formatTime(item.create_time) : '',
				totalTransaction: totalTx,
				totalTransactionText: `￥${totalTx.toFixed(2)}`,
				ssfl,
				cashback,
				cashbackText: cashback > 0 ? `￥${cashback.toFixed(4)}` : '-',
				cashbackTime: item.cashback_time ? formatTime(item.cashback_time) : '',
				releaseAmount: releaseAmt,
				releaseAmountText: releaseAmt > 0 ? `￥${releaseAmt.toFixed(4)}` : '-',
				releaseRatioText: releaseRatio > 0 ? `${releaseRatio}%` : '-',
				riskStatus: item.risk_control_status === 'risk' ? '风控' : (item.risk_control_status === 'release' ? '解除' : '否'),
				salesman: item.salesman || '未分配',
				salesmanTime: '',
				company: item.company || '管理员',
				createTime: formatTime(item.create_time)
			};
		});

		const sumRes = await query.field({ amount: true }).limit(5000).get();
		const totalAmount = (sumRes.data || []).reduce((s, t) => s + Number(t.amount || 0), 0);

		return {
			code: 0,
			message: '获取成功',
			data: { list, total, totalAmount, page, pageSize }
		};
	} catch (error) {
		console.error('刷卡记录列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

// 添加机具
async function addMachine(data, event) {
	try {
		if (!data || !data.deviceId || !data.brandId) {
			return {
				code: 400,
				message: '缺少必填字段'
			};
		}
		if (String(data.deviceId).length > 50) {
			return {
				code: 400,
				message: '设备编号不能超过50位'
			};
		}

		// 检查设备编号是否已存在
		const existingDevice = await machineCollection.where({ device_id: data.deviceId }).get();
		if (existingDevice.data.length > 0) {
			return {
				code: 400,
				message: '设备编号已存在'
			};
		}
		
		// 获取品牌名称
		const brandInfo = await brandCollection.where({ brand_id: data.brandId }).get();
		if (brandInfo.data.length === 0) {
			return {
				code: 404,
				message: '品牌不存在'
			};
		}
		
		const now = new Date().getTime();
		const machineData = {
			device_id: data.deviceId,
			brand_id: data.brandId,
			brand_name: brandInfo.data[0].brand_name,
			speaker_id: data.speakerId || '',
			is_bound: 0,
			is_activated: false,
			total_transaction: 0,
			pending_amount: 0,
			withdrawn_amount: 0,
			frozen_amount: 0,
			merchant: '管理员',
			salesman: '管理员',
			in_stock_time: now,
			is_deleted: false
		};
		
		const result = await machineCollection.add(machineData);
		
		// 记录操作日志
		await recordOperationLog(event, 'add', data.deviceId, data.deviceId, `添加机具: ${data.deviceId}`);
		
		return {
			code: 0,
			message: '添加成功',
			data: result
		};
	} catch (error) {
		console.error('添加机具失败:', error);
		return {
			code: 500,
			message: '添加失败'
		};
	}
}

// 更新机具
async function updateMachine(data, event) {
	try {
		const { id, ...updateData } = data;
		
		// 检查机具是否存在且未被删除
		const machineInfo = await machineCollection.where({ 
			device_id: id,
			is_deleted: false
		}).get();
		if (machineInfo.data.length === 0) {
			return {
				code: 404,
				message: '机具不存在'
			};
		}
		
		const update = {};
		if (updateData.brandId) {
			// 获取品牌名称
			const brandInfo = await brandCollection.where({ brand_id: updateData.brandId }).get();
			if (brandInfo.data.length === 0) {
				return {
					code: 404,
					message: '品牌不存在'
				};
			}
			update.brand_id = updateData.brandId;
			update.brand_name = brandInfo.data[0].brand_name;
		}
		if (updateData.speakerId !== undefined) update.speaker_id = updateData.speakerId;
		if (updateData.merchant !== undefined) update.merchant = updateData.merchant;
		if (updateData.salesman !== undefined) update.salesman = updateData.salesman;
		
		const result = await machineCollection.where({ 
			device_id: id,
			is_deleted: false
		}).update(update);
		
		// 记录操作日志
		await recordOperationLog(event, 'update', id, id, `更新机具: ${id}`);
		
		return {
			code: 0,
			message: '更新成功',
			data: result
		};
	} catch (error) {
		console.error('更新机具失败:', error);
		return {
			code: 500,
			message: '更新失败'
		};
	}
}

// 删除机具（软删除）
async function deleteMachine(data, event) {
	try {
		const { id } = data;
		
		// 检查机具是否存在且未被删除
		const machineInfo = await machineCollection.where({ 
			device_id: id,
			is_deleted: false
		}).get();
		if (machineInfo.data.length === 0) {
			return {
				code: 404,
				message: '机具不存在'
			};
		}
		
		const now = new Date().getTime();
		const result = await machineCollection.where({ device_id: id }).update({
			is_deleted: true,
			delete_time: now
		});
		
		// 记录操作日志
		await recordOperationLog(event, 'delete', id, id, `删除机具: ${id}`);
		
		return {
			code: 0,
			message: '删除成功',
			data: result
		};
	} catch (error) {
		console.error('删除机具失败:', error);
		return {
			code: 500,
			message: '删除失败'
		};
	}
}

// 绑定机具：按商户手机号绑定，绑定后更新商户的 device_id
async function bindMachine(data, event) {
	try {
		const { id, mobile } = data || {};
		const deviceId = String(id || '').trim();
		const mobileStr = String(mobile || '').trim();
		if (!deviceId) {
			return { code: 400, message: '缺少机具编号' };
		}
		if (!mobileStr) {
			return { code: 400, message: '请输入商户手机号码' };
		}

		const machineRes = await machineCollection.where({
			device_id: deviceId,
			is_deleted: false
		}).get();
		if (machineRes.data.length === 0) {
			return { code: 404, message: '机具不存在' };
		}
		const machine = machineRes.data[0];
		if (machine.is_bound === 1) {
			return { code: 400, message: '该机具已绑定，请先解绑' };
		}

		const merchantRes = await merchantCollection.where({ mobile: mobileStr }).get();
		if (!merchantRes.data || merchantRes.data.length === 0) {
			return { code: 400, message: '商户不存在' };
		}
		const merchant = merchantRes.data[0];
		const userId = merchant.user_id || merchant._id;
		const userName = merchant.wx_nickname || '';

		const now = Date.now();
		await machineCollection.where({ device_id: deviceId, is_deleted: false }).update({
			is_bound: 1,
			bind_time: now,
			bind_user_id: userId,
			bind_user_name: userName,
			bind_user_mobile: mobileStr
		});

		await merchantCollection.doc(merchant._id).update({
			device_id: deviceId,
			login_time: now
		});

		await recordOperationLog(event, 'bind', deviceId, deviceId, `绑定机具: ${deviceId}，商户手机 ${mobileStr}，商户名 ${userName}`);

		return { code: 0, message: '绑定成功', data: {} };
	} catch (error) {
		console.error('绑定机具失败:', error);
		return { code: 500, message: '绑定失败' };
	}
}

// 解绑机具：删除该机具流水，置为已解绑，记录解绑日志
async function unbindMachine(data, event) {
	try {
		const { id } = data;
		const deviceId = String(id || '').trim();
		if (!deviceId) {
			return { code: 400, message: '缺少机具编号' };
		}

		const machineRes = await machineCollection.where({
			device_id: deviceId,
			is_deleted: false
		}).get();
		if (machineRes.data.length === 0) {
			return { code: 404, message: '机具不存在' };
		}
		const machine = machineRes.data[0];
		const bindUserName = machine.bind_user_name || '';
		const bindUserMobile = machine.bind_user_mobile || '';

		// 删除该机具的交易流水
		await tradeCollection.where({ device_id: deviceId }).remove();

		await machineCollection.where({
			device_id: deviceId,
			is_deleted: false
		}).update({
			is_bound: 2,
			bind_time: null,
			bind_user_id: '',
			bind_user_name: '',
			bind_user_mobile: ''
		});

		// 清空该机具对应商户的 device_id
		await merchantCollection.where({ device_id: deviceId }).update({ device_id: '' });

		await recordOperationLog(event, 'unbind', deviceId, deviceId, `解绑机具: ${deviceId}，原绑定 ${bindUserName}/${bindUserMobile}，已删除流水`);

		return { code: 0, message: '解绑成功', data: {} };
	} catch (error) {
		console.error('解绑机具失败:', error);
		return { code: 500, message: '解绑失败' };
	}
}

exports.main = async (event, context) => {
	const { action, data, params } = event;
	// 兼容两种参数格式：直接传递data或通过params传递
	const actualData = data || params;
	
	switch (action) {
		case 'list':
			return await getMachineList(actualData);
		case 'add':
			return await addMachine(actualData, event);
		case 'update':
			return await updateMachine(actualData, event);
		case 'delete':
			return await deleteMachine(actualData, event);
		case 'bind':
			return await bindMachine(actualData, event);
		case 'unbind':
			return await unbindMachine(actualData, event);
		case 'getBrands':
			return await getBrandList();
		case 'virtualSwipe':
			return await virtualSwipe(actualData, event);
		case 'tradeList':
			return await getTradeList(actualData);
		case 'cardRecordList':
			return await getCardRecordList(actualData);
		default:
			return {
				code: 400,
				message: '无效的操作'
			};
	}
};