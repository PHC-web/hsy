<template>
	<view v-if="!allowRender" class="h5-entry-placeholder"></view>
	<view v-else class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group"></view>
		</view>
		<view class="uni-container portal-page">
			<view class="title-wrap">
				<view class="page-title">门户中心</view>
				<view class="page-desc">按左侧菜单分组展示您有权访问的功能，点击卡片即可快速进入。</view>
			</view>

			<view v-if="loading" class="portal-loading">加载中…</view>
			<view v-else-if="!portalGroups.length" class="portal-empty">暂无可用入口，请联系管理员分配菜单权限。</view>
			<view v-else class="portal-grid">
				<view
					v-for="item in portalGroups"
					:key="item.menu_id"
					class="portal-card pointer"
					@click="goFirstLeaf(item)"
				>
					<view class="portal-card-icon-wrap">
						<view v-if="item.icon" :class="item.icon" class="portal-card-icon"></view>
						<text v-else class="portal-card-icon-fallback bi bi-grid-3x3-gap"></text>
					</view>
					<view class="portal-card-body">
						<view class="portal-card-title">{{ item.text }}</view>
					</view>
					<text class="portal-card-arrow bi bi-chevron-right"></text>
				</view>
			</view>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
import { buildMenus } from '@/components/uni-data-menu/util.js';
import adminConfig from '@/admin.config.js';

export default {
	data() {
		return {
			allowRender: true,
			loading: true,
			menuTree: []
		};
	},
	computed: {
		portalGroups() {
			const roots = Array.isArray(this.menuTree) ? this.menuTree : [];
			const skip = new Set(['staff_portal', 'portal_center']);
			const list = [];
			for (const r of roots) {
				if (!r || skip.has(r.menu_id)) continue;
				if (!r.children || !r.children.length) continue;
				const leaf = this.firstAccessibleLeaf(r);
				if (!leaf || !leaf.value) continue;
				list.push({ ...r });
			}
			return list;
		}
	},
	onLoad() {
		// #ifdef H5
		const pathname = (window.location && window.location.pathname) || '/';
		const hash = (window.location && window.location.hash) || '';
		const search = (window.location && window.location.search) || '';
		const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
		if (!isAdminPath) {
			this.allowRender = false;
			if (hash.indexOf('/pages/h5/') === -1) {
				window.location.replace(`${pathname}${search}#/pages/h5/auth/index`);
			}
			return;
		}
		this.allowRender = true;
		// #endif
	},
	onShow() {
		if (!this.allowRender) return;
		const ids = adminConfig.permissionIds || {};
		const indexUrl = (adminConfig.index && adminConfig.index.url) || '/pages/index/index';
		const homeIds = ids.adminHome != null ? ids.adminHome : 'console.home';
		const portalIds = ids.portalHome != null ? ids.portalHome : 'console.portal';
		const homeList = Array.isArray(homeIds) ? homeIds : [homeIds];
		const portalList = Array.isArray(portalIds) ? portalIds : [portalIds];
		const hasPerm = (list) =>
			typeof this.$hasPermission === 'function' &&
			list.some((id) => id && this.$hasPermission(id));
		const canPortal =
			(typeof this.$hasRole === 'function' && this.$hasRole('admin')) || hasPerm.call(this, portalList);
		if (!canPortal) {
			const canHome =
				(typeof this.$hasRole === 'function' && this.$hasRole('admin')) || hasPerm.call(this, homeList);
			if (canHome) {
				uni.redirectTo({ url: indexUrl });
			} else {
				uni.showToast({ title: '无门户访问权限', icon: 'none' });
			}
			return;
		}
		this.loadPortalMenus();
	},
	methods: {
		getRolePermission() {
			let permission = [];
			let role = [];
			try {
				const x = uniCloud.getCurrentUserInfo && uniCloud.getCurrentUserInfo();
				if (x) {
					permission = x.permission || [];
					role = x.role || [];
				}
			} catch (e) {}
			const u = this.$uniIdPagesStore && this.$uniIdPagesStore.store && this.$uniIdPagesStore.store.userInfo;
			if (u) {
				permission = u.permission || permission;
				role = u.role || role;
			}
			return { permission, role };
		},
		/** 与 components/uni-data-menu 侧栏一致的叶子过滤 */
		filterFlatMenuByPermission(menuList) {
			const { permission, role } = this.getRolePermission();
			menuList.forEach((item) => {
				item.isLeafNode = !menuList.some((sub) => sub.parent_id === item.menu_id);
			});
			if (role.includes('admin')) {
				return menuList;
			}
			return menuList.filter((item) => {
				if (item.isLeafNode) {
					if (item.permission && item.permission.length) {
						return item.permission.some((p) => permission.indexOf(p) > -1);
					}
					return false;
				}
				return true;
			});
		},
		async loadPortalMenus() {
			this.loading = true;
			try {
				const db = uniCloud.database();
				const res = await db.collection('opendb-admin-menus').where({ enable: true }).limit(500).get();
				const raw = (res.result && res.result.data) || res.data || [];
				raw.sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
				const flat = raw.map((m) => ({
					...m,
					text: m.name,
					value: m.url == null ? '' : m.url
				}));
				const filtered = this.filterFlatMenuByPermission(flat);
				this.menuTree = buildMenus(filtered);
			} catch (e) {
				console.error(e);
				this.menuTree = [];
				uni.showToast({ title: '菜单加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		/** 按菜单 sort 深度优先，第一个带 url 的叶子（与侧栏展开顺序一致） */
		firstAccessibleLeaf(node) {
			if (!node) return null;
			const hasKids = node.children && node.children.length;
			const val = String(node.value || '').trim();
			if (!hasKids) {
				return val ? node : null;
			}
			const kids = [...node.children].sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
			for (let i = 0; i < kids.length; i++) {
				const hit = this.firstAccessibleLeaf(kids[i]);
				if (hit) return hit;
			}
			return null;
		},
		goFirstLeaf(group) {
			const leaf = this.firstAccessibleLeaf(group);
			if (!leaf || !leaf.value) {
				uni.showToast({ title: '暂无可访问页面', icon: 'none' });
				return;
			}
			let url = String(leaf.value).trim();
			if (url.indexOf('http') === 0) {
				// #ifdef H5
				window.open(url);
				// #endif
				return;
			}
			if (url === '/' || url === '') {
				url = '/pages/index/index';
			}
			if (url[0] !== '/') {
				url = '/' + url;
			}
			uni.redirectTo({
				url,
				fail: () => {
					uni.showModal({
						title: '提示',
						content: '页面跳转失败：' + url,
						showCancel: false
					});
				}
			});
		}
	}
};
</script>

<style scoped>
.h5-entry-placeholder {
	width: 100vw;
	height: 100vh;
	background: #fff;
}

.portal-page {
	min-height: 420px;
	padding: 12px 8px 28px;
	max-width: 1200px;
	margin: 0 auto;
}

.title-wrap {
	margin-bottom: 16px;
}

.page-title {
	position: relative;
	font-size: 22px;
	font-weight: 700;
	color: #0f172a;
	padding-left: 14px;
	letter-spacing: 0.02em;
}

.page-title::before {
	content: '';
	position: absolute;
	left: 0;
	top: 4px;
	bottom: 4px;
	width: 4px;
	border-radius: 4px;
	background: linear-gradient(180deg, #2563eb 0%, #6366f1 100%);
}

.page-desc {
	margin-top: 8px;
	font-size: 13px;
	color: #64748b;
	line-height: 1.55;
}

.portal-loading,
.portal-empty {
	padding: 48px 16px;
	text-align: center;
	color: #64748b;
	font-size: 14px;
}

.portal-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: 12px;
}

.portal-card {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 14px 16px;
	border-radius: 12px;
	background: #fff;
	border: 1px solid rgba(148, 163, 184, 0.22);
	box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
	transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.portal-card.pointer {
	cursor: pointer;
}

.portal-card:hover {
	box-shadow: 0 8px 28px rgba(15, 23, 42, 0.1);
	transform: translateY(-1px);
}

.portal-card-icon-wrap {
	width: 44px;
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border-radius: 10px;
	background: linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 100%);
}

.portal-card-icon {
	width: 24px;
	height: 24px;
	font-size: 22px;
}

.portal-card-icon-fallback {
	font-size: 22px;
	color: #475569;
}

.portal-card-body {
	flex: 1;
	min-width: 0;
}

.portal-card-title {
	font-size: 16px;
	font-weight: 600;
	color: #0f172a;
	line-height: 1.35;
}

.portal-card-arrow {
	flex-shrink: 0;
	font-size: 18px;
	color: #94a3b8;
}
</style>
