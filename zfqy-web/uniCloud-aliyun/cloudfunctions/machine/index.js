'use strict';
const db = uniCloud.database();
const machineCollection = db.collection('hsy-machine');
const brandCollection = db.collection('hsy-brand');
const operationLogCollection = db.collection('hsy-operation-logs');
const tradeCollection = db.collection('hsy-machine-trades');
const merchantCollection = db.collection('hsy-merchant-users');
const incomePacketCollection = db.collection('hsy-income-packets');
const withdrawCollection = db.collection('hsy-withdraw-records');
const { formatTimeMs: formatTime, shanghaiYearMonthFromTs } = require('./format-time-cn.js');
const { tradeMemberBucketForMerchant } = require('./trade-member-bucket.js');

const monthNo = shanghaiYearMonthFromTs;

function generateTradeNo() {
	const ts = Date.now();
	const rnd = Math.floor(Math.random() * 9000) + 1000;
	return `MOCK${ts}${rnd}`;
}

/** 与商户管理「待提现」一致：优先 withdraw_pending_balance，否则 account_points */
function rawPendingBalance(row) {
	if (!row) return 0;
	if (row.withdraw_pending_balance != null && row.withdraw_pending_balance !== '') {
		return Number(row.withdraw_pending_balance || 0);
	}
	return Number(row.account_points || 0);
}
function normalizePendingBalance(row) {
	return Math.max(0, Number(Number(rawPendingBalance(row)).toFixed(2)));
}
/**
 * 与商户管理「已提现」、H5 已到账统计一致：arrival_status=received 的 amount 求和
 */
async function batchComputeReceivedWithdrawAmountForMerchants(merchantDocs) {
	const amountByUid = new Map();
	const rows = Array.isArray(merchantDocs) ? merchantDocs : [];
	if (!rows.length) return amountByUid;
	const uids = [...new Set(rows.map((m) => String(m.user_id || m._id || '')).filter(Boolean))];
	if (!uids.length) return amountByUid;

	for (const uid of uids) amountByUid.set(uid, 0);
	const _ = db.command;
	const pageSize = 5000;
	let skip = 0;
	let guard = 0;
	while (guard < 30) {
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

	for (const [uid, sum] of amountByUid.entries()) {
		amountByUid.set(uid, Number(Number(sum || 0).toFixed(2)));
	}
	return amountByUid;
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

async function tryActivateMachineByTotal(machine, newTotal, now) {
	if (!machine || machine.is_activated) return { activated: !!(machine && machine.is_activated), activatedTime: machine?.activated_time || null };
	const brandId = String(machine.brand_id || '').trim();
	const brandName = String(machine.brand_name || '').trim();
	let brand = null;
	if (brandId) {
		const brandRes = await brandCollection
			.where(
				db.command.and([
					{ brand_id: brandId },
					db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])
				])
			)
			.limit(1)
			.get();
		brand = brandRes.data && brandRes.data[0];
	}
	if (!brand && brandName) {
		const brandByName = await brandCollection
			.where(
				db.command.and([
					{ brand_name: brandName },
					db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])
				])
			)
			.limit(1)
			.get();
		brand = brandByName.data && brandByName.data[0];
	}
	if (!brand) return { activated: !!machine.is_activated, activatedTime: machine.activated_time || null };
	const cond = Number(brand.activation_condition || 0);
	if (!(Number.isFinite(cond) && cond > 0)) return { activated: !!machine.is_activated, activatedTime: machine.activated_time || null };
	if (Number(newTotal || 0) + 1e-8 < cond) return { activated: false, activatedTime: null };
	await machineCollection.where({ device_id: machine.device_id, is_deleted: false }).update({
		is_activated: true,
		activated_time: now
	});
	return { activated: true, activatedTime: now };
}

async function refreshMerchantPrimaryDeviceByUserId(userId) {
	const uid = String(userId || '').trim();
	if (!uid) return;
	const merchantRes = await merchantCollection
		.where(db.command.or([{ user_id: uid }, { _id: uid }]))
		.limit(1)
		.get();
	const merchant = merchantRes.data && merchantRes.data[0];
	if (!merchant) return;
	const boundRes = await machineCollection
		.where({ is_deleted: false, is_bound: 1, bind_user_id: uid })
		.field({ device_id: true, bind_time: true, brand_name: true })
		.limit(200)
		.get();
	const rows = boundRes.data || [];
	if (!rows.length) {
		await merchantCollection.doc(merchant._id).update({ device_id: '', brand_name: '', bind_time: null });
		return;
	}
	const primary = rows
		.slice()
		.sort((a, b) => Number(b.bind_time || 0) - Number(a.bind_time || 0))[0];
	await merchantCollection.doc(merchant._id).update({
		device_id: String(primary.device_id || ''),
		brand_name: String(primary.brand_name || ''),
		bind_time: Number(primary.bind_time || Date.now())
	});
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
			brandIds,
			speakerId = '', 
			isBound = '', 
			isBoundList,
			bindTimeStart = '', 
			bindTimeEnd = '', 
			bindUserId = '', 
			isActivated = '', 
			isActivatedList,
			activatedTimeStart = '', 
			activatedTimeEnd = '', 
			inStockTimeStart = '', 
			inStockTimeEnd = '' 
		} = data || {};
		
		// 单次 where 合并条件，避免部分环境下链式 where 未按预期叠加
		const where = { is_deleted: false };
		if (deviceId) {
			where.device_id = new RegExp(String(deviceId));
		}
		const brandIdTrim = brandId !== undefined && brandId !== null ? String(brandId).trim() : '';
		const brandIdArr = Array.isArray(brandIds)
			? [...new Set(brandIds.map((id) => String(id).trim()).filter(Boolean))]
			: [];
		if (brandIdArr.length === 1) {
			where.brand_id = brandIdArr[0];
		} else if (brandIdArr.length > 1) {
			where.brand_id = db.command.in(brandIdArr);
		} else if (brandIdTrim) {
			where.brand_id = brandIdTrim;
		}
		if (speakerId) {
			where.speaker_id = new RegExp(String(speakerId));
		}
		const boundArr = Array.isArray(isBoundList)
			? [...new Set(isBoundList.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)))]
			: [];
		if (boundArr.length === 1) {
			where.is_bound = boundArr[0];
		} else if (boundArr.length > 1) {
			where.is_bound = db.command.in(boundArr);
		} else if (isBound !== '' && isBound !== undefined && isBound !== null) {
			where.is_bound = parseInt(isBound, 10);
		}
		if (bindTimeStart) {
			where.bind_time = db.command.gte(parseInt(bindTimeStart, 10));
		}
		if (bindTimeEnd) {
			where.bind_time = where.bind_time
				? db.command.and([where.bind_time, db.command.lte(parseInt(bindTimeEnd, 10))])
				: db.command.lte(parseInt(bindTimeEnd, 10));
		}
		if (bindUserId) {
			where.bind_user_id = String(bindUserId).trim();
		}
		const actArr = Array.isArray(isActivatedList)
			? [...new Set(isActivatedList.map((x) => String(x)))]
			: [];
		if (actArr.length === 1) {
			where.is_activated = actArr[0] === '1';
		} else if (actArr.length === 0 && isActivated !== '' && isActivated !== undefined && isActivated !== null) {
			where.is_activated = isActivated === '1';
		}
		if (activatedTimeStart) {
			where.activated_time = db.command.gte(parseInt(activatedTimeStart, 10));
		}
		if (activatedTimeEnd) {
			where.activated_time = where.activated_time
				? db.command.and([where.activated_time, db.command.lte(parseInt(activatedTimeEnd, 10))])
				: db.command.lte(parseInt(activatedTimeEnd, 10));
		}
		if (inStockTimeStart) {
			where.in_stock_time = db.command.gte(parseInt(inStockTimeStart, 10));
		}
		if (inStockTimeEnd) {
			where.in_stock_time = where.in_stock_time
				? db.command.and([where.in_stock_time, db.command.lte(parseInt(inStockTimeEnd, 10))])
				: db.command.lte(parseInt(inStockTimeEnd, 10));
		}

		let query = machineCollection.where(where);

		// 计算总数
		const countResult = await query.count();
		const total = countResult.total;
		
		// 分页查询
		const result = await query
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.orderBy('in_stock_time', 'desc')
			.get();
		
		// 与商户管理一致：先解析本页绑定的商户，再批量算「已到账提现」
		const rows = result.data || [];
		const resolved = await Promise.all(
			rows.map(async (item) => {
				let merchant = null;
				if (item.is_bound === 1 && item.bind_user_id) {
					try {
						const merchantByDevice = await merchantCollection
							.where({ device_id: String(item.device_id) })
							.limit(1)
							.get();
						merchant = merchantByDevice.data && merchantByDevice.data[0];
						if (!merchant) {
							const merchantRes = await merchantCollection
								.where(
									db.command.or([
										{ user_id: String(item.bind_user_id) },
										{ _id: String(item.bind_user_id) }
									])
								)
								.limit(1)
								.get();
							merchant = merchantRes.data && merchantRes.data[0];
						}
					} catch (e) {
						console.error('resolve merchant for machine list failed:', e);
					}
				}
				return { item, merchant };
			})
		);
		const merchantDocs = resolved.map((r) => r.merchant).filter(Boolean);
		const withdrawnByUid = await batchComputeReceivedWithdrawAmountForMerchants(merchantDocs);

		// 格式化数据
		const machineList = await Promise.all(
			resolved.map(async ({ item, merchant }) => {
				let frozen = Number(item.frozen_amount || 0);
				let pendingAmt = Number(item.pending_amount || 0);
				let withdrawnAmt = Number(item.withdrawn_amount || 0);
				const bindStart = Number(item.bind_time || 0);
				if (item.is_bound === 1 && item.bind_user_id) {
					try {
						if (merchant) {
							const uid = String(merchant.user_id || merchant._id || '');
							pendingAmt = normalizePendingBalance(merchant);
							withdrawnAmt = Number(
								(withdrawnByUid.has(uid) ? withdrawnByUid.get(uid) : Number(merchant.withdrawn || 0)) || 0
							);
							if (
								Number(item.pending_amount || 0) !== pendingAmt ||
								Number(item.withdrawn_amount || 0) !== withdrawnAmt
							) {
								await machineCollection.doc(item._id).update({
									pending_amount: Number(pendingAmt.toFixed(4)),
									withdrawn_amount: Number(withdrawnAmt.toFixed(4))
								});
							}
						}

						const tradeRes = await tradeCollection
							.where({
								device_id: item.device_id,
								is_deleted: db.command.neq(true),
								amount: db.command.gt(0),
								create_time: bindStart ? db.command.gte(bindStart) : db.command.gt(0)
							})
							.field({ cashback: true, amount: true })
							.limit(5000)
							.get();
						let freezeTotal = 0;
						(tradeRes.data || []).forEach((t) => {
							const c = t.cashback != null ? Number(t.cashback || 0) : Number(t.amount || 0) * 0.0038;
							if (Number.isFinite(c) && c > 0) freezeTotal += c;
						});
						const claimRes = await incomePacketCollection
							.where({
								merchant_user_id: String(item.bind_user_id),
								status: 'claimed',
								is_deleted: false,
								claimed_time: bindStart ? db.command.gte(bindStart) : db.command.gt(0)
							})
							.field({ amount: true })
							.limit(5000)
							.get();
						let releaseTotal = 0;
						(claimRes.data || []).forEach((p) => {
							releaseTotal += Number(p.amount || 0);
						});
						frozen = Math.max(0, Number((freezeTotal - releaseTotal).toFixed(4)));
					} catch (e) {
						console.error('calc frozen_amount failed:', e);
					}
				}
				return {
					id: item.device_id,
					deviceId: item.device_id,
					brandId: item.brand_id,
					brandName: item.brand_name,
					speakerId: item.speaker_id || '-',
					isBound: item.is_bound,
					isBoundText: item.is_bound === 0 ? '未绑定' : item.is_bound === 1 ? '已绑定' : '已解绑',
					bindTime: formatTime(item.bind_time),
					bindUserId: item.bind_user_id || '',
					bindUserName: item.bind_user_name || '',
					bindUserMobile: item.bind_user_mobile || '',
					isActivated: item.is_activated,
					isActivatedText: item.is_activated ? '已激活' : '未激活',
					activatedTime: formatTime(item.activated_time),
					totalTransaction: `￥${item.total_transaction.toFixed(2)}`,
					pendingWithdrawn: `￥${Number(pendingAmt || 0).toFixed(2)}/${Number(withdrawnAmt || 0).toFixed(2)}`,
					frozenAmount: `￥${Number(frozen || 0).toFixed(2)}`,
					merchant: item.merchant || '管理员',
					salesman: item.salesman || '管理员',
					inStockTime: formatTime(item.in_stock_time)
				};
			})
		);
		
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

		const cashback = Number((swipeAmount * 0.0038).toFixed(4));
		const installments = swipeAmount > 300 ? 5 : 1;
		const releaseAmount = Number((cashback / installments).toFixed(4));
		const newTotal = Number((Number(machine.total_transaction || 0) + swipeAmount).toFixed(2));
		const now = Date.now();
		await machineCollection.where({ device_id: deviceId, is_deleted: false }).update({
			total_transaction: newTotal,
			frozen_amount: Number((Number(machine.frozen_amount || 0) + cashback).toFixed(4))
		});
		let tradeMemberBucket = 'non_member';
		let mer = null;
		if (machine.bind_user_id) {
			const mRes = await merchantCollection
				.where(db.command.or([{ user_id: String(machine.bind_user_id) }, { _id: String(machine.bind_user_id) }]))
				.limit(1)
				.get();
			mer = mRes.data && mRes.data[0];
			if (mer) tradeMemberBucket = tradeMemberBucketForMerchant(mer);
		}
		// 商户基础表 frozen_amount 同步累加，供商户管理列表直接读取
		if (cashback > 0 && mer) {
			await merchantCollection.doc(mer._id).update({
				frozen_amount: Number((Number(mer.frozen_amount || 0) + cashback).toFixed(4)),
				update_time: now
			});
		}
		const act = await tryActivateMachineByTotal(machine, newTotal, now);

		const tradeNo = generateTradeNo();
		await tradeCollection.add({
			device_id: deviceId,
			trade_no: tradeNo,
			user_id: machine.bind_user_id,
			user_name: machine.bind_user_name || '',
			user_mobile: '',
			trade_type: 'virtual',
			paychannel: '',
			paychannel_text: '虚拟',
			is_risk_trade: false,
			risk_audit_status: 'none',
			stats_eligible: true,
			trade_member_bucket: tradeMemberBucket,
			amount: swipeAmount,
			is_activated: !!act.activated,
			total_transaction: newTotal,
			cashback: cashback,
			cashback_time: cashback > 0 ? now : null,
			release_amount: releaseAmount,
			release_ratio: Number((100 / installments).toFixed(2)),
			is_deleted: false,
			company: machine.merchant || '管理员',
			risk_control_status: 'no',
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

		const query = tradeCollection.where({ device_id: deviceId, is_deleted: db.command.neq(true) });
		const countRes = await query.count();
		const total = countRes.total;
		const res = await query
			.orderBy('create_time', 'desc')
			.orderBy('_id', 'desc')
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
			cashback: Number(item.cashback || 0) > 0 ? `￥${Number(item.cashback || 0).toFixed(4)}${item.cashback_time ? '\n' + formatTime(item.cashback_time) : ''}` : '-',
			releaseAmount: Number(item.release_amount || 0) > 0 ? `￥${Number(item.release_amount || 0).toFixed(4)}\n${Number(item.release_ratio || 20)}%` : '-',
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

async function getFreezeBillList(data) {
	try {
		const {
			deviceId = '',
			releaseMonth = '',
			tradeNo = '',
			accountType = '',
			page = 1,
			pageSize = 20
		} = data || {};
		if (!deviceId) return { code: 400, message: '缺少机具编号' };
		const machineRes = await machineCollection.where({ device_id: String(deviceId), is_deleted: false }).limit(1).get();
		const machine = machineRes.data && machineRes.data[0];
		const bindStart = Number(machine?.bind_time || 0);
		const q = tradeCollection.where({
			device_id: String(deviceId),
			is_deleted: db.command.neq(true),
			amount: db.command.gt(0),
			create_time: bindStart ? db.command.gte(bindStart) : db.command.gt(0)
		});
		const res = await q.orderBy('create_time', 'asc').orderBy('_id', 'asc').limit(5000).get();
		const trades = res.data || [];
		const merchantUserId = machine && machine.bind_user_id ? String(machine.bind_user_id) : '';
		let claimedPackets = [];
		if (merchantUserId) {
			const packetRes = await incomePacketCollection
				.where({
					merchant_user_id: merchantUserId,
					status: 'claimed',
					is_deleted: false,
					claimed_time: bindStart ? db.command.gte(bindStart) : db.command.gt(0)
				})
				.orderBy('claimed_time', 'asc')
				.orderBy('_id', 'asc')
				.limit(5000)
				.get();
			claimedPackets = packetRes.data || [];
		}
		let bal = 0;
		const events = [];
		for (const t of trades) {
			const ts = Number(t.create_time || Date.now());
			const ym = monthNo(ts);
			const no = String(t.trade_no || '');
			const amount = Number(t.amount || 0);
			const cashback = Number((t.cashback != null ? t.cashback : amount * 0.0038).toFixed(4));
			if (cashback > 0) {
				events.push({
					eventType: 'freeze',
					ts,
					deviceId: String(deviceId),
					releaseMonth: ym,
					tradeNo: no,
					accountType: '冻结',
					tradeAmount: amount.toFixed(4),
					billAmount: cashback.toFixed(4)
				});
			}
		}
		for (const p of claimedPackets) {
			const ts = Number(p.claimed_time || p.update_time || p.create_time || Date.now());
			const amt = Number(p.amount || 0);
			if (amt > 0) {
				events.push({
					eventType: 'release',
					ts,
					deviceId: String(deviceId),
					releaseMonth: String(p.month_no || monthNo(ts)),
					tradeNo: String(p.packet_no || p.dedup_key || p._id || ''),
					accountType: '释放',
					tradeAmount: '-',
					billAmount: amt.toFixed(4)
				});
			}
		}
		events.sort((a, b) => Number(a.ts) - Number(b.ts));
		const rows = [];
		for (const e of events) {
			const orig = bal;
			if (e.eventType === 'freeze') {
				bal = Number((orig + Number(e.billAmount || 0)).toFixed(4));
			} else {
				bal = Number(Math.max(0, orig - Number(e.billAmount || 0)).toFixed(4));
			}
			rows.push({
				deviceId: e.deviceId,
				releaseMonth: e.releaseMonth,
				tradeNo: e.tradeNo,
				accountType: e.accountType,
				tradeAmount: e.tradeAmount,
				originalAmount: orig.toFixed(4),
				billAmount: e.billAmount,
				ratioText: e.eventType === 'freeze' ? '0.38% - 20%' : '领取释放',
				postAmount: bal.toFixed(4),
				createTime: formatTime(e.ts),
				_ts: e.ts
			});
		}
		let out = rows;
		if (releaseMonth) out = out.filter((x) => String(x.releaseMonth) === String(releaseMonth));
		if (tradeNo) out = out.filter((x) => String(x.tradeNo).includes(String(tradeNo)));
		if (accountType) out = out.filter((x) => String(x.accountType) === String(accountType));
		out = out.sort((a, b) => Number(b._ts) - Number(a._ts));
		const total = out.length;
		const start = (Number(page) - 1) * Number(pageSize);
		const list = out.slice(start, start + Number(pageSize)).map(({ _ts, ...rest }) => rest);
		return { code: 0, message: '获取成功', data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
	} catch (error) {
		console.error('冻结账单列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

/** get() 默认最多 100 条，必须分页否则「已绑定机具」列表不全，刷卡记录会漏数据 */
const CARD_LIST_BOUND_MACHINE_PAGE = 1000;
/** MongoDB in 列表过长时拆成 $or，降低单次查询体积 */
const CARD_LIST_IN_CHUNK = 450;

function chunkIdsForIn(arr, chunkSize) {
	const out = [];
	const a = Array.isArray(arr) ? arr : [];
	for (let i = 0; i < a.length; i += chunkSize) out.push(a.slice(i, i + chunkSize));
	return out;
}

/**
 * 拉取满足条件的全部已绑定机具的 device_id / bind_user_id（分页）
 */
async function fetchAllBoundMachineIdsForCardList(boundMachineWhere) {
	const deviceSet = new Set();
	const userSet = new Set();
	let skip = 0;
	for (;;) {
		const r = await machineCollection
			.where(boundMachineWhere)
			.field({ device_id: true, bind_user_id: true })
			.skip(skip)
			.limit(CARD_LIST_BOUND_MACHINE_PAGE)
			.get();
		const rows = r.data || [];
		for (const x of rows) {
			const d = String(x.device_id || '').trim();
			const u = String(x.bind_user_id || '').trim();
			if (d) deviceSet.add(d);
			if (u) userSet.add(u);
		}
		if (rows.length < CARD_LIST_BOUND_MACHINE_PAGE) break;
		skip += CARD_LIST_BOUND_MACHINE_PAGE;
		if (skip > 200000) break;
	}
	return { boundDeviceIds: [...deviceSet], boundUserIds: [...userSet] };
}

// 刷卡记录列表（多条件筛选 + 品牌/商户关联）
async function getCardRecordList(data) {
	try {
		const _ = db.command;
		const {
			page = 1,
			pageSize = 10,
			deviceId = '',
			brandId = '',
			brandIds,
			tradeNo = '',
			merchantUserId = '',
			merchantUserIds,
			isActivated = '',
			isActivatedList,
			isCashback = '',
			isCashbackList,
			releaseAmount = '',
			riskStatus = '',
			riskStatusList,
			timeStart = '',
			timeEnd = '',
			tradeType = '',
			tradeTypeList
		} = data || {};

		const whereParts = [{ is_deleted: _.neq(true) }];
		const pushWhere = (cond) => {
			if (cond) whereParts.push(cond);
		};

		const brandKeyArr = Array.isArray(brandIds) && brandIds.length
			? [...new Set(brandIds.map((id) => String(id).trim()).filter(Boolean))]
			: (String(brandId || '').trim() ? [String(brandId).trim()] : []);
		if (brandKeyArr.length) {
			const brandWhere = brandKeyArr.length === 1
				? { brand_id: brandKeyArr[0] }
				: { brand_id: _.in(brandKeyArr) };
			const machines = await machineCollection.where({ ...brandWhere, is_deleted: false }).field({ device_id: true }).get();
			const deviceIds = (machines.data || []).map(m => m.device_id);
			if (deviceIds.length === 0) {
				return { code: 0, message: '获取成功', data: { list: [], total: 0, totalAmount: 0, page, pageSize } };
			}
			pushWhere({ device_id: _.in(deviceIds) });
		}

		if (deviceId) {
			pushWhere({ device_id: new RegExp(String(deviceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
		}
		if (tradeNo) {
			pushWhere({ trade_no: new RegExp(String(tradeNo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
		}
		const muidArr = Array.isArray(merchantUserIds) && merchantUserIds.length
			? [...new Set(merchantUserIds.map((id) => String(id).trim()).filter(Boolean))]
			: (String(merchantUserId || '').trim() ? [String(merchantUserId).trim()] : []);
		if (muidArr.length === 1) {
			pushWhere({ user_id: muidArr[0] });
		} else if (muidArr.length > 1) {
			pushWhere({ user_id: _.in(muidArr) });
		}
		// 强约束：仅统计“当前仍处于已绑定状态”的机具流水，且绑定用户与流水 user_id 一致。
		const boundMachineWhere = {
			is_deleted: false,
			is_bound: 1,
			bind_user_id: _.neq('')
		};
		if (brandKeyArr.length === 1) {
			boundMachineWhere.brand_id = brandKeyArr[0];
		} else if (brandKeyArr.length > 1) {
			boundMachineWhere.brand_id = _.in(brandKeyArr);
		}
		if (muidArr.length === 1) {
			boundMachineWhere.bind_user_id = muidArr[0];
		} else if (muidArr.length > 1) {
			boundMachineWhere.bind_user_id = _.in(muidArr);
		}
		const { boundDeviceIds, boundUserIds } = await fetchAllBoundMachineIdsForCardList(boundMachineWhere);
		if (!boundDeviceIds.length || !boundUserIds.length) {
			return { code: 0, message: '获取成功', data: { list: [], total: 0, totalAmount: 0, page, pageSize } };
		}
		const pushIdIn = (field, ids) => {
			if (!ids || !ids.length) return;
			if (ids.length <= CARD_LIST_IN_CHUNK) {
				pushWhere({ [field]: _.in(ids) });
				return;
			}
			pushWhere(_.or(chunkIdsForIn(ids, CARD_LIST_IN_CHUNK).map((c) => ({ [field]: _.in(c) }))));
		};
		pushIdIn('device_id', boundDeviceIds);
		pushIdIn('user_id', boundUserIds);
		const actArr = Array.isArray(isActivatedList)
			? [...new Set(isActivatedList.map((x) => String(x)))]
			: [];
		if (actArr.length === 1) {
			if (actArr[0] === '1') {
				pushWhere({ is_activated: true });
			} else if (actArr[0] === '0') {
				pushWhere({ is_activated: false });
			}
		} else if (actArr.length === 0) {
			if (isActivated === '1') {
				pushWhere({ is_activated: true });
			} else if (isActivated === '0') {
				pushWhere({ is_activated: false });
			}
		}
		const cbArr = Array.isArray(isCashbackList)
			? [...new Set(isCashbackList.map((x) => String(x)))]
			: [];
		if (cbArr.length === 1) {
			if (cbArr[0] === '1') {
				pushWhere({ cashback: _.gt(0) });
			} else if (cbArr[0] === '0') {
				pushWhere(_.or([{ cashback: 0 }, { cashback: null }]));
			}
		} else if (cbArr.length === 0) {
			if (isCashback === '1') {
				pushWhere({ cashback: _.gt(0) });
			} else if (isCashback === '0') {
				pushWhere(_.or([{ cashback: 0 }, { cashback: null }]));
			}
		}
		if (releaseAmount !== '' && releaseAmount !== undefined) {
			const num = Number(releaseAmount);
			if (Number.isFinite(num) && num > 0) {
				pushWhere({ release_amount: _.gte(num) });
			}
		}
		const rsArr = Array.isArray(riskStatusList)
			? [...new Set(riskStatusList.map((x) => String(x)))]
			: [];
		if (rsArr.length === 1) {
			if (rsArr[0] === 'risk') {
				pushWhere(_.or([{ risk_control_status: 'risk' }, { risk_audit_status: 'pending' }]));
			} else if (rsArr[0] === 'release') {
				pushWhere(_.or([{ risk_control_status: 'release' }, { risk_audit_status: 'approved' }]));
			} else if (rsArr[0] === 'no') {
				pushWhere({ is_risk_trade: _.neq(true) });
			}
		} else if (rsArr.length > 1) {
			const ors = [];
			for (const r of rsArr) {
				if (r === 'risk') {
					ors.push(_.or([{ risk_control_status: 'risk' }, { risk_audit_status: 'pending' }]));
				} else if (r === 'release') {
					ors.push(_.or([{ risk_control_status: 'release' }, { risk_audit_status: 'approved' }]));
				} else if (r === 'no') {
					ors.push({ is_risk_trade: _.neq(true) });
				}
			}
			if (ors.length) {
				pushWhere(_.or(ors));
			}
		} else if (riskStatus === 'risk') {
			pushWhere(_.or([{ risk_control_status: 'risk' }, { risk_audit_status: 'pending' }]));
		} else if (riskStatus === 'release') {
			pushWhere(_.or([{ risk_control_status: 'release' }, { risk_audit_status: 'approved' }]));
		} else if (riskStatus === 'no') {
			pushWhere({ is_risk_trade: _.neq(true) });
		}
		if (timeStart) {
			pushWhere({ create_time: _.gte(Number(timeStart)) });
		}
		if (timeEnd) {
			pushWhere({ create_time: _.lte(Number(timeEnd)) });
		}
		const ttArr = Array.isArray(tradeTypeList)
			? [...new Set(tradeTypeList.map((x) => String(x)))]
			: [];
		if (ttArr.length === 1) {
			pushWhere({ trade_type: ttArr[0] });
		} else if (ttArr.length > 1) {
			pushWhere({ trade_type: _.in(ttArr) });
		} else if (tradeType === 'virtual') {
			pushWhere({ trade_type: 'virtual' });
		} else if (tradeType === 'real') {
			pushWhere({ trade_type: 'real' });
		}

		// 刷卡记录页仅统计“已绑定商户机具”的流水：
		// 1) stats_eligible 必须显式为 true
		// 2) user_id 必须非空（未绑定机具流水 user_id 为空，不参与本页统计）
		// 3) 交易用户展示字段至少有一项非空（避免历史脏数据把未绑定流水统计进来）
		pushWhere({ stats_eligible: true });
		pushWhere(
			_.and([
				{ user_id: _.neq('') },
				{ user_id: _.neq(null) }
			])
		);
		pushWhere(
			_.or([
				{ user_name: _.neq('') },
				{ user_mobile: _.neq('') }
			])
		);
		pushWhere(
			_.or([
				{ is_risk_trade: _.neq(true) },
				{ risk_audit_status: 'approved' }
			])
		);

		const finalWhere = whereParts.length > 1 ? _.and(whereParts) : whereParts[0];
		const query = tradeCollection.where(finalWhere);

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
			// 业务口径：每 10000 元对应 38 积分，折算比例固定为 0.38%
			const ssfl = totalTx > 0 ? '0.38%' : '-';
			const bn = brandMap[item.device_id] || '';
			return {
				id: item._id,
				deviceId: item.device_id,
				devicePlain: item.device_id,
				brandName: bn,
				deviceDisplay: bn ? `(${bn})${item.device_id}` : item.device_id,
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
				riskStatus:
					item.risk_audit_status === 'pending'
						? '风险待审'
						: item.risk_audit_status === 'approved'
							? '风险已通过'
							: item.risk_audit_status === 'rejected'
								? '风险已驳回'
								: item.risk_control_status === 'risk'
									? '风控'
									: item.risk_control_status === 'release'
										? '解除'
										: '否',
				paychannelText: item.paychannel_text || '',
				salesman: item.salesman || '未分配',
				salesmanTime: '',
				company: item.company || '管理员',
				createTime: formatTime(item.create_time)
			};
		});

		// 用与列表完全一致的 where 条件分批求和，避免聚合 match 在部分环境下口径不一致。
		let totalAmount = 0;
		const sumPageSize = 500;
		for (let offset = 0; offset < total; offset += sumPageSize) {
			const sumChunkRes = await tradeCollection
				.where(finalWhere)
				.field({ amount: true })
				.skip(offset)
				.limit(sumPageSize)
				.get();
			const rows = sumChunkRes.data || [];
			totalAmount += rows.reduce((s, r) => s + Number(r.amount || 0), 0);
			if (rows.length < sumPageSize) break;
		}
		totalAmount = Number(totalAmount.toFixed(2));

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

function riskRecordStatusText(status) {
	const m = {
		pending: '待审核',
		approved: '审核通过',
		rejected: '审核驳回',
		reviewing: '审核中'
	};
	return m[status] || status || '-';
}

function escapeReg(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 风险管理：星驿标准贷记卡/京东白条等待审核的机具流水
async function getRiskList(data) {
	try {
		const {
			page = 1,
			pageSize = 10,
			userKeyword = '',
			snTradeKeyword = '',
			amountMin = '',
			amountMax = '',
			status = '',
			statusList,
			createTimeStart = '',
			createTimeEnd = '',
			updateTimeStart = '',
			updateTimeEnd = '',
			scenarioKeyword = '',
			sortField = '',
			sortOrder = ''
		} = data || {};

		let query = tradeCollection.where({
			is_risk_trade: true,
			stats_eligible: true,
			trade_type: 'real'
		});

		if (userKeyword) {
			const r = new RegExp(escapeReg(userKeyword), 'i');
			query = query.where(db.command.or([{ user_name: r }, { user_mobile: r }]));
		}
		if (snTradeKeyword) {
			const r = new RegExp(escapeReg(snTradeKeyword), 'i');
			query = query.where(db.command.or([{ device_id: r }, { trade_no: r }]));
		}

		const minOk = amountMin !== '' && amountMin !== undefined && Number.isFinite(Number(amountMin));
		const maxOk = amountMax !== '' && amountMax !== undefined && Number.isFinite(Number(amountMax));
		if (minOk && maxOk) {
			query = query.where(
				db.command.and([
					{ amount: db.command.gte(Number(amountMin)) },
					{ amount: db.command.lte(Number(amountMax)) }
				])
			);
		} else if (minOk) {
			query = query.where({ amount: db.command.gte(Number(amountMin)) });
		} else if (maxOk) {
			query = query.where({ amount: db.command.lte(Number(amountMax)) });
		}

		const stArr = Array.isArray(statusList)
			? [...new Set(statusList.map((x) => String(x)))]
			: [];
		if (stArr.length === 1) {
			query = query.where({ risk_audit_status: stArr[0] });
		} else if (stArr.length > 1) {
			query = query.where({ risk_audit_status: db.command.in(stArr) });
		} else if (status) {
			query = query.where({ risk_audit_status: String(status) });
		}

		if (scenarioKeyword) {
			query = query.where({ paychannel_text: new RegExp(escapeReg(scenarioKeyword), 'i') });
		}

		if (createTimeStart) {
			query = query.where({ create_time: db.command.gte(Number(createTimeStart)) });
		}
		if (createTimeEnd) {
			query = query.where({ create_time: db.command.lte(Number(createTimeEnd)) });
		}
		if (updateTimeStart) {
			query = query.where({ risk_audit_time: db.command.gte(Number(updateTimeStart)) });
		}
		if (updateTimeEnd) {
			query = query.where({ risk_audit_time: db.command.lte(Number(updateTimeEnd)) });
		}

		let orderByField = 'create_time';
		let orderByDir = 'desc';
		if (sortField === 'amount' && (sortOrder === 'asc' || sortOrder === 'ascending')) {
			orderByField = 'amount';
			orderByDir = 'asc';
		} else if (sortField === 'amount' && (sortOrder === 'desc' || sortOrder === 'descending')) {
			orderByField = 'amount';
			orderByDir = 'desc';
		}

		const countRes = await query.count();
		const total = countRes.total;

		const res = await query
			.orderBy(orderByField, orderByDir)
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();

		const list = (res.data || []).map((item) => ({
			id: item._id,
			userDisplay: [item.user_name || '', item.user_mobile || ''].filter(Boolean).join('\n') || '-',
			snTradeDisplay: `${item.device_id || '-'} / ${item.trade_no || '-'}`,
			sn: item.device_id || '',
			tradeNo: item.trade_no || '',
			amount: Number(item.amount || 0),
			amountText: `￥${Number(item.amount || 0).toFixed(2)}`,
			businessLicense: '',
			tradeProof: '',
			businessScenario: item.paychannel_text || item.paychannel || '-',
			auditRemark: item.risk_audit_remark || '',
			status: item.risk_audit_status || 'pending',
			statusText: riskRecordStatusText(item.risk_audit_status || 'pending'),
			createTime: formatTime(item.create_time),
			updateTime: item.risk_audit_time ? formatTime(item.risk_audit_time) : '-'
		}));

		return {
			code: 0,
			message: '获取成功',
			data: { list, total, page, pageSize }
		};
	} catch (error) {
		console.error('风控列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

async function riskAuditTrade(data, event) {
	try {
		const tradeId = data && (data.tradeId || data.id);
		const status = String((data && data.status) || '').trim();
		const remark = String((data && data.remark) || '').trim().slice(0, 500);
		if (!tradeId) return { code: 400, message: '缺少流水ID' };
		if (status !== 'approved' && status !== 'rejected') return { code: 400, message: 'status 须为 approved 或 rejected' };

		const docRes = await tradeCollection.doc(tradeId).get();
		const doc = docRes.data && docRes.data[0];
		if (!doc) return { code: 404, message: '流水不存在' };
		if (!doc.is_risk_trade) return { code: 400, message: '非风险流水' };
		if (doc.risk_audit_status && doc.risk_audit_status !== 'pending') {
			return { code: 400, message: '该流水已审核' };
		}

		const now = Date.now();
		await tradeCollection.doc(tradeId).update({
			risk_audit_status: status,
			risk_audit_remark: remark,
			risk_audit_time: now,
			risk_control_status: status === 'approved' ? 'release' : 'risk'
		});
		// 风险流水审核通过后，补计入商户基础表 frozen_amount（之前 pending 不计入）
		if (status === 'approved') {
			const cashback = Number(doc.cashback || 0);
			const uid = String(doc.user_id || '').trim();
			if (cashback > 0 && uid) {
				const mRes = await merchantCollection.where(db.command.or([{ user_id: uid }, { _id: uid }])).limit(1).get();
				const mer = mRes.data && mRes.data[0];
				if (mer) {
					await merchantCollection.doc(mer._id).update({
						frozen_amount: Number((Number(mer.frozen_amount || 0) + cashback).toFixed(4)),
						update_time: now
					});
				}
			}
		}

		await recordOperationLog(event, 'riskAuditTrade', tradeId, tradeId, `风险审核:${status} ${remark}`);

		return { code: 0, message: '审核已保存', data: { tradeId, status } };
	} catch (error) {
		console.error('riskAuditTrade failed:', error);
		return { code: 500, message: '审核失败' };
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

// 批量导入机具（按模板：机具编号、品牌ID）
async function batchImportMachine(data, event) {
	try {
		const rows = Array.isArray(data?.rows) ? data.rows : [];
		if (!rows.length) {
			return { code: 400, message: '导入数据为空' };
		}

		const brandRes = await brandCollection.where({ is_deleted: false }).get();
		const brandMap = {};
		(brandRes.data || []).forEach((b) => {
			brandMap[String(b.brand_id)] = b.brand_name || '';
		});

		const seenInFile = new Set();
		const deviceIds = [];
		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			const brandId = String(row.brandId || '').trim();
			if (!deviceId || !brandId) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号和品牌ID必填` };
			}
			if (!brandMap[brandId]) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：品牌ID(${brandId})不存在` };
			}
			if (seenInFile.has(deviceId)) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号(${deviceId})在文件中重复` };
			}
			seenInFile.add(deviceId);
			deviceIds.push(deviceId);
		}

		const existsRes = await machineCollection.where({
			device_id: db.command.in(deviceIds),
			is_deleted: false
		}).field({ device_id: true }).get();
		const existsSet = new Set((existsRes.data || []).map((x) => String(x.device_id)));

		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			if (existsSet.has(deviceId)) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号(${deviceId})已存在` };
			}
		}

		const now = Date.now();
		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const deviceId = String(row.deviceId || '').trim();
			const brandId = String(row.brandId || '').trim();
			const speakerId = String(row.speakerId || '').trim();
			await machineCollection.add({
				device_id: deviceId,
				brand_id: brandId,
				brand_name: brandMap[brandId] || '',
				speaker_id: speakerId,
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
			});
		}

		await recordOperationLog(event, 'batchImport', 'machine', 'machine', `批量入库机具: ${rows.length}台`);
		return { code: 0, message: '导入成功', data: { successCount: rows.length } };
	} catch (error) {
		console.error('批量导入机具失败:', error);
		return { code: 500, message: '导入失败' };
	}
}

// 批量解绑机具（按模板：机具编号）
async function batchUnbindMachine(data, event) {
	try {
		const rows = Array.isArray(data?.rows) ? data.rows : [];
		if (!rows.length) {
			return { code: 400, message: '导入数据为空' };
		}

		const seenInFile = new Set();
		const deviceIds = [];
		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			if (!deviceId) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号必填` };
			}
			if (seenInFile.has(deviceId)) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号(${deviceId})在文件中重复` };
			}
			seenInFile.add(deviceId);
			deviceIds.push(deviceId);
		}

		const machineRes = await machineCollection.where({
			device_id: db.command.in(deviceIds),
			is_deleted: false
		}).get();
		const machineMap = {};
		(machineRes.data || []).forEach((m) => {
			machineMap[String(m.device_id)] = m;
		});

		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			const machine = machineMap[deviceId];
			if (!machine) {
				return { code: 400, message: `导入失败，请检查第${rowNo}行：机具编号(${deviceId})不存在` };
			}
		}

		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const deviceId = String(row.deviceId || '').trim();
			const machine = machineMap[deviceId] || {};
			const bindUserName = machine.bind_user_name || '';
			const bindUserMobile = machine.bind_user_mobile || '';

			await tradeCollection.where({ device_id: deviceId, is_deleted: db.command.neq(true) }).update({
				is_deleted: true,
				delete_time: Date.now()
			});
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
			if (machine.bind_user_id) {
				await refreshMerchantPrimaryDeviceByUserId(machine.bind_user_id);
			}
			await recordOperationLog(event, 'batchUnbind', deviceId, deviceId, `批量解绑机具: ${deviceId}，原绑定 ${bindUserName}/${bindUserMobile}，已软删除流水`);
		}

		return { code: 0, message: '解绑成功', data: { successCount: rows.length } };
	} catch (error) {
		console.error('批量解绑机具失败:', error);
		return { code: 500, message: '解绑失败' };
	}
}

// 批量删除机具（软删除，按模板：机具编号）
async function batchDeleteMachine(data, event) {
	try {
		const rows = Array.isArray(data?.rows) ? data.rows : [];
		if (!rows.length) {
			return { code: 400, message: '导入数据为空' };
		}

		const seenInFile = new Set();
		const deviceIds = [];
		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			if (!deviceId) {
				return { code: 400, message: `删除失败，请检查第${rowNo}行：机具编号必填` };
			}
			if (seenInFile.has(deviceId)) {
				return { code: 400, message: `删除失败，请检查第${rowNo}行：机具编号(${deviceId})在文件中重复` };
			}
			seenInFile.add(deviceId);
			deviceIds.push(deviceId);
		}

		const machineRes = await machineCollection.where({
			device_id: db.command.in(deviceIds),
			is_deleted: false
		}).field({ device_id: true, is_bound: true }).get();
		const machineMap = {};
		(machineRes.data || []).forEach((m) => {
			machineMap[String(m.device_id)] = m;
		});

		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const rowNo = Number(row.rowNo) || (i + 2);
			const deviceId = String(row.deviceId || '').trim();
			const machine = machineMap[deviceId];
			if (!machine) {
				return { code: 400, message: `删除失败，请检查第${rowNo}行：机具编号(${deviceId})不存在` };
			}
			if (Number(machine.is_bound) === 1) {
				return { code: 400, message: `删除失败，请检查第${rowNo}行+机具号(${deviceId})，未解除绑定，请先解除绑定后再进行删除` };
			}
		}

		const deleteUser = event?.context?.userInfo?.username || event?.context?.uid || event?.context?.OPENID || 'system';
		const now = Date.now();
		for (let i = 0; i < rows.length; i += 1) {
			const row = rows[i] || {};
			const deviceId = String(row.deviceId || '').trim();
			await machineCollection.where({ device_id: deviceId, is_deleted: false }).update({
				is_deleted: true,
				delete_time: now,
				delete_user: deleteUser
			});
			await recordOperationLog(event, 'batchDelete', deviceId, deviceId, `批量删除机具: ${deviceId}`);
		}

		return { code: 0, message: '删除成功', data: { successCount: rows.length } };
	} catch (error) {
		console.error('批量删除机具失败:', error);
		return { code: 500, message: '删除失败' };
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
		if (Number(machineInfo.data[0].is_bound) === 1) {
			return {
				code: 400,
				message: '该机具当前为已绑定状态，请先解绑后再删除'
			};
		}
		
		const deleteUser = event?.context?.userInfo?.username || event?.context?.uid || event?.context?.OPENID || 'system';
		const now = new Date().getTime();
		const result = await machineCollection.where({ device_id: id }).update({
			is_deleted: true,
			delete_time: now,
			delete_user: deleteUser
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

		// 软删除该机具当前流水（保留数据）
		await tradeCollection.where({ device_id: deviceId, is_deleted: db.command.neq(true) }).update({
			is_deleted: true,
			delete_time: Date.now()
		});

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

		if (machine.bind_user_id) {
			await refreshMerchantPrimaryDeviceByUserId(machine.bind_user_id);
		}

		await recordOperationLog(event, 'unbind', deviceId, deviceId, `解绑机具: ${deviceId}，原绑定 ${bindUserName}/${bindUserMobile}，已软删除流水`);

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
		case 'batchImport':
			return await batchImportMachine(actualData, event);
		case 'batchUnbind':
			return await batchUnbindMachine(actualData, event);
		case 'batchDelete':
			return await batchDeleteMachine(actualData, event);
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
		case 'freezeBillList':
			return await getFreezeBillList(actualData);
		case 'cardRecordList':
			return await getCardRecordList(actualData);
		case 'riskList':
			return await getRiskList(actualData);
		case 'riskAuditTrade':
			return await riskAuditTrade(actualData, event);
		default:
			return {
				code: 400,
				message: '无效的操作'
			};
	}
};