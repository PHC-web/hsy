'use strict';
const db = uniCloud.database();
const brandCollection = db.collection('hsy-brand');
const operationLogCollection = db.collection('hsy-operation-logs');
const agreementCollection = db.collection('hsy-agreements');
const merchantCollection = db.collection('hsy-merchant-users');

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
		case 'agreementCreate':
			return await agreementCreate(actualData, event);
		case 'agreementList':
			return await agreementList(actualData);
		case 'agreementSignList':
			return await agreementSignList(actualData);
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

function safeText(v, max = 200) {
	return String(v == null ? '' : v).trim().slice(0, max);
}

function mkAgreementVersion() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	return `AG-${y}${m}${day}${hh}${mm}${ss}`;
}

async function agreementCreate(data, event) {
	try {
		const title = safeText(data?.title, 80) || '开户优惠活动计划书';
		const pdfFileId = safeText(data?.pdfFileId || data?.pdf_url, 400);
		const notifyAllResign = !!data?.notifyAllResign;
		if (!pdfFileId) return { code: 400, message: '请先上传协议PDF' };
		const now = Date.now();
		const version = safeText(data?.version, 40) || mkAgreementVersion();
		await agreementCollection.where({ is_deleted: false, is_current: true }).update({
			is_current: false,
			update_time: now
		});
		const addRes = await agreementCollection.add({
			title,
			version,
			pdf_file_id: pdfFileId,
			notify_all_resign: notifyAllResign,
			is_current: true,
			is_deleted: false,
			create_time: now,
			update_time: now
		});
		await recordOperationLog(
			event,
			'agreementCreate',
			String(addRes.id || ''),
			title,
			`发布协议: ${title}(${version})，通知全员重签=${notifyAllResign ? '是' : '否'}`
		);
		return { code: 0, message: '发布成功', data: { id: addRes.id, version } };
	} catch (error) {
		console.error('agreementCreate failed:', error);
		return { code: 500, message: '发布失败' };
	}
}

async function agreementList(data) {
	try {
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(50, Math.max(1, Number(data?.pageSize || 10)));
		const title = safeText(data?.title, 80);
		let query = agreementCollection.where({ is_deleted: false });
		if (title) query = query.where({ title: new RegExp(title) });
		const countRes = await query.count();
		const total = Number(countRes.total || 0);
		const res = await query
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.orderBy('create_time', 'desc')
			.get();
		const allMerchants = await merchantCollection
			.where({ is_deleted: db.command.neq(true) })
			.field({ _id: true, agreement_img: true, agreement_version: true })
			.limit(20000)
			.get();
		const merchants = allMerchants.data || [];
		const merchantTotal = merchants.length;
		const list = (res.data || []).map((x) => {
			const signedCount = merchants.filter(
				(m) => String(m.agreement_version || '') === String(x.version || '') && String(m.agreement_img || '').trim()
			).length;
			const needSignCount = x.notify_all_resign
				? Math.max(0, merchantTotal - signedCount)
				: merchants.filter((m) => !String(m.agreement_img || '').trim()).length;
			return {
				id: String(x._id || ''),
				title: x.title || '',
				version: x.version || '',
				pdfFileId: x.pdf_file_id || '',
				notifyAllResign: !!x.notify_all_resign,
				isCurrent: !!x.is_current,
				signedCount,
				needSignCount,
				merchantTotal,
				createTime: formatTime(x.create_time),
				updateTime: formatTime(x.update_time)
			};
		});
		return { code: 0, message: '获取成功', data: { list, total, page, pageSize } };
	} catch (error) {
		console.error('agreementList failed:', error);
		return { code: 500, message: '获取失败' };
	}
}

async function agreementSignList(data) {
	try {
		const agreementId = safeText(data?.agreementId, 80);
		if (!agreementId) return { code: 400, message: '缺少协议ID' };
		const page = Math.max(1, Number(data?.page || 1));
		const pageSize = Math.min(100, Math.max(1, Number(data?.pageSize || 20)));
		const keyword = safeText(data?.keyword, 80);
		const status = safeText(data?.status, 20);
		const aRes = await agreementCollection.where({ _id: agreementId, is_deleted: false }).limit(1).get();
		const agreement = aRes.data && aRes.data[0];
		if (!agreement) return { code: 404, message: '协议不存在' };
		const mRes = await merchantCollection
			.where({ is_deleted: db.command.neq(true) })
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				agreement_version: true,
				agreement_img: true,
				agreement_signed_at: true
			})
			.limit(20000)
			.get();
		const version = String(agreement.version || '');
		let rows = (mRes.data || []).map((m) => {
			const matched = String(m.agreement_version || '') === version && String(m.agreement_img || '').trim();
			return {
				id: String(m._id || ''),
				userId: String(m.user_id || m._id || ''),
				nickname: m.wx_nickname || '-',
				mobile: m.mobile || '-',
				signed: !!matched,
				signedAt: matched ? formatTime(m.agreement_signed_at) : '',
				signImage: matched ? m.agreement_img || '' : '',
				agreementVersion: m.agreement_version || ''
			};
		});
		if (keyword) {
			rows = rows.filter(
				(x) =>
					String(x.userId).includes(keyword) ||
					String(x.nickname).includes(keyword) ||
					String(x.mobile).includes(keyword)
			);
		}
		if (status === 'signed') rows = rows.filter((x) => x.signed);
		if (status === 'unsigned') rows = rows.filter((x) => !x.signed);
		const total = rows.length;
		const start = (page - 1) * pageSize;
		const list = rows.slice(start, start + pageSize);
		return {
			code: 0,
			message: '获取成功',
			data: {
				agreement: {
					id: String(agreement._id || ''),
					title: agreement.title || '',
					version,
					pdfFileId: agreement.pdf_file_id || '',
					notifyAllResign: !!agreement.notify_all_resign
				},
				list,
				total,
				page,
				pageSize
			}
		};
	} catch (error) {
		console.error('agreementSignList failed:', error);
		return { code: 500, message: '获取失败' };
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