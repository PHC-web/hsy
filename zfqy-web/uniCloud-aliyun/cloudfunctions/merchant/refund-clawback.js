'use strict';

const { shanghaiYearMonthFromTs } = require('./format-time-cn.js');

const CASHBACK_RATE = 0.0038;
const THRESHOLD_YUAN = 300;
const INSTALLMENTS_ABOVE = 5;

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function round4(n) {
	return Number(Number(n || 0).toFixed(4));
}

function round2(n) {
	return Number(Number(n || 0).toFixed(2));
}

function monthNoFromTs(ts) {
	return shanghaiYearMonthFromTs(ts);
}

function addMonthsYm(ym, delta) {
	const [ys, ms] = String(ym || '').split('-');
	const y = Number(ys);
	const m = Number(ms);
	if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
	const d = new Date(Date.UTC(y, m - 1 + Number(delta || 0), 1, 0, 0, 0, 0));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function compareYm(a, b) {
	return String(a || '').localeCompare(String(b || ''));
}

/** 原交易积分拆分：≤300 一期；>300 五期均分 */
function buildTradeSubsidyInstallments(tradeAmountYuan, sourceYm) {
	const amount = Math.abs(Number(tradeAmountYuan || 0));
	if (!(amount > 0)) return [];
	const total = round4(amount * CASHBACK_RATE);
	if (!(total > 0)) return [];
	if (amount <= THRESHOLD_YUAN) {
		return [{ installmentIndex: 1, targetYm: sourceYm, amount: round2(total) }];
	}
	const per = round2(total / INSTALLMENTS_ABOVE);
	const items = [];
	let sum = 0;
	for (let i = 0; i < INSTALLMENTS_ABOVE; i += 1) {
		const amt = i === INSTALLMENTS_ABOVE - 1 ? round2(total - sum) : per;
		sum = round2(sum + amt);
		items.push({
			installmentIndex: i + 1,
			targetYm: addMonthsYm(sourceYm, i),
			amount: amt
		});
	}
	return items;
}

function scaleInstallments(installments, ratio) {
	const r = Math.min(1, Math.max(0, Number(ratio || 0)));
	if (r >= 1 - 1e-8) return installments.map((x) => ({ ...x }));
	const scaled = installments.map((x) => ({ ...x, amount: round2(Number(x.amount || 0) * r) }));
	const targetTotal = round2(
		installments.reduce((s, x) => s + Number(x.amount || 0), 0) * r
	);
	let sum = round2(scaled.reduce((s, x) => s + Number(x.amount || 0), 0));
	const gap = round2(targetTotal - sum);
	if (Math.abs(gap) >= 0.01 && scaled.length) {
		scaled[scaled.length - 1].amount = round2(Number(scaled[scaled.length - 1].amount || 0) + gap);
	}
	return scaled.filter((x) => Number(x.amount || 0) >= 0.01);
}

function firstReleaseDedupKey(merchantUserId, tradeNo) {
	return `trade_${merchantUserId}_${tradeNo}`;
}

async function findOriginalTrade(db, ologno) {
	const tradeNo = safeText(ologno, 64);
	if (!tradeNo) return null;
	const col = db.collection('hsy-machine-trades');
	let r = await col.where({ trade_no: tradeNo, amount: db.command.gt(0), is_deleted: db.command.neq(true) }).limit(1).get();
	if (r.data && r.data.length) return r.data[0];
	r = await col.where({ trade_no: tradeNo, is_deleted: db.command.neq(true) }).limit(1).get();
	return (r.data && r.data[0]) || null;
}

async function findPacketsForInstallment(db, merchantUserId, sourceYm, tradeNo, installmentIndex, targetYm) {
	const col = db.collection('hsy-income-packets');
	const uid = safeText(merchantUserId, 80);
	if (installmentIndex === 1) {
		const dk = firstReleaseDedupKey(uid, tradeNo);
		const r = await col
			.where({ merchant_user_id: uid, dedup_key: dk, is_deleted: false })
			.limit(5)
			.get();
		return r.data || [];
	}
	const r = await col
		.where({
			merchant_user_id: uid,
			is_deleted: false,
			subsidy_kind: 'release_pool_history',
			subsidy_flow_month: sourceYm,
			month_no: targetYm
		})
		.limit(20)
		.get();
	return r.data || [];
}

async function cancelPendingPackets(db, packets, nowTs, reason) {
	let cancelled = 0;
	for (const p of packets || []) {
		if (!p || p.status !== 'pending') continue;
		await db.collection('hsy-income-packets').doc(p._id).update({
			status: 'cancelled',
			cancel_reason: safeText(reason || 'trade_refund', 80),
			update_time: nowTs
		});
		cancelled += 1;
	}
	return cancelled;
}

function rawPendingBalance(row) {
	if (!row) return 0;
	if (row.withdraw_pending_balance != null && row.withdraw_pending_balance !== '') {
		return Number(row.withdraw_pending_balance || 0);
	}
	return Number(row.account_points || 0);
}

async function applyBalanceDeduction(db, merchant, deductAmount, opts = {}) {
	const amt = round2(Number(deductAmount || 0));
	const flatFallback = round2(Number(opts.flatFallbackAmount || 0));
	const useFlat = flatFallback > 0;
	const deduct = useFlat ? flatFallback : amt;
	if (!(deduct > 0) && !useFlat) return { deducted: 0, newBalance: rawPendingBalance(merchant), flatApplied: false };
	const cur = rawPendingBalance(merchant);
	const next = round2(cur - deduct);
	await db.collection('hsy-merchant-users').doc(merchant._id).update({
		account_points: next,
		withdraw_pending_balance: next,
		pending_withdraw: next,
		update_time: Number(opts.nowTs || Date.now())
	});
	return {
		deducted: deduct,
		newBalance: next,
		flatApplied: useFlat,
		beforeBalance: cur
	};
}

async function upsertClawbackTask(db, task) {
	const col = db.collection('hsy-refund-clawback-tasks');
	const dedupKey = safeText(task.dedup_key, 120);
	const exist = await col.where({ dedup_key: dedupKey, status: db.command.neq('cancelled') }).limit(1).get();
	if (exist.data && exist.data.length) return exist.data[0]._id;
	const addRes = await col.add(task);
	return addRes.id || addRes._id;
}

async function markOriginalTradeVoid(db, originalTrade, refundTradeNo, nowTs) {
	if (!originalTrade || !originalTrade._id) return;
	await db.collection('hsy-machine-trades').doc(originalTrade._id).update({
		subsidy_void: true,
		subsidy_void_reason: 'refund',
		subsidy_void_refund_no: safeText(refundTradeNo, 64),
		subsidy_void_time: nowTs,
		update_time: nowTs
	});
}

/**
 * 处理星驿退款流水积分回冲（方案 A）
 * @returns {Promise<object>}
 */
async function processTradeRefundClawback(db, payload = {}) {
	const nowTs = Number(payload.nowTs || Date.now());
	const refundLogno = safeText(payload.refundLogno, 64);
	const ologno = safeText(payload.ologno, 64);
	const refundAmountAbs = Math.abs(Number(payload.refundAmountAbs || 0));
	const refundTradeId = safeText(payload.refundTradeId, 80);
	const merchantUserId = safeText(payload.merchantUserId, 80);

	const result = {
		ok: false,
		skipped: false,
		reason: '',
		refundLogno,
		ologno,
		tasksCreated: 0,
		tasksApplied: 0,
		packetsCancelled: 0,
		totalDeducted: 0
	};

	if (!ologno) {
		result.skipped = true;
		result.reason = 'missing_ologno';
		return result;
	}
	if (!refundLogno) {
		result.skipped = true;
		result.reason = 'missing_refund_logno';
		return result;
	}
	if (!(refundAmountAbs > 0)) {
		result.skipped = true;
		result.reason = 'invalid_refund_amount';
		return result;
	}

	const clawCol = db.collection('hsy-refund-clawback-tasks');
	const dupTask = await clawCol.where({ refund_trade_no: refundLogno, status: db.command.in(['pending', 'done']) }).limit(1).get();
	if (dupTask.data && dupTask.data.length) {
		result.skipped = true;
		result.reason = 'already_processed';
		result.ok = true;
		return result;
	}

	const original = await findOriginalTrade(db, ologno);
	if (!original) {
		result.skipped = true;
		result.reason = 'original_not_found';
		if (refundTradeId) {
			await db.collection('hsy-machine-trades').doc(refundTradeId).update({
				refund_clawback_status: 'skipped_no_original',
				update_time: nowTs
			});
		}
		return result;
	}

	const origAmount = Math.abs(Number(original.amount || 0));
	const uid = safeText(original.user_id || merchantUserId, 80);
	const tradeNo = safeText(original.trade_no, 64);
	const sourceYm = monthNoFromTs(Number(original.create_time || nowTs));
	const refundYm = monthNoFromTs(nowTs);
	const ratio = origAmount > 0 ? Math.min(1, refundAmountAbs / origAmount) : 1;

	const baseInstallments = buildTradeSubsidyInstallments(origAmount, sourceYm);
	const installments = scaleInstallments(baseInstallments, ratio);
	const flatFallbackAmount = round2(refundAmountAbs * CASHBACK_RATE);

	const merchantRes = await db
		.collection('hsy-merchant-users')
		.where(db.command.or([{ user_id: uid }, { _id: uid }]))
		.limit(1)
		.get();
	const merchant = merchantRes.data && merchantRes.data[0];
	if (!merchant) {
		result.skipped = true;
		result.reason = 'merchant_not_found';
		return result;
	}

	await markOriginalTradeVoid(db, original, refundLogno, nowTs);

	const clawbackItems = [];
	for (const inst of installments) {
		const packets = await findPacketsForInstallment(
			db,
			uid,
			sourceYm,
			tradeNo,
			inst.installmentIndex,
			inst.targetYm
		);
		result.packetsCancelled += await cancelPendingPackets(db, packets, nowTs, `refund_${refundLogno}`);
		clawbackItems.push({
			...inst,
			dedup_key: `clawback_${refundLogno}_${inst.installmentIndex}_${inst.targetYm}`
		});
	}

	for (const item of clawbackItems) {
		await upsertClawbackTask(db, {
			merchant_user_id: uid,
			merchant_id: merchant._id,
			original_trade_no: tradeNo,
			refund_trade_no: refundLogno,
			ologno,
			installment_index: item.installmentIndex,
			target_ym: item.targetYm,
			amount: item.amount,
			flat_fallback_amount: flatFallbackAmount,
			status: 'pending',
			dedup_key: item.dedup_key,
			create_time: nowTs,
			update_time: nowTs
		});
		result.tasksCreated += 1;
	}

	const dueNow = clawbackItems.filter((x) => compareYm(x.targetYm, refundYm) <= 0);
	const future = clawbackItems.filter((x) => compareYm(x.targetYm, refundYm) > 0);

	let merchantFresh = merchant;
	const cancelAllPendingForRefund = async (reason) => {
		await clawCol
			.where({ refund_trade_no: refundLogno, status: 'pending' })
			.update({ status: 'cancelled', cancel_reason: safeText(reason, 80), update_time: nowTs });
	};

	const applyFlatFallbackOnce = async () => {
		const freshRes = await db.collection('hsy-merchant-users').doc(merchant._id).get();
		merchantFresh = (freshRes.data && freshRes.data[0]) || merchantFresh;
		const applyRes = await applyBalanceDeduction(db, merchantFresh, flatFallbackAmount, {
			nowTs,
			flatFallbackAmount
		});
		await clawCol
			.where({ refund_trade_no: refundLogno, status: 'pending' })
			.update({
				status: 'done',
				applied_amount: applyRes.deducted,
				applied_balance_before: applyRes.beforeBalance,
				applied_balance_after: applyRes.newBalance,
				flat_fallback_applied: true,
				applied_time: nowTs,
				update_time: nowTs
			});
		result.tasksApplied += 1;
		result.totalDeducted = round2(Number(applyRes.deducted || 0));
		return applyRes;
	};

	const dueNowTotal = round2(dueNow.reduce((s, x) => s + Number(x.amount || 0), 0));
	const curBalBefore = rawPendingBalance(merchant);
	if (dueNow.length && dueNowTotal > 0 && curBalBefore + 1e-6 < dueNowTotal) {
		await applyFlatFallbackOnce();
	} else {
		const applyOne = async (item) => {
			const freshRes = await db.collection('hsy-merchant-users').doc(merchant._id).get();
			merchantFresh = (freshRes.data && freshRes.data[0]) || merchantFresh;
			const curBal = rawPendingBalance(merchantFresh);
			const need = round2(Number(item.amount || 0));
			if (curBal + 1e-6 < need) {
				await applyFlatFallbackOnce();
				await cancelAllPendingForRefund('flat_fallback_applied');
				return true;
			}
			const applyRes = await applyBalanceDeduction(db, merchantFresh, need, { nowTs });
			await clawCol
				.where({ dedup_key: item.dedup_key, status: 'pending' })
				.update({
					status: 'done',
					applied_amount: applyRes.deducted,
					applied_balance_before: applyRes.beforeBalance,
					applied_balance_after: applyRes.newBalance,
					flat_fallback_applied: false,
					applied_time: nowTs,
					update_time: nowTs
				});
			result.tasksApplied += 1;
			result.totalDeducted = round2(result.totalDeducted + Number(applyRes.deducted || 0));
			return false;
		};

		for (const item of dueNow) {
			const stop = await applyOne(item);
			if (stop) break;
		}
	}

	const futurePending = await clawCol.where({ refund_trade_no: refundLogno, status: 'pending' }).count();
	const futureCount = Number(futurePending.total || 0);

	if (refundTradeId) {
		await db.collection('hsy-machine-trades').doc(refundTradeId).update({
			is_refund: true,
			refund_of_trade_no: ologno,
			refund_clawback_status: futureCount > 0 ? 'partial_scheduled' : 'done',
			refund_clawback_amount: result.totalDeducted,
			update_time: nowTs
		});
	}

	try {
		await db.collection('hsy-operation-logs').add({
			user_id: uid,
			user_name: merchant.wx_nickname || merchant.mobile || uid,
			action: 'trade_refund_clawback',
			module: 'finance',
			target_id: merchant._id,
			target_name: tradeNo,
			content: `退款回冲积分：退款单 ${refundLogno} 关联原单 ${ologno}，已扣 ${result.totalDeducted}，待执行 ${futureCount} 期`,
			operator_source: 'system',
			operator: 'refund_clawback',
			platform_no: refundLogno,
			create_time: nowTs,
			refund_amount: refundAmountAbs,
			clawback_deducted: result.totalDeducted,
			clawback_tasks: result.tasksCreated
		});
	} catch (e) {
		console.error('trade_refund_clawback log failed', e);
	}

	result.ok = true;
	result.futureTasks = futureCount;
	return result;
}

/** 执行到期（target_ym <= 当前月）的待扣任务，供定时任务或 H5 同步调用 */
async function applyDueRefundClawbackTasks(db, opts = {}) {
	const nowTs = Number(opts.nowTs || Date.now());
	const curYm = monthNoFromTs(nowTs);
	const limit = Math.min(200, Math.max(1, Number(opts.limit || 50)));
	const merchantUserId = safeText(opts.merchantUserId, 80);
	const col = db.collection('hsy-refund-clawback-tasks');
	const whereParts = [{ status: 'pending' }, { target_ym: db.command.lte(curYm) }];
	if (merchantUserId) whereParts.push({ merchant_user_id: merchantUserId });
	const res = await col
		.where(whereParts.length === 1 ? whereParts[0] : db.command.and(whereParts))
		.orderBy('target_ym', 'asc')
		.orderBy('create_time', 'asc')
		.limit(limit)
		.get();
	const rows = res.data || [];
	let applied = 0;
	let deducted = 0;
	const flatHandledRefunds = new Set();
	for (const row of rows) {
		const refundNo = safeText(row.refund_trade_no, 64);
		if (refundNo && flatHandledRefunds.has(refundNo)) continue;
		const uid = safeText(row.merchant_user_id, 80);
		const mRes = await db
			.collection('hsy-merchant-users')
			.where(db.command.or([{ user_id: uid }, { _id: uid }]))
			.limit(1)
			.get();
		const merchant = mRes.data && mRes.data[0];
		if (!merchant) continue;
		const need = round2(Number(row.amount || 0));
		const curBal = rawPendingBalance(merchant);
		const flatFallback = round2(Number(row.flat_fallback_amount || 0));
		let applyRes;
		if (curBal + 1e-6 < need && flatFallback > 0) {
			applyRes = await applyBalanceDeduction(db, merchant, flatFallback, {
				nowTs,
				flatFallbackAmount: flatFallback
			});
			await col
				.where({ refund_trade_no: row.refund_trade_no, status: 'pending' })
				.update({
					status: 'done',
					applied_amount: applyRes.deducted,
					applied_balance_before: applyRes.beforeBalance,
					applied_balance_after: applyRes.newBalance,
					flat_fallback_applied: true,
					applied_time: nowTs,
					update_time: nowTs
				});
		} else {
			applyRes = await applyBalanceDeduction(db, merchant, need, { nowTs });
			await col.doc(row._id).update({
				status: 'done',
				applied_amount: applyRes.deducted,
				applied_balance_before: applyRes.beforeBalance,
				applied_balance_after: applyRes.newBalance,
				flat_fallback_applied: false,
				applied_time: nowTs,
				update_time: nowTs
			});
		}
		applied += 1;
		deducted = round2(deducted + Number(applyRes.deducted || 0));
		if (applyRes.flatApplied && row.refund_trade_no) {
			flatHandledRefunds.add(refundNo);
			await col
				.where({ refund_trade_no: row.refund_trade_no, status: 'pending' })
				.update({ status: 'cancelled', cancel_reason: 'flat_fallback_applied', update_time: nowTs });
		}
	}
	return { applied, deducted, pendingChecked: rows.length, atYm: curYm };
}

module.exports = {
	processTradeRefundClawback,
	applyDueRefundClawbackTasks,
	buildTradeSubsidyInstallments,
	monthNoFromTs
};
