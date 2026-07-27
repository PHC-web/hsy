'use strict';

/**
 * 星驿付异步通知收件箱（URL 化）
 * 与 third-party-push（TYY0001～0004）完全独立，勿混用。
 *
 * 基础地址（自定义域名 URL 化）：
 *   https://huishouying.zhifan.work/xingyi-async-notify
 *
 * 路径见同目录《对接地址.md》
 */

const db = uniCloud.database();
const inboxCol = db.collection('hsy-xingyi-async-notifies');

const BODY_RAW_MAX = 200000;
const HEADER_VAL_MAX = 500;

/** path 末段 → 类型与中文名（对应《服务商生产环境需提供的参数》通知配置） */
const NOTIFY_TYPES = {
	trade: '交易异步通知',
	withdraw_realtime: '实时提现异步通知',
	account_balance: '账户余额通知',
	merchant_onboard: '进件异步通知',
	merchant_report: '商户报备信息异步通知',
	terminal_bind: '终端绑定/解绑通知',
	d0_appeal: 'D0申诉异步通知',
	special_biz: '特殊业务异步通知',
	wx_campaign: '微信活动报名结果通知',
	digital_currency: '数币开通/商户状态通知',
	bank_campaign: '银行活动报名结果通知',
	merchant_risk: '商户风险&状态变更异步通知',
	batch_settle: '批次结算到账通知',
	wx_mini_freeze: '微信小程序冻结通知',
	sign_result: '签约结果通知',
	xzy_split: '星账云分账相关异步通知'
};

function nowTs() {
	return Date.now();
}

function safeText(v, max = 300) {
	return String(v == null ? '' : v)
		.trim()
		.slice(0, max);
}

function resolvePath(event) {
	const raw = String(event.path || event.httpInfo?.path || event.pathInfo || '').replace(/\?.*$/, '');
	return raw;
}

function resolveMethod(event) {
	return String(event.httpMethod || event.httpInfo?.method || event.method || 'POST').toUpperCase();
}

function resolveHeaders(event) {
	const h = event.headers || event.httpInfo?.headers || {};
	const out = {};
	if (!h || typeof h !== 'object') return out;
	for (const k of Object.keys(h)) {
		out[safeText(k, 80)] = safeText(h[k], HEADER_VAL_MAX);
	}
	return out;
}

function resolveQuery(event) {
	const q = event.queryStringParameters || event.query || event.httpInfo?.queryStringParameters || {};
	return q && typeof q === 'object' ? q : {};
}

function resolveClientIp(event) {
	const headers = event.headers || event.httpInfo?.headers || {};
	const xff = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
	if (xff) return safeText(String(xff).split(',')[0], 80);
	return safeText(
		event.clientIP ||
			event.clientIp ||
			headers['x-real-ip'] ||
			headers['X-Real-Ip'] ||
			'',
		80
	);
}

function resolveContentType(headers) {
	return safeText(headers['content-type'] || headers['Content-Type'] || '', 120);
}

function parseBody(raw, contentType) {
	if (raw == null) return { body: null, bodyRaw: '' };
	if (typeof raw === 'object' && !Buffer.isBuffer(raw)) {
		return { body: raw, bodyRaw: safeText(JSON.stringify(raw), BODY_RAW_MAX) };
	}
	let text = '';
	if (typeof raw === 'string') text = raw;
	else if (Buffer.isBuffer(raw)) text = raw.toString('utf8');
	else text = String(raw);

	const bodyRaw = text.slice(0, BODY_RAW_MAX);
	const ct = String(contentType || '').toLowerCase();
	const trimmed = text.trim();
	if (!trimmed) return { body: null, bodyRaw };

	if (ct.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			return { body: JSON.parse(trimmed), bodyRaw };
		} catch (e) {
			return { body: null, bodyRaw };
		}
	}

	if (ct.includes('application/x-www-form-urlencoded') || trimmed.includes('=')) {
		const obj = {};
		try {
			const params = new URLSearchParams(trimmed);
			for (const [k, v] of params.entries()) obj[k] = v;
			if (Object.keys(obj).length) return { body: obj, bodyRaw };
		} catch (e) {}
	}

	return { body: { _raw: bodyRaw.slice(0, 2000) }, bodyRaw };
}

function extractNotifyType(path) {
	const parts = String(path || '')
		.split('/')
		.map((x) => x.trim())
		.filter(Boolean);
	if (!parts.length) return '';
	let last = parts[parts.length - 1];
	// 根路径：.../xingyi-async-notify 或 .../http/xingyi-async-notify
	if (last === 'xingyi-async-notify' || last === 'http') return last;
	last = last.replace(/\.ag$/i, '').replace(/\.do$/i, '');
	return last;
}

function successHttp(bodyText = 'SUCCESS') {
	return {
		mpserverlessComposedResponse: true,
		statusCode: 200,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		},
		body: bodyText
	};
}

function jsonHttp(statusCode, obj) {
	return {
		mpserverlessComposedResponse: true,
		statusCode,
		headers: {
			'Content-Type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify(obj)
	};
}

exports.main = async (event = {}) => {
	const path = resolvePath(event);
	const method = resolveMethod(event);
	const headers = resolveHeaders(event);
	const query = resolveQuery(event);
	const contentType = resolveContentType(headers);
	const clientIp = resolveClientIp(event);

	// 健康检查 / 根路径
	const notifyType = extractNotifyType(path);
	if (!notifyType || notifyType === 'xingyi-async-notify' || notifyType === 'http') {
		return jsonHttp(200, {
			ok: true,
			service: 'xingyi-async-notify',
			message: '星驿异步通知收件箱已就绪；请 POST 到具体子路径，见对接地址.md',
			types: Object.keys(NOTIFY_TYPES)
		});
	}

	if (!NOTIFY_TYPES[notifyType]) {
		return jsonHttp(404, {
			ok: false,
			message: `未知通知类型: ${notifyType}`,
			types: Object.keys(NOTIFY_TYPES)
		});
	}

	const { body, bodyRaw } = parseBody(event.body, contentType);
	const doc = {
		notify_type: notifyType,
		notify_label: NOTIFY_TYPES[notifyType],
		path: safeText(path, 300),
		http_method: method,
		content_type: contentType,
		query,
		headers,
		body,
		body_raw: bodyRaw,
		client_ip: clientIp,
		create_time: nowTs()
	};

	try {
		await inboxCol.add(doc);
	} catch (e) {
		console.error('xingyi-async-notify save failed', notifyType, e);
		// 仍返回 SUCCESS，避免对方无限重试把库打挂；失败看云函数日志
		return successHttp('SUCCESS');
	}

	return successHttp('SUCCESS');
};
