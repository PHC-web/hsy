/**
 * 优先使用 token 解析结果（与 uniCloud.getCurrentUserInfo 一致），避免本地缓存的 userInfo 缺 permission/role。
 */
function resolveAuth(vm) {
	let permission = vm.$uniIdPagesStore?.store?.userInfo?.permission || []
	let role = vm.$uniIdPagesStore?.store?.userInfo?.role || []
	try {
		if (typeof uniCloud !== 'undefined' && typeof uniCloud.getCurrentUserInfo === 'function') {
			const ci = uniCloud.getCurrentUserInfo()
			if (ci && Array.isArray(ci.permission) && ci.permission.length) permission = ci.permission
			if (ci && Array.isArray(ci.role) && ci.role.length) role = ci.role
		}
	} catch (e) {}
	return { permission, role }
}

// #ifndef VUE3
export function initPermission(Vue) {
	Vue.prototype.$hasPermission = function hasPermission(name) {
		const { permission, role } = resolveAuth(this)
		return role.indexOf('admin') > -1 || permission.indexOf(name) > -1
	}
	Vue.prototype.$hasRole = function hasRole(name) {
		const { role } = resolveAuth(this)
		return role.indexOf(name) > -1
	}
}
// #endif

// #ifdef VUE3
export function initPermission(app) {
	app.config.globalProperties.$hasPermission = function hasPermission(name) {
		const { permission, role } = resolveAuth(this)
		return role.indexOf('admin') > -1 || permission.indexOf(name) > -1
	}
	app.config.globalProperties.$hasRole = function hasRole(name) {
		const { role } = resolveAuth(this)
		return role.indexOf(name) > -1
	}
}
// #endif
