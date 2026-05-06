export default {
	login: {
		url: '/uni_modules/uni-id-pages/pages/login/login-withpwd' // 登录页面路径
	},
	/**
	 * 页面准入校验用的是 uni-id **permission_id**（权限管理里「权限标识」），须与用户角色上的权限、菜单叶子节点上的 permission 数组一致。
	 * 菜单里的「标识」是 menu_id（如 index、portal），与 permission_id 不是同一字段；若你希望二者同名，请在权限管理中新建 permission_id 为 index / portal 的权限并分配给角色。
	 * 下列数组为「任一命中即可」，兼容历史 console.home / console.portal 与菜单常用 index / portal。
	 * admin 角色仍可进控制台与门户。
	 */
    permissionIds: {
		adminHome: ['console.home', 'index'],
		portalHome: ['console.portal', 'portal']
	},
	portal: {
		url: '/pages/portal/index'
	},
	index: {
		url: '/pages/index/index' // 登录后跳转的第一个页面
	},
	error: {
		url: '/pages/error/404' // 404 Not Found 错误页面路径
	},
	navBar: { // 顶部导航
		logo: '/static/logo.png', // 左侧 Logo
		langs: [{
			text: '中文简体',
			lang: 'zh-Hans'
		}, {
			text: '中文繁體',
			lang: 'zh-Hant'
		}, {
			text: 'English',
			lang: 'en'
		}],
		themes: [{
			text: '默认',
			value: 'default'
		}, {
			text: '绿柔',
			value: 'green'
		}],
		debug: {
			enable: process.env.NODE_ENV !== 'production', //是否显示错误信息
			engine: [{ // 搜索引擎配置（每条错误信息后，会自动生成搜索链接，点击后跳转至搜索引擎）
				name: '百度',
				url: 'https://www.baidu.com/baidu?wd=ERR_MSG'
			}, {
				name: '谷歌',
				url: 'https://www.google.com/search?q=ERR_MSG'
			}]
		}
	},
	sideBar: { // 左侧菜单
		// 静态菜单（追加在数据库菜单下方）；业务入口请在「菜单管理」opendb-admin-menus 中配置
		staticMenu: []
	},
	uniStat: {
		
	}
};
