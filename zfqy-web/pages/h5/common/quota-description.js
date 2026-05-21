/**
 * H5 额度包页展示的「套餐说明」正文（与后台 hsy-quota-packages.description 对应）
 * 去掉 [H5]/[/H5] 标记，保留块内块外全部文字。
 */
export function quotaDescriptionForH5Display(description) {
	let s = String(description == null ? '' : description).trim();
	if (!s) return '';
	s = s.replace(/\[\/H5\]/gi, '').replace(/\[H5\]/gi, '');
	return s.replace(/\n{3,}/g, '\n\n').trim();
}
