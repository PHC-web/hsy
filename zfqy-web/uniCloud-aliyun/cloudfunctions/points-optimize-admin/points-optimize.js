'use strict';

/**
 * 登录周积分优化引擎（仅待返未领分片；H5 无文案）
 * 查询约定：一律按 merchant_user_id / _id 游标分页，禁止无索引全表排序扫。
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 跑批每轮商户数（过大易单轮超时） */
const BATCH_MERCHANT_PAGE = 15;
const SLICE_PAGE = 500;
/** 写库并发：对账/砍片逐条 await 易超时 */
const DB_WRITE_CONCURRENCY = 25;
/** 待返理论片最多来自「当前月往前 4 个月」的流水（target = source+1..+4） */
const THEORY_SOURCE_MONTH_LOOKBACK = 4;

/** 任务日志仅保留：登录周优化、人工改片、白名单 */
const TASK_LOG_ACTIONS = [
	'login_week_up',
	'login_week_sim',
	'skip_disabled',
	'manual_set',
	'manual_clear',
	'slice_opt_skip',
	'slice_opt_unskip',
	'whitelist_add',
	'whitelist_remove'
];
/** 按流水优化：白名单增删（开关变更记在 bizConfig，此处仅白名单） */
const FLOW_TASK_LOG_ACTIONS = ['flow_whitelist_add', 'flow_whitelist_remove'];
const TASK_LOG_ACTION_SET = new Set([...TASK_LOG_ACTIONS, ...FLOW_TASK_LOG_ACTIONS]);

function floor2(n) {
	const x = Number(n || 0);
	if (!Number.isFinite(x) || x <= 0) return 0;
	const s = x.toString();
	if (/e-/i.test(s)) return 0;
	if (/e\+/i.test(s)) return Math.floor(x * 100) / 100;
	const dot = s.indexOf('.');
	if (dot < 0) return x;
	if (s.slice(dot + 1).length <= 2) return x;
	return Number(s.slice(0, dot + 3));
}

function isAutoOptimizableSlice(s) {
	if (!s) return false;
	// 仅「后续不优化」跳过；有人工金额仍按生效值参与 ×0.75
	if (s.opt_skip) return false;
	return true;
}

function round4(n) {
	return Number(Number(n || 0).toFixed(4));
}

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function nowTs() {
	return Date.now();
}

function effectiveOf(row) {
	if (row == null) return 0;
	if (row.manual_amount != null && row.manual_amount !== '') {
		return floor2(row.manual_amount);
	}
	return floor2(row.system_amount != null ? row.system_amount : row.original_amount);
}

function isWhitelisted(merchant) {
	return !!(merchant && merchant.points_opt_whitelist);
}

function anchorTsOf(merchant) {
	const login = Number(merchant && merchant.login_time) || 0;
	const created = Number(merchant && merchant.create_time) || 0;
	return login > 0 ? login : created > 0 ? created : 0;
}

function calcDueWeeks(merchant, now = Date.now()) {
	const anchor = anchorTsOf(merchant);
	if (!(anchor > 0)) return 0;
	const idle = Math.max(0, now - anchor);
	return Math.floor(idle / WEEK_MS);
}

function idleDaysOf(merchant, now = Date.now()) {
	const anchor = anchorTsOf(merchant);
	if (!(anchor > 0)) return 0;
	return Math.floor(Math.max(0, now - anchor) / 86400000);
}

/** 有限并发执行，避免对账/砍片上千次串行写库超时 */
async function mapPool(items, concurrency, worker) {
	const list = Array.isArray(items) ? items : [];
	if (!list.length) return;
	const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
	let cursor = 0;
	const runners = [];
	for (let c = 0; c < limit; c += 1) {
		runners.push(
			(async () => {
				for (;;) {
					const idx = cursor;
					cursor += 1;
					if (idx >= list.length) break;
					await worker(list[idx], idx);
				}
			})()
		);
	}
	await Promise.all(runners);
}

function createPointsOptimizeApi(deps) {
	const {
		db,
		_,
		merchantCollection,
		subsidyEngine,
		getBizSettings,
		getOperator,
		formatTime,
		recalcFrozen,
		invalidateH5MerchantCaches,
		getMerchantByIdOrUserId
	} = deps;

	const sliceCol = db.collection('hsy-points-slice-state');
	const logCol = db.collection('hsy-points-optimize-logs');
	const taskCol = db.collection('hsy-points-optimize-tasks');
	const packetCol = db.collection('hsy-income-packets');

	async function addLog(doc) {
		const action = safeText(doc && doc.action, 48);
		if (!TASK_LOG_ACTION_SET.has(action)) return;
		try {
			await logCol.add(
				Object.assign(
					{
						create_time: nowTs(),
						dry_run: false
					},
					doc || {}
				)
			);
		} catch (e) {
			console.error('pointsOptimize addLog', e);
		}
	}

	async function isLoginOptimizeEnabled() {
		const biz = await getBizSettings();
		return biz && biz.pointsOptimizeLoginEnabled === true;
	}

	/** 按商户拉片：强制 merchant_user_id 等值条件 + 分页，避免慢查 */
	async function loadSlicesForMerchant(merchantUserId, opts = {}) {
		const uid = String(merchantUserId || '');
		if (!uid) return [];
		const whereParts = [{ merchant_user_id: uid }, { is_deleted: _.neq(true) }];
		if (opts.unclaimedOnly) whereParts.push({ is_claimed: _.neq(true) });
		if (opts.minTargetYm) whereParts.push({ target_ym: _.gte(String(opts.minTargetYm)) });
		const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
		const all = [];
		let skip = 0;
		for (;;) {
			const r = await sliceCol.where(where).orderBy('target_ym', 'asc').skip(skip).limit(SLICE_PAGE).get();
			const rows = r.data || [];
			all.push(...rows);
			if (rows.length < SLICE_PAGE) break;
			skip += SLICE_PAGE;
			if (skip >= 200000) break;
		}
		return all;
	}

	/**
	 * 仅根据流水算出理论待返分片（不写库），供预览估算砍额。
	 */
	async function buildTheoryDeferredMap(merchant, options = {}) {
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		if (!merchantUserId) return { ok: false, theory: new Map(), curYm: '' };
		const now = nowTs();
		const curYm = subsidyEngine.monthNoFromTs(now);
		const biz = options.biz || (await getBizSettings());
		const optimizeConfig = biz && biz.optimizeConfig ? biz.optimizeConfig : {};

		// 仅需 source >= curYm-4 的流水（更早月份的待返目标月已全部过期）
		const minSrcYm = subsidyEngine.addMonths
			? subsidyEngine.addMonths(curYm, -THEORY_SOURCE_MONTH_LOOKBACK)
			: addMonthsLocal(curYm, -THEORY_SOURCE_MONTH_LOOKBACK);
		const range =
			typeof subsidyEngine.monthStartEndTs === 'function'
				? subsidyEngine.monthStartEndTs(minSrcYm)
				: { start: 0 };
		const minTradeTs = Number(range && range.start) || 0;
		const baseWhere = subsidyEngine.buildEligibleSubsidyTradeWhere(db, merchantUserId);
		const tradeWhere =
			minTradeTs > 0 ? _.and([baseWhere, { create_time: _.gte(minTradeTs) }]) : baseWhere;

		const tradesRaw = await subsidyEngine.fetchAllQueryPages(db, 'hsy-machine-trades', tradeWhere, {
			field: {
				_id: true,
				trade_no: true,
				amount: true,
				release_amount: true,
				release_ratio: true,
				create_time: true
			},
			orderBy: { field: 'create_time', direction: 'asc' }
		});
		const seen = new Set();
		const trades = [];
		for (const t of tradesRaw || []) {
			const tn = String(t.trade_no || '').trim();
			const key = tn || `id:${t._id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			trades.push(t);
		}

		const bySource = subsidyEngine.buildDeferredSlicesByMonth(trades, now, 10000, optimizeConfig);
		const theory = new Map();
		Object.keys(bySource || {}).forEach((srcYm) => {
			if (minSrcYm && String(srcYm).localeCompare(String(minSrcYm)) < 0) return;
			const slices = bySource[srcYm] || [];
			for (let k = 1; k <= 4; k += 1) {
				const targetYm = subsidyEngine.addMonths
					? subsidyEngine.addMonths(srcYm, k)
					: addMonthsLocal(srcYm, k);
				if (!targetYm || String(targetYm).localeCompare(curYm) < 0) continue;
				for (let i = 0; i < slices.length; i += 1) {
					const amt = floor2(slices[i] || 0);
					if (!(amt > 0)) continue;
					const key = `${targetYm}|${srcYm}|${i}`;
					theory.set(key, { targetYm, sourceYm: srcYm, sliceIndex: i, original: amt });
				}
			}
		});
		return { ok: true, theory, curYm, merchantUserId, now };
	}

	function theoryMapToMemorySlices(theory) {
		const rows = [];
		for (const th of theory.values()) {
			rows.push({
				_id: `mem_${th.targetYm}_${th.sourceYm}_${th.sliceIndex}`,
				target_ym: th.targetYm,
				source_ym: th.sourceYm,
				slice_index: th.sliceIndex,
				original_amount: th.original,
				system_amount: th.original,
				manual_amount: null,
				effective_amount: th.original,
				opt_skip: false,
				is_claimed: false
			});
		}
		return rows;
	}

	/**
	 * 理论分片 → 账本 original（不抬高已优化 system）
	 * 仅处理该商户，交易查询带 user_id 条件。
	 */
	async function reconcileOriginal(merchant, options = {}) {
		const built = await buildTheoryDeferredMap(merchant, options);
		if (!built.ok) return { ok: false, reason: 'no_uid' };
		const { theory, curYm, merchantUserId, now } = built;

		const existing = await loadSlicesForMerchant(merchantUserId);
		const existMap = new Map();
		for (const row of existing) {
			const key = `${row.target_ym}|${row.source_ym}|${row.slice_index}`;
			existMap.set(key, row);
		}

		const writeJobs = [];
		for (const [key, th] of theory.entries()) {
			const row = existMap.get(key);
			if (row && row.is_claimed) {
				writeJobs.push(() =>
					sliceCol.doc(row._id).update({
						original_amount: th.original,
						update_time: now
					})
				);
				existMap.delete(key);
				continue;
			}
			if (!row) {
				writeJobs.push(() =>
					sliceCol.add({
						merchant_user_id: merchantUserId,
						target_ym: th.targetYm,
						source_ym: th.sourceYm,
						slice_index: th.sliceIndex,
						original_amount: th.original,
						system_amount: th.original,
						manual_amount: null,
						effective_amount: th.original,
						is_claimed: false,
						packet_id: '',
						packet_status: '',
						version: 0,
						is_deleted: false,
						create_time: now,
						update_time: now
					})
				);
				continue;
			}
			const prevSys = Number(row.system_amount != null ? row.system_amount : row.original_amount || 0);
			let nextSys = prevSys;
			if (th.original < prevSys - 1e-9) nextSys = th.original;
			const hasManual = row.manual_amount != null && row.manual_amount !== '';
			const nextEff = hasManual ? floor2(row.manual_amount) : floor2(nextSys);
			writeJobs.push(() =>
				sliceCol.doc(row._id).update({
					original_amount: th.original,
					system_amount: floor2(nextSys),
					effective_amount: nextEff,
					update_time: now,
					version: Number(row.version || 0) + 1
				})
			);
			existMap.delete(key);
		}

		// 理论已消失且未领取：软删
		for (const [, row] of existMap.entries()) {
			if (row.is_claimed) continue;
			if (String(row.target_ym || '').localeCompare(curYm) < 0) continue;
			if (!theory.has(`${row.target_ym}|${row.source_ym}|${row.slice_index}`)) {
				writeJobs.push(() => sliceCol.doc(row._id).update({ is_deleted: true, update_time: now }));
			}
		}

		await mapPool(writeJobs, DB_WRITE_CONCURRENCY, (job) => job());

		// 对账原始片：不写任务日志（仅登录周优化 / 人工改片 / 白名单记日志）
		return { ok: true, upserted: writeJobs.length, theoryCount: theory.size };
	}

	function addMonthsLocal(ym, delta) {
		const [ys, ms] = String(ym || '').split('-');
		const y = Number(ys);
		const m = Number(ms);
		if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
		const d = new Date(Date.UTC(y, m - 1 + Number(delta || 0), 1));
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	async function syncPendingPacketsForSlices(merchantUserId, changedSlices) {
		if (!changedSlices || !changedSlices.length) return;
		await mapPool(changedSlices, Math.min(10, DB_WRITE_CONCURRENCY), async (s) => {
			const eff = effectiveOf(s);
			// 等值条件：商户+目标月+来源月+片序 → 可走组合查询；limit 小
			const pr = await packetCol
				.where({
					merchant_user_id: merchantUserId,
					is_deleted: _.neq(true),
					status: 'pending',
					subsidy_kind: 'release_pool_history',
					month_no: String(s.target_ym || ''),
					subsidy_flow_month: String(s.source_ym || ''),
					subsidy_block_index: Number(s.slice_index)
				})
				.limit(5)
				.get();
			const rows = pr.data || [];
			for (const p of rows) {
				if (eff < 0.01) {
					await packetCol.doc(p._id).update({
						status: 'expired',
						amount: 0,
						update_time: nowTs(),
						optimize_void: true
					});
					await sliceCol.doc(s._id).update({
						packet_id: p._id,
						packet_status: 'expired',
						update_time: nowTs()
					});
				} else if (Math.abs(Number(p.amount || 0) - eff) >= 0.005) {
					await packetCol.doc(p._id).update({
						amount: eff,
						update_time: nowTs()
					});
					await sliceCol.doc(s._id).update({
						packet_id: p._id,
						packet_status: 'pending',
						update_time: nowTs()
					});
				}
			}
		});
	}

	async function applySliceDiffsToDb(diffs, autoSlices, now) {
		if (!diffs || !diffs.length) return;
		await mapPool(diffs, DB_WRITE_CONCURRENCY, async (d) => {
			await sliceCol.doc(d._id).update({
				system_amount: d.after,
				effective_amount: d.after,
				manual_amount: null,
				update_time: now,
				version: _.inc(1)
			});
			const row = autoSlices.find((x) => x._id === d._id);
			if (row) {
				row.system_amount = d.after;
				row.effective_amount = d.after;
				row.manual_amount = null;
			}
		});
	}

	/**
	 * 一周优化：每片（自动片）各自 ×0.75，向下取到分。
	 * 例：7.6/7.6/7.6 → 5.7/5.7/5.7 → 4.27/4.27/4.27
	 * 勾选「后续不优化」的片不参与；有人工金额的片按当前生效值继续 ×0.75（砍后清人工，以系统值为准）。
	 */
	function applyOneWeekCutInMemory(autoSlices) {
		const diffs = [];
		let beforeTotal = 0;
		for (const s of autoSlices || []) {
			const cur = effectiveOf(s);
			beforeTotal = floor2(beforeTotal + cur);
			if (!(cur > 0)) continue;
			const nextSys = floor2(cur * 0.75);
			if (nextSys === cur) continue;
			diffs.push({
				_id: s._id,
				target_ym: s.target_ym,
				source_ym: s.source_ym,
				slice_index: s.slice_index,
				before: cur,
				after: nextSys
			});
			s.system_amount = nextSys;
			s.manual_amount = null;
			s.effective_amount = nextSys;
		}
		let afterTotal = 0;
		for (const s of autoSlices || []) afterTotal = floor2(afterTotal + effectiveOf(s));
		return {
			diffs,
			beforeTotal,
			afterTotal,
			cutTotal: floor2(beforeTotal - afterTotal)
		};
	}

	async function optimizeLoginWeeks(merchant, options = {}) {
		const merchantUserId = String(merchant.user_id || merchant._id || '');
		const dryRun = !!options.dryRun;
		const operator = options.operator || 'system';
		const batchId = options.batchId || '';
		const now = nowTs();

		if (isWhitelisted(merchant)) {
			return { action: 'skip_whitelist', merchantUserId };
		}

		const dueWeeks = calcDueWeeks(merchant, now);
		const applied = Math.max(0, Number(merchant.points_opt_week_applied || 0) || 0);
		if (dueWeeks <= applied) {
			return { action: 'skip', merchantUserId, dueWeeks, applied };
		}

		// 正式执行才写库对账；预览只读账本，无账本时内存按流水估算（避免整页对账超时）
		if (!dryRun) {
			await reconcileOriginal(merchant, { operator, batchId, silentLog: true, biz: options.biz });
		}

		const curYm = subsidyEngine.monthNoFromTs(now);
		let slices = await loadSlicesForMerchant(merchantUserId, { unclaimedOnly: true, minTargetYm: curYm });
		let usedTradeEstimate = false;
		if (dryRun && !slices.length && options.allowTradeEstimate !== false) {
			try {
				const built = await buildTheoryDeferredMap(merchant, { biz: options.biz });
				slices = theoryMapToMemorySlices(built.theory || new Map()).filter(
					(s) => String(s.target_ym || '').localeCompare(curYm) >= 0
				);
				usedTradeEstimate = true;
			} catch (e) {
				console.error('dryRun theory estimate', merchantUserId, e);
				slices = [];
			}
		}
		// 稳定排序：target、source、index（每片等比 ×0.75，不再从尾部扣）
		slices.sort((a, b) => {
			const c1 = String(a.target_ym).localeCompare(String(b.target_ym));
			if (c1) return c1;
			const c2 = String(a.source_ym).localeCompare(String(b.source_ym));
			if (c2) return c2;
			return Number(a.slice_index || 0) - Number(b.slice_index || 0);
		});

		let autoSlices = slices.filter((s) => isAutoOptimizableSlice(s));
		let curApplied = applied;
		let totalCut = 0;
		const allDiffs = [];

		for (let w = applied + 1; w <= dueWeeks; w += 1) {
			const { diffs, beforeTotal, afterTotal, cutTotal } = applyOneWeekCutInMemory(autoSlices);
			totalCut = floor2(totalCut + cutTotal);
			allDiffs.push(...diffs);
			if (!dryRun) {
				await addLog({
					batch_id: batchId,
					action: 'login_week_up',
					merchant_user_id: merchantUserId,
					operator,
					before_week: w - 1,
					after_week: w,
					before_total: beforeTotal,
					after_total: afterTotal,
					cut_total: cutTotal,
					slice_diffs: diffs.slice(0, 200),
					anchor_ts: anchorTsOf(merchant),
					idle_days: idleDaysOf(merchant, now),
					due_weeks: dueWeeks,
					dry_run: false
				});
				await applySliceDiffsToDb(diffs, autoSlices, now);
				await syncPendingPacketsForSlices(
					merchantUserId,
					diffs.map((d) => autoSlices.find((x) => x._id === d._id)).filter(Boolean)
				);
			}
			curApplied = w;
		}

		if (!dryRun) {
			await merchantCollection.doc(merchant._id).update({
				points_opt_week_applied: curApplied,
				points_opt_update_time: now
			});
			try {
				if (typeof recalcFrozen === 'function') {
					await recalcFrozen(merchantUserId);
				}
			} catch (e) {
				console.error('recalcFrozen after optimize', e);
			}
			try {
				if (typeof invalidateH5MerchantCaches === 'function') {
					await invalidateH5MerchantCaches(merchant);
				}
			} catch (e) {}
		}

		return {
			action: autoSlices.length || totalCut > 0 ? 'upgraded' : 'upgraded_empty',
			merchantUserId,
			dueWeeks,
			beforeApplied: applied,
			afterApplied: dryRun ? dueWeeks : curApplied,
			cutTotal: totalCut,
			diffCount: allDiffs.length,
			sliceCount: autoSlices.length,
			usedTradeEstimate,
			dryRun
		};
	}

	/**
	 * 测试专用：忽略登录闲置 / 总开关，对指定商户强制砍 1 周（各自动片 ×0.75）。
	 * 白名单商户与正式执行一致：跳过不砍。
	 * 每点一次只砍一周；会推进 points_opt_week_applied，写 sim 日志。
	 * 已有未领自动片时跳过全量对账（避免大户扫流水+逐条写库超时）；无账本时才对账。
	 */
	async function pointsOptimizeLoginSimulateWeek(data = {}, event = {}) {
		const key = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (!key) return { code: 400, message: '请指定商户 userId / _id' };
		const merchant = await getMerchantByIdOrUserId(key);
		if (!merchant) return { code: 404, message: '商户不存在' };

		const merchantUserId = String(merchant.user_id || merchant._id || '');
		if (isWhitelisted(merchant)) {
			return {
				code: 0,
				message: '该商户在优化白名单中，模拟也不砍',
				data: {
					action: 'skip_whitelist',
					merchantUserId,
					cutTotal: 0
				}
			};
		}

		const operator = getOperator(event);
		const now = nowTs();
		const applied = Math.max(0, Number(merchant.points_opt_week_applied || 0) || 0);
		const nextApplied = applied + 1;
		const curYm = subsidyEngine.monthNoFromTs(now);
		const forceReconcile = data.forceReconcile === true || data.reconcile === true;

		const sortSlices = (list) => {
			list.sort((a, b) => {
				const c1 = String(a.target_ym).localeCompare(String(b.target_ym));
				if (c1) return c1;
				const c2 = String(a.source_ym).localeCompare(String(b.source_ym));
				if (c2) return c2;
				return Number(a.slice_index || 0) - Number(b.slice_index || 0);
			});
			return list;
		};

		let slices = sortSlices(
			await loadSlicesForMerchant(merchantUserId, { unclaimedOnly: true, minTargetYm: curYm })
		);
		let autoSlices = slices.filter((s) => isAutoOptimizableSlice(s));
		let reconciled = false;
		// 有可砍片则直接砍；仅无账本或强制对账时再扫流水
		if (forceReconcile || !autoSlices.length) {
			await reconcileOriginal(merchant, { operator, silentLog: true });
			reconciled = true;
			slices = sortSlices(
				await loadSlicesForMerchant(merchantUserId, { unclaimedOnly: true, minTargetYm: curYm })
			);
			autoSlices = slices.filter((s) => isAutoOptimizableSlice(s));
		}
		if (!autoSlices.length) {
			return {
				code: 0,
				message: reconciled
					? '对账后仍无可自动砍减的未领待返分片'
					: '无可自动砍减的未领待返分片（可先点「对账原始片」）',
				data: {
					action: 'skip_empty',
					merchantUserId,
					beforeApplied: applied,
					afterApplied: applied,
					cutTotal: 0,
					reconciled
				}
			};
		}

		const { diffs, beforeTotal, afterTotal, cutTotal } = applyOneWeekCutInMemory(autoSlices);
		await addLog({
			action: 'login_week_sim',
			merchant_user_id: merchantUserId,
			operator,
			before_week: applied,
			after_week: nextApplied,
			before_total: beforeTotal,
			after_total: afterTotal,
			cut_total: cutTotal,
			slice_diffs: diffs.slice(0, 200),
			anchor_ts: anchorTsOf(merchant),
			idle_days: idleDaysOf(merchant, now),
			due_weeks: calcDueWeeks(merchant, now),
			remark: reconciled
				? '模拟砍一周（含对账；忽略登录闲置/总开关；白名单跳过）'
				: '模拟砍一周（跳过对账；忽略登录闲置/总开关；白名单跳过）',
			dry_run: false
		});
		await applySliceDiffsToDb(diffs, autoSlices, now);
		await syncPendingPacketsForSlices(
			merchantUserId,
			diffs.map((d) => autoSlices.find((x) => x._id === d._id)).filter(Boolean)
		);
		await merchantCollection.doc(merchant._id).update({
			points_opt_week_applied: nextApplied,
			points_opt_update_time: now
		});
		try {
			if (typeof recalcFrozen === 'function') await recalcFrozen(merchantUserId);
		} catch (e) {
			console.error('recalcFrozen after simulate', e);
		}
		try {
			if (typeof invalidateH5MerchantCaches === 'function') await invalidateH5MerchantCaches(merchant);
		} catch (e) {}

		return {
			code: 0,
			message: `模拟砍一周完成，砍额 ${floor2(cutTotal).toFixed(2)}`,
			data: {
				action: 'simulated',
				merchantUserId,
				beforeApplied: applied,
				afterApplied: nextApplied,
				beforeTotal,
				afterTotal,
				cutTotal: floor2(cutTotal),
				diffCount: diffs.length,
				reconciled
			}
		};
	}

	async function pointsOptimizeLoginPreview(data = {}) {
		const merchantKey =
			data.merchantUserId || data.merchantId || data.userId || data.keyword || data.deviceId;
		const enabled = await isLoginOptimizeEnabled();
		const biz = await getBizSettings();
		if (merchantKey) {
			const merchant = await getMerchantByIdOrUserId(merchantKey);
			if (!merchant) return { code: 404, message: '未找到商户（请用商户编号或机具号）' };
			const r = await optimizeLoginWeeks(merchant, { dryRun: true, biz, allowTradeEstimate: true });
			return {
				code: 0,
				message: 'ok',
				data: {
					enabled,
					list: [previewRow(merchant, r)],
					total: 1,
					page: 1,
					pageSize: 1
				}
			};
		}
		// 预览每户可能扫流水估算，单页不宜过大（易超时）
		const pageSize = Math.min(10, Math.max(1, Number(data.pageSize) || 5));
		const page = Math.max(1, Number(data.page) || 1);
		const skip = (page - 1) * pageSize;
		let total = 0;
		try {
			const countRes = await merchantCollection.count();
			total = Number(countRes.total || 0);
		} catch (e) {
			total = 0;
		}
		const res = await merchantCollection
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				login_time: true,
				create_time: true,
				points_opt_week_applied: true,
				points_opt_whitelist: true
			})
			.orderBy('_id', 'asc')
			.skip(skip)
			.limit(pageSize)
			.get();
		const rows = res.data || [];
		const list = [];
		// 无分片账本时才扫流水；每页最多估算若干户，避免 FunctionTimeout
		let tradeEstimateBudget = Math.min(5, rows.length);
		for (const m of rows) {
			const allowTradeEstimate = tradeEstimateBudget > 0;
			const r = await optimizeLoginWeeks(m, { dryRun: true, biz, allowTradeEstimate });
			if (r && r.usedTradeEstimate) tradeEstimateBudget -= 1;
			list.push(previewRow(m, r));
		}
		return {
			code: 0,
			message: 'ok',
			data: {
				enabled,
				list,
				total,
				page,
				pageSize
			}
		};
	}

	function previewRow(m, r) {
		const now = nowTs();
		return {
			id: m._id,
			userId: m.user_id || m._id,
			name: m.wx_nickname || '-',
			mobile: m.mobile || '',
			whitelist: isWhitelisted(m),
			loginTime: m.login_time ? formatTime(m.login_time) : '',
			createTime: m.create_time ? formatTime(m.create_time) : '',
			idleDays: idleDaysOf(m, now),
			dueWeeks: calcDueWeeks(m, now),
			applied: Number(m.points_opt_week_applied || 0) || 0,
			previewAction: r.action,
			previewCut: Number(r.cutTotal || 0),
			afterApplied: r.afterApplied != null ? r.afterApplied : Number(m.points_opt_week_applied || 0)
		};
	}

	async function pointsOptimizeLoginRun(data = {}, event = {}) {
		const operator = getOperator(event);
		const enabled = await isLoginOptimizeEnabled();
		if (!enabled) {
			await addLog({ action: 'skip_disabled', operator, remark: '总开关关闭' });
			return { code: 0, message: '总开关已关闭，未执行优化', data: { skipped: true, enabled: false } };
		}
		const dryRun = !!data.dryRun;
		const merchantKey =
			data.merchantUserId || data.merchantId || data.userId || data.keyword || data.deviceId;
		const biz = await getBizSettings();

		if (merchantKey) {
			const merchant = await getMerchantByIdOrUserId(merchantKey);
			if (!merchant) return { code: 404, message: '未找到商户（请用商户编号或机具号）' };
			const r = await optimizeLoginWeeks(merchant, { dryRun, operator, biz, batchId: '' });
			return { code: 0, message: 'ok', data: r };
		}

		// 全体：任务续跑，_id 游标
		let batchId = safeText(data.batchId || data.taskId, 80);
		let task = null;
		if (batchId) {
			const tr = await taskCol.where({ batch_id: batchId }).limit(1).get();
			task = (tr.data || [])[0] || null;
		}
		const now = nowTs();
		if (!task) {
			batchId = `po_${now}_${Math.random().toString(36).slice(2, 8)}`;
			const add = await taskCol.add({
				batch_id: batchId,
				status: 'running',
				cursor: '',
				progress: 0,
				scanned: 0,
				upgraded: 0,
				skipped_whitelist: 0,
				skipped: 0,
				failed: 0,
				cut_total: 0,
				dry_run: dryRun,
				operator,
				create_time: now,
				update_time: now
			});
			task = { _id: add.id, batch_id: batchId, cursor: '', scanned: 0, upgraded: 0, skipped_whitelist: 0, skipped: 0, failed: 0, cut_total: 0 };
		}

		const chunk = Math.min(40, Math.max(5, Number(data.chunkSize) || BATCH_MERCHANT_PAGE));
		const cursor = safeText(data.cursor != null ? data.cursor : task.cursor, 80);
		// 只扫闲置 ≥7 天：有 login_time 用登录锚点，否则用注册时间（与 calcDueWeeks 一致）
		const cutoffTs = now - WEEK_MS;
		const idleWhere = _.or([
			{ login_time: _.gt(0).and(_.lte(cutoffTs)) },
			_.and([
				_.or([{ login_time: _.exists(false) }, { login_time: _.lte(0) }, { login_time: null }]),
				{ create_time: _.gt(0).and(_.lte(cutoffTs)) }
			])
		]);
		const whereParts = [idleWhere];
		if (cursor) whereParts.push({ _id: _.gt(cursor) });
		const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
		const res = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				login_time: true,
				create_time: true,
				points_opt_week_applied: true,
				points_opt_whitelist: true,
				wx_nickname: true
			})
			.orderBy('_id', 'asc')
			.limit(chunk)
			.get();
		const rows = res.data || [];
		let scanned = Number(task.scanned || 0);
		let upgraded = Number(task.upgraded || 0);
		let skippedWhitelist = Number(task.skipped_whitelist || 0);
		let skipped = Number(task.skipped || 0);
		let failed = Number(task.failed || 0);
		let cutTotal = Number(task.cut_total || 0);

		for (const m of rows) {
			scanned += 1;
			try {
				const r = await optimizeLoginWeeks(m, { dryRun, operator, biz, batchId });
				if (r.action === 'skip_whitelist') skippedWhitelist += 1;
				else if (r.action === 'upgraded') {
					upgraded += 1;
					cutTotal = floor2(cutTotal + Number(r.cutTotal || 0));
				} else skipped += 1;
			} catch (e) {
				failed += 1;
				console.error('optimizeLoginWeeks merchant', m._id, e);
			}
		}

		const nextCursor = rows.length ? String(rows[rows.length - 1]._id) : cursor;
		const done = rows.length < chunk;
		await taskCol.doc(task._id).update({
			cursor: nextCursor,
			scanned,
			upgraded,
			skipped_whitelist: skippedWhitelist,
			skipped,
			failed,
			cut_total: cutTotal,
			status: done ? 'done' : 'running',
			progress: done ? 100 : Math.min(99, Number(task.progress || 0) + 1),
			update_time: nowTs()
		});

		return {
			code: 0,
			message: done ? '本轮完成' : '继续调用以续跑',
			data: {
				batchId,
				done,
				nextCursor: done ? '' : nextCursor,
				scanned,
				upgraded,
				skippedWhitelist,
				skipped,
				failed,
				cutTotal,
				dryRun,
				enabled: true
			}
		};
	}

	async function pointsOptimizeTaskStatus(data = {}) {
		const batchId = safeText(data.batchId || data.taskId, 80);
		if (!batchId) return { code: 400, message: '缺少 batchId' };
		const tr = await taskCol.where({ batch_id: batchId }).limit(1).get();
		const task = (tr.data || [])[0];
		if (!task) return { code: 404, message: '任务不存在' };
		return { code: 0, message: 'ok', data: task };
	}

	/** 日志列表补齐商户昵称 + 绑定机具号（按页批量查，避免 N+1） */
	async function enrichLogsWithMerchantInfo(rows) {
		const list = Array.isArray(rows) ? rows : [];
		if (!list.length) return list;
		const uidKeys = [
			...new Set(list.map((x) => String(x.merchant_user_id || '').trim()).filter(Boolean))
		];
		const merchantByKey = new Map();
		if (uidKeys.length) {
			try {
				const mRes = await merchantCollection
					.where(_.or([{ user_id: _.in(uidKeys) }, { _id: _.in(uidKeys) }]))
					.field({ _id: true, user_id: true, wx_nickname: true, mobile: true, device_id: true })
					.limit(Math.min(500, uidKeys.length * 2))
					.get();
				for (const m of mRes.data || []) {
					const info = {
						id: String(m._id || ''),
						userId: String(m.user_id || m._id || ''),
						name: safeText(m.wx_nickname || m.mobile || '', 60) || '-',
						snapshotDeviceId: safeText(m.device_id, 80)
					};
					if (info.id) merchantByKey.set(info.id, info);
					if (info.userId) merchantByKey.set(info.userId, info);
				}
			} catch (e) {
				console.error('enrichLogsWithMerchantInfo merchants', e);
			}
		}
		const bindIds = [
			...new Set(
				[...merchantByKey.values()]
					.flatMap((m) => [m.userId, m.id])
					.map((x) => String(x || '').trim())
					.filter(Boolean)
			)
		];
		const devicesByBind = new Map();
		if (bindIds.length) {
			try {
				const machineCol = db.collection('hsy-machine');
				const CHUNK = 200;
				for (let i = 0; i < bindIds.length; i += CHUNK) {
					const part = bindIds.slice(i, i + CHUNK);
					const mr = await machineCol
						.where(
							_.and([
								{ is_deleted: _.neq(true) },
								{ is_bound: 1 },
								{ bind_user_id: _.in(part) }
							])
						)
						.field({ device_id: true, bind_user_id: true })
						.limit(1000)
						.get();
					for (const row of mr.data || []) {
						const uid = String(row.bind_user_id || '').trim();
						const did = safeText(row.device_id, 80);
						if (!uid || !did) continue;
						if (!devicesByBind.has(uid)) devicesByBind.set(uid, []);
						const arr = devicesByBind.get(uid);
						if (!arr.includes(did)) arr.push(did);
					}
				}
			} catch (e) {
				console.error('enrichLogsWithMerchantInfo machines', e);
			}
		}
		const deviceTextFor = (info) => {
			if (!info) return '';
			const fromBind = [
				...(devicesByBind.get(info.userId) || []),
				...(devicesByBind.get(info.id) || [])
			];
			const uniq = [...new Set(fromBind.filter(Boolean))];
			if (uniq.length) return uniq.join('、');
			return info.snapshotDeviceId || '';
		};
		return list.map((row) => {
			const key = String(row.merchant_user_id || '').trim();
			const info = key ? merchantByKey.get(key) : null;
			return Object.assign({}, row, {
				merchant_name: info ? info.name : '',
				device_ids: info ? deviceTextFor(info) : ''
			});
		});
	}

	async function pointsOptimizeLogsList(data = {}) {
		const page = Math.max(1, Number(data.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
		const scope = String(data.scope || data.logScope || 'login').trim();
		const defaultActions = scope === 'flow' ? FLOW_TASK_LOG_ACTIONS : TASK_LOG_ACTIONS;
		const whereParts = [{ action: _.in(defaultActions) }];
		if (data.action && TASK_LOG_ACTION_SET.has(String(data.action))) {
			whereParts[0] = { action: String(data.action) };
		}
		if (data.merchantUserId) whereParts.push({ merchant_user_id: String(data.merchantUserId) });
		if (data.batchId) whereParts.push({ batch_id: String(data.batchId) });
		const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
		const countRes = await logCol.where(where).count();
		const listRes = await logCol
			.where(where)
			.orderBy('create_time', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = await enrichLogsWithMerchantInfo(listRes.data || []);
		return {
			code: 0,
			message: 'ok',
			data: {
				list,
				total: countRes.total || 0,
				page,
				pageSize
			}
		};
	}

	async function pointsOptimizeWhitelistList(data = {}) {
		const page = Math.max(1, Number(data.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
		const keyword = safeText(data.keyword || data.merchantUserId || data.deviceId, 80);
		const whereParts = [{ points_opt_whitelist: true }];
		if (keyword) {
			const hit = await getMerchantByIdOrUserId(keyword);
			if (!hit) {
				return { code: 0, message: 'ok', data: { list: [], total: 0, page, pageSize } };
			}
			const uid = String(hit.user_id || hit._id || '');
			const docId = String(hit._id || '');
			const idOr = [{ _id: docId }];
			if (uid) idOr.push({ user_id: uid });
			whereParts.push(_.or(idOr));
		}
		const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
		const countRes = await merchantCollection.where(where).count();
		const listRes = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				points_opt_whitelist: true,
				points_opt_whitelist_at: true,
				points_opt_whitelist_by: true,
				points_opt_whitelist_remark: true,
				login_time: true
			})
			.orderBy('points_opt_whitelist_at', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (listRes.data || []).map((x) => ({
			id: x._id,
			userId: x.user_id || x._id,
			name: x.wx_nickname || '-',
			mobile: x.mobile || '',
			remark: x.points_opt_whitelist_remark || '',
			by: x.points_opt_whitelist_by || '',
			at: x.points_opt_whitelist_at ? formatTime(x.points_opt_whitelist_at) : '',
			loginTime: x.login_time ? formatTime(x.login_time) : ''
		}));
		return { code: 0, message: 'ok', data: { list, total: countRes.total || 0, page, pageSize } };
	}

	async function pointsOptimizeWhitelistAdd(data = {}, event = {}) {
		const operator = getOperator(event);
		const remark = safeText(data.remark, 200);
		const ids = [];
		if (Array.isArray(data.merchantUserIds)) {
			data.merchantUserIds.forEach((x) => {
				const s = safeText(x, 80);
				if (s) ids.push(s);
			});
		}
		const one = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (one) ids.push(one);
		const uniq = [...new Set(ids)];
		if (!uniq.length) return { code: 400, message: '请传入商户ID' };
		const now = nowTs();
		let ok = 0;
		const failed = [];
		for (const key of uniq.slice(0, 200)) {
			const m = await getMerchantByIdOrUserId(key);
			if (!m) {
				failed.push(key);
				continue;
			}
			await merchantCollection.doc(m._id).update({
				points_opt_whitelist: true,
				points_opt_whitelist_at: now,
				points_opt_whitelist_by: operator,
				points_opt_whitelist_remark: remark
			});
			await addLog({
				action: 'whitelist_add',
				merchant_user_id: m.user_id || m._id,
				operator,
				remark
			});
			ok += 1;
		}
		return { code: 0, message: 'ok', data: { ok, failed } };
	}

	async function pointsOptimizeWhitelistRemove(data = {}, event = {}) {
		const operator = getOperator(event);
		const key = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (!key) return { code: 400, message: '请传入商户ID' };
		const m = await getMerchantByIdOrUserId(key);
		if (!m) return { code: 404, message: '商户不存在' };
		await merchantCollection.doc(m._id).update({
			points_opt_whitelist: false,
			points_opt_whitelist_at: nowTs(),
			points_opt_whitelist_by: operator
		});
		await addLog({
			action: 'whitelist_remove',
			merchant_user_id: m.user_id || m._id,
			operator
		});
		return { code: 0, message: 'ok' };
	}

	async function pointsFlowOptimizeWhitelistList(data = {}) {
		const page = Math.max(1, Number(data.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20));
		const keyword = safeText(data.keyword || data.merchantUserId || data.deviceId, 80);
		const whereParts = [{ points_flow_opt_whitelist: true }];
		if (keyword) {
			const hit = await getMerchantByIdOrUserId(keyword);
			if (!hit) {
				return { code: 0, message: 'ok', data: { list: [], total: 0, page, pageSize } };
			}
			const uid = String(hit.user_id || hit._id || '');
			const docId = String(hit._id || '');
			const idOr = [{ _id: docId }];
			if (uid) idOr.push({ user_id: uid });
			whereParts.push(_.or(idOr));
		}
		const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
		const countRes = await merchantCollection.where(where).count();
		const listRes = await merchantCollection
			.where(where)
			.field({
				_id: true,
				user_id: true,
				wx_nickname: true,
				mobile: true,
				points_flow_opt_whitelist: true,
				points_flow_opt_whitelist_at: true,
				points_flow_opt_whitelist_by: true,
				points_flow_opt_whitelist_remark: true,
				create_time: true
			})
			.orderBy('points_flow_opt_whitelist_at', 'desc')
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.get();
		const list = (listRes.data || []).map((x) => ({
			id: x._id,
			userId: x.user_id || x._id,
			name: x.wx_nickname || '-',
			mobile: x.mobile || '',
			remark: x.points_flow_opt_whitelist_remark || '',
			by: x.points_flow_opt_whitelist_by || '',
			at: x.points_flow_opt_whitelist_at ? formatTime(x.points_flow_opt_whitelist_at) : '',
			createTime: x.create_time ? formatTime(x.create_time) : ''
		}));
		return { code: 0, message: 'ok', data: { list, total: countRes.total || 0, page, pageSize } };
	}

	async function pointsFlowOptimizeWhitelistAdd(data = {}, event = {}) {
		const operator = getOperator(event);
		const remark = safeText(data.remark, 200);
		const ids = [];
		if (Array.isArray(data.merchantUserIds)) {
			data.merchantUserIds.forEach((x) => {
				const s = safeText(x, 80);
				if (s) ids.push(s);
			});
		}
		const one = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (one) ids.push(one);
		const uniq = [...new Set(ids)];
		if (!uniq.length) return { code: 400, message: '请传入商户ID' };
		const now = nowTs();
		let ok = 0;
		const failed = [];
		for (const key of uniq.slice(0, 200)) {
			const m = await getMerchantByIdOrUserId(key);
			if (!m) {
				failed.push(key);
				continue;
			}
			await merchantCollection.doc(m._id).update({
				points_flow_opt_whitelist: true,
				points_flow_opt_whitelist_at: now,
				points_flow_opt_whitelist_by: operator,
				points_flow_opt_whitelist_remark: remark
			});
			await addLog({
				action: 'flow_whitelist_add',
				merchant_user_id: m.user_id || m._id,
				operator,
				remark
			});
			ok += 1;
		}
		return { code: 0, message: 'ok', data: { ok, failed } };
	}

	async function pointsFlowOptimizeWhitelistRemove(data = {}, event = {}) {
		const operator = getOperator(event);
		const key = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (!key) return { code: 400, message: '请传入商户ID' };
		const m = await getMerchantByIdOrUserId(key);
		if (!m) return { code: 404, message: '商户不存在' };
		await merchantCollection.doc(m._id).update({
			points_flow_opt_whitelist: false,
			points_flow_opt_whitelist_at: nowTs(),
			points_flow_opt_whitelist_by: operator
		});
		await addLog({
			action: 'flow_whitelist_remove',
			merchant_user_id: m.user_id || m._id,
			operator
		});
		return { code: 0, message: 'ok' };
	}

	async function pointsSliceStateList(data = {}) {
		const key = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (!key) return { code: 400, message: '请传入商户ID' };
		const m = await getMerchantByIdOrUserId(key);
		if (!m) return { code: 404, message: '商户不存在' };
		const merchantUserId = String(m.user_id || m._id);
		await reconcileOriginal(m, { operator: 'admin_view', silentLog: true });
		const curYm = subsidyEngine.monthNoFromTs(nowTs());
		const slices = await loadSlicesForMerchant(merchantUserId, { minTargetYm: curYm });
		slices.sort((a, b) => {
			const c1 = String(a.target_ym).localeCompare(String(b.target_ym));
			if (c1) return c1;
			const c2 = String(a.source_ym).localeCompare(String(b.source_ym));
			if (c2) return c2;
			return Number(a.slice_index || 0) - Number(b.slice_index || 0);
		});
		const list = slices.map((s) => ({
			id: s._id,
			targetYm: s.target_ym,
			sourceYm: s.source_ym,
			sliceIndex: s.slice_index,
			original: floor2(s.original_amount),
			system: floor2(s.system_amount),
			manual: s.manual_amount == null || s.manual_amount === '' ? null : floor2(s.manual_amount),
			effective: effectiveOf(s),
			isClaimed: !!s.is_claimed,
			optSkip: !!s.opt_skip,
			packetStatus: s.packet_status || ''
		}));
		return {
			code: 0,
			message: 'ok',
			data: {
				merchant: {
					id: m._id,
					userId: merchantUserId,
					name: m.wx_nickname || '',
					whitelist: isWhitelisted(m),
					applied: Number(m.points_opt_week_applied || 0) || 0,
					dueWeeks: calcDueWeeks(m),
					idleDays: idleDaysOf(m)
				},
				list
			}
		};
	}

	async function pointsSliceManualSet(data = {}, event = {}) {
		const operator = getOperator(event);
		const sliceId = safeText(data.sliceId || data.id, 80);
		if (!sliceId) return { code: 400, message: '缺少 sliceId' };
		const sr = await sliceCol.doc(sliceId).get();
		const row = sr.data && (Array.isArray(sr.data) ? sr.data[0] : sr.data);
		if (!row) return { code: 404, message: '分片不存在' };
		if (row.is_claimed) return { code: 400, message: '已领取不可改' };

		const now = nowTs();
		const onlyOptSkip =
			(data.optSkip !== undefined || data.skipOptimize !== undefined) &&
			data.amount == null &&
			data.manualAmount == null &&
			!data.mode &&
			data.clearManual !== true;

		if (onlyOptSkip) {
			const skip =
				data.optSkip === true ||
				data.optSkip === '1' ||
				data.optSkip === 1 ||
				data.skipOptimize === true ||
				data.skipOptimize === '1' ||
				data.skipOptimize === 1;
			const prev = !!row.opt_skip;
			if (prev === skip) return { code: 0, message: 'ok', data: { optSkip: skip } };
			await sliceCol.doc(sliceId).update({
				opt_skip: skip,
				update_time: now,
				version: _.inc(1)
			});
			await addLog({
				action: skip ? 'slice_opt_skip' : 'slice_opt_unskip',
				merchant_user_id: row.merchant_user_id,
				operator,
				remark: `${row.target_ym}←${row.source_ym}#${row.slice_index} ${skip ? '后续不优化' : '恢复可优化'}`,
				slice_diffs: [
					{
						sliceId,
						target_ym: row.target_ym,
						source_ym: row.source_ym,
						slice_index: row.slice_index,
						opt_skip: skip
					}
				]
			});
			return { code: 0, message: skip ? '已标记后续不优化' : '已取消后续不优化', data: { optSkip: skip } };
		}

		const clearManual = data.clearManual === true || data.mode === 'clear';
		const restoreOriginal = data.mode === 'original';
		const restoreSystem = data.mode === 'system';
		let patch = { update_time: now, version: _.inc(1) };
		const before = effectiveOf(row);

		if (clearManual || restoreSystem) {
			patch.manual_amount = null;
			patch.effective_amount = floor2(row.system_amount);
		} else if (restoreOriginal) {
			const o = floor2(row.original_amount);
			patch.manual_amount = o;
			patch.effective_amount = o;
		} else {
			const raw = data.amount != null ? data.amount : data.manualAmount;
			const n = typeof raw === 'string' ? Number(String(raw).replace(/[￥,\s]/g, '')) : Number(raw);
			if (!Number.isFinite(n) || n < 0) return { code: 400, message: '金额无效' };
			const v = floor2(n);
			patch.manual_amount = v;
			patch.effective_amount = v;
		}

		await sliceCol.doc(sliceId).update(patch);
		const afterEff = floor2(patch.effective_amount);
		await syncPendingPacketsForSlices(row.merchant_user_id, [
			Object.assign({}, row, {
				manual_amount: patch.manual_amount === null ? null : patch.manual_amount,
				effective_amount: patch.effective_amount,
				system_amount: row.system_amount
			})
		]);
		const hadManual = row.manual_amount != null && row.manual_amount !== '';
		const hasManual = patch.manual_amount != null && patch.manual_amount !== '';
		const amountChanged = Math.abs(before - afterEff) >= 0.01;
		const manualFlagChanged = hadManual !== hasManual;
		if (amountChanged || manualFlagChanged) {
			await addLog({
				action: clearManual || restoreSystem ? 'manual_clear' : 'manual_set',
				merchant_user_id: row.merchant_user_id,
				operator,
				before_total: before,
				after_total: afterEff,
				cut_total: floor2(before - afterEff),
				remark: `${row.target_ym}←${row.source_ym}#${row.slice_index}`,
				slice_diffs: [
					{
						sliceId,
						target_ym: row.target_ym,
						source_ym: row.source_ym,
						slice_index: row.slice_index,
						before,
						after: afterEff
					}
				]
			});
		}
		try {
			if (typeof recalcFrozen === 'function') await recalcFrozen(row.merchant_user_id);
		} catch (e) {}
		return { code: 0, message: '保存成功' };
	}

	async function pointsSliceReconcile(data = {}, event = {}) {
		const key = safeText(data.merchantUserId || data.userId || data.merchantId, 80);
		if (!key) return { code: 400, message: '请传入商户ID' };
		const m = await getMerchantByIdOrUserId(key);
		if (!m) return { code: 404, message: '商户不存在' };
		const r = await reconcileOriginal(m, { operator: getOperator(event) });
		return { code: 0, message: '对账成功', data: r };
	}

	/** 登录成功：重置周进度，不恢复金额 */
	async function onMerchantLoginAnchorReset(merchantDocId, merchantUserId) {
		if (!merchantDocId) return;
		try {
			await merchantCollection.doc(merchantDocId).update({
				points_opt_week_applied: 0
			});
			// 登录锚点重置不写任务日志
		} catch (e) {
			console.error('onMerchantLoginAnchorReset', e);
		}
	}

	return {
		pointsOptimizeLoginPreview,
		pointsOptimizeLoginRun,
		pointsOptimizeLoginSimulateWeek,
		pointsOptimizeTaskStatus,
		pointsOptimizeLogsList,
		pointsOptimizeWhitelistList,
		pointsOptimizeWhitelistAdd,
		pointsOptimizeWhitelistRemove,
		pointsFlowOptimizeWhitelistList,
		pointsFlowOptimizeWhitelistAdd,
		pointsFlowOptimizeWhitelistRemove,
		pointsSliceStateList,
		pointsSliceManualSet,
		pointsSliceReconcile,
		onMerchantLoginAnchorReset,
		reconcileOriginal,
		optimizeLoginWeeks,
		isLoginOptimizeEnabled,
		calcDueWeeks,
		isWhitelisted
	};
}

module.exports = {
	createPointsOptimizeApi,
	floor2,
	effectiveOf,
	calcDueWeeks: (m, now) => {
		const login = Number(m && m.login_time) || 0;
		const created = Number(m && m.create_time) || 0;
		const anchor = login > 0 ? login : created > 0 ? created : 0;
		if (!(anchor > 0)) return 0;
		return Math.floor(Math.max(0, (now || Date.now()) - anchor) / WEEK_MS);
	}
};
