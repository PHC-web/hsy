'use strict';

const POINTS_PER_BLOCK = 38;
const POINTS_PER_MONTH = 7.6;
const CLAIM_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

function monthNoFromTs(ts) {
	const d = new Date(Number(ts));
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

function parseYearMonth(ym) {
	const [ys, ms] = String(ym || '').split('-');
	const y = Number(ys);
	const m = Number(ms);
	if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
	return { y, m };
}

function monthStartEndTs(ym) {
	const p = parseYearMonth(ym);
	if (!p) return { start: 0, end: 0 };
	const start = new Date(p.y, p.m - 1, 1, 0, 0, 0, 0).getTime();
	const end = new Date(p.y, p.m, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}

function addMonths(ym, delta) {
	const p = parseYearMonth(ym);
	if (!p) return '';
	const d = new Date(Date.UTC(p.y, p.m - 1 + Number(delta || 0), 1, 0, 0, 0, 0));
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

async function sumEligibleRealFlowYuan(db, merchantUserId, start, end) {
	const _ = db.command;
	const res = await db
		.collection('hsy-machine-trades')
		.where(
			_.and([
				{ user_id: merchantUserId },
				{ trade_type: 'real' },
				{ stats_eligible: _.neq(false) },
				{ create_time: _.gte(start).and(_.lte(end)) },
				{ amount: _.gt(0) },
				_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
			])
		)
		.field({ amount: true })
		.limit(20000)
		.get();
	let total = 0;
	for (const row of res.data || []) {
		total += Number(row.amount || 0);
	}
	return Number(total.toFixed(2));
}

async function sumEligibleReleasePoints(db, merchantUserId, start, end) {
	const _ = db.command;
	const res = await db
		.collection('hsy-machine-trades')
		.where(
			_.and([
				{ user_id: merchantUserId },
				{ trade_type: 'real' },
				{ stats_eligible: _.neq(false) },
				{ create_time: _.gte(start).and(_.lte(end)) },
				{ amount: _.gt(0) },
				_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
			])
		)
		.field({ amount: true, release_amount: true, release_ratio: true })
		.limit(20000)
		.get();
	let total = 0;
	for (const row of res.data || []) {
		const amount = Number(row.amount || 0);
		const hasRelease = row.release_amount !== undefined && row.release_amount !== null;
		let release = hasRelease ? Number(row.release_amount || 0) : Number((amount * 0.0038 / (amount > 300 ? 5 : 1)).toFixed(4));
		const rr = Number(row.release_ratio);
		if (!hasRelease && Number.isFinite(rr) && rr >= 99) {
			release = Number((amount * 0.0038).toFixed(4));
		}
		if (Number.isFinite(release) && release > 0) total += release;
	}
	return Number(total.toFixed(4));
}

async function existingDedupKeys(db, merchantUserId) {
	const res = await db
		.collection('hsy-income-packets')
		.where({ merchant_user_id: merchantUserId, is_deleted: false })
		.field({ dedup_key: true })
		.limit(5000)
		.get();
	const set = new Set();
	for (const r of res.data || []) {
		if (r.dedup_key) set.add(r.dedup_key);
	}
	return set;
}

async function upsertPacket(db, doc, dedupSet) {
	const dk = doc.dedup_key;
	if (!dk || dedupSet.has(dk)) return;
	await db.collection('hsy-income-packets').add(doc);
	dedupSet.add(dk);
}

async function syncSubsidyPackets(db, merchant, nowTs) {
	const merchantUserId = merchant.user_id || merchant._id;
	const dedupSet = await existingDedupKeys(db, merchantUserId);
	const _ = db.command;
	const tradesRes = await db
		.collection('hsy-machine-trades')
		.where(
			_.and([
				{ user_id: merchantUserId },
				{ trade_type: 'real' },
				{ stats_eligible: _.neq(false) },
				{ amount: _.gt(0) },
				_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }])
			])
		)
		.field({ _id: true, trade_no: true, amount: true, release_amount: true, release_ratio: true, create_time: true })
		.orderBy('create_time', 'asc')
		.limit(5000)
		.get();
	const trades = tradesRes.data || [];
	if (!trades.length) return;

	const isMember = Number(merchant.recharge_package_price || 0) >= 600 || Number(merchant.remaining_quota || 0) > 0;
	const monthFlowMap = {};
	const deferredPoolByMonth = {};
	for (const t of trades) {
		const ym = monthNoFromTs(t.create_time || nowTs);
		monthFlowMap[ym] = Number((monthFlowMap[ym] || 0) + Number(t.amount || 0));
		const total = Number((Number(t.amount || 0) * 0.0038).toFixed(4));
		const first = Number(t.release_amount != null ? t.release_amount : total);
		const deferred = Number((total - first).toFixed(4));
		if (deferred > 0) deferredPoolByMonth[ym] = Number((deferredPoolByMonth[ym] || 0) + deferred);
	}

	// 1) 首期（第一个月）按每笔流水生成气泡
	for (const t of trades) {
		const total = Number((Number(t.amount || 0) * 0.0038).toFixed(4));
		const firstRelease = Number(t.release_amount != null ? t.release_amount : total);
		if (!(firstRelease > 0)) continue;
		const ym = monthNoFromTs(t.create_time || nowTs);
		const monthFlow = Number(monthFlowMap[ym] || 0);
		const canOpenNow = isMember || monthFlow >= 50000;
		const openAt = canOpenNow ? nowTs : 0;
		const expAt = canOpenNow ? nowTs + CLAIM_WINDOW_MS : 0;
		const tradeNo = String(t.trade_no || t._id || '');
		await upsertPacket(
			db,
			{
				merchant_user_id: merchantUserId,
				month_no: ym,
				title: `流水首期补贴 ${tradeNo.slice(-8)}`,
				amount: Number(firstRelease.toFixed(4)),
				status: 'pending',
				create_time: Number(t.create_time || nowTs),
				update_time: nowTs,
				is_deleted: false,
				expire_time: expAt,
				claim_open_time: openAt,
				subsidy_kind: 'trade_first',
				dedup_key: `trade_${merchantUserId}_${tradeNo}`,
				subsidy_flow_month: ym,
				subsidy_block_index: 0,
				installment_index: 1,
				anchor_flow_yuan: Number(t.amount || 0),
				unlock_flow_yuan: 0
			},
			dedupSet
		);
	}

	// 2) 其余分期进入待返池；3) 按“每满1万一档”释放（不顺延）
	// 规则：
	// - 当月每满 1 万：释放“本月待返池”1个7.6；
	// - 同一档位，最多再释放“上月待返池”1个7.6；
	// - 上月超出当月档位未释放的部分直接失效，不结转下月。
	const months = Object.keys(monthFlowMap).sort();
	for (const ym of months) {
		const tiers = Math.floor(Number(monthFlowMap[ym] || 0) / 10000);
		if (tiers <= 0) continue;
		const curPoolAmt = Number(deferredPoolByMonth[ym] || 0);
		const curBlocks = Math.floor(curPoolAmt / POINTS_PER_MONTH);
		const prevYm = addMonths(ym, -1);
		const prevPoolAmt = Number(deferredPoolByMonth[prevYm] || 0);
		const prevBlocks = Math.floor(prevPoolAmt / POINTS_PER_MONTH);
		const grantCur = Math.min(curBlocks, tiers);
		const grantPrev = Math.min(prevBlocks, tiers);

		for (let i = 0; i < grantCur; i += 1) {
			await upsertPacket(
				db,
				{
					merchant_user_id: merchantUserId,
					month_no: ym,
					title: `本月待返补贴 ${ym} #${i + 1}`,
					amount: POINTS_PER_MONTH,
					status: 'pending',
					create_time: nowTs,
					update_time: nowTs,
					is_deleted: false,
					expire_time: nowTs + CLAIM_WINDOW_MS,
					claim_open_time: nowTs,
					subsidy_kind: 'release_pool_current',
					dedup_key: `pool_cur_${merchantUserId}_${ym}_${i}`,
					subsidy_flow_month: ym,
					subsidy_block_index: i,
					installment_index: 2,
					anchor_flow_yuan: Number(curPoolAmt.toFixed(4)),
					unlock_flow_yuan: (i + 1) * 10000
				},
				dedupSet
			);
		}

		for (let i = 0; i < grantPrev; i += 1) {
			await upsertPacket(
				db,
				{
					merchant_user_id: merchantUserId,
					month_no: ym,
					title: `上月待返补贴 ${prevYm} #${i + 1}`,
					amount: POINTS_PER_MONTH,
					status: 'pending',
					create_time: nowTs,
					update_time: nowTs,
					is_deleted: false,
					expire_time: nowTs + CLAIM_WINDOW_MS,
					claim_open_time: nowTs,
					subsidy_kind: 'release_pool_prev',
					dedup_key: `pool_prev_${merchantUserId}_${prevYm}_to_${ym}_${i}`,
					subsidy_flow_month: prevYm,
					subsidy_block_index: i,
					installment_index: 2,
					anchor_flow_yuan: Number(prevPoolAmt.toFixed(4)),
					unlock_flow_yuan: (i + 1) * 10000
				},
				dedupSet
			);
		}
	}

	// 非会员：首期气泡当月流水满5万后统一开放，并从开放时刻起算15天
	if (!isMember) {
		const pendingRes = await db
			.collection('hsy-income-packets')
			.where({ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false, subsidy_kind: 'trade_first' })
			.limit(2000)
			.get();
		for (const p of pendingRes.data || []) {
			if (Number(p.claim_open_time || 0) > 0) continue;
			const ym = String(p.month_no || '');
			const mf = Number(monthFlowMap[ym] || 0);
			if (mf < 50000) continue;
			await db.collection('hsy-income-packets').doc(p._id).update({
				claim_open_time: nowTs,
				expire_time: nowTs + CLAIM_WINDOW_MS,
				update_time: nowTs
			});
		}
	}

	/* 过期标记 */
	const pend = await db
		.collection('hsy-income-packets')
		.where({ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false })
		.limit(500)
		.get();
	for (const row of pend.data || []) {
		if (row.expire_time && row.expire_time < nowTs) {
			await db.collection('hsy-income-packets').doc(row._id).update({
				status: 'expired',
				update_time: nowTs
			});
		}
	}
}

module.exports = {
	POINTS_PER_BLOCK,
	POINTS_PER_MONTH,
	monthNoFromTs,
	monthStartEndTs,
	sumEligibleRealFlowYuan,
	sumEligibleReleasePoints,
	syncSubsidyPackets
};
