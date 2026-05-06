<template>
	<view>
		<uni-nav-menu :active="value" activeKey="value" :activeTextColor="activeTextColor" :uniqueOpened="uniqueOpened"
			@select="onSelect">
			<uni-menu-sidebar :data="userMenu"></uni-menu-sidebar>
			<uni-menu-sidebar :data="staticMenu"></uni-menu-sidebar>
		</uni-nav-menu>
	</view>
</template>

<script>
	import {
		mapActions
	} from 'vuex'
	import {
		buildMenus
	} from './util.js'
	export default {
		data() {
			return {
				menus: [],
				userMenu: [],
				famliy: [],

			};
		},
		mixins: [uniCloud.mixinDatacom],
		props: {
			// 当前激活菜单的 url
			value: {
				type: String,
				default: ''
			},
			// 当前激活菜单的文字颜色
			activeTextColor: {
				type: String,
				default: '#42B983'
			},
			// 是否只保持一个子菜单的展开
			uniqueOpened: {
				type: Boolean,
				default: false
			},
			staticMenu: {
				type: Array,
				default () {
					return []
				}
			}
		},
		watch: {
			localdata: {
				handler(newval) {
					if (this.hasLocalData(newval)) {
						this.userMenu = newval
					}
				},
				immediate: true
			},
			// TODO 暂时无需监听，需要看后面会出现什么问题
			// #ifdef H5
			menus: {
				immediate: true,
				handler(newVal) {
					const item = this.findMenuForRoute(this.$route.path)
					if (item && Array.isArray(newVal) && newVal.length) {
						this.famliy = []
						this.getMenuAncestor(item.menu_id, newVal)
						this.setRoutes && this.setRoutes(this.famliy)
					}
				}
			},
			// #endif
			$route: {
				immediate: true,
				handler(val, old) {
					if (!val) return
					if (old && val.fullPath === old.fullPath) return
					const menu = this.findMenuForRoute(val.path)
					const menu_id = menu && menu.menu_id
					if (!menu_id || !this.menus.length) return
					this.famliy = []
					this.getMenuAncestor(menu_id, this.menus)
					this.setRoutes && this.setRoutes(this.famliy)
				}
			}
		},
		created() {
			if (this.hasLocalData(this.localdata)) return
			this.load()
		},
		// computed:{
		// 	userMenu() {
		// 		return this.getUserMenu(this.menus)
		// 	}
		// },
		methods: {
			...mapActions({
				setRoutes: 'app/setRoutes'
			}),
			getUserMenu(menuList) {
				const {
					permission,
					role
				} = uniCloud.getCurrentUserInfo()
				// 标记叶子节点
				menuList.map(item => {
					if (!menuList.some(subMenuItem => subMenuItem.parent_id === item.menu_id)) {
						item.isLeafNode = true
					}
				})

				// 删除无权限访问的菜单
				if (!role.includes('admin')) {
					menuList = menuList.filter(item => {
						if (item.isLeafNode) {
							if (item.permission && item.permission.length) {
								return item.permission.some(item => permission.indexOf(item) > -1)
							}
							return false
						}
						return true
					})
				}
				return buildMenus(menuList)
			},
			onSelect(menu) {

				this.famliy = []
				this.getMenuAncestor(menu.menu_id, this.menus)
				this.emit(menu)
			},
			emit(menu) {
				this.$emit('select', menu, this.famliy)
				this.$emit('input', menu.value)
			},
			hasLocalData(value) {
				return Array.isArray(value) && value.length > 0
			},
			/** 菜单 url 常为 `/`，路由 path 常为 `/pages/index/index`，需对齐 */
			findMenuForRoute(routePath) {
				const menus = this.menus || []
				if (!menus.length) return null
				const p = routePath || ''
				let item = menus.find((m) => m.value === p)
				if (item) return item
				const isHomePath =
					p === '/' ||
					p === '/pages/index/index' ||
					p.endsWith('/pages/index/index')
				if (isHomePath) {
					item = menus.find((m) => {
						const v = m.value || ''
						return v === '/' || v === '/pages/index/index' || v === 'pages/index/index'
					})
				}
				return item || null
			},
			load() {
				if (this.mixinDatacomLoading == true) {
					return
				}
				this.mixinDatacomLoading = true
				this.mixinDatacomGet().then((res) => {
					this.mixinDatacomLoading = false
					const {
						data,
						count
					} = res.result
					this.menus = data
					this.userMenu = this.getUserMenu(this.menus)
				}).catch((err) => {
					this.mixinDatacomLoading = false
					this.mixinDatacomErrorMessage = err
				})
			},
			getMenuAncestor(menuId, menus) {
				if (!menuId || !Array.isArray(menus)) return
				const item = menus.find((m) => m.menu_id === menuId)
				if (!item) return
				const route = {
					name: item.text
				}
				const path = item.value
				if (path) {
					route.to = {
						path
					}
				}
				this.famliy.unshift(route)
				if (item.parent_id) {
					this.getMenuAncestor(item.parent_id, menus)
				}
			}
		},
	}
</script>

<style>

</style>
