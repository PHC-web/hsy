/**
 * 可选使用 uniCloud Redis：控制台开通并绑定后自动生效；
 * 未开通或调用失败时回退为仅内存/数据库，不抛错影响业务。
 * @see https://doc.dcloud.net.cn/uniCloud/redis-introduction
 */
'use strict';

let _redis = null;

function getRedis() {
	// 成功才缓存；失败不永久钉死，避免冷启动偶发失败后整实例一直读不到
	if (_redis) return _redis;
	try {
		if (typeof uniCloud !== 'undefined' && typeof uniCloud.redis === 'function') {
			_redis = uniCloud.redis();
		}
	} catch (e) {
		_redis = null;
	}
	return _redis;
}

function normalizeRedisString(s) {
	if (s == null || s === '') return null;
	if (typeof Buffer !== 'undefined' && Buffer.isBuffer(s)) {
		const t = s.toString('utf8');
		return t === '' ? null : t;
	}
	if (typeof s === 'object') {
		// 部分客户端可能已反序列化
		try {
			return JSON.stringify(s);
		} catch (e) {
			return null;
		}
	}
	const t = String(s);
	return t === '' ? null : t;
}

async function h5RedisGetString(key) {
	const r = getRedis();
	if (!r || !key) return null;
	try {
		const s = await r.get(key);
		return normalizeRedisString(s);
	} catch (e) {
		console.error('h5RedisGetString', key, e && e.message);
		return null;
	}
}

async function h5RedisGetJson(key) {
	const r = getRedis();
	if (!r || !key) return null;
	try {
		const s = await r.get(key);
		if (s == null || s === '') return null;
		const isBuf = typeof Buffer !== 'undefined' && Buffer.isBuffer(s);
		if (typeof s === 'object' && !isBuf) {
			return s;
		}
		const text = normalizeRedisString(s);
		if (text == null) return null;
		return JSON.parse(text);
	} catch (e) {
		console.error('h5RedisGetJson', key, e && e.message);
		return null;
	}
}

async function h5RedisSetJson(key, obj, exSec) {
	const r = getRedis();
	if (!r || !key) return false;
	try {
		const str = JSON.stringify(obj);
		const n = Math.max(0, Number(exSec) || 0);
		if (n > 0) {
			try {
				await r.set(key, str, 'EX', n);
			} catch (e1) {
				try {
					await r.setex(key, n, str);
				} catch (e2) {
					await r.set(key, str);
					try {
						await r.expire(key, n);
					} catch (e3) {}
				}
			}
		} else {
			await r.set(key, str);
		}
		return true;
	} catch (e) {
		console.error('h5RedisSetJson', key, e && e.message);
		return false;
	}
}

async function h5RedisDel(key) {
	const r = getRedis();
	if (!r || !key) return;
	try {
		await r.del(key);
	} catch (e) {
		// ignore
	}
}

function h5RedisAlive() {
	return !!getRedis();
}

module.exports = {
	getRedis,
	h5RedisAlive,
	h5RedisGetString,
	h5RedisGetJson,
	h5RedisSetJson,
	h5RedisDel
};
