'use strict';

/**
 * 运维：H5 商户积分红包、积分变动日志、升级清除日志（只读）。
 */

const db = uniCloud.database();
const _ = db.command;
const incomePacketCollection = db.collection('hsy-income-packets');
const merchantCollection = db.collection('hsy-merchant-users');
const operationLogCollection = db.collection('hsy-operation-logs');
const optimizeLogCollection = db.collection('hsy-points-optimize-logs');
const machineCollection = db.collection('hsy-machine');
const withdrawCollection = db.collection('hsy-withdraw-records');
const sliceStateCollection = db.collection('hsy-points-slice-state');

const MEMBER_UPGRADE_POINTS_CLEAR_ACTION = 'member_upgrade_points_clear';
/** 与补贴引擎一致：流水 ≤ 该阈值只走 1 期，领取后不增加冻结 */
const FLOW_THRESHOLD_YUAN = 300;
const OPTIMIZE_LOG_ACTIONS = ['login_week_up', 'login_week_sim', 'manual_set', 'manual_clear'];
const DB_PAGE_SIZE = 1000;
const DB_MAX_ROWS = 20000;

function safeText(v, max = 200) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function escapeReg(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTimeRangeWhere(field, timeStart, timeEnd) {
	if (
		timeStart != null &&
		!Number.isNaN(Number(timeStart)) &&
		timeEnd != null &&
		!Number.isNaN(Number(timeEnd))
	) {
		return _.and([{ [field]: _.gte(Number(timeStart)) }, { [field]: _.lte(Number(timeEnd)) }]);
	}
	if (timeStart != null && !Number.isNaN(Number(timeStart))) {
		return { [field]: _.gte(Number(timeStart)) };
	}
	if (timeEnd != null && !Number.isNaN(Number(timeEnd))) {
		return { [field]: _.lte(Number(timeEnd)) };
	}
	return null;
}

const CASHBACK_RATE = 0.0038;

function floorYuan2(n) {
	const x = Number(n || 0);
	if (!Number.isFinite(x) || x <= 0) return 0;
	return Math.floor(x * 100 + 1e-9) / 100;
}

/**
 * 流水首期领取后进入后四期的冻结额。
 * 有锚定流水时用「整笔返现 − 首期」；否则按五期均分（首期×4）。其它类型不产生后四期。
 */
function futureDeferredFrozenYuan(row) {
	if (safeText(row && row.subsidy_kind, 48) !== 'trade_first') return null;
	const first = floorYuan2(row && row.amount);
	const flow = Number((row && row.anchor_flow_yuan) || 0);
	if (flow > 0) {
		const total = floorYuan2(flow * CASHBACK_RATE);
		return Number(Math.max(0, total - first).toFixed(2));
	}
	return Number((first * 4).toFixed(2));
}

function roundYuan2(n) {
	const x = Number(n || 0);
	if (!Number.isFinite(x)) return 0;
	return Number(x.toFixed(2));
}

function formatSignedYuan(n) {
	const v = roundYuan2(n);
	if (v > 0) return `+${v.toFixed(2)}`;
	if (v < 0) return v.toFixed(2);
	return '+0.00';
}

function deltaSign(n) {
	const v = roundYuan2(n);
	if (v > 0) return 'pos';
	if (v < 0) return 'neg';
	return 'zero';
}

function isValidCnMobile(m) {
	return /^1\d{10}$/.test(String(m || '').trim());
}

async function fetchAllQueryPages(collection, where, opts = {}) {
	const all = [];
	let skip = 0;
	for (;;) {
		let q = collection.where(where);
		if (opts.field && Object.keys(opts.field).length) q = q.field(opts.field);
		if (opts.orderBy && opts.orderBy.field) {
			q = q.orderBy(opts.orderBy.field, opts.orderBy.direction || 'asc');
		}
		const r = await q.skip(skip).limit(DB_PAGE_SIZE).get();
		const rows = r.data || [];
		all.push(...rows);
		if (rows.length < DB_PAGE_SIZE) break;
		skip += DB_PAGE_SIZE;
		if (skip >= DB_MAX_ROWS) break;
	}
	return all;
}

/**
 * 自然月 YYYY-MM（北京时间）
 */
function shanghaiYearMonthFromTs(ts) {
	const t = Number(ts);
	if (!Number.isFinite(t)) return '';
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Shanghai',
			year: 'numeric',
			month: '2-digit'
		}).formatToParts(new Date(t));
		let y = '';
		let mo = '';
		for (const p of parts) {
			if (p.type === 'year') y = p.value;
			if (p.type === 'month') mo = p.value;
		}
		if (!y || mo === '') throw new Error('no ym');
		return `${y}-${String(mo).padStart(2, '0')}`;
	} catch (e) {
		const d = new Date(t + 8 * 60 * 60 * 1000);
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}
}

function addMonthsYm(ym, delta) {
	const [ys, ms] = String(ym || '').split('-');
	const y = Number(ys);
	const m = Number(ms);
	if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return '';
	const d = new Date(Date.UTC(y, m - 1 + Number(delta || 0), 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeYearMonth(v) {
	const s = String(v == null ? '' : v).trim();
	if (!s) return '';
	const m = s.match(/(\d{4})\D{0,2}(\d{1,2})/);
	if (!m) return s;
	const month = Number(m[2]);
	if (!Number.isFinite(month) || month < 1 || month > 12) return s;
	return `${m[1]}-${String(month).padStart(2, '0')}`;
}

/** 北京时间该月 1 日 00:00:00 */
function shanghaiMonthStartTs(ym) {
	const [y, m] = String(ym || '').split('-').map(Number);
	if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
	return Date.UTC(y, m - 1, 1) - 8 * 60 * 60 * 1000;
}

function sliceAmountNow(row) {
	if (!row) return 0;
	if (row.effective_amount != null && row.effective_amount !== '') return roundYuan2(row.effective_amount);
	if (row.manual_amount != null && row.manual_amount !== '') return roundYuan2(row.manual_amount);
	if (row.system_amount != null && row.system_amount !== '') return roundYuan2(row.system_amount);
	return roundYuan2(row.original_amount);
}

/**
 * 与商户列表同一口径：未领分片 effective，target_ym > 事件当时月份。
 * 晚于 ts 的优化按 slice_diffs 回滚，避免历史行已经是砍后余额。
 */
function frozenFromSlicesAt(slices, optLogs, ts) {
	const curYm = shanghaiYearMonthFromTs(ts);
	if (!curYm) return 0;
	const amt = new Map();
	for (let i = 0; i < (slices || []).length; i += 1) {
		const s = slices[i];
		if (!s || s.is_claimed === true) continue;
		const ym = normalizeYearMonth(s.target_ym);
		if (!ym) continue;
		const id = String(
			s._id || `${ym}|${s.source_ym || ''}|${s.slice_index != null ? s.slice_index : i}`
		);
		amt.set(id, { ym, amount: sliceAmountNow(s) });
	}
	const later = (optLogs || [])
		.filter((o) => Number(o.create_time || 0) > Number(ts || 0))
		.sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
	for (const o of later) {
		for (const d of o.slice_diffs || []) {
			const id = String((d && (d._id || d.sliceId)) || '');
			if (!id || !amt.has(id)) continue;
			const before = Number(d.before);
			if (!Number.isFinite(before)) continue;
			amt.get(id).amount = roundYuan2(before);
		}
	}
	let s = 0;
	for (const v of amt.values()) {
		if (v.ym > curYm && v.amount > 0) s += v.amount;
	}
	return roundYuan2(s);
}

function allocateFrozenSnapshot(group, snapshot, prevFrozen) {
	const jump = roundYuan2(snapshot - prevFrozen);
	const claimers = (group || []).filter((e) => e.type === 'claim_first' && Number(e.frozenAdd || 0) > 0);
	const weights = {};
	if (claimers.length && Math.abs(jump) >= 0.01) {
		const wsum = claimers.reduce((s, e) => s + Number(e.frozenAdd || 0), 0) || claimers.length;
		let allocated = 0;
		claimers.forEach((e, idx) => {
			const d =
				idx === claimers.length - 1
					? roundYuan2(jump - allocated)
					: roundYuan2((jump * Number(e.frozenAdd || 0)) / wsum);
			weights[e.id] = d;
			allocated = roundYuan2(allocated + d);
		});
	} else if (group && group.length) {
		weights[group[group.length - 1].id] = jump;
	}
	let frozen = prevFrozen;
	for (const ev of group || []) {
		const d = weights[ev.id] != null ? weights[ev.id] : 0;
		frozen = roundYuan2(frozen + d);
		ev.frozenDelta = d;
		ev.frozenAfter = frozen;
	}
	return frozen;
}

function splitDeferredMonths(claimYm, deferredYuan) {
	const total = roundYuan2(deferredYuan);
	if (!(total > 0) || !claimYm) return [];
	const lots = [];
	let left = total;
	for (let i = 1; i <= 4; i += 1) {
		const ym = addMonthsYm(claimYm, i);
		const amt = i === 4 ? roundYuan2(left) : roundYuan2(total / 4);
		left = roundYuan2(left - amt);
		if (ym && amt > 0) lots.push({ ym, amount: amt });
	}
	return lots;
}

function frozenFromLots(lots, curYm) {
	let s = 0;
	for (const lot of lots || []) {
		if (lot && lot.ym > curYm && Number(lot.amount) > 0) s += Number(lot.amount);
	}
	return roundYuan2(s);
}

/** 目标月 = 当前月：已从冻结转出、本月待解锁（待流水达标后领取） */
function currentMonthUnlockFromLots(lots, curYm) {
	let s = 0;
	for (const lot of lots || []) {
		if (lot && lot.ym === curYm && Number(lot.amount) > 0) s += Number(lot.amount);
	}
	return roundYuan2(s);
}

function applyCutToLots(lots, cutYuan, curYm, diffs) {
	if (Array.isArray(diffs) && diffs.length) {
		const cutByYm = new Map();
		for (const d of diffs) {
			const ym = normalizeYearMonth(d && d.target_ym);
			const c = roundYuan2((Number(d && d.before) || 0) - (Number(d && d.after) || 0));
			if (!ym || !(c > 0)) continue;
			cutByYm.set(ym, roundYuan2((cutByYm.get(ym) || 0) + c));
		}
		for (const lot of lots || []) {
			const need = cutByYm.get(lot.ym) || 0;
			if (!(need > 0) || !(lot.amount > 0)) continue;
			const take = Math.min(lot.amount, need);
			lot.amount = roundYuan2(lot.amount - take);
			cutByYm.set(lot.ym, roundYuan2(need - take));
		}
		return;
	}
	let remain = roundYuan2(cutYuan);
	if (!(remain > 0)) return;
	const order = (lots || [])
		.filter((lot) => lot && lot.amount > 0)
		.sort((a, b) => {
			const aFut = a.ym > curYm ? 0 : 1;
			const bFut = b.ym > curYm ? 0 : 1;
			if (aFut !== bFut) return aFut - bFut;
			return String(a.ym).localeCompare(String(b.ym));
		});
	for (const lot of order) {
		if (!(remain > 0)) break;
		const take = Math.min(lot.amount, remain);
		lot.amount = roundYuan2(lot.amount - take);
		remain = roundYuan2(remain - take);
	}
}

function listMonthRollEvents(fromTs, toTs) {
	const events = [];
	const startTs = Number(fromTs || 0);
	const endTs = Number(toTs || 0);
	if (!(startTs > 0) || !(endTs > startTs)) return events;
	let ym = addMonthsYm(shanghaiYearMonthFromTs(startTs), 1);
	const endYm = shanghaiYearMonthFromTs(endTs);
	let guard = 0;
	while (ym && ym <= endYm && guard < 120) {
		const ts = shanghaiMonthStartTs(ym);
		if (ts > startTs && ts <= endTs) {
			const prevYm = addMonthsYm(ym, -1);
			// 先作废上月剩余待解锁，再转入本月（两条记录，结余不会出现「合成负数」）
			events.push({
				id: `expire_${ym}`,
				ts,
				type: 'month_unlock_expire',
				label: '上月待解锁作废',
				title: `${prevYm || '上月'} 待解锁未领部分作废，不结转到 ${ym}`,
				flow: 0,
				pendingDelta: 0,
				frozenAdd: 0,
				cutTotal: 0,
				sortKey: `m_${ym}_0`
			});
			events.push({
				id: `roll_${ym}`,
				ts,
				type: 'month_roll',
				label: '月份结转',
				title: `${ym} 进入当月，该月待返从冻结转入本月待解锁`,
				flow: 0,
				pendingDelta: 0,
				frozenAdd: 0,
				cutTotal: 0,
				sortKey: `m_${ym}_1`
			});
		}
		ym = addMonthsYm(ym, 1);
		guard += 1;
	}
	return events;
}

async function liveFutureFrozenYuan(uids) {
	const list = [...new Set((Array.isArray(uids) ? uids : [uids]).map((x) => String(x || '').trim()).filter(Boolean))];
	if (!list.length) return 0;
	const curYm = shanghaiYearMonthFromTs(Date.now());
	try {
		const $ = db.command.aggregate;
		const matchUid = list.length === 1 ? list[0] : _.in(list);
		const agg = await sliceStateCollection
			.aggregate()
			.match(
				_.and([
					{ merchant_user_id: matchUid },
					{ is_deleted: _.neq(true) },
					{ is_claimed: _.neq(true) },
					{ target_ym: _.gt(curYm) }
				])
			)
			.group({ _id: null, total: $.sum('$effective_amount') })
			.end();
		const t = agg && agg.data && agg.data[0] ? Number(agg.data[0].total || 0) : 0;
		return roundYuan2(t);
	} catch (e) {
		console.error('liveFutureFrozenYuan', e);
		return 0;
	}
}

/** 当前自然月未领分片合计 = 本月待解锁（与冻结互补：target_ym == 当月） */
async function liveCurrentMonthUnlockYuan(uids) {
	const list = [...new Set((Array.isArray(uids) ? uids : [uids]).map((x) => String(x || '').trim()).filter(Boolean))];
	if (!list.length) return 0;
	const curYm = shanghaiYearMonthFromTs(Date.now());
	try {
		const $ = db.command.aggregate;
		const matchUid = list.length === 1 ? list[0] : _.in(list);
		const agg = await sliceStateCollection
			.aggregate()
			.match(
				_.and([
					{ merchant_user_id: matchUid },
					{ is_deleted: _.neq(true) },
					{ is_claimed: _.neq(true) },
					{ target_ym: curYm }
				])
			)
			.group({ _id: null, total: $.sum('$effective_amount') })
			.end();
		const t = agg && agg.data && agg.data[0] ? Number(agg.data[0].total || 0) : 0;
		return roundYuan2(t);
	} catch (e) {
		console.error('liveCurrentMonthUnlockYuan', e);
		return 0;
	}
}

/** 与商户列表相同：按目标月汇总未领分片 effective_amount */
async function loadSliceRowsForPointsLog(uids) {
	const list = [...new Set((uids || []).map((x) => String(x || '').trim()).filter(Boolean))];
	if (!list.length) return [];
	const matchUid = list.length === 1 ? list[0] : _.in(list);
	const $ = db.command.aggregate;
	const runGroup = async (amountField) => {
		const agg = await sliceStateCollection
			.aggregate()
			.match(
				_.and([{ merchant_user_id: matchUid }, { is_deleted: _.neq(true) }, { is_claimed: _.neq(true) }])
			)
			.group({ _id: '$target_ym', total: $.sum(`$${amountField}`) })
			.end();
		return ((agg && agg.data) || [])
			.map((r, i) => ({
				_id: `ym_${r._id}_${i}`,
				target_ym: normalizeYearMonth(r._id),
				effective_amount: Number(r.total || 0),
				is_claimed: false
			}))
			.filter((x) => x.target_ym);
	};
	try {
		let rows = await runGroup('effective_amount');
		const tot = rows.reduce((s, r) => s + Number(r.effective_amount || 0), 0);
		if (tot < 0.01) {
			const alt = await runGroup('system_amount');
			const tot2 = alt.reduce((s, r) => s + Number(r.effective_amount || 0), 0);
			if (tot2 > tot) rows = alt;
		}
		return rows;
	} catch (e) {
		console.error('loadSliceRowsForPointsLog agg', e);
		return [];
	}
}

function claimFrozenDeltaYuan(row) {
	if (safeText(row && row.subsidy_kind, 48) !== 'trade_first') return 0;
	const flow = Number((row && row.anchor_flow_yuan) || 0);
	if (flow > 0 && flow <= FLOW_THRESHOLD_YUAN) return 0;
	const frozen = futureDeferredFrozenYuan(row);
	return frozen == null ? 0 : roundYuan2(frozen);
}

function claimEventType(kind) {
	const k = safeText(kind, 48);
	if (k === 'trade_first') return { type: 'claim_first', label: '领取首期' };
	if (k === 'release_pool_history') return { type: 'claim_pool', label: '领取分期待返' };
	if (k === 'coupon_reward') return { type: 'claim_coupon', label: '领取优惠券' };
	return { type: 'claim_other', label: '领取积分' };
}

function optimizeEventMeta(row) {
	const action = safeText(row && row.action, 48);
	if (action === 'login_week_up') return { type: 'optimize_login', label: '登录周优化' };
	if (action === 'login_week_sim') return { type: 'optimize_sim', label: '模拟优化' };
	if (action === 'manual_set') return { type: 'optimize_manual', label: '人工改片' };
	if (action === 'manual_clear') return { type: 'optimize_manual', label: '取消人工改片' };
	return { type: 'optimize', label: '优化积分' };
}

async function resolveMerchantForPointsLog(keyword) {
	const val = safeText(keyword, 120);
	if (!val) {
		return { error: { code: 400, message: '请先搜索商户（user_id / 手机号 / 机具号）' } };
	}

	const ors = [{ _id: val }, { user_id: val }];
	if (isValidCnMobile(val)) ors.push({ mobile: val });
	try {
		const res = await merchantCollection
			.where(_.or(ors))
			.field({
				user_id: true,
				wx_nickname: true,
				mobile: true,
				device_id: true,
				account_points: true,
				frozen_amount: true
			})
			.limit(2)
			.get();
		if (res.data && res.data.length === 1) return { merchant: res.data[0] };
		if (res.data && res.data.length > 1) {
			return { error: { code: 400, message: '匹配到多个商户，请使用完整 user_id' } };
		}
	} catch (e) {
		console.error('resolveMerchantForPointsLog exact', e);
	}

	try {
		const mRes = await machineCollection
			.where(
				_.and([
					{ device_id: val },
					{ is_deleted: _.neq(true) },
					{ is_bound: 1 },
					{ bind_user_id: _.neq('') }
				])
			)
			.field({ bind_user_id: true })
			.limit(1)
			.get();
		const bindUid = mRes.data && mRes.data[0] && String(mRes.data[0].bind_user_id || '').trim();
		if (bindUid) {
			const res2 = await merchantCollection
				.where(_.or([{ user_id: bindUid }, { _id: bindUid }]))
				.field({
					user_id: true,
					wx_nickname: true,
					mobile: true,
					device_id: true,
					account_points: true,
					frozen_amount: true
				})
				.limit(1)
				.get();
			if (res2.data && res2.data[0]) return { merchant: res2.data[0] };
		}
	} catch (e) {
		console.error('resolveMerchantForPointsLog device', e);
	}

	try {
		const r3 = await merchantCollection
			.where({ device_id: val })
			.field({
				user_id: true,
				wx_nickname: true,
				mobile: true,
				device_id: true,
				account_points: true,
				frozen_amount: true
			})
			.limit(1)
			.get();
		if (r3.data && r3.data[0]) return { merchant: r3.data[0] };
	} catch (e) {}

	if (val.length >= 2) {
		try {
			const r = new RegExp(escapeReg(val), 'i');
			const fuzzy = await merchantCollection
				.where(_.or([{ mobile: r }, { wx_nickname: r }]))
				.field({
					user_id: true,
					wx_nickname: true,
					mobile: true,
					device_id: true,
					account_points: true,
					frozen_amount: true
				})
				.limit(8)
				.get();
			const rows = fuzzy.data || [];
			if (rows.length === 1) return { merchant: rows[0] };
			if (rows.length > 1) {
				const names = rows
					.slice(0, 5)
					.map((x) => x.wx_nickname || x.user_id || x._id)
					.join('、');
				return {
					error: {
						code: 400,
						message: `匹配到多个商户（${names}），请改用 user_id 或完整手机号`
					}
				};
			}
		} catch (e) {
			console.error('resolveMerchantForPointsLog fuzzy', e);
		}
	}

	return { error: { code: 404, message: '未找到商户，请用 user_id、手机号或机具号搜索' } };
}

function merchantQueryIds(merchant) {
	return [...new Set([merchant && merchant.user_id, merchant && merchant._id].map((x) => String(x || '').trim()).filter(Boolean))];
}

function mapBalanceLogRow(ev, merchant) {
	return {
		_id: ev.id,
		event_time: ev.ts,
		event_type: ev.type,
		event_type_label: ev.label,
		title: ev.title,
		anchor_flow_yuan: ev.flow,
		anchorFlowText: ev.flow != null && ev.flow > 0 ? Number(ev.flow).toFixed(2) : '-',
		pendingDelta: ev.pendingDelta,
		pendingAfter: ev.pendingAfter,
		pendingDeltaText: formatSignedYuan(ev.pendingDelta),
		pendingAfterText: roundYuan2(ev.pendingAfter).toFixed(2),
		pendingDeltaSign: deltaSign(ev.pendingDelta),
		frozenDelta: ev.frozenDelta,
		frozenAfter: ev.frozenAfter,
		frozenDeltaText: formatSignedYuan(ev.frozenDelta),
		frozenAfterText: roundYuan2(ev.frozenAfter).toFixed(2),
		frozenDeltaSign: deltaSign(ev.frozenDelta),
		unlockDelta: ev.unlockDelta,
		unlockAfter: ev.unlockAfter,
		unlockDeltaText: formatSignedYuan(ev.unlockDelta),
		unlockAfterText: roundYuan2(ev.unlockAfter).toFixed(2),
		unlockDeltaSign: deltaSign(ev.unlockDelta),
		merchant_user_id: String((merchant && merchant.user_id) || (merchant && merchant._id) || ''),
		merchant_name: String((merchant && merchant.wx_nickname) || '').trim() || '-',
		merchant_mobile: String((merchant && merchant.mobile) || '').trim() || '-'
	};
}

/**
 * 指定商户的积分变动日志：领取、提现、优化、过月结转、升级清零。
 * 各行「变动」按事件规则；「变动后结余」从商户列表当前待提现/冻结倒推，
 * 使时间线终点与商户列表一致，用来解释这两个数如何累计/减少。
 */
async function opsPointsBalanceLog(data = {}) {
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(1000, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 120);
	const timeStart = data.timeStart != null && data.timeStart !== '' ? Number(data.timeStart) : NaN;
	const timeEnd = data.timeEnd != null && data.timeEnd !== '' ? Number(data.timeEnd) : NaN;

	const resolved = await resolveMerchantForPointsLog(keyword);
	if (resolved.error) return resolved.error;
	const merchant = resolved.merchant;
	const ids = merchantQueryIds(merchant);
	if (!ids.length) return { code: 404, message: '未找到商户' };

	const idWhere = ids.length === 1 ? ids[0] : _.in(ids);
	const primaryUid = String(merchant.user_id || merchant._id || '');

	let packets = [];
	try {
		packets = await fetchAllQueryPages(
			incomePacketCollection,
			_.and([
				{ merchant_user_id: idWhere },
				{ status: 'claimed' },
				_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])
			]),
			{
				field: {
					merchant_user_id: true,
					title: true,
					amount: true,
					status: true,
					claimed_time: true,
					create_time: true,
					update_time: true,
					subsidy_kind: true,
					month_no: true,
					anchor_flow_yuan: true,
					installment_index: true
				}
			}
		);
	} catch (e) {
		console.error('opsPointsBalanceLog packets', e);
		return { code: 500, message: e.message || '查询领取记录失败' };
	}

	let optLogs = [];
	try {
		optLogs = await fetchAllQueryPages(
			optimizeLogCollection,
			_.and([
				{ merchant_user_id: idWhere },
				{ action: _.in(OPTIMIZE_LOG_ACTIONS) },
				_.or([{ dry_run: false }, { dry_run: _.exists(false) }])
			]),
			{
				field: {
					action: true,
					create_time: true,
					cut_total: true,
					before_total: true,
					after_total: true,
					remark: true,
					before_week: true,
					after_week: true,
					dry_run: true,
					merchant_user_id: true,
					slice_diffs: true
				}
			}
		);
	} catch (e) {
		console.error('opsPointsBalanceLog optimize', e);
	}

	let clearLogs = [];
	try {
		clearLogs = await fetchAllQueryPages(
			operationLogCollection,
			{
				action: MEMBER_UPGRADE_POINTS_CLEAR_ACTION,
				user_id: idWhere
			},
			{
				field: {
					user_id: true,
					create_time: true,
					cleared_account_points: true,
					cleared_frozen_amount: true,
					content: true,
					upgrade_kind: true,
					target_membership_name: true
				}
			}
		);
	} catch (e) {
		console.error('opsPointsBalanceLog upgrade', e);
	}

	let withdraws = [];
	try {
		withdraws = await fetchAllQueryPages(
			withdrawCollection,
			_.and([{ merchant_user_id: idWhere }, _.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])]),
			{
				field: {
					amount: true,
					create_time: true,
					update_time: true,
					arrival_status: true,
					balance_restored: true,
					withdraw_no: true
				}
			}
		);
	} catch (e) {
		console.error('opsPointsBalanceLog withdraw', e);
	}

	let adminPendingLogs = [];
	try {
		adminPendingLogs = await fetchAllQueryPages(
			operationLogCollection,
			{
				action: 'admin_set_pending_balance',
				user_id: idWhere
			},
			{
				field: {
					create_time: true,
					before_pending_balance: true,
					after_pending_balance: true,
					content: true
				}
			}
		);
	} catch (e) {
		console.error('opsPointsBalanceLog admin pending', e);
	}

	const liveFrozen = await liveFutureFrozenYuan(ids);
	const listFrozenNow = liveFrozen > 0.009 ? liveFrozen : roundYuan2(merchant.frozen_amount);
	const liveUnlock = await liveCurrentMonthUnlockYuan(ids);

	const events = [];
	for (const row of packets) {
		const meta = claimEventType(row.subsidy_kind);
		const ts = Number(row.claimed_time || row.update_time || row.create_time || 0);
		events.push({
			id: `claim_${row._id}`,
			ts,
			type: meta.type,
			label: meta.label,
			title: String(row.title || meta.label),
			flow: meta.type === 'claim_first' ? Number(row.anchor_flow_yuan || 0) : 0,
			pendingDelta: roundYuan2(row.amount),
			frozenAdd: claimFrozenDeltaYuan(row),
			cutTotal: 0,
			unlockConsume: meta.type === 'claim_pool' ? roundYuan2(row.amount) : 0,
			sortKey: `c_${row._id}`
		});
	}
	for (const row of optLogs) {
		const meta = optimizeEventMeta(row);
		const cut = roundYuan2(row.cut_total);
		const weekBit =
			row.before_week != null && row.after_week != null ? `第${row.before_week}→${row.after_week}周` : '';
		const remark = safeText(row.remark, 120);
		events.push({
			id: `opt_${row._id}`,
			ts: Number(row.create_time || 0),
			type: meta.type,
			label: meta.label,
			title: remark || `${weekBit}${weekBit ? ' ' : ''}砍 ${cut.toFixed(2)}`.trim() || meta.label,
			flow: 0,
			pendingDelta: 0,
			frozenAdd: 0,
			cutTotal: cut,
			sliceDiffs: Array.isArray(row.slice_diffs) ? row.slice_diffs : [],
			isOptimize: true,
			sortKey: `o_${row._id}`
		});
	}
	for (const row of clearLogs) {
		events.push({
			id: `clr_${row._id}`,
			ts: Number(row.create_time || 0),
			type: 'upgrade_clear',
			label: '升级清零',
			title: String(row.content || row.target_membership_name || '升级清除积分'),
			flow: 0,
			pendingDelta: 0,
			frozenAdd: 0,
			cutTotal: 0,
			sortKey: `u_${row._id}`,
			clearPendingYuan: roundYuan2(row.cleared_account_points),
			clearFrozenYuan: roundYuan2(row.cleared_frozen_amount),
			resetPending: true,
			resetFrozen: true
		});
	}
	for (const row of withdraws) {
		const amt = roundYuan2(row.amount);
		if (!(amt > 0)) continue;
		const st = String(row.arrival_status || '');
		if (row.balance_restored && (st === 'expired' || st === 'returned')) continue;
		events.push({
			id: `wd_${row._id}`,
			ts: Number(row.create_time || row.update_time || 0),
			type: 'withdraw',
			label: '积分提现',
			title: `提现 ${safeText(row.withdraw_no, 40) || amt.toFixed(2)}`.trim(),
			flow: 0,
			pendingDelta: -amt,
			frozenAdd: 0,
			cutTotal: 0,
			sortKey: `w_${row._id}`
		});
	}
	for (const row of adminPendingLogs) {
		events.push({
			id: `ap_${row._id}`,
			ts: Number(row.create_time || 0),
			type: 'admin_pending',
			label: '人工改待提现',
			title: String(row.content || '管理员修改待提现'),
			flow: 0,
			pendingDelta: 0,
			frozenAdd: 0,
			cutTotal: 0,
			setPending: roundYuan2(row.after_pending_balance),
			sortKey: `a_${row._id}`
		});
	}

	const nowTs = Date.now();
	const minTs = events.reduce((m, ev) => (ev.ts > 0 && (m === 0 || ev.ts < m) ? ev.ts : m), 0);
	if (minTs > 0) {
		events.push(...listMonthRollEvents(minTs, nowTs));
	}

	events.sort((a, b) => {
		const dt = (a.ts || 0) - (b.ts || 0);
		if (dt !== 0) return dt;
		return String(a.sortKey).localeCompare(String(b.sortKey));
	});

	let pending = 0;
	let frozen = 0;
	let idx = 0;
	while (idx < events.length) {
		const ev = events[idx];
		if (ev.type === 'upgrade_clear') {
			const cleared = roundYuan2(ev.clearPendingYuan);
			ev.pendingDelta = cleared > 0.009 ? roundYuan2(-cleared) : roundYuan2(-pending);
			pending = 0;
			ev.pendingAfter = 0;
		} else if (ev.resetPending) {
			ev.pendingDelta = roundYuan2(-pending);
			pending = 0;
		} else if (ev.setPending != null && Number.isFinite(Number(ev.setPending))) {
			ev.pendingDelta = roundYuan2(Number(ev.setPending) - pending);
			pending = roundYuan2(ev.setPending);
		} else {
			pending = roundYuan2(pending + Number(ev.pendingDelta || 0));
			if (pending < 0) pending = 0;
		}
		ev.pendingAfter = pending;
		idx += 1;
	}

	/**
	 * 冻结 / 本月待解锁：
	 * 1) 领取首期：冻结 +后四期
	 * 2) 上月待解锁作废：本月待解锁 −剩余 → 0（单独一行）
	 * 3) 月份结转：冻结 −当月待返，本月待解锁 +转出额（单独一行）
	 * 4) 领取分期待返：本月待解锁 −领取额（不低于 0）
	 * 5) 积分优化 / 升级清零
	 */
	const lots = [];
	frozen = 0;
	let unlock = 0;
	for (const ev of events) {
		const curYm = shanghaiYearMonthFromTs(ev.ts) || shanghaiYearMonthFromTs(nowTs);
		const prevFrozen = frozen;
		const prevUnlock = unlock;
		ev.unlockDelta = 0;

		if (ev.type === 'upgrade_clear') {
			const cleared = roundYuan2(ev.clearFrozenYuan);
			ev.frozenDelta = cleared > 0.009 ? roundYuan2(-cleared) : roundYuan2(-prevFrozen);
			ev.unlockDelta = roundYuan2(-prevUnlock);
			frozen = 0;
			unlock = 0;
			lots.splice(0, lots.length);
			ev.frozenAfter = 0;
			ev.unlockAfter = 0;
			continue;
		}

		if (ev.type === 'month_unlock_expire') {
			ev.frozenDelta = 0;
			ev.unlockDelta = roundYuan2(-prevUnlock);
			unlock = 0;
			ev.frozenAfter = frozen;
			ev.unlockAfter = 0;
			continue;
		}

		if (ev.isOptimize) {
			const cut = roundYuan2(ev.cutTotal);
			applyCutToLots(lots, cut, curYm, ev.sliceDiffs);
			const delta = cut > 0.009 ? roundYuan2(-Math.min(cut, prevFrozen)) : 0;
			frozen = roundYuan2(Math.max(0, prevFrozen + delta));
			const lotsFrozen = frozenFromLots(lots, curYm);
			if (lotsFrozen < frozen - 0.009) frozen = lotsFrozen;
			unlock = currentMonthUnlockFromLots(lots, curYm);
			if (unlock < 0) unlock = 0;
			ev.frozenDelta = roundYuan2(frozen - prevFrozen);
			ev.unlockDelta = roundYuan2(unlock - prevUnlock);
			ev.frozenAfter = frozen;
			ev.unlockAfter = unlock;
			continue;
		}

		if (Number(ev.frozenAdd || 0) > 0) {
			lots.push(...splitDeferredMonths(curYm, ev.frozenAdd));
		}

		frozen = frozenFromLots(lots, curYm);
		ev.frozenDelta = roundYuan2(frozen - prevFrozen);

		if (ev.type === 'month_roll') {
			// 上月已在 expire 行清零；本行只转入当月成熟额
			const matured = roundYuan2(Math.max(0, prevFrozen - frozen));
			unlock = matured;
			ev.unlockDelta = matured;
		} else if (Number(ev.unlockConsume || 0) > 0) {
			const take = roundYuan2(Math.min(Number(ev.unlockConsume || 0), Math.max(0, prevUnlock)));
			unlock = roundYuan2(Math.max(0, prevUnlock - take));
			let need = take;
			for (const lot of lots) {
				if (!(need > 0) || !lot || lot.ym !== curYm || !(lot.amount > 0)) continue;
				const cutAmt = Math.min(lot.amount, need);
				lot.amount = roundYuan2(lot.amount - cutAmt);
				need = roundYuan2(need - cutAmt);
			}
			ev.unlockDelta = roundYuan2(-take);
		} else {
			unlock = currentMonthUnlockFromLots(lots, curYm);
			if (unlock < 0) unlock = 0;
			ev.unlockDelta = roundYuan2(unlock - prevUnlock);
		}

		ev.frozenAfter = frozen;
		ev.unlockAfter = unlock;
	}

	const kept = events.filter((ev) => {
		if (ev.type === 'month_unlock_expire') return Math.abs(Number(ev.unlockDelta || 0)) >= 0.01;
		if (ev.type === 'month_roll') {
			return (
				Math.abs(Number(ev.frozenDelta || 0)) >= 0.01 || Math.abs(Number(ev.unlockDelta || 0)) >= 0.01
			);
		}
		return true;
	});

	let listFrozen = roundYuan2(merchant.frozen_amount);
	if (liveFrozen > 0.009) listFrozen = liveFrozen;
	else if (listFrozenNow > 0.009) listFrozen = listFrozenNow;
	const listPending = roundYuan2(merchant.account_points);
	const listUnlock = liveUnlock > 0.009 ? liveUnlock : roundYuan2(Math.max(0, unlock));

	// 待提现 / 冻结结余倒推对齐商户列表；本月待解锁保持正序回放（避免倒推把领取扣成负数）
	let walkPending = listPending;
	let walkFrozen = listFrozen;
	for (let i = kept.length - 1; i >= 0; i -= 1) {
		const ev = kept[i];
		ev.pendingAfter = walkPending;
		ev.frozenAfter = walkFrozen;
		walkPending = roundYuan2(walkPending - Number(ev.pendingDelta || 0));
		walkFrozen = roundYuan2(walkFrozen - Number(ev.frozenDelta || 0));
	}
	const openingPending = walkPending;
	const openingFrozen = walkFrozen;
	if (Math.abs(openingPending) >= 0.01 || Math.abs(openingFrozen) >= 0.01) {
		const firstTs = kept.length && Number(kept[0].ts) > 0 ? Number(kept[0].ts) : nowTs;
		kept.unshift({
			id: 'opening_align',
			ts: Math.max(0, firstTs - 1),
			type: 'opening_align',
			label: '期初结余',
			title: '对齐商户列表的回放起点（含日志未覆盖的历史变动或口径差）',
			flow: 0,
			pendingDelta: openingPending,
			pendingAfter: openingPending,
			frozenDelta: openingFrozen,
			frozenAfter: openingFrozen,
			unlockDelta: 0,
			unlockAfter: 0,
			sortKey: 'a_opening'
		});
	}

	const hasStart = Number.isFinite(timeStart);
	const hasEnd = Number.isFinite(timeEnd);
	const filtered = kept.filter((ev) => {
		if (hasStart && ev.ts < timeStart) return false;
		if (hasEnd && ev.ts > timeEnd) return false;
		return true;
	});
	filtered.reverse();

	const total = filtered.length;
	const skip = (page - 1) * pageSize;
	const pageRows = filtered.slice(skip, skip + pageSize).map((ev) => mapBalanceLogRow(ev, merchant));

	return {
		code: 0,
		message: 'ok',
		data: {
			list: pageRows,
			total,
			page,
			pageSize,
			merchant: {
				user_id: String(merchant.user_id || merchant._id || ''),
				wx_nickname: String(merchant.wx_nickname || '').trim() || '-',
				mobile: String(merchant.mobile || '').trim() || '-',
				device_id: String(merchant.device_id || '').trim() || '-',
				list_pending: listPending,
				list_frozen: listFrozen,
				list_unlock: listUnlock,
				list_pending_text: listPending.toFixed(2),
				list_frozen_text: listFrozen.toFixed(2),
				list_unlock_text: listUnlock.toFixed(2)
			},
			reconstructedPending: listPending,
			reconstructedFrozen: listFrozen,
			reconstructedUnlock: listUnlock,
			openingPending,
			openingFrozen
		}
	};
}

function subsidyKindLabel(k) {
	const map = {
		trade_first: '流水首期补贴',
		recharge_vesting: '充值用户分期',
		non_recharge_lump: '非充值5万档',
		non_recharge_extra: '非充值每满1万',
		coupon_reward: '优惠券达标奖励',
		release_pool_history: '历史池分期返还'
	};
	const key = safeText(k, 48);
	return map[key] || key || '-';
}

function displayStatus(row, nowTs) {
	if (row.status === 'claimed') return { key: 'claimed', label: '已领取' };
	if (row.status === 'expired') return { key: 'expired', label: '过期未领取' };
	if (row.status === 'pending') {
		if (row.expire_time && row.expire_time < nowTs) return { key: 'expired', label: '过期未领取' };
		if (!Number(row.claim_open_time || 0)) return { key: 'pending_locked', label: '待开放' };
		if (row.claim_open_time > nowTs) return { key: 'pending_locked', label: '未到领取时间' };
		if (Number(row.amount || 0) < 0.01) return { key: 'empty', label: '无效金额' };
		return { key: 'pending_ready', label: '待领取' };
	}
	return { key: 'other', label: row.status || '-' };
}

async function opsIncomePacketsList(data = {}) {
	const page = Math.max(1, Number(data.page) || 1);
	// 与 uniCloud 单次 get 上限一致；须与前端 uni-pagination 可选条数对齐，避免 UI 按 500 算页、服务端仍按 100 查
	const pageSize = Math.min(1000, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const statusFilter = safeText(data.statusFilter, 28) || 'all';
	const subsidyKindFilter = safeText(data.subsidyKindFilter, 48);
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;
	const now = Date.now();

	const whereParts = [_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }])];

	const tr = buildTimeRangeWhere('create_time', timeStart, timeEnd);
	if (tr) whereParts.push(tr);

	if (keyword) {
		const r = new RegExp(escapeReg(keyword), 'i');
		const orParts = [
			{ merchant_user_id: r },
			{ title: r },
			{ month_no: r },
			{ subsidy_kind: r },
			{ dedup_key: r },
			{ coupon_instance_id: keyword.length >= 10 ? keyword : r }
		];
		if (keyword.length >= 16) {
			orParts.push({ _id: keyword });
		}
		whereParts.push(_.or(orParts));
	}

	if (subsidyKindFilter) {
		whereParts.push({ subsidy_kind: subsidyKindFilter });
	}

	if (statusFilter === 'claimed') {
		whereParts.push({ status: 'claimed' });
	} else if (statusFilter === 'expired') {
		whereParts.push({ status: 'expired' });
	} else if (statusFilter === 'pending_ready') {
		whereParts.push({ status: 'pending' });
		whereParts.push({ claim_open_time: _.lte(now) });
		whereParts.push({ claim_open_time: _.gt(0) });
		whereParts.push(_.or([{ expire_time: _.exists(false) }, { expire_time: null }, { expire_time: _.gte(now) }]));
		whereParts.push({ amount: _.gte(0.01) });
	} else if (statusFilter === 'pending_locked') {
		whereParts.push({ status: 'pending' });
		whereParts.push(
			_.or([
				{ claim_open_time: _.gt(now) },
				{ claim_open_time: _.lte(0) },
				{ claim_open_time: _.exists(false) }
			])
		);
	} else if (statusFilter === 'pending') {
		whereParts.push({ status: 'pending' });
	}

	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	let total = 0;
	try {
		const countRes = await incomePacketCollection.where(where).count();
		total = countRes.total || 0;
	} catch (e) {
		console.error('opsIncomePacketsList count', e);
	}

	const skip = (page - 1) * pageSize;
	let rows = [];
	try {
		const listRes = await incomePacketCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(pageSize)
			.get();
		rows = listRes.data || [];
	} catch (e) {
		console.error('opsIncomePacketsList get', e);
		return { code: 500, message: e.message || '查询失败' };
	}

	const userIds = [...new Set(rows.map((x) => String(x.merchant_user_id || '')).filter(Boolean))];
	const merchantMap = new Map();
	if (userIds.length) {
		try {
			const mr = await merchantCollection
				.where({ user_id: _.in(userIds) })
				.field({ user_id: true, wx_nickname: true, mobile: true })
				.get();
			(mr.data || []).forEach((m) => {
				merchantMap.set(String(m.user_id || ''), m);
			});
		} catch (e) {
			console.error('opsIncomePacketsList merchants', e);
		}
	}

	const list = rows.map((row) => {
		const mid = String(row.merchant_user_id || '');
		const m = merchantMap.get(mid) || {};
		const st = displayStatus(row, now);
		const frozen = futureDeferredFrozenYuan(row);
		return {
			_id: row._id,
			merchant_user_id: mid,
			merchant_name: String(m.wx_nickname || '').trim() || '-',
			merchant_mobile: String(m.mobile || '').trim() || '-',
			title: row.title || '-',
			amount: Number(row.amount || 0),
			amountText: Number(row.amount || 0).toFixed(2),
			frozenAmount: frozen,
			frozenAmountText: frozen == null ? '-' : Number(frozen).toFixed(2),
			month_no: row.month_no || '-',
			subsidy_kind: row.subsidy_kind || '',
			subsidy_kind_label: subsidyKindLabel(row.subsidy_kind),
			status: row.status,
			display_status: st.label,
			display_status_key: st.key,
			claim_open_time: row.claim_open_time || null,
			expire_time: row.expire_time || null,
			claimed_time: row.claimed_time || null,
			create_time: row.create_time || null,
			coupon_instance_id: row.coupon_instance_id || '',
			subsidy_flow_month: row.subsidy_flow_month || '',
			installment_index: row.installment_index != null ? row.installment_index : ''
		};
	});

	return {
		code: 0,
		message: 'ok',
		data: { list, total, page, pageSize, statusFilter, subsidyKindFilter }
	};
}

function upgradeKindLabel(kind) {
	const map = {
		exchange_code_silver: '兑换码→白银',
		paid_recharge: '付费→充值会员'
	};
	return map[String(kind || '')] || String(kind || '-');
}

async function opsMemberUpgradeClearLogsList(data = {}) {
	const page = Math.max(1, Number(data.page) || 1);
	const pageSize = Math.min(1000, Math.max(1, Number(data.pageSize) || 20));
	const keyword = safeText(data.keyword, 100);
	const timeStart = data.timeStart;
	const timeEnd = data.timeEnd;

	const whereParts = [{ action: MEMBER_UPGRADE_POINTS_CLEAR_ACTION }];
	const tr = buildTimeRangeWhere('create_time', timeStart, timeEnd);
	if (tr) whereParts.push(tr);
	if (keyword) {
		const r = new RegExp(escapeReg(keyword), 'i');
		whereParts.push(
			_.or([
				{ user_id: r },
				{ user_name: r },
				{ target_id: r },
				{ target_name: r },
				{ content: r },
				{ target_membership_name: r },
				{ platform_no: r }
			])
		);
	}
	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);

	let total = 0;
	try {
		const countRes = await operationLogCollection.where(where).count();
		total = countRes.total || 0;
	} catch (e) {
		console.error('opsMemberUpgradeClearLogsList count', e);
	}

	const skip = (page - 1) * pageSize;
	let rows = [];
	try {
		const listRes = await operationLogCollection
			.where(where)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(pageSize)
			.get();
		rows = listRes.data || [];
	} catch (e) {
		console.error('opsMemberUpgradeClearLogsList get', e);
		return { code: 500, message: e.message || '查询失败' };
	}

	const userIds = [...new Set(rows.map((x) => String(x.user_id || '')).filter(Boolean))];
	const merchantMap = new Map();
	if (userIds.length) {
		try {
			const mr = await merchantCollection
				.where({ user_id: _.in(userIds) })
				.field({ user_id: true, wx_nickname: true, mobile: true })
				.get();
			(mr.data || []).forEach((m) => {
				merchantMap.set(String(m.user_id || ''), m);
			});
		} catch (e) {
			console.error('opsMemberUpgradeClearLogsList merchants', e);
		}
	}

	const list = rows.map((row) => {
		const mid = String(row.user_id || '');
		const m = merchantMap.get(mid) || {};
		const clearedAp = Number(row.cleared_account_points != null ? row.cleared_account_points : 0);
		const clearedFrozen = Number(row.cleared_frozen_amount != null ? row.cleared_frozen_amount : 0);
		return {
			_id: row._id,
			merchant_user_id: mid,
			merchant_name: String(m.wx_nickname || row.user_name || '').trim() || '-',
			merchant_mobile: String(m.mobile || '').trim() || '-',
			upgrade_kind: row.upgrade_kind || '',
			upgrade_kind_label: upgradeKindLabel(row.upgrade_kind),
			target_membership_name: row.target_membership_name || '-',
			cleared_account_points: clearedAp,
			cleared_account_points_text: clearedAp.toFixed(2),
			cleared_frozen_amount: clearedFrozen,
			cleared_frozen_amount_text: clearedFrozen.toFixed(2),
			platform_no: row.platform_no || '',
			content: row.content || '',
			operator_source: row.operator_source || '',
			create_time: row.create_time || null
		};
	});

	return {
		code: 0,
		message: 'ok',
		data: { list, total, page, pageSize }
	};
}

async function opsIncomePacketDetail(data = {}) {
	const id = safeText(data.id, 80);
	if (!id) return { code: 400, message: '缺少 id' };
	try {
		const r = await incomePacketCollection.doc(id).get();
		const row = r.data && r.data[0];
		if (!row) return { code: 404, message: '记录不存在' };
		let merchant = null;
		const uid = String(row.merchant_user_id || '');
		if (uid) {
			const mr = await merchantCollection.where({ user_id: uid }).limit(1).get();
			merchant = (mr.data && mr.data[0]) || null;
		}
		const now = Date.now();
		const st = displayStatus(row, now);
		return {
			code: 0,
			message: 'ok',
			data: {
				row,
				merchant: merchant
					? {
							user_id: merchant.user_id,
							wx_nickname: merchant.wx_nickname,
							mobile: merchant.mobile
					  }
					: null,
				display_status: st.label,
				display_status_key: st.key,
				subsidy_kind_label: subsidyKindLabel(row.subsidy_kind),
				frozenAmount: futureDeferredFrozenYuan(row)
			}
		};
	} catch (e) {
		console.error('opsIncomePacketDetail', e);
		return { code: 500, message: e.message || '加载失败' };
	}
}

/**
 * 分批扫描红包（单次只拉一页，避免云函数超时）。
 * 浏览器循环调用并在本地按 dedup_key 汇总；同键 ≥2 条视为重复。
 *
 * 也可 resolveMerchantsOnly=true + userIds：仅解析商户昵称。
 * includeAllStatus=true：不限 claimed（清理列表重复时用）。
 */
async function opsIncomeClaimedDedupDuplicatesScan(data = {}) {
	if (data.resolveMerchantsOnly) {
		const rawIds = Array.isArray(data.userIds) ? data.userIds : [];
		const userIds = [...new Set(rawIds.map((x) => safeText(x, 80)).filter(Boolean))].slice(0, 500);
		const merchants = {};
		for (let i = 0; i < userIds.length; i += 100) {
			const chunk = userIds.slice(i, i + 100);
			try {
				const mr = await merchantCollection
					.where({ user_id: _.in(chunk) })
					.field({ user_id: true, wx_nickname: true, mobile: true })
					.get();
				(mr.data || []).forEach((m) => {
					const uid = String(m.user_id || '');
					if (!uid) return;
					merchants[uid] = {
						merchant_name: String(m.wx_nickname || '').trim() || '-',
						merchant_mobile: String(m.mobile || '').trim() || '-'
					};
				});
			} catch (e) {
				console.error('opsIncomeClaimedDedupDuplicatesScan resolveMerchants', e);
			}
		}
		return { code: 0, message: 'ok', data: { merchants } };
	}

	const pageSize = Math.min(500, Math.max(50, Number(data.pageSize) || 300));
	const cursorId = safeText(data.cursorId, 80);
	const merchantUserId = safeText(data.merchantUserId, 80);
	const subsidyKindFilter = safeText(data.subsidyKindFilter, 48);
	const includeAllStatus = data.includeAllStatus === true;

	const whereParts = [
		_.or([{ is_deleted: false }, { is_deleted: _.exists(false) }]),
		{ dedup_key: _.exists(true) },
		{ dedup_key: _.neq('') }
	];
	if (!includeAllStatus) {
		whereParts.unshift({ status: 'claimed' });
	}
	if (merchantUserId) whereParts.push({ merchant_user_id: merchantUserId });
	if (subsidyKindFilter) whereParts.push({ subsidy_kind: subsidyKindFilter });
	const tr = buildTimeRangeWhere(
		includeAllStatus ? 'create_time' : 'claimed_time',
		includeAllStatus ? data.timeStart : data.claimedTimeStart,
		includeAllStatus ? data.timeEnd : data.claimedTimeEnd
	);
	if (tr) whereParts.push(tr);
	const where = whereParts.length === 1 ? whereParts[0] : _.and(whereParts);
	const pageWhere = cursorId ? _.and([where, { _id: _.gt(cursorId) }]) : where;

	let rows = [];
	try {
		const listRes = await incomePacketCollection
			.where(pageWhere)
			.field({
				_id: true,
				merchant_user_id: true,
				dedup_key: true,
				title: true,
				amount: true,
				status: true,
				subsidy_kind: true,
				month_no: true,
				create_time: true,
				claimed_time: true
			})
			.orderBy('_id', 'asc')
			.limit(pageSize)
			.get();
		rows = listRes.data || [];
	} catch (e) {
		console.error('opsIncomeClaimedDedupDuplicatesScan page', e);
		return { code: 500, message: e.message || '扫描失败' };
	}

	const nextCursor = rows.length ? String(rows[rows.length - 1]._id || '') : '';
	const done = rows.length < pageSize;
	return {
		code: 0,
		message: 'ok',
		data: {
			rows: rows.map((r) => ({
				_id: r._id,
				merchant_user_id: String(r.merchant_user_id || ''),
				dedup_key: String(r.dedup_key || '').trim(),
				title: r.title || '',
				amount: Number(Number(r.amount || 0).toFixed(4)),
				status: r.status || '',
				subsidy_kind: r.subsidy_kind || '',
				subsidy_kind_label: subsidyKindLabel(r.subsidy_kind),
				month_no: r.month_no || '',
				create_time: r.create_time || null,
				claimed_time: r.claimed_time || null
			})),
			pageSize,
			scanned: rows.length,
			nextCursor,
			done,
			includeAllStatus
		}
	};
}

/**
 * 软删除指定重复红包（不回扣商户积分）。
 * 单次最多 20 条；并行 update，避免超时。
 * 会改写 dedup_key，避免与正本冲突，便于后续建唯一索引。
 */
async function opsIncomeDedupDuplicatesCleanup(data = {}) {
	const apply = data.apply === true || data.dryRun === false;
	const dryRun = !apply;
	const rawIds = Array.isArray(data.packetIds) ? data.packetIds : [];
	const packetIds = [...new Set(rawIds.map((x) => safeText(x, 80)).filter(Boolean))].slice(0, 20);
	if (!packetIds.length) {
		return { code: 400, message: '缺少 packetIds' };
	}

	const now = Date.now();
	const samples = [];
	let updated = 0;
	let skipped = 0;
	const failedIds = [];

	// 一次查出本批，减少往返
	let rowMap = new Map();
	try {
		const got = await incomePacketCollection
			.where({ _id: _.in(packetIds) })
			.field({
				_id: true,
				merchant_user_id: true,
				title: true,
				amount: true,
				status: true,
				dedup_key: true,
				is_deleted: true
			})
			.limit(packetIds.length)
			.get();
		(got.data || []).forEach((row) => {
			rowMap.set(String(row._id), row);
		});
	} catch (e) {
		console.error('opsIncomeDedupDuplicatesCleanup batch get', e);
		return { code: 500, message: e.message || '查询失败' };
	}

	const toUpdate = [];
	for (const id of packetIds) {
		const row = rowMap.get(id);
		if (!row || row.is_deleted === true) {
			skipped += 1;
			continue;
		}
		const oldDk = String(row.dedup_key || '').trim();
		if (samples.length < 20) {
			samples.push({
				_id: id,
				merchant_user_id: row.merchant_user_id || '',
				title: row.title || '',
				amount: Number(row.amount || 0),
				status: row.status || '',
				dedup_key: oldDk
			});
		}
		toUpdate.push({ id, oldDk });
	}

	if (dryRun) {
		return {
			code: 0,
			message: 'dryRun ok',
			data: {
				dryRun: true,
				requested: packetIds.length,
				updated: toUpdate.length,
				skipped,
				failedIds: [],
				samples
			}
		};
	}

	const results = await Promise.all(
		toUpdate.map(async ({ id, oldDk }) => {
			try {
				await incomePacketCollection.doc(id).update({
					is_deleted: true,
					update_time: now,
					dedup_key: `cleared_dup_${id}`,
					dedup_key_cleared_from: oldDk || '',
					cleanup_reason: 'dedup_duplicate'
				});
				return { id, ok: true };
			} catch (e) {
				console.error('opsIncomeDedupDuplicatesCleanup update', id, e);
				return { id, ok: false };
			}
		})
	);

	for (const r of results) {
		if (r.ok) updated += 1;
		else {
			skipped += 1;
			failedIds.push(r.id);
		}
	}

	return {
		code: 0,
		message: 'ok',
		data: {
			dryRun: false,
			requested: packetIds.length,
			updated,
			skipped,
			failedIds,
			samples
		}
	};
}

exports.main = async (event) => {
	const { action, params, data } = event || {};
	const actualData = data || params || {};
	switch (action) {
		case 'opsIncomePacketsList':
			return await opsIncomePacketsList(actualData);
		case 'opsIncomePacketDetail':
			return await opsIncomePacketDetail(actualData);
		case 'opsMemberUpgradeClearLogsList':
			return await opsMemberUpgradeClearLogsList(actualData);
		case 'opsPointsBalanceLog':
			return await opsPointsBalanceLog(actualData);
		case 'opsIncomeClaimedDedupDuplicatesScan':
			return await opsIncomeClaimedDedupDuplicatesScan(actualData);
		case 'opsIncomeDedupDuplicatesCleanup':
			return await opsIncomeDedupDuplicatesCleanup(actualData);
		default:
			return { code: 400, message: '无效操作' };
	}
};
