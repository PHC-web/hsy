'use strict';
const { sm3 } = require('sm-crypto');

/**
 * 国通星驿第三方数据推送接收
 * 需将本云函数配置为「URL化」后，提供给第三方对接。
 * 接口路径：POST {云函数URL}/TYY0001.ag | /TYY0002.ag | /TYY0003.ag | /TYY0004.ag
 */

const db = uniCloud.database();
const tradesCol = db.collection('hsy-push-trades');
const merchantsCol = db.collection('hsy-push-merchants');
const terminalsCol = db.collection('hsy-push-terminals');
const commfeesCol = db.collection('hsy-push-commfees');
const logsCol = db.collection('hsy-push-logs');
const machineCol = db.collection('hsy-machine');
const machineTradesCol = db.collection('hsy-machine-trades');
const brandCol = db.collection('hsy-brand');
const systemSettingCol = db.collection('hsy-system-settings');

const SUCCESS_CODE = '00000';
const NOW_TS = () => String(Math.floor(Date.now() / 1000));

function successRes() {
	return {
		errorcode: SUCCESS_CODE,
		errormsg: '推送成功',
		timestamp: NOW_TS()
	};
}

function failRes(errormsg, errorcode = '10001') {
	return {
		errorcode,
		errormsg: errormsg || '推送处理失败',
		timestamp: NOW_TS()
	};
}

function sm3Hex(s) {
	return sm3(String(s || ''));
}

function buildApiSignSource(body) {
	return `firstagentid=${String(body?.firstagentid || '')}&sign=${String(body?.sign || '')}&timestamp=${String(body?.timestamp || '')}`;
}

function verifyEnvelope(body) {
	if (!body || typeof body !== 'object') return { ok: false, msg: '请求体为空' };
	if (!body.firstagentid) return { ok: false, msg: '缺少firstagentid' };
	if (!body.timestamp && body.timestamp !== 0) return { ok: false, msg: '缺少timestamp' };
	if (!body.sign) return { ok: false, msg: '缺少sign' };
	if (!body.apisign) return { ok: false, msg: '缺少apisign' };
	if (!body.reqdatajson || typeof body.reqdatajson !== 'object') return { ok: false, msg: '缺少reqdatajson' };

	// 按第三方文档算法：SM3("firstagentid=...&sign=...&timestamp=...")
	const source = buildApiSignSource(body);
	const calc = sm3Hex(source);
	if (String(calc).toLowerCase() !== String(body.apisign || '').toLowerCase()) {
		return { ok: false, msg: 'apisign验签失败' };
	}
	return { ok: true };
}

/** TYY0001 paychannel 枚举（星驿） */
const PAYCHANNEL_TEXT = {
	'00': '未知',
	'01': '支付宝',
	'02': '微信',
	'03': '银联优惠',
	'04': '银联未优惠',
	'05': '标准借记卡',
	'06': '标准贷记卡',
	'11': '冻结款(押金)',
	'12': '数币',
	'31': '京东白条'
};

/** TYY0001 discount_flag 补贴类型 */
const DISCOUNT_FLAG_TEXT = {
	'0': '无补贴',
	'1': '邮政补贴',
	'2': '公司补贴',
	'11': '落地机构补贴'
};

/** TYY0001 sffd 手续费是否封顶：1是/0否 */
const SFFD_TEXT = {
	'0': '否',
	'1': '是'
};

function normalizeEnumKey(v) {
	return String(v == null ? '' : v).trim();
}

function mapPaychannelText(v) {
	const k = normalizeEnumKey(v);
	if (!k) return '';
	if (PAYCHANNEL_TEXT[k]) return PAYCHANNEL_TEXT[k];
	const padded = k.length === 1 ? `0${k}` : k;
	if (PAYCHANNEL_TEXT[padded]) return PAYCHANNEL_TEXT[padded];
	return `未知(${k})，联系星驿支付排查`;
}

function normalizePaychannelCode(raw) {
	const s = normalizeEnumKey(raw);
	if (!s) return '';
	return s.length === 1 ? `0${s}` : s;
}

const DEFAULT_OPTIMIZE_CONFIG = { enabled: true, thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 1 };
const DEFAULT_RISK_RATES = { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 };
let bizConfigCache = null;
let bizConfigCacheAt = 0;

async function getBizConfig() {
	const now = Date.now();
	if (bizConfigCache && now - bizConfigCacheAt < 60000) return bizConfigCache;
	try {
		const r = await systemSettingCol.where({ key: 'h5_biz_params' }).limit(1).get();
		const v = (r.data && r.data[0] && r.data[0].value) || {};
		bizConfigCache = {
			optimizeConfig: Object.assign({}, DEFAULT_OPTIMIZE_CONFIG, v.optimizeConfig || {}),
			riskRates: Object.assign({}, DEFAULT_RISK_RATES, v.riskRates || {})
		};
		bizConfigCacheAt = now;
		return bizConfigCache;
	} catch (e) {
		console.error('getBizConfig failed', e);
		return { optimizeConfig: DEFAULT_OPTIMIZE_CONFIG, riskRates: DEFAULT_RISK_RATES };
	}
}

function riskAuditFromPaychannel(paychannelRaw, riskRates = DEFAULT_RISK_RATES) {
	const code = normalizePaychannelCode(paychannelRaw);
	const rate = Math.max(0, Math.min(100, Number(riskRates[code] != null ? riskRates[code] : 0)));
	if (Math.random() * 100 < rate) {
		return { is_risk: true, risk_audit_status: 'pending' };
	}
	return { is_risk: false, risk_audit_status: 'none' };
}

function mapDiscountFlagText(v) {
	const k = normalizeEnumKey(v);
	if (!k) return '';
	return DISCOUNT_FLAG_TEXT[k] || `未知(${k})`;
}

function mapSffdText(v) {
	const k = normalizeEnumKey(v);
	if (k === '') return '';
	if (SFFD_TEXT[k]) return SFFD_TEXT[k];
	return `未知(${k})`;
}

/** TYY0002 status：0 开通，其余(如1、2)关停 */
function mapMerchantStatusText(v) {
	const k = normalizeEnumKey(v);
	if (k === '') return '';
	return k === '0' ? '开通' : '关停';
}

const EQUIPTYPE_TEXT = {
	'1': '码牌',
	'2': 'POS',
	'3': '音箱'
};

/** TYY0003 equiptype */
function mapEquiptypeText(v) {
	const k = normalizeEnumKey(v);
	if (!k) return '';
	return EQUIPTYPE_TEXT[k] || `未知(${k})`;
}

/** TYY0003 allinone：1 是，其他否 */
function mapAllinoneText(v) {
	const k = normalizeEnumKey(v);
	if (k === '') return '';
	return k === '1' ? '是' : '否';
}

/** 星驿同步机具默认品牌（取库中第一条未删品牌，无则兜底） */
let cachedDefaultBrand = null;
async function getDefaultBrandForPush() {
	if (cachedDefaultBrand) return cachedDefaultBrand;
	try {
		const r = await brandCol.where({ is_deleted: false }).limit(1).get();
		if (r.data && r.data.length) {
			cachedDefaultBrand = {
				brand_id: r.data[0].brand_id,
				brand_name: r.data[0].brand_name || ''
			};
			return cachedDefaultBrand;
		}
	} catch (e) {
		console.error('getDefaultBrandForPush', e);
	}
	cachedDefaultBrand = { brand_id: 'xingyifu', brand_name: '星驿付' };
	return cachedDefaultBrand;
}

async function tryActivateMachineByTotal(machine, newTotal, now) {
	if (!machine || machine.is_activated) return !!(machine && machine.is_activated);
	const brandId = normalizeEnumKey(machine.brand_id);
	const brandName = normalizeEnumKey(machine.brand_name);
	let brand = null;
	if (brandId) {
		const br = await brandCol
			.where(
				db.command.and([
					{ brand_id: brandId },
					db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])
				])
			)
			.limit(1)
			.get();
		brand = br.data && br.data[0];
	}
	if (!brand && brandName) {
		const byName = await brandCol
			.where(
				db.command.and([
					{ brand_name: brandName },
					db.command.or([{ is_deleted: false }, { is_deleted: db.command.exists(false) }])
				])
			)
			.limit(1)
			.get();
		brand = byName.data && byName.data[0];
	}
	if (!brand) return !!machine.is_activated;
	const cond = Number(brand.activation_condition || 0);
	if (!(Number.isFinite(cond) && cond > 0)) return !!machine.is_activated;
	if (Number(newTotal || 0) + 1e-8 < cond) return false;
	await machineCol.where({ device_id: machine.device_id, is_deleted: false }).update({
		is_activated: true,
		activated_time: now
	});
	return true;
}

/** 解析交易时间：orderdat yyyyMMdd + ordertime HHmmss */
function parseXingyiOrderTime(orderdat, ordertime, fallbackTs) {
	const od = String(orderdat || '').trim();
	const ot = String(ordertime || '').trim();
	if (od.length === 8 && ot.length >= 6) {
		const y = od.slice(0, 4);
		const m = od.slice(4, 6);
		const day = od.slice(6, 8);
		const h = ot.slice(0, 2);
		const mi = ot.slice(2, 4);
		const s = ot.slice(4, 6);
		const t = new Date(`${y}-${m}-${day}T${h}:${mi}:${s}+08:00`).getTime();
		if (Number.isFinite(t)) return t;
	}
	return fallbackTs;
}

function parseXingyiAmount(txnamt) {
	const n = Number(String(txnamt == null ? '' : txnamt).replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

/**
 * 机具编号 termphyno 与后台 hsy-machine.device_id 一致且未删除则视为在库
 */
async function isMachineInSystem(termphyno) {
	const id = normalizeEnumKey(termphyno);
	if (!id) return false;
	const r = await machineCol.where({ device_id: id, is_deleted: false }).limit(1).get();
	return (r.data && r.data.length > 0) || false;
}

/**
 * 星驿流水写入刷卡记录表：仅机具在库时写入；同一 logno 不重复写入
 */
async function maybeAddXingyiMachineTrade(termphyno, d, receiveTs) {
	const deviceId = normalizeEnumKey(termphyno);
	if (!deviceId) return;

	const dup = await machineTradesCol.where({ device_id: deviceId, trade_no: String(d.logno) }).count();
	if (dup.total > 0) return;

	const mRes = await machineCol.where({ device_id: deviceId, is_deleted: false }).limit(1).get();
	if (!mRes.data || !mRes.data.length) return;
	const machine = mRes.data[0];

	let amount = parseXingyiAmount(d.txnamt);
	if (normalizeEnumKey(d.refund) === '1') {
		amount = amount > 0 ? -amount : amount;
	}

	const createTime = parseXingyiOrderTime(d.orderdat, d.ordertime, receiveTs);
	const bound = machine.is_bound === 1 && machine.bind_user_id;
	// 未绑定商户机具的流水不写入刷卡记录表，避免进入后台刷卡记录统计口径。
	if (!bound) return;
	const newTotal = Number((Number(machine.total_transaction || 0) + amount).toFixed(2));
	const pch = normalizePaychannelCode(d.paychannel);
	const pchText = mapPaychannelText(d.paychannel);
	const bizCfg = await getBizConfig();
	const risk = riskAuditFromPaychannel(d.paychannel, bizCfg.riskRates || DEFAULT_RISK_RATES);
	const cashback = amount > 0 ? Number((amount * 0.0038).toFixed(4)) : 0;
	const optimize = bizCfg.optimizeConfig || DEFAULT_OPTIMIZE_CONFIG;
	const thresholdYuan = Math.max(0, Number(optimize.thresholdYuan || 300));
	const aboveInstallments = Math.max(1, Number(optimize.aboveInstallments || 5));
	const belowInstallments = Math.max(1, Number(optimize.belowInstallments || 1));
	// 业务口径：
	// - 300元以下（含300）：首期100%，不分5期
	// - 300元以上：首期20%，按5期口径
	const installments = amount > thresholdYuan ? aboveInstallments : belowInstallments;
	const releaseAmount = amount > 0 ? Number((cashback / installments).toFixed(4)) : 0;
	const activated = await tryActivateMachineByTotal(machine, newTotal, createTime);

	await machineTradesCol.add({
		device_id: deviceId,
		trade_no: String(d.logno),
		user_id: bound ? machine.bind_user_id : '',
		user_name: bound ? (machine.bind_user_name || '') : '',
		user_mobile: bound ? (machine.bind_user_mobile || '') : '',
		trade_type: 'real',
		trade_source: 'xingyi',
		paychannel: pch || '',
		paychannel_text: pchText,
		is_risk_trade: !!risk.is_risk,
		risk_audit_status: risk.risk_audit_status,
		stats_eligible: !!bound,
		amount,
		is_activated: !!activated,
		total_transaction: newTotal,
		cashback: cashback,
		cashback_time: cashback > 0 ? createTime : null,
		release_amount: releaseAmount,
		release_ratio: Number((100 / installments).toFixed(2)),
		is_deleted: false,
		company: machine.merchant || '管理员',
		risk_control_status: risk.is_risk ? 'risk' : 'no',
		salesman: machine.salesman || '管理员',
		create_time: createTime
	});

	await machineCol.where({ device_id: deviceId, is_deleted: false }).update({
		total_transaction: newTotal,
		frozen_amount: Number((Number(machine.frozen_amount || 0) + cashback).toFixed(4))
	});
	// 商户基础表 frozen_amount 同步累加，供商户列表直接读取
	if (cashback > 0 && machine.bind_user_id && (!risk.is_risk || risk.risk_audit_status === 'approved')) {
		const mRes = await merchantCol.where(
			db.command.or([{ user_id: String(machine.bind_user_id) }, { _id: String(machine.bind_user_id) }])
		).limit(1).get();
		const mer = mRes.data && mRes.data[0];
		if (mer) {
			await merchantCol.doc(mer._id).update({
				frozen_amount: Number((Number(mer.frozen_amount || 0) + cashback).toFixed(4)),
				update_time: createTime
			});
		}
	}
}

/**
 * TYY0003 终端同步到机具管理：无则新增未绑定机具；有则仅更新音箱号等
 */
async function syncPushTerminalToMachine(d, now) {
	const termphyno = normalizeEnumKey(d.termphyno);
	if (!termphyno) return;

	const sp = normalizeEnumKey(d.spno);
	const existing = await machineCol.where({ device_id: termphyno, is_deleted: false }).limit(1).get();

	if (!existing.data || !existing.data.length) {
		const brand = await getDefaultBrandForPush();
		await machineCol.add({
			device_id: termphyno,
			brand_id: brand.brand_id,
			brand_name: brand.brand_name,
			speaker_id: sp,
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
		return;
	}

	if (sp) {
		await machineCol.where({ device_id: termphyno, is_deleted: false }).update({ speaker_id: sp });
	}
}

async function writeLog(pushType, success, dataId, firstagentid, summary, errorMsg) {
	await logsCol.add({
		push_type: pushType,
		receive_time: Date.now(),
		success: !!success,
		data_id: dataId || '',
		firstagentid: firstagentid || '',
		summary: summary || '',
		error_msg: success ? '' : (errorMsg || '')
	});
}

/**
 * TYY0001.ag 成功交易流水推送
 */
async function handleTYY0001(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || !reqdatajson.logno) {
		return failRes('缺少reqdatajson或logno');
	}
	const d = reqdatajson;
	const now = Date.now();
	let machineInSystem = false;
	try {
		machineInSystem = await isMachineInSystem(d.termphyno);
	} catch (e) {
		console.error('TYY0001 机具匹配失败', e);
	}
	const doc = {
		firstagentid: firstagentid || '',
		receive_time: now,
		logno: d.logno,
		ologno: d.ologno,
		mercid: d.mercid,
		termphyno: d.termphyno,
		machine_in_system: machineInSystem,
		policyid: d.policyid,
		ustldat: d.ustldat,
		orderdat: d.orderdat,
		ordertime: d.ordertime,
		agentid: d.agentid,
		paychannel: d.paychannel,
		paychannel_text: mapPaychannelText(d.paychannel),
		txnamt: d.txnamt,
		ysfee: d.ysfee,
		ssfee: d.ssfee,
		refund: d.refund,
		discount_flag: d.discount_flag,
		discount_flag_text: mapDiscountFlagText(d.discount_flag),
		sp_no: d.sp_no,
		txf: d.txf,
		ssfl: d.ssfl,
		wlfwf: d.wlfwf,
		adjustid1: d.adjustid1,
		adjustfee1: d.adjustfee1,
		adjustid2: d.adjustid2,
		adjustfee2: d.adjustfee2,
		adjustid3: d.adjustid3,
		adjustfee3: d.adjustfee3,
		adjustid4: d.adjustid4,
		adjustfee4: d.adjustfee4,
		sffd: d.sffd,
		sffd_text: mapSffdText(d.sffd),
		raw: body
	};
	try {
		const addRes = await tradesCol.add(doc);
		if (machineInSystem) {
			try {
				await maybeAddXingyiMachineTrade(d.termphyno, d, now);
			} catch (e2) {
				console.error('TYY0001 同步刷卡记录失败', e2);
			}
		}
		await writeLog('TYY0001', true, addRes.id, firstagentid, `流水号:${d.logno} 商户:${d.mercid} 金额:${d.txnamt}`);
		return successRes();
	} catch (e) {
		console.error('TYY0001 入库失败:', e);
		await writeLog('TYY0001', false, '', firstagentid, `logno:${d.logno}`, e.message);
		return failRes(e.message || '入库失败');
	}
}

/**
 * TYY0002.ag 商户信息推送
 */
async function handleTYY0002(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || !reqdatajson.mercid) {
		return failRes('缺少reqdatajson或mercid');
	}
	const d = reqdatajson;
	const now = Date.now();
	const doc = {
		firstagentid: firstagentid || '',
		receive_time: now,
		agentid: d.agentid,
		mercid: d.mercid,
		mercname: d.mercname,
		applydat: d.applydat,
		status: d.status,
		status_text: mapMerchantStatusText(d.status),
		reqdata: d.reqdata,
		reqseqid: d.reqseqid,
		mertype: d.mertype,
		provid: d.provid,
		cityid: d.cityid,
		raw: body
	};
	try {
		const addRes = await merchantsCol.add(doc);
		await writeLog('TYY0002', true, addRes.id, firstagentid, `商户号:${d.mercid} 名称:${d.mercname}`);
		return successRes();
	} catch (e) {
		console.error('TYY0002 入库失败:', e);
		await writeLog('TYY0002', false, '', firstagentid, `mercid:${d.mercid}`, e.message);
		return failRes(e.message || '入库失败');
	}
}

/**
 * TYY0003.ag 终端信息推送(绑定/解绑)
 */
async function handleTYY0003(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || !reqdatajson.termno || !reqdatajson.termphyno) {
		return failRes('缺少reqdatajson或termno/termphyno');
	}
	const d = reqdatajson;
	const now = Date.now();
	const doc = {
		firstagentid: firstagentid || '',
		receive_time: now,
		termno: d.termno,
		termphyno: d.termphyno,
		agentid: d.agentid,
		mercid: d.mercid,
		policyid: d.policyid,
		merextdat: d.merextdat,
		equiptype: d.equiptype,
		equiptype_text: mapEquiptypeText(d.equiptype),
		allinone: d.allinone,
		allinone_text: mapAllinoneText(d.allinone),
		spno: d.spno,
		merexttime: d.merexttime,
		raw: body
	};
	try {
		const addRes = await terminalsCol.add(doc);
		try {
			await syncPushTerminalToMachine(d, now);
		} catch (e2) {
			console.error('TYY0003 同步机具管理失败', e2);
		}
		const action = d.mercid ? '绑定' : '解绑';
		await writeLog('TYY0003', true, addRes.id, firstagentid, `终端:${d.termphyno} ${action} 商户:${d.mercid || '-'}`);
		return successRes();
	} catch (e) {
		console.error('TYY0003 入库失败:', e);
		await writeLog('TYY0003', false, '', firstagentid, `termphyno:${d.termphyno}`, e.message);
		return failRes(e.message || '入库失败');
	}
}

/**
 * TYY0004.ag 通讯费缴费成功推送
 */
async function handleTYY0004(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
		const pushId = reqdatajson && reqdatajson.id;
		if (!reqdatajson || pushId === undefined || pushId === null || String(pushId).trim() === '') {
		return failRes('缺少reqdatajson或id');
	}
	const d = reqdatajson;
	const now = Date.now();
	const doc = {
		firstagentid: firstagentid || '',
		receive_time: now,
		push_id: String(d.id),
		mercid: d.mercid,
		policyid: d.policyid,
		feeid: d.feeid,
		feetime: d.feetime,
		receivefee: Number(d.receivefee) || 0,
		agentid: d.agentid,
		sn: d.sn,
		raw: body
	};
	try {
		const addRes = await commfeesCol.add(doc);
		await writeLog('TYY0004', true, addRes.id, firstagentid, `id:${d.id} 商户:${d.mercid} 金额:${d.receivefee}`);
		return successRes();
	} catch (e) {
		console.error('TYY0004 入库失败:', e);
		await writeLog('TYY0004', false, '', firstagentid, `id:${d.id}`, e.message);
		return failRes(e.message || '入库失败');
	}
}

exports.main = async (event, context) => {
	// URL化 时：event 含 body、path、httpInfo 等
	let path = (event.path || event.httpInfo?.path || '').replace(/\?.*$/, '');
	let body = event.body;
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body || '{}');
		} catch (e) {
			return failRes('请求体非合法JSON');
		}
	}
	if (!body || typeof body !== 'object') {
		body = {};
	}
	const verify = verifyEnvelope(body);
	if (!verify.ok) {
		await writeLog('SIGN', false, '', body.firstagentid || '', '验签失败', verify.msg);
		return failRes(verify.msg, '10002');
	}

	// 路径兼容：可能带云函数名前缀，只认末尾
	if (path.endsWith('TYY0001.ag')) {
		return await handleTYY0001(body);
	}
	if (path.endsWith('TYY0002.ag')) {
		return await handleTYY0002(body);
	}
	if (path.endsWith('TYY0003.ag')) {
		return await handleTYY0003(body);
	}
	if (path.endsWith('TYY0004.ag')) {
		return await handleTYY0004(body);
	}

	return failRes('未知推送类型，路径需为 /TYY0001.ag | /TYY0002.ag | /TYY0003.ag | /TYY0004.ag', '404');
};
