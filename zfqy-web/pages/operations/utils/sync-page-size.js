/**
 * 运维列表分页：云函数会将 pageSize 钳制在 uniCloud 单次查询上限内，
 * 须用响应中的 pageSize 回写 pageInfo，避免 UI 按 500 算页、服务端仍按 100 查。
 */
export function syncOpsListPageSize(pageInfo, data) {
	if (!pageInfo || !data) return;
	const n = Number(data.pageSize);
	if (n > 0 && n !== pageInfo.pageSize) {
		pageInfo.pageSize = n;
	}
}
