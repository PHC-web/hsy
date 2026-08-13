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
const systemSettingCollection = db.collection('hsy-system-settings');
const BIZ_SETTING_KEY = 'h5_biz_params';

function normalizeOptimizeConfigMachine(oc) {
	const raw = oc && typeof oc === 'object' ? oc : {};
	return {
		thresholdYuan: Math.max(0, Number(raw.thresholdYuan != null ? raw.thresholdYuan : 300)),
		aboveInstallments: Math.max(1, Math.floor(Number(raw.aboveInstallments != null ? raw.aboveInstallments : 5))),
		belowInstallments: Math.max(1, Math.floor(Number(raw.belowInstallments != null ? raw.belowInstallments : 1)))
	};
}

async function loadOptimizeConfigForMachine() {
	try {
		const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(5).get();
		const rows = r.data || [];
		rows.sort((a, b) => Number(b.update_time || b.create_time || 0) - Number(a.update_time || a.create_time || 0));
		const doc = rows[0];
		const raw = doc && doc.value && typeof doc.value === 'object' ? doc.value : {};
		return normalizeOptimizeConfigMachine(raw.optimizeConfig || {});
	} catch (e) {
		return normalizeOptimizeConfigMachine(null);
	}
}

function resolveInstallmentsForAmount(amount, optimizeConfig) {
	const oc = normalizeOptimizeConfigMachine(optimizeConfig);
	const amt = Number(amount || 0);
	return amt > oc.thresholdYuan ? oc.aboveInstallments : oc.belowInstallments;
}

function ceilYuan2Machine(raw) {
	const n = Number(raw || 0);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.ceil(n * 100 - 1e-9) / 100;
}

/** 低于该金额：不产生首期积分、不累加冻结 */
function minTradeYuanForInstallments(installments) {
	return ceilYuan2Machine((0.01 * Math.max(1, Number(installments) || 1)) / 0.0038);
}

/**
 * @returns {{ cashback: number, installments: number, releaseAmount: number, deferredToFrozen: number, subsidyEligible: boolean }}
 */
function resolveSubsidyAmountsForTrade(amountYuan, optimizeConfig) {
	const amt = Number(amountYuan || 0);
	const cashback = amt > 0 ? Number((amt * 0.0038).toFixed(4)) : 0;
	const installments = resolveInstallmentsForAmount(amt, optimizeConfig);
	const minTrade = minTradeYuanForInstallments(installments);
	const subsidyEligible = amt >= minTrade && cashback > 0;
	if (!subsidyEligible) {
		return {
			cashback: 0,
			installments,
			releaseAmount: 0,
			deferredToFrozen: 0,
			subsidyEligible: false,
			minTradeYuan: minTrade
		};
	}
	const releaseAmount = Number((cashback / installments).toFixed(4));
	const deferredToFrozen = Number(Math.max(0, cashback - releaseAmount).toFixed(4));
	return {
		cashback,
		installments,
		releaseAmount,
		deferredToFrozen,
		subsidyEligible: true,
		minTradeYuan: minTrade
	};
}

function generateTradeNo() {
	const ts = Date.now();
	const rnd = Math.floor(Math.random() * 9000) + 1000;
	return `MOCK${ts}${rnd}`;
}

function generateRefundTradeNo() {
	const ts = Date.now();
	const rnd = Math.floor(Math.random() * 9000) + 1000;
	return `REF${ts}${rnd}`;
}

async function batchSumRefundedByOriginalTradeNos(tradeNos) {
	const map = new Map();
	const nos = [...new Set((tradeNos || []).map((x) => String(x || '').trim()).filter(Boolean))];
	if (!nos.length) return map;
	const _ = db.command;
	const pageSize = 1000;
	let skip = 0;
	// 依赖索引 refund_of_trade_no_is_refund；无索引时会 COLLSCAN 全表（~9 万 doc）
	const REFUND_SUM_INDEX_HINT = 'refund_of_trade_no_is_refund';
	for (let guard = 0; guard < 20; guard += 1) {
		let q = tradeCollection
			.where({
				refund_of_trade_no: _.in(nos),
				is_refund: true,
				is_deleted: _.neq(true)
			})
			.field({ refund_of_trade_no: true, amount: true })
			.skip(skip)
			.limit(pageSize);
		if (typeof q.hint === 'function') {
			try {
				q = q.hint(REFUND_SUM_INDEX_HINT) || q;
			} catch (e) {
				/* index 未建好时忽略 hint */
			}
		}
		const res = await q.get();
		const rows = res.data || [];
		for (const row of rows) {
			const key = String(row.refund_of_trade_no || '');
			if (!key) continue;
			const prev = Number(map.get(key) || 0);
			map.set(key, Number((prev + Math.abs(Number(row.amount || 0))).toFixed(2)));
		}
		if (rows.length < pageSize) break;
		skip += pageSize;
	}
	return map;
}

function buildTradeRefundMeta(item, refundedMap) {
	const amount = Number(item.amount || 0);
	const isPositive = amount > 0;
	const tradeNo = String(item.trade_no || '');
	const refundedTotal = isPositive ? Number(refundedMap.get(tradeNo) || 0) : 0;
	const refundableAmount = isPositive ? Math.max(0, Number((amount - refundedTotal).toFixed(2))) : 0;
	return {
		isRefund: !!item.is_refund || amount < 0,
		refundOfTradeNo: String(item.refund_of_trade_no || ''),
		refundedTotal,
		refundedTotalText: refundedTotal > 0 ? `￥${refundedTotal.toFixed(2)}` : '-',
		refundableAmount,
		refundableAmountText: refundableAmount > 0 ? `￥${refundableAmount.toFixed(2)}` : '-',
		canSimulateRefund: isPositive && refundableAmount >= 0.01
	};
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
	const n = Number(rawPendingBalance(row) || 0);
	if (!Number.isFinite(n) || n <= 0) return 0;
	const s = n.toString();
	if (/e-/i.test(s)) return 0;
	if (/e\+/i.test(s)) return Math.floor(n * 100) / 100;
	const dot = s.indexOf('.');
	if (dot < 0) return n;
	if (s.slice(dot + 1).length <= 2) return n;
	return Number(s.slice(0, dot + 3));
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

		// 冻结口径与商户一致：读商户 frozen_amount（仅首期已领才有值）；不再用「流水返现−已领」实时推高
		const frozenByMerchantKey = new Map();
		for (const mer of merchantDocs) {
			const uid = String(mer.user_id || mer._id || '');
			const id = String(mer._id || '');
			const v = Number(mer.frozen_amount || 0) || 0;
			if (uid) frozenByMerchantKey.set(uid, v);
			if (id) frozenByMerchantKey.set(id, v);
		}

		// 格式化数据
		const machineList = await Promise.all(
			resolved.map(async ({ item, merchant }) => {
				let frozen = Number(item.frozen_amount || 0);
				let pendingAmt = Number(item.pending_amount || 0);
				let withdrawnAmt = Number(item.withdrawn_amount || 0);
				if (item.is_bound === 1 && item.bind_user_id) {
					try {
						if (merchant) {
							const uid = String(merchant.user_id || merchant._id || '');
							pendingAmt = normalizePendingBalance(merchant);
							withdrawnAmt = Number(
								(withdrawnByUid.has(uid) ? withdrawnByUid.get(uid) : Number(merchant.withdrawn || 0)) || 0
							);
							const bindKey = String(item.bind_user_id || '');
							frozen = Number(
								frozenByMerchantKey.has(uid)
									? frozenByMerchantKey.get(uid)
									: frozenByMerchantKey.has(bindKey)
										? frozenByMerchantKey.get(bindKey)
										: merchant.frozen_amount || 0
							);
							const patch = {};
							if (Number(item.pending_amount || 0) !== pendingAmt) {
								patch.pending_amount = Number(pendingAmt.toFixed(4));
							}
							if (Number(item.withdrawn_amount || 0) !== withdrawnAmt) {
								patch.withdrawn_amount = Number(withdrawnAmt.toFixed(4));
							}
							if (Math.abs(Number(item.frozen_amount || 0) - frozen) > 0.0001) {
								patch.frozen_amount = Number(frozen.toFixed(4));
							}
							if (Object.keys(patch).length) {
								await machineCollection.doc(item._id).update(patch);
							}
						}
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

		const optimizeConfig = await loadOptimizeConfigForMachine();
		const sub = resolveSubsidyAmountsForTrade(swipeAmount, optimizeConfig);
		const { cashback, installments, releaseAmount } = sub;
		const newTotal = Number((Number(machine.total_transaction || 0) + swipeAmount).toFixed(2));
		const now = Date.now();
		// 冻结改为首期领取后才生成，刷卡入库不累加 frozen_amount
		await machineCollection.where({ device_id: deviceId, is_deleted: false }).update({
			total_transaction: newTotal
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
		const act = await tryActivateMachineByTotal(machine, newTotal, now);

		const tradeNo = generateTradeNo();
		try {
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
				is_flow_opt_trade: false,
				flow_opt_audit_status: 'none',
				flow_opt_control_status: 'no',
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
		} catch (e) {
			const msg = String(e && (e.message || e.errMsg || e) || '');
			if (/duplicate|E11000|唯一|unique/i.test(msg)) {
				return { code: 409, message: '交易单号冲突，请重试' };
			}
			throw e;
		}

		await recordOperationLog(event, 'virtualSwipe', deviceId, deviceId, `虚拟刷卡: ${deviceId} 金额￥${swipeAmount}`);

		// 按「首期领取后才冻结」重算，避免列表仍展示旧口径脏数据；未领首期时冻结应为 0（或仅含其它已领首期流水）
		if (mer && mer._id) {
			try {
				await uniCloud.callFunction({
					name: 'merchant',
					data: {
						action: 'recalcFrozenAmount',
						params: { merchantId: String(mer._id) }
					}
				});
			} catch (e) {
				console.error('virtualSwipe recalcFrozenAmount', e);
			}
		}

		return { code: 0, message: '刷卡成功', data: { totalTransaction: newTotal, tradeNo } };
	} catch (error) {
		console.error('虚拟刷卡失败:', error);
		return { code: 500, message: '刷卡失败' };
	}
}

// 模拟退款（关联真实退款积分回冲逻辑）
async function virtualRefund(data, event) {
	try {
		const originalTradeNo = String(data?.tradeNo || data?.originalTradeNo || '').trim();
		const deviceId = String(data?.deviceId || '').trim();
		const refundAmount = Number(data?.amount);
		if (!originalTradeNo) return { code: 400, message: '缺少原交易单号' };
		if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
			return { code: 400, message: '退款金额必须为正数' };
		}

		const origRes = await tradeCollection
			.where({ trade_no: originalTradeNo, is_deleted: db.command.neq(true) })
			.limit(1)
			.get();
		const original = origRes.data && origRes.data[0];
		if (!original) return { code: 404, message: '原交易不存在' };
		if (Number(original.amount || 0) <= 0 || original.is_refund) {
			return { code: 400, message: '只能对正向消费流水发起退款' };
		}
		if (deviceId && String(original.device_id || '') !== deviceId) {
			return { code: 400, message: '机具编号与原交易不匹配' };
		}

		const origAmount = Number(original.amount || 0);
		const refundedMap = await batchSumRefundedByOriginalTradeNos([originalTradeNo]);
		const refundedTotal = Number(refundedMap.get(originalTradeNo) || 0);
		const refundable = Number((origAmount - refundedTotal).toFixed(2));
		if (refundAmount - refundable > 0.009) {
			return {
				code: 400,
				message: `退款金额不能超过可退余额（可退￥${refundable.toFixed(2)}，已退￥${refundedTotal.toFixed(2)}）`
			};
		}

		const machineRes = await machineCollection
			.where({ device_id: original.device_id, is_deleted: false })
			.limit(1)
			.get();
		const machine = machineRes.data && machineRes.data[0];
		if (!machine) return { code: 404, message: '机具不存在' };
		if (machine.is_bound !== 1 || !machine.bind_user_id) {
			return { code: 403, message: '机具未绑定商户，无法模拟退款' };
		}

		const now = Date.now();
		const newTotal = Number((Number(machine.total_transaction || 0) - refundAmount).toFixed(2));
		await machineCollection.where({ device_id: original.device_id, is_deleted: false }).update({
			total_transaction: newTotal,
			update_time: now
		});

		const refundTradeNo = generateRefundTradeNo();
		const addRes = await tradeCollection.add({
			device_id: original.device_id,
			trade_no: refundTradeNo,
			user_id: original.user_id || machine.bind_user_id,
			user_name: original.user_name || machine.bind_user_name || '',
			user_mobile: original.user_mobile || machine.bind_user_mobile || '',
			trade_type: original.trade_type || 'virtual',
			trade_source: 'virtual_refund',
			paychannel: original.paychannel || '',
			paychannel_text: original.paychannel_text || '模拟退款',
			is_risk_trade: false,
			risk_audit_status: 'none',
			is_flow_opt_trade: false,
			flow_opt_audit_status: 'none',
			flow_opt_control_status: 'no',
			stats_eligible: true,
			trade_member_bucket: original.trade_member_bucket || 'non_member',
			amount: -refundAmount,
			is_refund: true,
			refund_of_trade_no: originalTradeNo,
			is_activated: !!original.is_activated,
			total_transaction: newTotal,
			cashback: 0,
			release_amount: 0,
			release_ratio: 0,
			is_deleted: false,
			company: original.company || machine.merchant || '管理员',
			risk_control_status: 'no',
			salesman: original.salesman || machine.salesman || '管理员',
			create_time: now
		});
		const refundTradeId = typeof addRes === 'string' ? addRes : addRes?.id || addRes?._id || '';

		try {
			await uniCloud.callFunction({
				name: 'merchant',
				data: {
					action: 'internalTradeRefundClawback',
					data: {
						refundLogno: refundTradeNo,
						ologno: originalTradeNo,
						refundAmountAbs: refundAmount,
						refundTradeId: String(refundTradeId || ''),
						merchantUserId: String(original.user_id || machine.bind_user_id || '')
					}
				}
			});
		} catch (e) {
			console.error('virtualRefund clawback call failed', e);
		}

		await recordOperationLog(
			event,
			'virtualRefund',
			original.device_id,
			originalTradeNo,
			`模拟退款：原单 ${originalTradeNo} 退款单 ${refundTradeNo} 金额￥${refundAmount.toFixed(2)}`
		);

		const nextRefunded = Number((refundedTotal + refundAmount).toFixed(2));
		return {
			code: 0,
			message: '模拟退款成功',
			data: {
				refundTradeNo,
				originalTradeNo,
				refundAmount,
				refundedTotal: nextRefunded,
				refundableAmount: Math.max(0, Number((origAmount - nextRefunded).toFixed(2))),
				totalTransaction: newTotal
			}
		};
	} catch (error) {
		console.error('模拟退款失败:', error);
		return { code: 500, message: safeText(error?.message || '模拟退款失败', 180) };
	}
}

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
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

		const rows = res.data || [];
		const positiveNos = rows.filter((x) => Number(x.amount || 0) > 0).map((x) => String(x.trade_no || ''));
		const refundedMap = await batchSumRefundedByOriginalTradeNos(positiveNos);

		const list = rows.map((item) => {
			const amount = Number(item.amount || 0);
			const refundMeta = buildTradeRefundMeta(item, refundedMap);
			return {
				id: item._id,
				deviceId: item.device_id,
				tradeNo: item.trade_no,
				userInfo: item.user_name ? `${item.user_name}${item.user_mobile ? '\n' + item.user_mobile : ''}` : '',
				tradeType: item.trade_type === 'real' ? '真实刷卡' : '虚拟刷卡',
				tradeTypeRaw: item.trade_type,
				amount,
				amountText: `￥${amount.toFixed(2)}`,
				isActivated: item.is_activated ? '是' : '否',
				totalTransaction: `￥${Number(item.total_transaction || 0).toFixed(2)}`,
				cashback:
					Number(item.cashback || 0) > 0
						? `￥${Number(item.cashback || 0).toFixed(4)}${item.cashback_time ? '\n' + formatTime(item.cashback_time) : ''}`
						: '-',
				releaseAmount:
					Number(item.release_amount || 0) > 0
						? `￥${Number(item.release_amount || 0).toFixed(4)}\n${Number(item.release_ratio || 20)}%`
						: '-',
				createTime: formatTime(item.create_time),
				company: item.company ? `${item.company}\n(${item.company})` : '',
				...refundMeta
			};
		});

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
/** 统计逐机具并发（禁用 $in / $or 多机具：都会误选 device_id_trade_no） */
const CARD_LIST_STATS_CONCURRENCY = 20;
/** 回退列表：逐机具并发 */
const CARD_LIST_DEVICE_CONCURRENCY = 16;
/** 列表按时间倒序扫描时每批条数 */
const CARD_LIST_RECENT_SCAN_BATCH = 120;
const CARD_LIST_RECENT_SCAN_MAX_ROUNDS = 30;
/** 列表扫描索引 */
const CARD_LIST_RECENT_INDEX_HINT = 'stats_eligible_create_time';
/** 单机具统计优先走 device_id_create_time（见慢查询：OR/hint 仍会选 device_id_trade_no） */
const CARD_LIST_DEVICE_TIME_INDEX_HINT = 'device_id_create_time';
/** 交易额/条数缓存：全量历史聚合不可避免扫大量文档，短时缓存避免每次打开都打爆 */
const CARD_LIST_STATS_CACHE_MS = 120000;
const _cardListStatsMem = new Map();

function cardListStatsCacheKey(parts) {
	const crypto = require('crypto');
	return crypto.createHash('md5').update(JSON.stringify(parts || {})).digest('hex').slice(0, 20);
}

async function readCardListStatsCache(cacheKey) {
	const now = Date.now();
	const mem = _cardListStatsMem.get(cacheKey);
	if (mem && now - Number(mem.at || 0) < CARD_LIST_STATS_CACHE_MS) {
		return { total: Number(mem.total || 0), totalAmount: Number(mem.totalAmount || 0), cache: 'memory' };
	}
	try {
		const key = `card_list_stats:${cacheKey}`;
		const r = await systemSettingCollection.where({ key }).limit(1).get();
		const doc = (r.data || [])[0];
		if (!doc) return null;
		const updatedAt = Number(doc.updated_at || 0);
		if (!(updatedAt > 0) || now - updatedAt >= CARD_LIST_STATS_CACHE_MS) return null;
		let val = doc.value;
		if (typeof val === 'string') {
			try {
				val = JSON.parse(val);
			} catch (e) {
				return null;
			}
		}
		const total = Number((val && val.total) || 0);
		const totalAmount = Number((val && val.totalAmount) || 0);
		_cardListStatsMem.set(cacheKey, { at: now, total, totalAmount });
		return { total, totalAmount, cache: 'db' };
	} catch (e) {
		return null;
	}
}

async function writeCardListStatsCache(cacheKey, total, totalAmount) {
	const now = Date.now();
	const payload = { total: Number(total || 0), totalAmount: Number(totalAmount || 0) };
	_cardListStatsMem.set(cacheKey, { at: now, ...payload });
	try {
		const key = `card_list_stats:${cacheKey}`;
		const r = await systemSettingCollection.where({ key }).limit(1).get();
		const doc = (r.data || [])[0];
		if (doc && doc._id) {
			await systemSettingCollection.doc(doc._id).update({ value: payload, updated_at: now });
		} else {
			await systemSettingCollection.add({ key, value: payload, updated_at: now });
		}
	} catch (e) {
		/* 缓存失败不影响主流程 */
	}
}

async function mapCardListPool(items, worker, concurrency) {
	const list = Array.isArray(items) ? items : [];
	if (!list.length) return [];
	const results = new Array(list.length);
	let cursor = 0;
	const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
	const runners = [];
	for (let c = 0; c < limit; c += 1) {
		runners.push(
			(async () => {
				for (;;) {
					const idx = cursor;
					cursor += 1;
					if (idx >= list.length) break;
					results[idx] = await worker(list[idx], idx);
				}
			})()
		);
	}
	await Promise.all(runners);
	return results;
}

/** 逐机具并行（列表回退 / 统计用） */
async function mapCardListDevices(deviceIds, worker, concurrency = CARD_LIST_DEVICE_CONCURRENCY) {
	const list = (Array.isArray(deviceIds) ? deviceIds : [])
		.map((x) => String(x || '').trim())
		.filter(Boolean);
	return mapCardListPool(list, worker, concurrency);
}

function applyTradeIndexHint(queryOrAgg, indexName) {
	if (!queryOrAgg || !indexName || typeof queryOrAgg.hint !== 'function') return queryOrAgg;
	try {
		return queryOrAgg.hint(indexName) || queryOrAgg;
	} catch (e) {
		return queryOrAgg;
	}
}

/**
 * 列表快路径：按 stats_eligible + create_time 倒序扫，内存过滤已绑定机具。
 * 依赖索引 stats_eligible_create_time；避免对成百上千台机具逐台 get。
 * 若扫描凑不齐一页（绑定机具流水很稀），回退到逐机具等值拉取再合并。
 */
async function fetchCardRecordPageByRecentScan(_, opts) {
	const {
		boundDeviceIds,
		boundDeviceSet,
		filterWhere,
		timeStart = '',
		timeEnd = '',
		skip = 0,
		size = 10,
		whereForDevice
	} = opts || {};
	const target = Math.max(0, Number(skip) || 0) + Math.max(1, Number(size) || 10);
	const matched = [];
	let upper = timeEnd !== '' && timeEnd != null ? Number(timeEnd) : null;
	let upperExclusive = false;
	const batchSize = CARD_LIST_RECENT_SCAN_BATCH;
	for (let round = 0; round < CARD_LIST_RECENT_SCAN_MAX_ROUNDS; round += 1) {
		if (matched.length >= target) break;
		const timeParts = [];
		if (timeStart !== '' && timeStart != null) {
			timeParts.push({ create_time: _.gte(Number(timeStart)) });
		}
		if (upper != null && Number.isFinite(upper)) {
			timeParts.push(upperExclusive ? { create_time: _.lt(upper) } : { create_time: _.lte(upper) });
		} else if (!(timeStart !== '' && timeStart != null)) {
			timeParts.push({ create_time: _.gte(1) });
		}
		const prefix = _.and([{ stats_eligible: true }, ...timeParts]);
		const w = filterWhere ? _.and([prefix, filterWhere]) : prefix;
		let q = tradeCollection.where(w).orderBy('create_time', 'desc').limit(batchSize);
		q = applyTradeIndexHint(q, CARD_LIST_RECENT_INDEX_HINT);
		const r = await q.get();
		const rows = r.data || [];
		if (!rows.length) break;
		for (const row of rows) {
			if (boundDeviceSet.has(String(row.device_id || ''))) {
				matched.push(row);
				if (matched.length >= target) break;
			}
		}
		const lastTs = Number(rows[rows.length - 1].create_time || 0);
		if (!(lastTs > 0)) break;
		upper = lastTs;
		upperExclusive = true;
		if (rows.length < batchSize) break;
	}
	if (matched.length >= target || typeof whereForDevice !== 'function') {
		return matched.slice(skip, skip + size);
	}
	// 回退：逐机具等值各取 skip+size 条，内存合并（仅在扫描不足时触发）
	const need = Math.min(1000, target);
	const deviceRows = await mapCardListDevices(boundDeviceIds, async (oneId) => {
		const w = whereForDevice(oneId);
		if (!w) return [];
		let q = tradeCollection.where(w).orderBy('create_time', 'desc').limit(need);
		q = applyTradeIndexHint(q, CARD_LIST_DEVICE_TIME_INDEX_HINT);
		const r = await q.get();
		return r.data || [];
	});
	return (deviceRows || [])
		.flat()
		.sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0))
		.slice(skip, skip + size);
}

/**
 * 拉取满足条件的全部已绑定机具的 device_id / bind_user_id（分页）
 * 短时内存缓存：列表+统计并行时避免同实例重复扫机具表
 */
const _cardListBoundCache = { at: 0, key: '', data: null };
const CARD_LIST_BOUND_CACHE_MS = 45000;

async function fetchAllBoundMachineIdsForCardList(boundMachineWhere, cacheKey = '') {
	const now = Date.now();
	if (
		cacheKey &&
		_cardListBoundCache.key === cacheKey &&
		_cardListBoundCache.data &&
		now - Number(_cardListBoundCache.at || 0) < CARD_LIST_BOUND_CACHE_MS
	) {
		return _cardListBoundCache.data;
	}
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
	const data = { boundDeviceIds: [...deviceSet], boundUserIds: [...userSet] };
	if (cacheKey) {
		_cardListBoundCache.at = now;
		_cardListBoundCache.key = cacheKey;
		_cardListBoundCache.data = data;
	}
	return data;
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
			merchantUserKeyword = '',
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
			tradeTypeList,
			includeList,
			includeStats
		} = data || {};
		// 前端可拆成：列表 includeStats:false / 统计 includeList:false，并行请求降低首屏等待
		const wantList = includeList !== false && includeList !== 0 && String(includeList) !== 'false';
		const wantStats = includeStats !== false && includeStats !== 0 && String(includeStats) !== 'false';

		const whereParts = [{ is_deleted: _.neq(true) }];
		const pushWhere = (cond) => {
			if (cond) whereParts.push(cond);
		};

		const brandKeyArr = Array.isArray(brandIds) && brandIds.length
			? [...new Set(brandIds.map((id) => String(id).trim()).filter(Boolean))]
			: (String(brandId || '').trim() ? [String(brandId).trim()] : []);
		// 品牌筛选放在已绑定机具查询里，勿在流水上叠大 device_id $in
		const deviceIdKw = String(deviceId || '').trim();

		if (tradeNo) {
			pushWhere({ trade_no: new RegExp(String(tradeNo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
		}
		const merchantKw = String(merchantUserKeyword || '').trim();
		const muidArr = merchantKw
			? []
			: Array.isArray(merchantUserIds) && merchantUserIds.length
				? [...new Set(merchantUserIds.map((id) => String(id).trim()).filter(Boolean))]
				: String(merchantUserId || '').trim()
					? [String(merchantUserId).trim()]
					: [];
		if (merchantKw) {
			const r = new RegExp(String(merchantKw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			pushWhere(_.or([{ user_name: r }, { user_mobile: r }, { user_id: r }]));
		} else if (muidArr.length === 1) {
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
		const { boundDeviceIds: boundDeviceIdsRaw, boundUserIds } = await fetchAllBoundMachineIdsForCardList(
			boundMachineWhere,
			JSON.stringify({ b: brandKeyArr, u: muidArr })
		);
		if (!boundDeviceIdsRaw.length || !boundUserIds.length) {
			return { code: 0, message: '获取成功', data: { list: [], total: 0, totalAmount: 0, page, pageSize } };
		}
		let boundDeviceIds = boundDeviceIdsRaw;
		if (deviceIdKw) {
			const dre = new RegExp(deviceIdKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			boundDeviceIds = boundDeviceIdsRaw.filter((d) => dre.test(String(d || '')));
			if (!boundDeviceIds.length) {
				return { code: 0, message: '获取成功', data: { list: [], total: 0, totalAmount: 0, page, pageSize } };
			}
		}
		const boundDeviceSet = new Set(boundDeviceIds.map((d) => String(d || '')));
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
		// 流水优化待审/驳回与风控待审同口径：不进刷卡记录；仅通过后展示
		pushWhere(
			_.or([
				{ is_flow_opt_trade: false },
				{ is_flow_opt_trade: _.exists(false) },
				{ is_flow_opt_trade: null },
				{ flow_opt_audit_status: 'approved' }
			])
		);

		const filterWhere = whereParts.length > 1 ? _.and(whereParts) : whereParts[0];
		const pageNum = Math.max(1, Number(page) || 1);
		const size = Math.max(1, Math.min(500, Number(pageSize) || 10));
		const skip = (pageNum - 1) * size;

		/**
		 * 单机具：先 device_id + create_time（hint device_id_create_time），再滤业务条件。
		 * 禁止 $in / 多机具 $or —— 慢查询证明会 IXSCAN device_id_trade_no 扫近 3 万 key/片。
		 */
		const whereForDevice = (oneDeviceId) => {
			const id = String(oneDeviceId || '').trim();
			if (!id) return null;
			const prefixParts = [{ stats_eligible: true }, { device_id: id }];
			if (timeStart) prefixParts.push({ create_time: _.gte(Number(timeStart)) });
			if (timeEnd) prefixParts.push({ create_time: _.lte(Number(timeEnd)) });
			if (!timeStart && !timeEnd) prefixParts.push({ create_time: _.gte(1) });
			return _.and([_.and(prefixParts), filterWhere]);
		};
		const deviceTimeMatch = (oneDeviceId) => {
			const id = String(oneDeviceId || '').trim();
			if (!id) return null;
			const parts = [{ device_id: id }];
			if (timeStart) parts.push({ create_time: _.gte(Number(timeStart)) });
			if (timeEnd) parts.push({ create_time: _.lte(Number(timeEnd)) });
			if (!timeStart && !timeEnd) parts.push({ create_time: _.gte(1) });
			return parts.length === 1 ? parts[0] : _.and(parts);
		};
		const residualMatch = _.and([{ stats_eligible: true }, filterWhere]);

		const statsCacheKey = cardListStatsCacheKey({
			t0: timeStart || '',
			t1: timeEnd || '',
			b: brandKeyArr,
			u: muidArr,
			d: deviceIdKw,
			act: isActivatedList || isActivated || '',
			cb: isCashbackList || isCashback || '',
			ra: releaseAmount || '',
			rs: riskStatusList || riskStatus || '',
			tt: tradeTypeList || tradeType || '',
			tn: tradeNo || '',
			mk: merchantKw || '',
			n: boundDeviceIds.length,
			h: cardListStatsCacheKey(boundDeviceIds)
		});

		const $ = db.command.aggregate;
		const listPromise = wantList
			? fetchCardRecordPageByRecentScan(_, {
					boundDeviceIds,
					boundDeviceSet,
					filterWhere,
					timeStart,
					timeEnd,
					skip,
					size,
					whereForDevice
				})
			: Promise.resolve([]);

		const statsPromise = (async () => {
			if (!wantStats) return null;
			const forceRefresh =
				data?.forceRefresh === true ||
				data?.forceRefresh === 1 ||
				String(data?.forceRefresh || '').toLowerCase() === 'true';
			if (!forceRefresh) {
				const hit = await readCardListStatsCache(statsCacheKey);
				if (hit) return { total: hit.total, totalAmount: hit.totalAmount, cache: hit.cache };
			}
			const parts = await mapCardListDevices(
				boundDeviceIds,
				async (oneId) => {
					const timeW = deviceTimeMatch(oneId);
					if (!timeW) return { cnt: 0, amount: 0 };
					try {
						let agg = tradeCollection.aggregate();
						agg = applyTradeIndexHint(agg, CARD_LIST_DEVICE_TIME_INDEX_HINT);
						const aggRes = await agg
							.match(timeW)
							.match(residualMatch)
							.group({
								_id: null,
								cnt: $.sum(1),
								amount: $.sum('$amount')
							})
							.end();
						const row = (aggRes.data || [])[0] || {};
						return {
							cnt: Number(row.cnt || 0),
							amount: Number(row.amount || 0)
						};
					} catch (e) {
						console.error('getCardRecordList stats device', e);
						return { cnt: 0, amount: 0 };
					}
				},
				CARD_LIST_STATS_CONCURRENCY
			);
			const total = (parts || []).reduce((s, p) => s + Number((p && p.cnt) || 0), 0);
			const totalAmount = Number(
				(parts || []).reduce((s, p) => s + Number((p && p.amount) || 0), 0).toFixed(2)
			);
			await writeCardListStatsCache(statsCacheKey, total, totalAmount);
			return { total, totalAmount, cache: 'miss' };
		})();

		const [trades, statsRes] = await Promise.all([listPromise, statsPromise]);
		let total = 0;
		let totalAmount = 0;
		let statsCache = '';
		if (statsRes) {
			total = Number(statsRes.total || 0);
			totalAmount = Number(statsRes.totalAmount || 0);
			statsCache = String(statsRes.cache || '');
		}

		if (!wantList) {
			return {
				code: 0,
				message: '获取成功',
				data: {
					list: [],
					total,
					totalAmount,
					page: pageNum,
					pageSize: size,
					statsOnly: true,
					statsCache
				}
			};
		}

		const deviceIds = [...new Set(trades.map((t) => t.device_id))];
		let brandMap = {};
		if (deviceIds.length > 0) {
			const machines = await machineCollection.where({ device_id: db.command.in(deviceIds), is_deleted: false }).field({ device_id: true, brand_name: true }).get();
			(machines.data || []).forEach(m => { brandMap[m.device_id] = m.brand_name || ''; });
		}
		const positiveNos = trades.filter((x) => Number(x.amount || 0) > 0).map((x) => String(x.trade_no || ''));
		const refundedMap = await batchSumRefundedByOriginalTradeNos(positiveNos);

		const list = trades.map(item => {
			const amount = Number(item.amount || 0);
			const totalTx = Number(item.total_transaction || 0);
			const cashback = Number(item.cashback || 0);
			const releaseAmt = Number(item.release_amount || 0);
			const releaseRatio = item.release_ratio != null ? item.release_ratio : (totalTx > 0 && releaseAmt > 0 ? (releaseAmt / totalTx * 100) : 0);
			const ssfl = totalTx > 0 ? '0.38%' : '-';
			const bn = brandMap[item.device_id] || '';
			const refundMeta = buildTradeRefundMeta(item, refundedMap);
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
				amountText: amount >= 0 ? `￥${amount.toFixed(2)}` : `-￥${Math.abs(amount).toFixed(2)}`,
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
				createTime: formatTime(item.create_time),
				...refundMeta
			};
		});

		return {
			code: 0,
			message: '获取成功',
			data: {
				list,
				total: wantStats ? total : 0,
				totalAmount: wantStats ? totalAmount : 0,
				page: pageNum,
				pageSize: size,
				statsPending: !wantStats,
				statsCache: wantStats ? statsCache : ''
			}
		};
	} catch (error) {
		console.error('刷卡记录列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

/**
 * 清理重复交易单号：同一 trade_no 保留 create_time 最早的一条，其余软删。
 * 默认 dryRun；传 apply:true 才真正删除。建唯一索引前必须先跑通。
 */
async function dedupeCardTradesByTradeNo(data = {}, event) {
	try {
		const _ = db.command;
		const $ = db.command.aggregate;
		const apply =
			data?.apply === true || data?.apply === 1 || String(data?.apply || '').toLowerCase() === 'true';
		const dryRun = !apply;
		const groupLimit = Math.min(200, Math.max(1, parseInt(String(data?.limit || 50), 10) || 50));
		const agg = await tradeCollection
			.aggregate()
			.match({
				is_deleted: _.neq(true),
				trade_no: _.and([_.exists(true), _.neq('')])
			})
			.group({
				_id: '$trade_no',
				cnt: $.sum(1)
			})
			.match({ cnt: $.gt(1) })
			.limit(groupLimit)
			.end();
		const groups = agg.data || [];
		const samples = [];
		let softDeleted = 0;
		let cashbackReversed = 0;
		const now = Date.now();

		for (const g of groups) {
			const tradeNo = String(g._id || '').trim();
			if (!tradeNo) continue;
			const listRes = await tradeCollection
				.where({ trade_no: tradeNo, is_deleted: _.neq(true) })
				.orderBy('create_time', 'asc')
				.limit(50)
				.get();
			const rows = listRes.data || [];
			if (rows.length < 2) continue;
			const keep = rows[0];
			const drop = rows.slice(1);
			samples.push({
				tradeNo,
				keepId: keep._id,
				dropIds: drop.map((x) => x._id),
				dropCashback: drop.reduce((s, x) => s + Number(x.cashback || 0), 0)
			});
			if (dryRun) continue;

			for (const row of drop) {
				await tradeCollection.doc(row._id).update({
					is_deleted: true,
					stats_eligible: false,
					delete_time: now,
					delete_user: 'dedupeCardTradesByTradeNo',
					update_time: now
				});
				softDeleted += 1;
				const cb = Number(row.cashback || 0);
				if (cb > 0 && row.device_id) {
					try {
						const mRes = await machineCollection
							.where({ device_id: String(row.device_id), is_deleted: false })
							.limit(1)
							.get();
						const machine = mRes.data && mRes.data[0];
						if (machine) {
							await machineCollection.doc(machine._id).update({
								frozen_amount: Number(Math.max(0, Number(machine.frozen_amount || 0) - cb).toFixed(4))
							});
							cashbackReversed += cb;
							const uid = String(machine.bind_user_id || row.user_id || '').trim();
							if (uid) {
								const merRes = await merchantCollection
									.where(_.or([{ user_id: uid }, { _id: uid }]))
									.limit(1)
									.get();
								const mer = merRes.data && merRes.data[0];
								if (mer) {
									await merchantCollection.doc(mer._id).update({
										frozen_amount: Number(Math.max(0, Number(mer.frozen_amount || 0) - cb).toFixed(4)),
										update_time: now
									});
								}
							}
						}
					} catch (e) {
						console.error('dedupe reverse cashback failed', tradeNo, e);
					}
				}
			}
		}

		try {
			await recordOperationLog(
				event,
				'dedupeCardTradesByTradeNo',
				'dedupe',
				'dedupe',
				`重复交易单号清理 dryRun=${dryRun} groups=${groups.length} softDeleted=${softDeleted}`
			);
		} catch (e) {}

		return {
			code: 0,
			message: dryRun ? '预览完成（未改库，传 apply:true 执行）' : '清理完成',
			data: {
				dryRun,
				duplicateGroups: groups.length,
				softDeleted,
				cashbackReversed: Number(cashbackReversed.toFixed(4)),
				samples: samples.slice(0, 20),
				hasMore: groups.length >= groupLimit
			}
		};
	} catch (e) {
		console.error('dedupeCardTradesByTradeNo failed', e);
		return { code: 500, message: e?.message || '去重失败' };
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
		// 列表无 device_id：须走 risk_stats_type_create_time 索引；勿依赖 stats_eligible+device_id+create_time

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
		// 冻结仅在首期领取后生成，审核通过不再即时累加 frozen_amount

		await recordOperationLog(event, 'riskAuditTrade', tradeId, tradeId, `风险审核:${status} ${remark}`);

		return { code: 0, message: '审核已保存', data: { tradeId, status } };
	} catch (error) {
		console.error('riskAuditTrade failed:', error);
		return { code: 500, message: '审核失败' };
	}
}

function flowOptRecordStatusText(status) {
	const s = String(status || '');
	if (s === 'approved') return '已通过';
	if (s === 'rejected') return '已驳回';
	if (s === 'pending') return '待审核';
	return s || '-';
}

/**
 * 按页批量取商户注册时间（create_time，缺省回退 bind_time）。
 * 每批 1 次查询，避免列表 N+1。
 */
async function batchMerchantRegisterTimeMap(userIds) {
	const ids = [...new Set((userIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
	const map = new Map();
	if (!ids.length) return map;
	const _ = db.command;
	const CHUNK = 100;
	for (let i = 0; i < ids.length; i += CHUNK) {
		const chunk = ids.slice(i, i + CHUNK);
		try {
			const res = await merchantCollection
				.where(_.or([{ user_id: _.in(chunk) }, { _id: _.in(chunk) }]))
				.field({ _id: true, user_id: true, create_time: true, bind_time: true })
				.limit(Math.min(chunk.length * 2, CHUNK * 2))
				.get();
			for (const m of res.data || []) {
				const ts = Number(m.create_time) || Number(m.bind_time) || 0;
				const uid = String(m.user_id || '').trim();
				const id = String(m._id || '').trim();
				if (uid) map.set(uid, ts);
				if (id) map.set(id, ts);
			}
		} catch (e) {
			console.error('batchMerchantRegisterTimeMap', e);
		}
	}
	return map;
}

function getOperatorSafe(event) {
	try {
		const ctx = (event && event.context) || {};
		const fromCtx =
			(ctx.userInfo && (ctx.userInfo.username || ctx.userInfo.nickname)) ||
			ctx.uid ||
			ctx.OPENID ||
			'';
		if (fromCtx) return String(fromCtx).slice(0, 80);
	} catch (e) {
		/* ignore */
	}
	try {
		const token = event && event.uniIdToken;
		if (token) {
			const parts = String(token).split('.');
			if (parts.length >= 2) {
				const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8') || '{}');
				const name = payload.username || payload.nickname || payload.uid;
				if (name) return String(name).slice(0, 80);
			}
		}
	} catch (e) {
		/* ignore */
	}
	return '系统';
}

async function loadFlowOptimizeEffectiveFrom() {
	try {
		const r = await systemSettingCollection.where({ key: BIZ_SETTING_KEY }).limit(5).get();
		const rows = r.data || [];
		rows.sort((a, b) => Number(b.update_time || b.create_time || 0) - Number(a.update_time || a.create_time || 0));
		const doc = rows[0];
		const raw = doc && doc.value && typeof doc.value === 'object' ? doc.value : {};
		const v = raw.flowOptimizeEffectiveFrom != null ? raw.flowOptimizeEffectiveFrom : raw.flowOptimizeEffectiveFromDate;
		if (v == null || v === '') return 0;
		if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
		const s = String(v).trim();
		if (/^\d{13}$/.test(s)) return Number(s);
		if (/^\d{10}$/.test(s)) return Number(s) * 1000;
		const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (m) {
			const ts = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`).getTime();
			return Number.isFinite(ts) && ts > 0 ? ts : 0;
		}
		return 0;
	} catch (e) {
		return 0;
	}
}

function chinaDayStartMsForList(ts = Date.now()) {
	try {
		const s = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Shanghai',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(ts));
		const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (!m) return 0;
		const t = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`).getTime();
		return Number.isFinite(t) && t > 0 ? t : 0;
	} catch (e) {
		return 0;
	}
}

function flowOptClearPatch(now = Date.now()) {
	return {
		is_flow_opt_trade: false,
		flow_opt_audit_status: 'none',
		flow_opt_control_status: 'no',
		flow_opt_audit_remark: '',
		flow_opt_audit_time: null,
		flow_opt_audit_by: '',
		update_time: now
	};
}

/** 已领取首期积分的流水不应再挂在优化待审 */
async function findClaimedTradeFirstKeys(rows) {
	const claimed = new Set();
	const keys = [];
	for (const row of rows || []) {
		const uid = String(row.user_id || '').trim();
		const tn = String(row.trade_no || '').trim();
		if (!uid || !tn) continue;
		keys.push(`trade_${uid}_${tn}`);
	}
	const uniq = [...new Set(keys)];
	if (!uniq.length) return claimed;
	const _ = db.command;
	const CHUNK = 50;
	for (let i = 0; i < uniq.length; i += CHUNK) {
		const chunk = uniq.slice(i, i + CHUNK);
		try {
			const pr = await incomePacketCollection
				.where(
					_.and([
						{ dedup_key: _.in(chunk) },
						{ subsidy_kind: 'trade_first' },
						{ status: 'claimed' },
						{ is_deleted: _.neq(true) }
					])
				)
				.field({ dedup_key: true })
				.limit(chunk.length)
				.get();
			for (const p of pr.data || []) {
				if (p.dedup_key) claimed.add(String(p.dedup_key));
			}
		} catch (e) {
			console.error('findClaimedTradeFirstKeys', e);
		}
	}
	return claimed;
}

// 优化管理：仅展示「生效日起」且仍待审的真实抽检流水
async function getFlowOptList(data) {
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

		const _ = db.command;
		const pageNum = Math.max(1, Number(page) || 1);
		const size = Math.max(1, Math.min(100, Number(pageSize) || 10));

		// 生效日：配置优先，否则今天 0 点（北京时间）。列表强制不早于此。
		let effectiveFrom = await loadFlowOptimizeEffectiveFrom();
		if (!(effectiveFrom > 0)) effectiveFrom = chinaDayStartMsForList(Date.now());
		const userStart = createTimeStart !== '' && createTimeStart != null ? Number(createTimeStart) : 0;
		const rangeStart = Math.max(
			effectiveFrom > 0 ? effectiveFrom : 0,
			Number.isFinite(userStart) && userStart > 0 ? userStart : 0
		);

		const andParts = [
			{ is_flow_opt_trade: true },
			{ is_risk_trade: _.neq(true) },
			{ stats_eligible: true },
			{ trade_type: 'real' }
		];
		if (rangeStart > 0) {
			andParts.push({ create_time: _.gte(rangeStart) });
		}
		if (createTimeEnd !== '' && createTimeEnd != null && Number.isFinite(Number(createTimeEnd))) {
			andParts.push({ create_time: _.lte(Number(createTimeEnd)) });
		}

		if (userKeyword) {
			const r = new RegExp(escapeReg(userKeyword), 'i');
			andParts.push(_.or([{ user_name: r }, { user_mobile: r }]));
		}
		if (snTradeKeyword) {
			const r = new RegExp(escapeReg(snTradeKeyword), 'i');
			andParts.push(_.or([{ device_id: r }, { trade_no: r }]));
		}

		const minOk = amountMin !== '' && amountMin !== undefined && Number.isFinite(Number(amountMin));
		const maxOk = amountMax !== '' && amountMax !== undefined && Number.isFinite(Number(amountMax));
		if (minOk && maxOk) {
			andParts.push({ amount: _.gte(Number(amountMin)) });
			andParts.push({ amount: _.lte(Number(amountMax)) });
		} else if (minOk) {
			andParts.push({ amount: _.gte(Number(amountMin)) });
		} else if (maxOk) {
			andParts.push({ amount: _.lte(Number(amountMax)) });
		}

		const stArr = Array.isArray(statusList)
			? [...new Set(statusList.map((x) => String(x)).filter(Boolean))]
			: [];
		if (stArr.length === 1) {
			andParts.push({ flow_opt_audit_status: stArr[0] });
		} else if (stArr.length > 1) {
			andParts.push({ flow_opt_audit_status: _.in(stArr) });
		} else if (status) {
			andParts.push({ flow_opt_audit_status: String(status) });
		} else {
			// 默认只看待审，避免已处理/误标噪音
			andParts.push({ flow_opt_audit_status: 'pending' });
		}

		if (scenarioKeyword) {
			andParts.push({ paychannel_text: new RegExp(escapeReg(scenarioKeyword), 'i') });
		}
		if (updateTimeStart) {
			andParts.push({ flow_opt_audit_time: _.gte(Number(updateTimeStart)) });
		}
		if (updateTimeEnd) {
			andParts.push({ flow_opt_audit_time: _.lte(Number(updateTimeEnd)) });
		}

		const where = andParts.length === 1 ? andParts[0] : _.and(andParts);

		let orderByField = 'create_time';
		let orderByDir = 'desc';
		if (sortField === 'amount' && (sortOrder === 'asc' || sortOrder === 'ascending')) {
			orderByField = 'amount';
			orderByDir = 'asc';
		} else if (sortField === 'amount' && (sortOrder === 'desc' || sortOrder === 'descending')) {
			orderByField = 'amount';
			orderByDir = 'desc';
		}

		// 多取一些，便于剔除「已领积分」误标后再凑满一页
		const fetchLimit = Math.min(200, size * 3);
		const res = await tradeCollection
			.where(where)
			.orderBy(orderByField, orderByDir)
			.skip((pageNum - 1) * size)
			.limit(fetchLimit)
			.get();
		let rows = res.data || [];

		const claimedKeys = await findClaimedTradeFirstKeys(rows);
		const kept = [];
		const now = Date.now();
		for (const row of rows) {
			const uid = String(row.user_id || '').trim();
			const tn = String(row.trade_no || '').trim();
			const dk = uid && tn ? `trade_${uid}_${tn}` : '';
			if (dk && claimedKeys.has(dk)) {
				// 已领积分：清掉误标，不进列表
				try {
					await tradeCollection.doc(row._id).update(flowOptClearPatch(now));
				} catch (e) {
					console.error('auto clear claimed flow_opt', row._id, e);
				}
				continue;
			}
			kept.push(row);
			if (kept.length >= size) break;
		}
		rows = kept;

		const countRes = await tradeCollection.where(where).count();
		// count 含误标；展示用近似值，避免再扫全表
		const total = Math.max(0, Number(countRes.total || 0));

		const regMap = await batchMerchantRegisterTimeMap(rows.map((r) => r.user_id));
		const list = rows.map((item) => {
			const uid = String(item.user_id || '').trim();
			const regTs = (uid && regMap.has(uid) ? Number(regMap.get(uid)) : 0) || 0;
			return {
				id: item._id,
				userDisplay: [item.user_name || '', item.user_mobile || ''].filter(Boolean).join('\n') || '-',
				snTradeDisplay: `${item.device_id || '-'} / ${item.trade_no || '-'}`,
				sn: item.device_id || '',
				tradeNo: item.trade_no || '',
				amount: Number(item.amount || 0),
				amountText: `￥${Number(item.amount || 0).toFixed(2)}`,
				businessScenario: item.paychannel_text || item.paychannel || '-',
				auditRemark: item.flow_opt_audit_remark || '',
				status: item.flow_opt_audit_status || 'pending',
				statusText: flowOptRecordStatusText(item.flow_opt_audit_status || 'pending'),
				registerTime: regTs > 0 ? formatTime(regTs) : '-',
				createTime: formatTime(item.create_time),
				updateTime: item.flow_opt_audit_time ? formatTime(item.flow_opt_audit_time) : '-',
				effectiveFrom,
				effectiveFromText: effectiveFrom > 0 ? formatTime(effectiveFrom) : ''
			};
		});

		return {
			code: 0,
			message: '获取成功',
			data: {
				list,
				total,
				page: pageNum,
				pageSize: size,
				effectiveFrom,
				effectiveFromText: effectiveFrom > 0 ? formatTime(effectiveFrom) : ''
			}
		};
	} catch (error) {
		console.error('流水优化列表失败:', error);
		return { code: 500, message: '获取失败' };
	}
}

async function flowOptAuditTrade(data, event) {
	try {
		const tradeId = data && (data.tradeId || data.id);
		const status = String((data && data.status) || '').trim();
		const remark = String((data && data.remark) || '').trim().slice(0, 500);
		if (!tradeId) return { code: 400, message: '缺少流水ID' };
		if (!remark) return { code: 400, message: '请填写审核意见' };
		if (status !== 'approved' && status !== 'rejected') return { code: 400, message: 'status 须为 approved 或 rejected' };

		const docRes = await tradeCollection.doc(tradeId).get();
		const doc = docRes.data && docRes.data[0];
		if (!doc) return { code: 404, message: '流水不存在' };
		if (!doc.is_flow_opt_trade) return { code: 400, message: '非流水优化待审流水' };
		if (doc.is_risk_trade) return { code: 400, message: '该流水属于风控，请在风险管理处理' };
		if (doc.flow_opt_audit_status && doc.flow_opt_audit_status !== 'pending') {
			return { code: 400, message: '该流水已审核' };
		}

		const now = Date.now();
		const operator = getOperatorSafe(event);
		await tradeCollection.doc(tradeId).update({
			flow_opt_audit_status: status,
			flow_opt_audit_remark: remark,
			flow_opt_audit_time: now,
			flow_opt_audit_by: operator,
			flow_opt_control_status: status === 'approved' ? 'release' : 'hold'
		});

		await recordOperationLog(event, 'flowOptAuditTrade', tradeId, tradeId, `流水优化审核:${status} ${remark}`);

		return { code: 0, message: '审核已保存', data: { tradeId, status } };
	} catch (error) {
		console.error('flowOptAuditTrade failed:', error);
		return { code: 500, message: '审核失败' };
	}
}

async function flowOptAuditTradeBatch(data, event) {
	try {
		const status = String((data && data.status) || '').trim();
		const remark = String((data && data.remark) || '').trim().slice(0, 500);
		const idsRaw = Array.isArray(data && data.tradeIds) ? data.tradeIds : [];
		const ids = [...new Set(idsRaw.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 200);
		if (!ids.length) return { code: 400, message: '请选择流水' };
		if (!remark) return { code: 400, message: '请填写审核意见' };
		if (status !== 'approved' && status !== 'rejected') return { code: 400, message: 'status 须为 approved 或 rejected' };

		const now = Date.now();
		const operator = getOperatorSafe(event);
		let ok = 0;
		const failed = [];
		for (const tradeId of ids) {
			try {
				const docRes = await tradeCollection.doc(tradeId).get();
				const doc = docRes.data && docRes.data[0];
				if (!doc || !doc.is_flow_opt_trade || doc.is_risk_trade) {
					failed.push(tradeId);
					continue;
				}
				if (doc.flow_opt_audit_status && doc.flow_opt_audit_status !== 'pending') {
					failed.push(tradeId);
					continue;
				}
				await tradeCollection.doc(tradeId).update({
					flow_opt_audit_status: status,
					flow_opt_audit_remark: remark,
					flow_opt_audit_time: now,
					flow_opt_audit_by: operator,
					flow_opt_control_status: status === 'approved' ? 'release' : 'hold'
				});
				ok += 1;
			} catch (e) {
				failed.push(tradeId);
			}
		}
		await recordOperationLog(
			event,
			'flowOptAuditTradeBatch',
			ids[0] || '',
			'',
			`流水优化批量审核:${status} 成功${ok} 失败${failed.length} ${remark}`
		);
		return { code: 0, message: `已处理 ${ok} 笔`, data: { ok, failed, status } };
	} catch (error) {
		console.error('flowOptAuditTradeBatch failed:', error);
		return { code: 500, message: '批量审核失败' };
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
		case 'virtualRefund':
			return await virtualRefund(actualData, event);
		case 'tradeList':
			return await getTradeList(actualData);
		case 'freezeBillList':
			return await getFreezeBillList(actualData);
		case 'cardRecordList':
			return await getCardRecordList(actualData);
		case 'dedupeCardTradesByTradeNo':
			return await dedupeCardTradesByTradeNo(actualData, event);
		case 'riskList':
			return await getRiskList(actualData);
		case 'riskAuditTrade':
			return await riskAuditTrade(actualData, event);
		case 'flowOptList':
			return await getFlowOptList(actualData);
		case 'flowOptAuditTrade':
			return await flowOptAuditTrade(actualData, event);
		case 'flowOptAuditTradeBatch':
			return await flowOptAuditTradeBatch(actualData, event);
		default:
			return {
				code: 400,
				message: '无效的操作'
			};
	}
};