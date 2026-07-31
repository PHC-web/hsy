/** 运营列表页导出：与刷卡记录 / 积分记录同款格式 */

export const EXPORT_TYPE_OPTIONS = [
	{ text: 'JSON', value: 'json' },
	{ text: 'XML', value: 'xml' },
	{ text: 'CSV', value: 'csv' },
	{ text: 'TXT', value: 'txt' },
	{ text: 'MS-Word', value: 'word' },
	{ text: 'MS-Excel', value: 'excel' }
];

export const EXPORT_PAGE_SIZE = 1000;
export const EXPORT_MAX_ROWS = 10000;

export function downloadFile(filename, content, mimeType) {
	// #ifdef H5
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
	// #endif
	// #ifndef H5
	uni.setClipboardData({ data: String(content || '') });
	// #endif
}

export function toCsv(rows) {
	const keys = Object.keys(rows[0] || {});
	const esc = (s) => {
		const t = String(s == null ? '' : s);
		return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
	};
	const lines = [keys.join(',')];
	rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(',')));
	return '\uFEFF' + lines.join('\r\n');
}

export function toTxt(rows) {
	return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n');
}

export function toXml(rows, root = 'rows') {
	const esc = (s) =>
		String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	const items = rows
		.map((r) => {
			const fields = Object.entries(r)
				.map(([k, v]) => {
					const tag = String(k).replace(/[^\w\u4e00-\u9fa5]/g, '_');
					return `<${tag}>${esc(v)}</${tag}>`;
				})
				.join('');
			return `<item>${fields}</item>`;
		})
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?><${root}>${items}</${root}>`;
}

export function toHtmlTable(rows) {
	const keys = Object.keys(rows[0] || {});
	const th = keys.map((k) => `<th>${k}</th>`).join('');
	const tr = rows
		.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`)
		.join('');
	return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
}

/**
 * 分页拉取导出数据（云函数 pageSize 上限通常为 1000）
 * @param {{ request: Function, action: string, buildPayload: (page:number, pageSize:number)=>object, mapRow: (item:any)=>object, functionName: string, pageSize?: number, maxRows?: number }} opts
 */
export async function fetchPagedExportRows(opts) {
	const {
		request,
		action,
		buildPayload,
		mapRow,
		functionName,
		pageSize = EXPORT_PAGE_SIZE,
		maxRows = EXPORT_MAX_ROWS
	} = opts;
	const all = [];
	let page = 1;
	let total = Infinity;
	while (all.length < maxRows && all.length < total) {
		const res = await request(action, buildPayload(page, pageSize), { functionName });
		if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
		const d = res.data || {};
		const rows = d.list || [];
		total = Number(d.total);
		if (!Number.isFinite(total) || total < 0) total = rows.length;
		all.push(...rows);
		if (!rows.length || rows.length < pageSize) break;
		page += 1;
		if (page > 50) break;
	}
	const truncated = all.length >= maxRows && total > maxRows;
	const slice = all.slice(0, maxRows);
	return {
		rows: slice.map((x) => mapRow(x)),
		truncated
	};
}

export async function runListExport({ type, filenamePrefix, xmlRoot, fetchRows }) {
	try {
		uni.showLoading({ title: '导出中...', mask: true });
		const { rows, truncated } = await fetchRows();
		if (!rows.length) {
			uni.showToast({ title: '暂无可导出数据', icon: 'none' });
			return;
		}
		const ts = Date.now();
		const prefix = filenamePrefix || 'export';
		if (type === 'json') {
			downloadFile(`${prefix}_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
		} else if (type === 'xml') {
			downloadFile(`${prefix}_${ts}.xml`, toXml(rows, xmlRoot || 'rows'), 'application/xml;charset=utf-8');
		} else if (type === 'csv') {
			downloadFile(`${prefix}_${ts}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
		} else if (type === 'txt') {
			downloadFile(`${prefix}_${ts}.txt`, toTxt(rows), 'text/plain;charset=utf-8');
		} else if (type === 'word') {
			downloadFile(`${prefix}_${ts}.doc`, toHtmlTable(rows), 'application/msword');
		} else if (type === 'excel') {
			downloadFile(`${prefix}_${ts}.xls`, toHtmlTable(rows), 'application/vnd.ms-excel');
		}
		if (truncated) {
			uni.showToast({ title: '数据过多，已截断为前 10000 条', icon: 'none', duration: 2800 });
		}
	} catch (e) {
		uni.showToast({ title: (e && e.message) || '导出失败', icon: 'none' });
	} finally {
		uni.hideLoading();
	}
}
