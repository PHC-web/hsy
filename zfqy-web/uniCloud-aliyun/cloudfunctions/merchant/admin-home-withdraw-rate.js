'use strict';

/**
 * 管理端首页「月度提现率 + 后四月预测」
 * - 历史月写入 hsy-admin-month-metrics，封存后不再扫流水（避免慢查）
 * - 热路径只读 Redis；cron 仅重算未封存月（通常本月，偶发上月）
 */

function shanghaiYmToRangeMs(ym) {
	const key = String(ym || '').trim();
	if (!/^\d{4}-\d{2}$/.test(key)) return null;
	const start = Date.parse(`${key}-01T00:00:00+08:00`);
	if (!Number.isFinite(start)) return null;
	const [ys, ms] = key.split('-');
	let y = Number(ys);
	let m = Number(ms) + 1;
	if (m > 12) {
		m = 1;
		y += 1;
	}
	const next = `${y}-${String(m).padStart(2, '0')}`;
	const end = Date.parse(`${next}-01T00:00:00+08:00`);
	if (!Number.isFinite(end) || end <= start) return null;
	return { start, end, nextYm: next };
}

function yuanPerWan(withdrawAmount, tradeAmount) {
	const w = Number(withdrawAmount || 0);
	const t = Number(tradeAmount || 0);
	if (!Number.isFinite(w) || !Number.isFinite(t) || t <= 0) return 0;
	return Number(((w / t) * 10000).toFixed(2));
}

function isAdminHomeWithdrawRatePayload(p) {
	return !!(p && typeof p === 'object' && Array.isArray(p.history) && Array.isArray(p.forecast));
}

/**
 * @param {object} deps
 */
async function sumWithdrawPayableInRange(deps, start, end) {
	const { withdrawCollection, db } = deps;
	const _ = db.command;
	const $ = db.command.aggregate;
	try {
		const agg = await withdrawCollection
			.aggregate()
			.match(
				_.and([
					{ is_deleted: _.neq(true) },
					{ is_paid: true },
					{ arrival_status: 'received' },
					{ arrival_time: _.gte(start) },
					{ arrival_time: _.lt(end) }
				])
			)
			.group({ _id: null, total: $.sum('$payable') })
			.end();
		return Number(((((agg || {}).data || [])[0] || {}).total || 0).toFixed(2));
	} catch (e) {
		console.error('sumWithdrawPayableInRange', e);
		return 0;
	}
}

async function sumClaimedPointsInRange(deps, start, end) {
	const { incomePacketCollection, db } = deps;
	const _ = db.command;
	const $ = db.command.aggregate;
	try {
		const agg = await incomePacketCollection
			.aggregate()
			.match(
				_.and([
					{ status: 'claimed' },
					{ claimed_time: _.gte(start) },
					{ claimed_time: _.lt(end) }
				])
			)
			.group({ _id: null, total: $.sum('$amount') })
			.end();
		return Number(((((agg || {}).data || [])[0] || {}).total || 0).toFixed(2));
	} catch (e) {
		console.error('sumClaimedPointsInRange', e);
		return 0;
	}
}

async function sumEligibleTradeInRange(deps, start, end) {
	const { adminSumHomeTotalTradeBreakdown, buildCardRecordAlignedTradeBaseWhere, db } = deps;
	const _ = db.command;
	const timeExtras = [{ create_time: _.gte(start) }, { create_time: _.lt(end) }];
	if (typeof adminSumHomeTotalTradeBreakdown === 'function') {
		const cardBase = await buildCardRecordAlignedTradeBaseWhere(_);
		return adminSumHomeTotalTradeBreakdown(cardBase, timeExtras);
	}
	// 兼容旧依赖：仅常规刷卡
	const { adminSumTradeAmountCardAligned } = deps;
	const cardBase = await buildCardRecordAlignedTradeBaseWhere(_);
	if (!cardBase || !cardBase.ok) {
		return { regularAmount: 0, riskAmount: 0, flowOptAmount: 0, totalAmount: 0 };
	}
	const regularAmount = await adminSumTradeAmountCardAligned(cardBase, timeExtras);
	return {
		regularAmount,
		riskAmount: 0,
		flowOptAmount: 0,
		totalAmount: regularAmount
	};
}

function buildMonthDocFields(raw, now) {
	const regularAmount = Number(Number(raw.regularAmount != null ? raw.regularAmount : raw.tradeAmount || 0).toFixed(2));
	const riskAmount = Number(Number(raw.riskAmount || 0).toFixed(2));
	const flowOptAmount = Number(Number(raw.flowOptAmount || 0).toFixed(2));
	const tradeAmount = Number(
		Number(
			raw.tradeAmount != null ? raw.tradeAmount : regularAmount + riskAmount + flowOptAmount
		).toFixed(2)
	);
	const withdrawAmount = Number(Number(raw.withdrawAmount || 0).toFixed(2));
	const claimedPoints = Number(Number(raw.claimedPoints || 0).toFixed(2));
	const unconvertedPoints = Number(Math.max(0, claimedPoints - withdrawAmount).toFixed(2));
	const conversionRatio =
		claimedPoints > 0 ? Number(Math.min(3, withdrawAmount / claimedPoints).toFixed(4)) : 0;
	return {
		trade_amount: tradeAmount,
		trade_regular_amount: regularAmount,
		trade_risk_amount: riskAmount,
		trade_flow_opt_amount: flowOptAmount,
		withdraw_amount: withdrawAmount,
		claimed_points: claimedPoints,
		unconverted_points: unconvertedPoints,
		conversion_ratio: conversionRatio,
		rate_per_wan: yuanPerWan(withdrawAmount, tradeAmount),
		update_time: now
	};
}

async function computeMonthMetricsRaw(deps, ym) {
	const range = shanghaiYmToRangeMs(ym);
	if (!range) return null;
	const [withdrawAmount, claimedPoints, tradePack] = await Promise.all([
		sumWithdrawPayableInRange(deps, range.start, range.end),
		sumClaimedPointsInRange(deps, range.start, range.end),
		sumEligibleTradeInRange(deps, range.start, range.end)
	]);
	const pack = tradePack || {};
	return {
		ym,
		regularAmount: Number(pack.regularAmount || 0),
		riskAmount: Number(pack.riskAmount || 0),
		flowOptAmount: Number(pack.flowOptAmount || 0),
		tradeAmount: Number(pack.totalAmount != null ? pack.totalAmount : pack.tradeAmount || 0),
		withdrawAmount,
		claimedPoints
	};
}

async function upsertMonthMetrics(deps, ym, raw, opts = {}) {
	const { db, nowTs } = deps;
	const col = db.collection('hsy-admin-month-metrics');
	const now = nowTs();
	const fields = buildMonthDocFields(raw, now);
	const force = !!opts.force;
	const sealed = !!opts.sealed;
	const exist = await col.where({ ym: String(ym) }).limit(1).get();
	const row = ((exist && exist.data) || [])[0];
	if (row && row.sealed && !force) {
		return { ...row, skipped: true };
	}
	const patch = {
		...fields,
		ym: String(ym),
		sealed: row && row.sealed && !force ? true : sealed
	};
	if (row && row._id) {
		await col.doc(row._id).update(patch);
		return { _id: row._id, ...patch, skipped: false };
	}
	const addRes = await col.add({
		...patch,
		create_time: now
	});
	return { _id: addRes.id, ...patch, create_time: now, skipped: false };
}

/** 是否应封存该月：严格早于「上月」的一律封存；上月在本月 ≥3 号后封存 */
function shouldSealMonth(ym, currentYm, nowTsVal, shanghaiYearMonthFromTs) {
	const prevYm = (() => {
		const [ys, ms] = String(currentYm).split('-');
		let y = Number(ys);
		let m = Number(ms) - 1;
		if (m < 1) {
			m = 12;
			y -= 1;
		}
		return `${y}-${String(m).padStart(2, '0')}`;
	})();
	if (ym < prevYm) return true;
	if (ym === prevYm) {
		try {
			const parts = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Shanghai',
				day: '2-digit'
			}).formatToParts(new Date(nowTsVal));
			const day = Number((parts.find((p) => p.type === 'day') || {}).value || 0);
			return day >= 3;
		} catch (e) {
			return false;
		}
	}
	return false;
}

/**
 * cron/热刷新：默认只重算未封存月（本月；上月未封存时最多再扫 1 个月）
 * monthsBack>0 / forceAll：按需回填历史（勿放进每 15 分钟 cron）
 */
async function refreshOpenMonthMetrics(deps, options = {}) {
	const { shanghaiYearMonthFromTs, nowTs, addCalendarMonthsYm } = deps;
	const now = nowTs();
	const currentYm = shanghaiYearMonthFromTs(now);
	const monthsBack = Math.min(24, Math.max(0, Number(options.monthsBack) || 0));
	const forceAll = !!options.forceAll;
	const col = deps.db.collection('hsy-admin-month-metrics');
	const targets = [];

	if (forceAll || monthsBack > 0) {
		const back = forceAll ? Math.max(monthsBack, 1) : monthsBack;
		for (let i = back; i >= 0; i -= 1) {
			targets.push(addCalendarMonthsYm(currentYm, -i));
		}
	} else {
		const prevYm = addCalendarMonthsYm(currentYm, -1);
		const prevRes = await col.where({ ym: prevYm }).limit(1).get();
		const prevRow = ((prevRes && prevRes.data) || [])[0];
		if (!prevRow || !prevRow.sealed) targets.push(prevYm);
		targets.push(currentYm);
	}

	const refreshed = [];
	for (const ym of targets) {
		if (!ym) continue;
		if (!forceAll) {
			const exist = await col.where({ ym }).limit(1).get();
			const row = ((exist && exist.data) || [])[0];
			if (row && row.sealed) continue;
		}
		const raw = await computeMonthMetricsRaw(deps, ym);
		if (!raw) continue;
		const sealed = shouldSealMonth(ym, currentYm, now, shanghaiYearMonthFromTs);
		const doc = await upsertMonthMetrics(deps, ym, raw, { sealed, force: forceAll });
		refreshed.push({ ym, sealed: !!doc.sealed, skipped: !!doc.skipped });
	}
	return { currentYm, refreshed };
}

async function loadHistoryMonthRows(deps, currentYm, historyMonths) {
	const { db, addCalendarMonthsYm, ymToDisplayLabel } = deps;
	const col = db.collection('hsy-admin-month-metrics');
	const months = Math.max(1, Math.min(12, Number(historyMonths) || 4));
	const startYm = addCalendarMonthsYm(currentYm, -(months - 1));
	const res = await col
		.where(
			db.command.and([{ ym: db.command.gte(startYm) }, { ym: db.command.lte(currentYm) }])
		)
		.orderBy('ym', 'asc')
		.limit(36)
		.get();
	const byYm = Object.create(null);
	for (const r of res.data || []) {
		const ym = String(r.ym || '');
		if (!ym) continue;
		byYm[ym] = {
			ym,
			label: ymToDisplayLabel(ym),
			tradeAmount: Number(r.trade_amount || 0),
			regularAmount: Number(r.trade_regular_amount || 0),
			riskAmount: Number(r.trade_risk_amount || 0),
			flowOptAmount: Number(r.trade_flow_opt_amount || 0),
			withdrawAmount: Number(r.withdraw_amount || 0),
			claimedPoints: Number(r.claimed_points || 0),
			unconvertedPoints: Number(r.unconverted_points || 0),
			conversionRatio: Number(r.conversion_ratio || 0),
			ratePerWan: Number(r.rate_per_wan || 0),
			sealed: !!r.sealed,
			kind: 'history'
		};
	}
	// 固定返回前 N-1 月 + 本月，缺月补零，保证前端四列铺满
	const rows = [];
	for (let i = months - 1; i >= 0; i -= 1) {
		const ym = addCalendarMonthsYm(currentYm, -i);
		const hit = byYm[ym];
		if (hit) {
			rows.push({
				...hit,
				isCurrent: ym === currentYm
			});
		} else {
			rows.push({
				ym,
				label: ymToDisplayLabel(ym),
				tradeAmount: 0,
				regularAmount: 0,
				riskAmount: 0,
				flowOptAmount: 0,
				withdrawAmount: 0,
				claimedPoints: 0,
				unconvertedPoints: 0,
				conversionRatio: 0,
				ratePerWan: 0,
				sealed: ym < currentYm,
				kind: 'history',
				isCurrent: ym === currentYm
			});
		}
	}
	return rows;
}

/**
 * 后四月预测：
 * - 刷卡：近期交易额 EMA × 温和环比
 * - 积分：分片冻结释放 + 新流水估算积分 + 待提现存量分流
 * - 提现：积分池×历史转化率 与 历史提现率×刷卡 加权
 * - 提现率限制在历史区间附近，避免离谱外推
 */
function buildWithdrawRateForecast(deps, historyRows, pendingFrozen, currentYm) {
	const { addCalendarMonthsYm, ymToDisplayLabel } = deps;
	const usable = (historyRows || []).filter((h) => Number(h.tradeAmount || 0) > 0).slice(-6);
	const forecast = [];
	const frozenByYm = Object.create(null);
	for (const m of (pendingFrozen && pendingFrozen.frozenMonths) || []) {
		const ym = String(m.ym || '').trim();
		if (ym) frozenByYm[ym] = Number(m.amount || 0);
	}
	const pendingStock = Number((pendingFrozen && pendingFrozen.pendingWithdrawTotal) || 0);

	if (!usable.length) {
		for (let i = 1; i <= 4; i += 1) {
			const ym = addCalendarMonthsYm(currentYm, i);
			forecast.push({
				ym,
				label: ymToDisplayLabel(ym),
				ratePerWan: 0,
				tradeForecast: 0,
				withdrawForecast: 0,
				pointsExpected: Number((frozenByYm[ym] || 0).toFixed(2)),
				frozenRelease: Number((frozenByYm[ym] || 0).toFixed(2)),
				kind: 'forecast',
				confidence: 'low'
			});
		}
		return forecast;
	}

	let emaRate = Number(usable[0].ratePerWan || 0);
	let emaTrade = Number(usable[0].tradeAmount || 0);
	let emaClaimed = Number(usable[0].claimedPoints || 0);
	let emaConv = Math.min(
		1.5,
		Math.max(0.05, Number(usable[0].withdrawAmount || 0) / Math.max(Number(usable[0].claimedPoints || 0), 1))
	);
	const alpha = 0.45;
	for (let i = 1; i < usable.length; i += 1) {
		const u = usable[i];
		emaRate = alpha * Number(u.ratePerWan || 0) + (1 - alpha) * emaRate;
		emaTrade = alpha * Number(u.tradeAmount || 0) + (1 - alpha) * emaTrade;
		emaClaimed = alpha * Number(u.claimedPoints || 0) + (1 - alpha) * emaClaimed;
		const conv = Number(u.withdrawAmount || 0) / Math.max(Number(u.claimedPoints || 0), 1);
		emaConv = alpha * Math.min(1.5, Math.max(0.05, conv)) + (1 - alpha) * emaConv;
	}

	const firstTrade = Math.max(Number(usable[0].tradeAmount || 0), 1);
	const lastTrade = Math.max(Number(usable[usable.length - 1].tradeAmount || 0), 1);
	const span = Math.max(1, usable.length - 1);
	const tradeTrend = Math.pow(lastTrade / firstTrade, 1 / span);
	const tradeGrowth = Math.min(1.12, Math.max(0.88, tradeTrend));

	const rates = usable.map((u) => Number(u.ratePerWan || 0)).filter((n) => Number.isFinite(n) && n >= 0);
	const rateLo = Math.max(0, Math.min(...rates) * 0.7);
	const rateHi = Math.max(...rates, emaRate) * 1.4;
	const pointsPerTrade = emaClaimed / Math.max(emaTrade, 1);
	let carryStock = pendingStock;

	for (let i = 1; i <= 4; i += 1) {
		const ym = addCalendarMonthsYm(currentYm, i);
		const tradeForecast = emaTrade * Math.pow(tradeGrowth, i);
		const frozenRelease = Number(frozenByYm[ym] || 0);
		const newFromTrade = tradeForecast * pointsPerTrade;
		const carryOut = carryStock * Math.min(0.32, emaConv * 0.45);
		carryStock = Math.max(0, carryStock - carryOut);
		const pointsPool = frozenRelease + newFromTrade + carryOut;
		const withdrawFromPoints = pointsPool * Math.min(1, Math.max(0.08, emaConv));
		const withdrawFromRate = (tradeForecast * emaRate) / 10000;
		const wPoints = frozenRelease > 0 || pendingStock > emaTrade * 0.008 ? 0.55 : 0.35;
		const withdrawForecast = wPoints * withdrawFromPoints + (1 - wPoints) * withdrawFromRate;
		let ratePerWan = tradeForecast > 0 ? (withdrawForecast / tradeForecast) * 10000 : emaRate;
		ratePerWan = Math.min(rateHi, Math.max(rateLo, ratePerWan));
		forecast.push({
			ym,
			label: ymToDisplayLabel(ym),
			ratePerWan: Number(ratePerWan.toFixed(2)),
			tradeForecast: Number(tradeForecast.toFixed(2)),
			withdrawForecast: Number(withdrawForecast.toFixed(2)),
			pointsExpected: Number(pointsPool.toFixed(2)),
			frozenRelease: Number(frozenRelease.toFixed(2)),
			kind: 'forecast',
			confidence: usable.length >= 3 ? 'medium' : 'low'
		});
	}
	return forecast;
}

async function computeAdminHomeWithdrawRatePanel(deps) {
	const { shanghaiYearMonthFromTs, nowTs, computeAdminHomePendingFrozen } = deps;
	const now = nowTs();
	const currentYm = shanghaiYearMonthFromTs(now);
	const historyMonths = 4;

	await refreshOpenMonthMetrics(deps, { monthsBack: 0 });

	const history = await loadHistoryMonthRows(deps, currentYm, historyMonths);
	let pendingFrozen = null;
	try {
		if (typeof deps.loadPendingFrozenCached === 'function') {
			pendingFrozen = await deps.loadPendingFrozenCached();
		}
	} catch (e) {
		console.error('loadPendingFrozenCached', e);
	}
	if (!pendingFrozen && typeof computeAdminHomePendingFrozen === 'function') {
		pendingFrozen = await computeAdminHomePendingFrozen();
	}
	pendingFrozen = pendingFrozen || { pendingWithdrawTotal: 0, frozenMonths: [] };

	const forecast = buildWithdrawRateForecast(deps, history, pendingFrozen, currentYm);
	return {
		currentYm,
		updatedAt: now,
		history,
		forecast,
		pendingWithdrawTotal: Number(pendingFrozen.pendingWithdrawTotal || 0),
		methodNote:
			'预测：综合近月提现率、领取积分、未提现存量与分片冻结释放，对后四月刷卡与可提现积分做粗估，仅供参考。'
	};
}

async function refreshAdminHomeWithdrawRateCache(deps) {
	const payload = await computeAdminHomeWithdrawRatePanel(deps);
	await deps.adminHomeRedisSetLiveAndLast(
		deps.REDIS_KEY_ADMIN_HOME_WITHDRAW_RATE,
		deps.REDIS_KEY_ADMIN_HOME_WITHDRAW_RATE_LAST,
		payload,
		deps.REDIS_EX_ADMIN_HOME_WITHDRAW_RATE_SEC
	);
	return payload;
}

/** 手动回填历史月：一次最多 monthsBack（建议 1~3，避免超时） */
async function adminHomeMonthMetricsBackfill(deps, data = {}) {
	const monthsBack = Math.min(12, Math.max(1, Number(data.monthsBack) || 1));
	const forceAll = data.force === true || data.force === 1 || data.force === '1';
	const result = await refreshOpenMonthMetrics(deps, { monthsBack, forceAll });
	try {
		await refreshAdminHomeWithdrawRateCache(deps);
	} catch (e) {
		console.error('adminHomeMonthMetricsBackfill refresh cache', e);
	}
	return { code: 0, message: 'ok', data: result };
}

module.exports = {
	shanghaiYmToRangeMs,
	yuanPerWan,
	isAdminHomeWithdrawRatePayload,
	computeMonthMetricsRaw,
	upsertMonthMetrics,
	refreshOpenMonthMetrics,
	buildWithdrawRateForecast,
	computeAdminHomeWithdrawRatePanel,
	refreshAdminHomeWithdrawRateCache,
	adminHomeMonthMetricsBackfill
};
