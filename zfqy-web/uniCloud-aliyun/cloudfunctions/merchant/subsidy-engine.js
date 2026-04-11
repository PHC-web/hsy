'use strict';

const POINTS_PER_BLOCK = 38;
const POINTS_PER_MONTH = 7.6;
const CLAIM_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

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
		.field({ amount: true, release_amount: true })
		.limit(20000)
		.get();
	let total = 0;
	for (const row of res.data || []) {
		const hasRelease = row.release_amount !== undefined && row.release_amount !== null;
		const release = hasRelease ? Number(row.release_amount || 0) : Number(row.amount || 0) * 0.0038 / 5;
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

/**
 * 规则：每笔返现=交易金额*0.38%，本次释放=返现/5；
 * 自然月内累计释放金额每满7.6，生成一笔H5可领取7.6（10天有效）。
 */
async function syncSubsidyPackets(db, merchant, nowTs) {
	const merchantUserId = merchant.user_id || merchant._id;
	const dedupSet = await existingDedupKeys(db, merchantUserId);
	const curYm = monthNoFromTs(nowTs);
	const { start, end } = monthStartEndTs(curYm);
	if (start && end) {
		const releaseTotal = await sumEligibleReleasePoints(db, merchantUserId, start, end);
		const blocks = Math.floor(releaseTotal / POINTS_PER_MONTH);
		for (let i = 0; i < blocks; i += 1) {
			await upsertPacket(
				db,
				{
					merchant_user_id: merchantUserId,
					month_no: curYm,
					title: `流水释放补贴 ${curYm} #${i + 1}`,
					amount: POINTS_PER_MONTH,
					status: 'pending',
					create_time: nowTs,
					update_time: nowTs,
					is_deleted: false,
					expire_time: nowTs + CLAIM_WINDOW_MS,
					claim_open_time: nowTs,
					subsidy_kind: 'release_pool',
					dedup_key: `rp_${merchantUserId}_${curYm}_${i}`,
					subsidy_flow_month: curYm,
					subsidy_block_index: i,
					installment_index: 1,
					anchor_flow_yuan: Number(((i + 1) * 10000).toFixed(2)),
					unlock_flow_yuan: 0
				},
				dedupSet
			);
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
