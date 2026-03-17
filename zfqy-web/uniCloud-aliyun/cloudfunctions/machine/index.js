'use strict';
const db = uniCloud.database();
const machineCollection = db.collection('opendb-machine');
const brandCollection = db.collection('opendb-brand');
const operationLogCollection = db.collection('opendb-operation-logs');

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
			bindUserName: item.bind_user_name || '',
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

// 添加机具
async function addMachine(data, event) {
	try {
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

// 解绑机具
async function unbindMachine(data, event) {
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
		
		const result = await machineCollection.where({ 
			device_id: id,
			is_deleted: false
		}).update({
			is_bound: 2,
			bind_user_id: '',
			bind_user_name: ''
		});
		
		// 记录操作日志
		await recordOperationLog(event, 'unbind', id, id, `解绑机具: ${id}`);
		
		return {
			code: 0,
			message: '解绑成功',
			data: result
		};
	} catch (error) {
		console.error('解绑机具失败:', error);
		return {
			code: 500,
			message: '解绑失败'
		};
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
		case 'unbind':
			return await unbindMachine(actualData, event);
		case 'getBrands':
			return await getBrandList();
		default:
			return {
				code: 400,
				message: '无效的操作'
			};
	}
};