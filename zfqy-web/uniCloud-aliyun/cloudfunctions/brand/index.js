'use strict';
const db = uniCloud.database();
const brandCollection = db.collection('hsy-brand');
const operationLogCollection = db.collection('hsy-operation-logs');

exports.main = async (event, context) => {
	const { action, data, params } = event;
	// 兼容两种参数格式：直接传递data或通过params传递
	const actualData = data || params;
	
	switch (action) {
		case 'add':
			return await addBrand(actualData, event);
		case 'list':
			return await getBrandList(actualData);
		case 'update':
			return await updateBrand(actualData, event);
		case 'delete':
			return await deleteBrand(actualData, event);
		case 'get':
			return await getBrand(actualData);
		case 'updateStatus':
			return await updateBrandStatus(actualData);
		default:
			return {
				code: 400,
				message: '无效的操作'
			};
	}
};

// 添加品牌
async function addBrand(data, event) {
	try {
		// 检查品牌标识是否已存在
		const existingBrand = await brandCollection.where({ brand_id: data.brandId }).get();
		if (existingBrand.data.length > 0) {
			return {
				code: 400,
				message: '品牌标识已存在'
			};
		}
		
		// 检查品牌名称是否已存在
		const existingName = await brandCollection.where({ brand_name: data.brandName }).get();
		if (existingName.data.length > 0) {
			return {
				code: 400,
				message: '品牌名称已存在'
			};
		}
		
		const now = new Date().getTime();
		const brandData = {
			brand_id: data.brandId,
			brand_name: data.brandName,
			activation_condition: data.activationCondition ? parseFloat(data.activationCondition) : 0,
			return_machine: data.returnMachine ? parseFloat(data.returnMachine) : 0,
			public_key: data.publicKey || '',
			private_key: data.privateKey || '',
			activation_salary: data.activationSalary ? parseFloat(data.activationSalary) : 0,
			in_stock_count: 0,
			bind_count: 0,
			activated_count: 0,
			return_payment: 0,
			status: true,
			status_time: now,
			add_time: now,
			is_deleted: false
		};
		
		const result = await brandCollection.add(brandData);
		
		// 记录操作日志
		await recordOperationLog(event, 'add', data.brandId, data.brandName, `添加品牌: ${data.brandName} (${data.brandId})`);
		
		return {
			code: 0,
			message: '添加成功',
			data: result
		};
	} catch (error) {
		console.error('添加品牌失败:', error);
		return {
			code: 500,
			message: '添加失败'
		};
	}
}

// 获取品牌列表
async function getBrandList(data) {
	try {
		const { page = 1, pageSize = 10, brandId = '', brandName, status } = data || {};
		
		let query = brandCollection.where(
			db.command.or([
				{ is_deleted: false },
				{ is_deleted: db.command.exists(false) }
			])
		);
		
		if (brandId) {
			query = query.where({ brand_id: new RegExp(String(brandId)) });
		}
		// 构建查询条件
		if (brandName) {
			query = query.where({ brand_name: new RegExp(brandName) });
		}
		if (status !== undefined && status !== '') {
			query = query.where({ status: status === '1' });
		}
		
		// 计算总数
		const countResult = await query.count();
		const total = countResult.total;
		
		// 分页查询
		const result = await query
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.orderBy('add_time', 'desc')
			.get();
		
		// 格式化数据
		const brandList = result.data.map(item => ({
			id: item.brand_id,
			brandName: item.brand_name,
			activationCondition: `满￥${item.activation_condition.toFixed(2)}`,
			commission: `ZTO￥${item.activation_salary.toFixed(2)}`,
			inStockCount: item.in_stock_count,
			bindCount: item.bind_count,
			activatedCount: item.activated_count,
			returnMachine: item.return_machine,
			returnPayment: item.return_payment,
			status: item.status,
			statusTime: formatTime(item.status_time),
			addTime: formatTime(item.add_time),
			_id: item._id
		}));
		
		return {
			code: 0,
			message: '获取成功',
			data: {
				list: brandList,
				total,
				page,
				pageSize
			}
		};
	} catch (error) {
		console.error('获取品牌列表失败:', error);
		return {
			code: 500,
			message: '获取失败'
		};
	}
}

// 更新品牌
async function updateBrand(data, event) {
	try {
		const { id, ...updateData } = data;
		
		// 检查品牌是否存在且未被删除
		const brandInfo = await brandCollection.where({ 
			brand_id: id,
			is_deleted: false
		}).get();
		if (brandInfo.data.length === 0) {
			return {
				code: 404,
				message: '品牌不存在'
			};
		}
		const oldBrandName = brandInfo.data[0].brand_name;
		
		// 检查品牌名称是否已存在（如果要更新品牌名称）
		if (updateData.brandName) {
			const existingName = await brandCollection.where({ 
				brand_name: updateData.brandName,
				brand_id: db.command.neq(id),
				is_deleted: false
			}).get();
			if (existingName.data.length > 0) {
				return {
					code: 400,
					message: '品牌名称已存在'
				};
			}
		}
		
		const update = {};
		if (updateData.brandName) update.brand_name = updateData.brandName;
		if (updateData.activationCondition) update.activation_condition = parseFloat(updateData.activationCondition);
		if (updateData.activationSalary) update.activation_salary = parseFloat(updateData.activationSalary);
		
		const result = await brandCollection.where({ 
			brand_id: id,
			is_deleted: false
		}).update(update);
		
		// 记录操作日志
		const newBrandName = updateData.brandName || oldBrandName;
		await recordOperationLog(event, 'update', id, newBrandName, `更新品牌: ${oldBrandName} -> ${newBrandName}`);
		
		return {
			code: 0,
			message: '更新成功',
			data: result
		};
	} catch (error) {
		console.error('更新品牌失败:', error);
		return {
			code: 500,
			message: '更新失败'
		};
	}
}

// 删除品牌（软删除）
async function deleteBrand(data, event) {
	try {
		const { id } = data;
		
		// 检查品牌是否存在且未被删除
		const brandInfo = await brandCollection.where({ 
			brand_id: id,
			is_deleted: false
		}).get();
		if (brandInfo.data.length === 0) {
			return {
				code: 404,
				message: '品牌不存在'
			};
		}
		const brandName = brandInfo.data[0].brand_name;
		const deleteUser = event?.context?.userInfo?.username || event?.context?.uid || event?.context?.OPENID || 'system';
		
		const now = new Date().getTime();
		const result = await brandCollection.where({ brand_id: id }).update({
			is_deleted: true,
			delete_time: now,
			delete_user: deleteUser
		});
		
		// 记录操作日志
		await recordOperationLog(event, 'delete', id, brandName, `删除品牌: ${brandName} (${id})`);
		
		return {
			code: 0,
			message: '删除成功',
			data: result
		};
	} catch (error) {
		console.error('删除品牌失败:', error);
		return {
			code: 500,
			message: '删除失败'
		};
	}
}

// 获取单个品牌
async function getBrand(data) {
	try {
		const { id } = data;
		const result = await brandCollection.where({ 
			brand_id: id,
			is_deleted: false
		}).get();
		if (result.data.length === 0) {
			return {
				code: 404,
				message: '品牌不存在'
			};
		}
		return {
			code: 0,
			message: '获取成功',
			data: result.data[0]
		};
	} catch (error) {
		console.error('获取品牌失败:', error);
		return {
			code: 500,
			message: '获取失败'
		};
	}
}

// 更新品牌状态
async function updateBrandStatus(data) {
	try {
		const { id, status } = data;
		const now = new Date().getTime();
		const result = await brandCollection.where({ 
			brand_id: id,
			is_deleted: false
		}).update({
			status,
			status_time: now
		});
		return {
			code: 0,
			message: '更新成功',
			data: result
		};
	} catch (error) {
		console.error('更新品牌状态失败:', error);
		return {
			code: 500,
			message: '更新失败'
		};
	}
}

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
			module: 'brand',
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