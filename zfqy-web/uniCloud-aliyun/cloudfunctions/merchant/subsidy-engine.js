'use strict';

const { shanghaiYearMonthFromTs } = require('../common/format-time-cn.js');

const POINTS_PER_BLOCK = 38;
const POINTS_PER_MONTH = 7.6;
const CLAIM_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const MIN_PACKET_AMOUNT = 0.01;

function monthNoFromTs(ts) {
	return shanghaiYearMonthFromTs(ts);
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
				{ trade_type: _.in(['real', 'virtual']) },
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
				{ trade_type: _.in(['real', 'virtual']) },
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
	const amt = Number(doc.amount || 0);
	if (!(amt >= MIN_PACKET_AMOUNT)) return;
	await db.collection('hsy-income-packets').add(doc);
	dedupSet.add(dk);
}

function buildDeferredSlicesByMonth(trades, nowTs, sliceFlowYuan = 10000) {
	const byMonth = {};
	for (const t of trades || []) {
		const ym = monthNoFromTs(t.create_time || nowTs);
		if (!byMonth[ym]) byMonth[ym] = [];
		byMonth[ym].push(t);
	}
	const out = {};
	Object.keys(byMonth).forEach((ym) => {
		const rows = byMonth[ym];
		let monthFlowCursor = 0; // 当月累计流水游标（用于按0-1w、1-2w切片）
		const slices = [];
		for (const t of rows) {
			const amount = Number(t.amount || 0);
			if (!(amount > 0)) continue;
			const total = Number((amount * 0.0038).toFixed(4));
			const first = Number(t.release_amount != null ? t.release_amount : total);
			// 后续4个月“每个月”的应到期积分，而非4个月总和
			const monthlyDeferred = Number(((total - first) / 4).toFixed(6));
			let remainAmt = amount;
			let distributed = 0;
			while (remainAmt > 1e-8) {
				const sliceIdx = Math.floor(monthFlowCursor / sliceFlowYuan);
				const sliceEnd = (sliceIdx + 1) * sliceFlowYuan;
				const room = Math.max(0, sliceEnd - monthFlowCursor);
				const take = Math.min(remainAmt, room > 0 ? room : remainAmt);
				const part = amount > 0 ? Number((monthlyDeferred * (take / amount)).toFixed(6)) : 0;
				slices[sliceIdx] = Number(((slices[sliceIdx] || 0) + part).toFixed(6));
				distributed = Number((distributed + part).toFixed(6));
				monthFlowCursor = Number((monthFlowCursor + take).toFixed(6));
				remainAmt = Number((remainAmt - take).toFixed(6));
			}
			// 兜底把舍入差补到该笔最后一个片
			const gap = Number((monthlyDeferred - distributed).toFixed(6));
			if (Math.abs(gap) > 0.000001) {
				const lastIdx = Math.max(0, Math.ceil(monthFlowCursor / sliceFlowYuan) - 1);
				slices[lastIdx] = Number(((slices[lastIdx] || 0) + gap).toFixed(6));
			}
		}
		out[ym] = slices.map((x) => Number(Number(x || 0).toFixed(4)));
	});
	return out;
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
				{ trade_type: _.in(['real', 'virtual']) },
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

	const monthFlowMap = {};
	for (const t of trades) {
		const ym = monthNoFromTs(t.create_time || nowTs);
		monthFlowMap[ym] = Number((monthFlowMap[ym] || 0) + Number(t.amount || 0));
	}
	const deferredSlicesBySourceMonth = buildDeferredSlicesByMonth(trades, nowTs, 10000);
	// 目标月 => 源月 => slices[]
	const deferredDueByTargetMonth = {};
	Object.keys(deferredSlicesBySourceMonth).forEach((srcYm) => {
		const slices = deferredSlicesBySourceMonth[srcYm] || [];
		for (let k = 1; k <= 4; k += 1) {
			const targetYm = addMonths(srcYm, k);
			if (!deferredDueByTargetMonth[targetYm]) deferredDueByTargetMonth[targetYm] = {};
			deferredDueByTargetMonth[targetYm][srcYm] = slices.slice();
		}
	});

	// 1) 首期（第一个月）按每笔流水生成气泡
	for (const t of trades) {
		const total = Number((Number(t.amount || 0) * 0.0038).toFixed(4));
		const firstRelease = Number(t.release_amount != null ? t.release_amount : total);
		if (!(firstRelease > 0)) continue;
		const ym = monthNoFromTs(t.create_time || nowTs);
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
				expire_time: nowTs + CLAIM_WINDOW_MS,
				claim_open_time: nowTs,
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

	// 2) 其余分期释放规则（按最终口径）：
	// - 每月流水每满 1 万，生成 1 个释放档位（tiers）；
	// - tiers 仅用于“当月应释放”的历史月分期池（上月或更早）；
	// - 每个历史月在当月携带“流水分片”（每片对应该来源月某个1万流水区间，积分可能为0）；
	// - 分期待返按“每个月”口径切片（4个月各有一份，不是4个月总量一次切）；
	// - tiers 不足时，未释放分片直接流失，不顺延到下月。
	const months = Object.keys(monthFlowMap).sort();
	for (const ym of months) {
		const tiers = Math.floor(Number(monthFlowMap[ym] || 0) / 10000);
		if (tiers <= 0) continue;
		const dueBySource = deferredDueByTargetMonth[ym] || {};
		const sourceMonths = Object.keys(dueBySource).sort();
		for (const srcYm of sourceMonths) {
			const chunks = Array.isArray(dueBySource[srcYm]) ? dueBySource[srcYm] : [];
			if (!chunks.length) continue;
			// 每个来源月在目标月都按“当月档位”独立释放，不是全来源共用一个档位池
			const canGrant = Math.min(chunks.length, tiers);
			for (let i = 0; i < canGrant; i += 1) {
				const chunkAmt = Number(chunks[i] || 0);
				if (chunkAmt > 0) {
					await upsertPacket(
						db,
						{
							merchant_user_id: merchantUserId,
							month_no: ym,
							title: `分期待返补贴 ${srcYm} #${i + 1}`,
							amount: chunkAmt,
							status: 'pending',
							create_time: nowTs,
							update_time: nowTs,
							is_deleted: false,
							expire_time: nowTs + CLAIM_WINDOW_MS,
							claim_open_time: nowTs,
							subsidy_kind: 'release_pool_history',
							dedup_key: `pool_hist_${merchantUserId}_${srcYm}_to_${ym}_${i}`,
							subsidy_flow_month: srcYm,
							subsidy_block_index: i,
							installment_index: 2,
							anchor_flow_yuan: Number(chunks.reduce((s, x) => s + Number(x || 0), 0).toFixed(4)),
							unlock_flow_yuan: (i + 1) * 10000
						},
						dedupSet
					);
				}
			}
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
	buildDeferredSlicesByMonth,
	sumEligibleRealFlowYuan,
	sumEligibleReleasePoints,
	syncSubsidyPackets
};
