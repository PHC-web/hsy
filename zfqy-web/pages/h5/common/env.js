/**
 * H5 本地调试能力（Mock 登录、粘贴 code 等）仅在开发构建中启用。
 * 发行/正式环境（NODE_ENV === 'production'）不展示、不可用。
 *
 * Mock 登录需云函数 merchant 允许：开发构建会传 h5DevMock；
 * 若仍失败，请在 uniCloud 控制台为 merchant 配置环境变量 HSY_ALLOW_H5_MOCK=1。
 * 正式云空间请配置 HSY_ALLOW_H5_MOCK=0 以关闭 Mock。
 */
export function isH5DevToolsEnabled() {
	return process.env.NODE_ENV !== 'production';
}
