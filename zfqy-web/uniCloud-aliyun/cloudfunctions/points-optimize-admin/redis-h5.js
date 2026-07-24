/**
 * 可选使用 uniCloud Redis：控制台开通并绑定后自动生效；
 * 未开通或调用失败时回退为仅内存/数据库，不抛错影响业务。
 * @see https://doc.dcloud.net.cn/uniCloud/redis-introduction
 */
'use strict';

let _redis = null;
let _redisChecked = false;

function getRedis() {
	if (_redisChecked) {
		return _redis;
	}
	_redisChecked = true;
	try {
		_redis = typeof uniCloud !== 'undefined' && typeof uniCloud.redis === 'function' ? uniCloud.redis() : null;
	} catch (e) {
		_redis = null;
	}
	return _redis;
}

async function h5RedisGetString(key) {
	const r = getRedis();
	if (!r || !key) return null;
	try {
		const s = await r.get(key);
		if (s == null || s === '') return null;
		return s;
	} catch (e) {
		return null;
	}
}

async function h5RedisGetJson(key) {
	const s = await h5RedisGetString(key);
	if (s == null) return null;
	try {
		return JSON.parse(s);
	} catch (e) {
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
			// 兼容不同 Redis 客户端签名
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

module.exports = {
	getRedis,
	h5RedisGetString,
	h5RedisGetJson,
	h5RedisSetJson,
	h5RedisDel
};
