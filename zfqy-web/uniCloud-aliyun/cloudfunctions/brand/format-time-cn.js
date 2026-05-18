'use strict';

/**
 * 云函数运行环境多为 UTC，展示与业务日一律按 Asia/Shanghai。
 * brand 云函数包内副本：线上仅打包本目录，无法 require 上级 common。
 * 与 cloudfunctions/common/format-time-cn.js 保持同步。
 */

function formatTimeMs(timestamp) {
	if (timestamp == null || timestamp === '') return '';
	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) return '';
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Shanghai',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			hourCycle: 'h23'
		}).formatToParts(new Date(ts));
		const pick = (type) => (parts.find((x) => x.type === type) || {}).value || '';
		if (!pick('year')) return '';
		return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
	} catch (e) {
		const date = new Date(ts + 8 * 60 * 60 * 1000);
		return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
			date.getUTCDate()
		).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(
			2,
			'0'
		)}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
	}
}

/** 自然月 YYYY-MM（北京时间） */
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

/** 紧凑 YYYYMMDDHHmmss（北京时间），用于协议版本号等 */
function shanghaiCompactYmdHms(date = new Date()) {
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Shanghai',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			hourCycle: 'h23'
		}).formatToParts(date);
		const pick = (type) => (parts.find((x) => x.type === type) || {}).value || '';
		return `${pick('year')}${pick('month')}${pick('day')}${pick('hour')}${pick('minute')}${pick('second')}`;
	} catch (e) {
		const x = new Date(date.getTime() + 8 * 60 * 60 * 1000);
		const y = x.getUTCFullYear();
		const mo = String(x.getUTCMonth() + 1).padStart(2, '0');
		const d = String(x.getUTCDate()).padStart(2, '0');
		const h = String(x.getUTCHours()).padStart(2, '0');
		const mi = String(x.getUTCMinutes()).padStart(2, '0');
		const s = String(x.getUTCSeconds()).padStart(2, '0');
		return `${y}${mo}${d}${h}${mi}${s}`;
	}
}

module.exports = {
	formatTimeMs,
	shanghaiYearMonthFromTs,
	shanghaiCompactYmdHms
};
