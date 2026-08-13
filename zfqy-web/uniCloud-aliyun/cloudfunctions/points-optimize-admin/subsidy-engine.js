'use strict';

const { shanghaiYearMonthFromTs } = require('./format-time-cn.js');

const POINTS_PER_BLOCK = 38;
const POINTS_PER_MONTH = 7.6;
/** 待领取奖励默认有效期（天），可被业务参数 incomePacketClaimValidDays 覆盖 */
const DEFAULT_INCOME_PACKET_CLAIM_VALID_DAYS = 7;
const CASHBACK_RATE = 0.0038;
const DEFAULT_THRESHOLD_YUAN = 300;
const DEFAULT_ABOVE_INSTALLMENTS = 5;
/** 与历史产品一致：阈值以下默认 1 期；实际以参数配置 optimizeConfig 为准 */
const DEFAULT_BELOW_INSTALLMENTS = 1;
const MIN_PACKET_AMOUNT = 0.01;
/** H5 权益页未领取气泡上限；超出后失效 create_time 最早的 pending */
const MAX_PENDING_INCOME_PACKETS = 50;
/** 两位小数向上取整（例：13.1501 → 13.16）；用于最低流水门槛等 */
function ceilYuan2(raw) {
	const n = Number(raw || 0);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.ceil(n * 100 - 1e-9) / 100;
}
/**
 * 积分/红包金额：严格向下取整到分（截断，非四舍五入）。
 * 例：125.22999 → 125.22；0.8189 → 0.81；146.57999999999996 → 146.57
 */
function floorYuan2(raw) {
	const n = Number(raw || 0);
	if (!Number.isFinite(n) || n <= 0) return 0;
	const s = n.toString();
	if (/e-/i.test(s)) return 0;
	if (/e\+/i.test(s)) return Math.floor(n * 100) / 100;
	const dot = s.indexOf('.');
	if (dot < 0) return n;
	const dec = s.slice(dot + 1);
	if (dec.length <= 2) return n;
	return Number(s.slice(0, dot + 3));
}
/** @deprecated 名称保留兼容；口径为向下截断到分，等同 floorYuan2 */
function roundPacketAmountYuan(raw) {
	return floorYuan2(raw);
}

function normalizeOptimizeConfig(oc) {
	const raw = oc && typeof oc === 'object' ? oc : {};
	return {
		thresholdYuan: Math.max(
			0,
			Number(raw.thresholdYuan != null && raw.thresholdYuan !== '' ? raw.thresholdYuan : DEFAULT_THRESHOLD_YUAN)
		),
		aboveInstallments: Math.max(
			1,
			Math.floor(
				Number(
					raw.aboveInstallments != null && raw.aboveInstallments !== ''
						? raw.aboveInstallments
						: DEFAULT_ABOVE_INSTALLMENTS
				)
			)
		),
		belowInstallments: Math.max(
			1,
			Math.floor(
				Number(
					raw.belowInstallments != null && raw.belowInstallments !== ''
						? raw.belowInstallments
						: DEFAULT_BELOW_INSTALLMENTS
				)
			)
		)
	};
}

/** 每期最低 0.01 × 期数 / 0.0038，向上取整到分 */
function minSubsidyTradeYuanForInstallments(installments) {
	const n = Math.max(1, Number(installments) || 1);
	return ceilYuan2((MIN_PACKET_AMOUNT * n) / CASHBACK_RATE);
}

/**
 * 按参数配置解析分期数。
 * release_ratio≥99 视为历史「一期全返」标记。
 */
function resolveInstallmentCount(amount, releaseRatio, optimizeConfig) {
	const rr = Number(releaseRatio);
	if (Number.isFinite(rr) && rr >= 99) return 1;
	const oc = normalizeOptimizeConfig(optimizeConfig);
	const amt = Number(amount || 0);
	return amt > oc.thresholdYuan ? oc.aboveInstallments : oc.belowInstallments;
}

/**
 * 首期应返：按当前参数期数计算；库内过小的脏 release_amount（曾按 5 期写入）按参数重算。
 */
function resolveFirstReleaseYuan(amount, releaseAmount, releaseRatio, optimizeConfig) {
	const amt = Number(amount || 0);
	const installments = resolveInstallmentCount(amt, releaseRatio, optimizeConfig);
	const minTrade = minSubsidyTradeYuanForInstallments(installments);
	if (!(amt >= minTrade)) return 0;
	const expected = floorYuan2((amt * CASHBACK_RATE) / installments);
	const ra =
		releaseAmount !== undefined && releaseAmount !== null && releaseAmount !== ''
			? Number(releaseAmount)
			: NaN;
	if (Number.isFinite(ra) && floorYuan2(ra) >= MIN_PACKET_AMOUNT) {
		if (expected > 0 && ra + 1e-9 < expected * 0.5) return expected;
		return floorYuan2(ra);
	}
	return expected;
}

function isSubsidyEligibleTradeAmount(amount, releaseRatio, optimizeConfig) {
	const amt = Number(amount || 0);
	const installments = resolveInstallmentCount(amt, releaseRatio, optimizeConfig);
	return amt >= minSubsidyTradeYuanForInstallments(installments);
}

/** @deprecated 兼容旧引用；业务请用 minSubsidyTradeYuanForInstallments(期数) */
const MIN_SUBSIDY_TRADE_YUAN = minSubsidyTradeYuanForInstallments(DEFAULT_ABOVE_INSTALLMENTS);
/** uniCloud 单次 get 上限 1000，须分页拉全量 */
const DB_PAGE_SIZE = 1000;
const DB_MAX_ROWS = 2000000;

/**
 * 分页遍历查询结果（规避 uniCloud limit 最大 1000 条）。
 * @param {object} opts.field field 投影
 * @param {{ field: string, direction?: 'asc'|'desc' }} [opts.orderBy]
 */
async function forEachQueryPage(db, collectionName, where, opts, onPage) {
	const collection = db.collection(collectionName);
	const field = opts && opts.field ? opts.field : null;
	const orderBy = opts && opts.orderBy ? opts.orderBy : null;
	let skip = 0;
	let total = 0;
	for (;;) {
		let q = collection.where(where);
		if (field && Object.keys(field).length) q = q.field(field);
		if (orderBy && orderBy.field) q = q.orderBy(orderBy.field, orderBy.direction || 'asc');
		const r = await q.skip(skip).limit(DB_PAGE_SIZE).get();
		const rows = r.data || [];
		if (rows.length && typeof onPage === 'function') {
			await onPage(rows);
		}
		total += rows.length;
		if (rows.length < DB_PAGE_SIZE) break;
		skip += DB_PAGE_SIZE;
		if (skip >= DB_MAX_ROWS) break;
	}
	return total;
}

async function fetchAllQueryPages(db, collectionName, where, opts) {
	const all = [];
	await forEachQueryPage(db, collectionName, where, opts, (rows) => {
		all.push(...rows);
	});
	return all;
}

function buildEligibleSubsidyTradeWhere(db, merchantUserId) {
	const _ = db.command;
	return _.and([
		{ user_id: merchantUserId },
		{ trade_type: _.in(['real', 'virtual']) },
		{ stats_eligible: _.neq(false) },
		{ amount: _.gt(0) },
		_.or([{ subsidy_void: _.neq(true) }, { subsidy_void: _.exists(false) }]),
		_.or([{ is_risk_trade: _.neq(true) }, { risk_audit_status: 'approved' }]),
		_.or([{ is_flow_opt_trade: _.neq(true) }, { flow_opt_audit_status: 'approved' }])
	]);
}

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
	const where = _.and([
		buildEligibleSubsidyTradeWhere(db, merchantUserId),
		{ create_time: _.gte(start).and(_.lte(end)) }
	]);
	let total = 0;
	await forEachQueryPage(db, 'hsy-machine-trades', where, { field: { amount: true } }, (rows) => {
		for (const row of rows) {
			total += Number(row.amount || 0);
		}
	});
	return Number(total.toFixed(2));
}

async function sumEligibleReleasePoints(db, merchantUserId, start, end, optimizeConfig) {
	const _ = db.command;
	const where = _.and([
		buildEligibleSubsidyTradeWhere(db, merchantUserId),
		{ create_time: _.gte(start).and(_.lte(end)) }
	]);
	let total = 0;
	await forEachQueryPage(
		db,
		'hsy-machine-trades',
		where,
		{ field: { amount: true, release_amount: true, release_ratio: true } },
		(rows) => {
			for (const row of rows) {
				const amount = Number(row.amount || 0);
				if (!isSubsidyEligibleTradeAmount(amount, row.release_ratio, optimizeConfig)) continue;
				const release = resolveFirstReleaseYuan(
					amount,
					row.release_amount,
					row.release_ratio,
					optimizeConfig
				);
				if (Number.isFinite(release) && release > 0) total += release;
			}
		}
	);
	return Number(total.toFixed(4));
}

async function existingDedupKeys(db, merchantUserId) {
	const set = new Set();
	await forEachQueryPage(
		db,
		'hsy-income-packets',
		{ merchant_user_id: merchantUserId, is_deleted: false },
		{ field: { dedup_key: true } },
		(rows) => {
			for (const r of rows) {
				if (r.dedup_key) set.add(r.dedup_key);
			}
		}
	);
	return set;
}

async function upsertPacket(db, doc, dedupSet) {
	const dk = doc.dedup_key;
	if (!dk || dedupSet.has(dk)) return;
	const amt = roundPacketAmountYuan(doc.amount);
	if (!(amt >= MIN_PACKET_AMOUNT)) return;
	// 并发下仅靠内存 Set 会重复写入；落库前再查一次，并依赖 dedup 唯一索引兜底
	try {
		const exist = await db
			.collection('hsy-income-packets')
			.where({ merchant_user_id: doc.merchant_user_id, dedup_key: dk })
			.limit(1)
			.get();
		if (exist.data && exist.data.length) {
			dedupSet.add(dk);
			return;
		}
	} catch (e) {
		console.error('upsertPacket dedup check', e);
	}
	try {
		await db.collection('hsy-income-packets').add(Object.assign({}, doc, { amount: amt }));
		dedupSet.add(dk);
	} catch (e) {
		const msg = String((e && (e.message || e.errMsg)) || e || '');
		// 唯一索引冲突：另一并发请求已写入
		if (/duplicate|E11000|unique|已存在|重复/i.test(msg)) {
			dedupSet.add(dk);
			return;
		}
		throw e;
	}
}

function buildDeferredSlicesByMonth(trades, nowTs, sliceFlowYuan = 10000, optimizeConfig) {
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
			if (!isSubsidyEligibleTradeAmount(amount, t.release_ratio, optimizeConfig)) continue;
			const total = Number((amount * CASHBACK_RATE).toFixed(4));
			const first = resolveFirstReleaseYuan(amount, t.release_amount, t.release_ratio, optimizeConfig);
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
		out[ym] = slices.map((x) => floorYuan2(x));
	});
	return out;
}

function resolveIncomePacketClaimValidMs(options = {}) {
	const days = Math.max(
		1,
		Math.min(365, Number(options.claimValidDays != null ? options.claimValidDays : DEFAULT_INCOME_PACKET_CLAIM_VALID_DAYS))
	);
	return days * 24 * 60 * 60 * 1000;
}

/** 待领取窗口：自 anchorTs 起 claimValidMs 内可领，到期后权益页不可见 */
function buildIncomePacketClaimWindow(anchorTs, claimValidMs) {
	const anchor = Number(anchorTs || 0);
	const ms = Math.max(1, Number(claimValidMs || 0));
	return {
		claim_open_time: anchor,
		expire_time: anchor + ms
	};
}

/**
 * 保持可展示的未领取气泡 ≤ MAX_PENDING_INCOME_PACKETS：
 * 按 create_time 升序，超出部分将最早的标为 expired（先进先失效）。
 */
async function enforceMaxPendingIncomePackets(db, merchantUserId, nowTs) {
	const allPending = await fetchAllQueryPages(
		db,
		'hsy-income-packets',
		{ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false },
		{
			field: {
				_id: true,
				create_time: true,
				subsidy_kind: true,
				expire_time: true,
				claim_open_time: true,
				amount: true
			},
			orderBy: { field: 'create_time', direction: 'asc' }
		}
	);
	const claimable = (allPending || []).filter((x) => {
		if (x.expire_time && x.expire_time < nowTs) return false;
		if (!Number(x.claim_open_time || 0)) return false;
		if (x.claim_open_time && x.claim_open_time > nowTs) return false;
		if (roundPacketAmountYuan(x.amount) < MIN_PACKET_AMOUNT) return false;
		return true;
	});
	claimable.sort((a, b) => Number(a.create_time || 0) - Number(b.create_time || 0));
	if (claimable.length <= MAX_PENDING_INCOME_PACKETS) {
		return { expiredTradeFirst: 0, expiredByCap: 0 };
	}
	const overflow = claimable.length - MAX_PENDING_INCOME_PACKETS;
	const toExpire = claimable.slice(0, overflow);
	let expiredTradeFirst = 0;
	for (const row of toExpire) {
		await db.collection('hsy-income-packets').doc(row._id).update({
			status: 'expired',
			update_time: nowTs
		});
		if (String(row.subsidy_kind || '') === 'trade_first') expiredTradeFirst += 1;
	}
	return { expiredTradeFirst, expiredByCap: toExpire.length };
}

async function syncSubsidyPackets(db, merchant, nowTs, options = {}) {
	const claimValidMs = resolveIncomePacketClaimValidMs(options);
	const optimizeConfig = normalizeOptimizeConfig(options.optimizeConfig);
	const merchantUserId = merchant.user_id || merchant._id;
	const dedupSet = await existingDedupKeys(db, merchantUserId);
	const tradeWhere = buildEligibleSubsidyTradeWhere(db, merchantUserId);
	const tradesRaw = await fetchAllQueryPages(db, 'hsy-machine-trades', tradeWhere, {
		field: { _id: true, trade_no: true, amount: true, release_amount: true, release_ratio: true, create_time: true },
		orderBy: { field: 'create_time', direction: 'asc' }
	});
	// 同一 trade_no 只保留最早一条，杜绝重复流水导致月流水/延期积分翻倍
	const seenTradeNo = new Set();
	const trades = [];
	for (const t of tradesRaw || []) {
		const tn = String(t.trade_no || '').trim();
		const key = tn || `id:${t._id}`;
		if (seenTradeNo.has(key)) continue;
		seenTradeNo.add(key);
		trades.push(t);
	}
	if (!trades.length) {
		let expiredTradeFirst = 0;
		await forEachQueryPage(
			db,
			'hsy-income-packets',
			{ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false },
			{ field: { _id: true, expire_time: true, subsidy_kind: true } },
			async (rows) => {
				for (const row of rows) {
					if (row.expire_time && row.expire_time < nowTs) {
						await db.collection('hsy-income-packets').doc(row._id).update({
							status: 'expired',
							update_time: nowTs
						});
						if (String(row.subsidy_kind || '') === 'trade_first') expiredTradeFirst += 1;
					}
				}
			}
		);
		const capRet = await enforceMaxPendingIncomePackets(db, merchantUserId, nowTs);
		expiredTradeFirst += Number(capRet.expiredTradeFirst || 0);
		return { expiredTradeFirst };
	}

	const monthFlowMap = {};
	for (const t of trades) {
		const ym = monthNoFromTs(t.create_time || nowTs);
		monthFlowMap[ym] = Number((monthFlowMap[ym] || 0) + Number(t.amount || 0));
	}
	const deferredSlicesBySourceMonth = buildDeferredSlicesByMonth(trades, nowTs, 10000, optimizeConfig);
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

	// 1) 首期（第一个月）按每笔流水生成气泡（低于该期数对应最低流水不生成）
	for (const t of trades) {
		const amount = Number(t.amount || 0);
		if (!isSubsidyEligibleTradeAmount(amount, t.release_ratio, optimizeConfig)) continue;
		const firstRelease = resolveFirstReleaseYuan(amount, t.release_amount, t.release_ratio, optimizeConfig);
		if (!(firstRelease > 0)) continue;
		const ym = monthNoFromTs(t.create_time || nowTs);
		const tradeNo = String(t.trade_no || t._id || '');
		const tradeTs = Number(t.create_time || nowTs);
		const claimWindow = buildIncomePacketClaimWindow(tradeTs, claimValidMs);
		await upsertPacket(
			db,
			{
				merchant_user_id: merchantUserId,
				month_no: ym,
				title: `流水首期补贴 ${tradeNo.slice(-8)}`,
				amount: floorYuan2(firstRelease),
				status: 'pending',
				create_time: tradeTs,
				update_time: nowTs,
				is_deleted: false,
				expire_time: claimWindow.expire_time,
				claim_open_time: claimWindow.claim_open_time,
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
					const claimWindow = buildIncomePacketClaimWindow(nowTs, claimValidMs);
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
							expire_time: claimWindow.expire_time,
							claim_open_time: claimWindow.claim_open_time,
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

	/* 过期标记（分页处理全部 pending）；首期过期需触发冻结剔除 */
	let expiredTradeFirst = 0;
	await forEachQueryPage(
		db,
		'hsy-income-packets',
		{ merchant_user_id: merchantUserId, status: 'pending', is_deleted: false },
		{ field: { _id: true, expire_time: true, subsidy_kind: true } },
		async (rows) => {
			for (const row of rows) {
				if (row.expire_time && row.expire_time < nowTs) {
					await db.collection('hsy-income-packets').doc(row._id).update({
						status: 'expired',
						update_time: nowTs
					});
					if (String(row.subsidy_kind || '') === 'trade_first') {
						expiredTradeFirst += 1;
					}
				}
			}
		}
	);
	const capRet = await enforceMaxPendingIncomePackets(db, merchantUserId, nowTs);
	expiredTradeFirst += Number(capRet.expiredTradeFirst || 0);
	return { expiredTradeFirst };
}

module.exports = {
	POINTS_PER_BLOCK,
	POINTS_PER_MONTH,
	CASHBACK_RATE,
	DEFAULT_THRESHOLD_YUAN,
	DEFAULT_ABOVE_INSTALLMENTS,
	DEFAULT_BELOW_INSTALLMENTS,
	MIN_PACKET_AMOUNT,
	MAX_PENDING_INCOME_PACKETS,
	MIN_SUBSIDY_TRADE_YUAN,
	DB_PAGE_SIZE,
	DB_MAX_ROWS,
	ceilYuan2,
	floorYuan2,
	roundPacketAmountYuan,
	normalizeOptimizeConfig,
	minSubsidyTradeYuanForInstallments,
	resolveInstallmentCount,
	resolveFirstReleaseYuan,
	isSubsidyEligibleTradeAmount,
	resolveIncomePacketClaimValidMs,
	buildIncomePacketClaimWindow,
	DEFAULT_INCOME_PACKET_CLAIM_VALID_DAYS,
	monthNoFromTs,
	monthStartEndTs,
	addMonths,
	buildEligibleSubsidyTradeWhere,
	buildDeferredSlicesByMonth,
	forEachQueryPage,
	fetchAllQueryPages,
	sumEligibleRealFlowYuan,
	sumEligibleReleasePoints,
	syncSubsidyPackets,
	enforceMaxPendingIncomePackets
};
