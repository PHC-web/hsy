'use strict';

/**
 * 国通星驿第三方数据推送接收
 * 需将本云函数配置为「URL化」后，提供给第三方对接。
 * 接口路径：POST {云函数URL}/TYY0001.ag | /TYY0002.ag | /TYY0003.ag | /TYY0004.ag
 */

const db = uniCloud.database();
const tradesCol = db.collection('opendb-push-trades');
const merchantsCol = db.collection('opendb-push-merchants');
const terminalsCol = db.collection('opendb-push-terminals');
const commfeesCol = db.collection('opendb-push-commfees');
const logsCol = db.collection('opendb-push-logs');

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
		return { body: failRes('缺少reqdatajson或logno'), statusCode: 200 };
	}
	const d = reqdatajson;
	const now = Date.now();
	const doc = {
		firstagentid: firstagentid || '',
		receive_time: now,
		logno: d.logno,
		ologno: d.ologno,
		mercid: d.mercid,
		termphyno: d.termphyno,
		policyid: d.policyid,
		ustldat: d.ustldat,
		orderdat: d.orderdat,
		ordertime: d.ordertime,
		agentid: d.agentid,
		paychannel: d.paychannel,
		txnamt: d.txnamt,
		ysfee: d.ysfee,
		ssfee: d.ssfee,
		refund: d.refund,
		discount_flag: d.discount_flag,
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
		raw: body
	};
	try {
		const addRes = await tradesCol.add(doc);
		await writeLog('TYY0001', true, addRes.id, firstagentid, `流水号:${d.logno} 商户:${d.mercid} 金额:${d.txnamt}`);
		return { body: successRes(), statusCode: 200 };
	} catch (e) {
		console.error('TYY0001 入库失败:', e);
		await writeLog('TYY0001', false, '', firstagentid, `logno:${d.logno}`, e.message);
		return { body: failRes(e.message || '入库失败'), statusCode: 200 };
	}
}

/**
 * TYY0002.ag 商户信息推送
 */
async function handleTYY0002(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || !reqdatajson.mercid) {
		return { body: failRes('缺少reqdatajson或mercid'), statusCode: 200 };
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
		return { body: successRes(), statusCode: 200 };
	} catch (e) {
		console.error('TYY0002 入库失败:', e);
		await writeLog('TYY0002', false, '', firstagentid, `mercid:${d.mercid}`, e.message);
		return { body: failRes(e.message || '入库失败'), statusCode: 200 };
	}
}

/**
 * TYY0003.ag 终端信息推送(绑定/解绑)
 */
async function handleTYY0003(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || !reqdatajson.termno || !reqdatajson.termphyno) {
		return { body: failRes('缺少reqdatajson或termno/termphyno'), statusCode: 200 };
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
		allinone: d.allinone,
		spno: d.spno,
		merexttime: d.merexttime,
		raw: body
	};
	try {
		const addRes = await terminalsCol.add(doc);
		const action = d.mercid ? '绑定' : '解绑';
		await writeLog('TYY0003', true, addRes.id, firstagentid, `终端:${d.termphyno} ${action} 商户:${d.mercid || '-'}`);
		return { body: successRes(), statusCode: 200 };
	} catch (e) {
		console.error('TYY0003 入库失败:', e);
		await writeLog('TYY0003', false, '', firstagentid, `termphyno:${d.termphyno}`, e.message);
		return { body: failRes(e.message || '入库失败'), statusCode: 200 };
	}
}

/**
 * TYY0004.ag 通讯费缴费成功推送
 */
async function handleTYY0004(body) {
	const { firstagentid, timestamp, reqdatajson } = body || {};
	if (!reqdatajson || reqdatajson.id === undefined) {
		return { body: failRes('缺少reqdatajson或id'), statusCode: 200 };
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
		return { body: successRes(), statusCode: 200 };
	} catch (e) {
		console.error('TYY0004 入库失败:', e);
		await writeLog('TYY0004', false, '', firstagentid, `id:${d.id}`, e.message);
		return { body: failRes(e.message || '入库失败'), statusCode: 200 };
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
			return { body: failRes('请求体非合法JSON'), statusCode: 200 };
		}
	}
	if (!body || typeof body !== 'object') {
		body = {};
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

	return {
		body: failRes('未知推送类型，路径需为 /TYY0001.ag | /TYY0002.ag | /TYY0003.ag | /TYY0004.ag', '404'),
		statusCode: 200
	};
};
