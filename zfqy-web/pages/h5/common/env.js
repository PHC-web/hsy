/**
 * H5 本地调试能力（Mock 登录、粘贴 code 等）仅在开发构建中启用。
 * 发行/正式环境（NODE_ENV === 'production'）不展示、不可用。
 */
export function isH5DevToolsEnabled() {
	return process.env.NODE_ENV !== 'production';
}
