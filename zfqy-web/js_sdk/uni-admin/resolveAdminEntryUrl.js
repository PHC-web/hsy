import adminConfig from '@/admin.config.js';

function normalizeIdList(raw, fallback) {
	if (raw != null) return Array.isArray(raw) ? raw : [raw];
	return [fallback];
}

function hasAnyPermission(vm, list) {
	if (!vm || typeof vm.$hasPermission !== 'function') return false;
	return list.some((id) => id && vm.$hasPermission(id));
}

function hasAdminRole(vm) {
	return vm && typeof vm.$hasRole === 'function' && vm.$hasRole('admin');
}

/** 是否可访问控制台首页（与 pages/index onShow 一致） */
export function canAccessAdminHome(vm) {
	const ids = adminConfig.permissionIds || {};
	const homeList = normalizeIdList(ids.adminHome, 'console.home');
	return hasAdminRole(vm) || hasAnyPermission(vm, homeList);
}

/** 是否可访问门户中心（与 pages/portal onShow 一致） */
export function canAccessPortal(vm) {
	const ids = adminConfig.permissionIds || {};
	const portalList = normalizeIdList(ids.portalHome, 'console.portal');
	return hasAdminRole(vm) || hasAnyPermission(vm, portalList);
}

/**
 * 管理后台默认入口 URL：有首页权限 → 首页；否则有门户权限 → 门户中心。
 * 用于顶部 Logo、菜单「/」等统一跳转。
 */
export function resolveAdminEntryUrl(vm) {
	const indexUrl = (adminConfig.index && adminConfig.index.url) || '/pages/index/index';
	const portalUrl = (adminConfig.portal && adminConfig.portal.url) || '/pages/portal/index';
	if (canAccessAdminHome(vm)) return indexUrl;
	if (canAccessPortal(vm)) return portalUrl;
	return indexUrl;
}
