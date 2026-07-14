/**
 * H5 本地调试能力（Mock 登录、粘贴 code 等）仅在开发构建中启用。
 * 发行/正式环境（NODE_ENV === 'production'）不展示、不可用。
 *
 * Mock 登录需云函数 merchant 允许：开发构建会传 h5DevMock；
 * 若仍失败，请在 uniCloud 控制台为 merchant 配置环境变量 HSY_ALLOW_H5_MOCK=1。
 * 正式云空间请配置 HSY_ALLOW_H5_MOCK=0 以关闭 Mock。
 *
 * 固定调试账号：openid 恒为 mock_dev_test，本地反复登录复用同一商户；
 * 首次绑定机具后，后续一键登录无需再绑。
 */
export const H5_MOCK_TEST_OPENID = 'mock_dev_test';
export const H5_MOCK_TEST_NICKNAME = 'test';

export function isH5DevToolsEnabled() {
	return process.env.NODE_ENV !== 'production';
}
