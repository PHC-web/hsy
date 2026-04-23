<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button size="mini" @click="reset">重置</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button size="mini" class="export-trigger" @click="toggleExportMenu">
							<text class="bi bi-download export-icon"></text>
							<text>导出</text>
							<text class="bi bi-chevron-down export-caret"></text>
						</button>
						<view v-if="showExportMenu" class="export-menu">
							<view v-for="opt in exportTypeOptions" :key="opt.value" class="export-menu-item" @click="selectAndExport(opt.value)">
								{{ opt.text }}
							</view>
						</view>
					</view>
					<button size="mini" type="warn" @click="openOfflineRecharge">线下首冲额度</button>
					<button size="mini" type="primary" @click="goAdd">模拟商户注册</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" :key="tableKey" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="60">头像</uni-th>
							<uni-th align="center" width="60">协议</uni-th>
							<uni-th align="center" width="120" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">机具号码</uni-th>
							<uni-th align="center" width="160" filter-type="search" @filter-change="headerFilterChange($event, 'wxNickname')">微信用户</uni-th>
							<uni-th align="center" width="90">剩余额度</uni-th>
							<uni-th align="center" width="90">待提现</uni-th>
							<uni-th align="center" width="90">已提现</uni-th>
							<uni-th align="center" width="90">冻结金额</uni-th>
							<uni-th align="center" width="70">优惠券</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="useStatusFilterData" @filter-change="headerFilterChange($event, 'useStatus')">使用状态</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag1')">1</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag2')">2</uni-th>
							<uni-th align="center" width="60" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'flag3')">3</uni-th>
							<uni-th align="center" width="90" filter-type="select" :filter-data="flagBoolFilterData" @filter-change="headerFilterChange($event, 'microMerchant')">小微商户</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'loginTime')">登录时间</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center">
								<image class="avatar" :src="item.avatar || defaultAvatar" mode="aspectFill" @click="previewImg(item.avatar || defaultAvatar)" />
							</uni-td>
							<uni-td align="center">
								<image class="agreement" :src="item.agreement || defaultAgreement" mode="aspectFill" @click="previewImg(item.agreement || defaultAgreement)" />
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ item.deviceDisplay }}</view>
							</uni-td>
							<uni-td align="center">
								<view class="cell-multiline">{{ item.wxUser }}</view>
							</uni-td>
							<uni-td align="center" class="money">{{ item.remainingQuota }}</uni-td>
							<uni-td align="center" class="money">{{ item.pendingWithdraw }}</uni-td>
							<uni-td align="center" class="money">{{ item.withdrawn }}</uni-td>
							<uni-td align="center" class="money">{{ item.frozenAmount }}</uni-td>
							<uni-td align="center">{{ item.couponCount }}</uni-td>
							<uni-td align="center">
								<switch :checked="item.status" @change="onSwitch(item, 'status', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag1" @change="onSwitch(item, 'flag1', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag2" @change="onSwitch(item, 'flag2', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.flag3" @change="onSwitch(item, 'flag3', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">
								<switch :checked="item.microMerchant" @change="onSwitch(item, 'micro_merchant', $event.detail.value)" />
							</uni-td>
							<uni-td align="center">{{ item.loginTime }}</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>
			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
			</view>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
		<uni-popup ref="offlineRechargePopup" type="dialog">
			<view class="offline-popup">
				<view class="offline-title">线下首充额度</view>
				<view class="offline-label required">手机号码</view>
				<input v-model="offlineForm.mobile" class="offline-input" type="number" maxlength="11" placeholder="手机号" />
				<view class="offline-label required">选择套餐</view>
				<scroll-view class="offline-packages" scroll-y>
					<radio-group>
						<label v-for="item in offlinePackages" :key="item.value" class="offline-package-item" @click="offlineForm.packageId = item.value">
							<radio :value="item.value" :checked="offlineForm.packageId === item.value" />
							<view class="offline-package-content">
								<view class="offline-package-main">额度：{{ item.quotaText }}；价格：{{ item.priceText }}元</view>
								<view v-if="item.desc" class="offline-package-desc">{{ item.desc }}</view>
							</view>
						</label>
					</radio-group>
				</scroll-view>
				<view class="offline-actions">
					<button size="mini" @click="closeOfflineRecharge">取消</button>
					<button size="mini" type="primary" :loading="offlineSubmitting" @click="submitOfflineRecharge">提交</button>
				</view>
			</view>
		</uni-popup>
		<uni-popup ref="imgPreviewPopup" type="center">
			<view class="img-preview-modal">
				<view
					ref="previewViewport"
					class="img-preview-viewport"
					@wheel.prevent="onPreviewWheel"
					@mousedown="onPreviewMouseDown"
					@mousemove="onPreviewMouseMove"
					@mouseup="onPreviewMouseUp"
					@mouseleave="onPreviewMouseUp"
				>
					<image
						ref="previewImage"
						class="img-preview-main"
						:src="previewImageUrl"
						mode="widthFix"
						:style="previewImageStyle"
						@load="onPreviewImageLoad"
					/>
				</view>
				<view class="img-preview-tip">滚轮缩放，按住鼠标左键拖动</view>
				<view class="img-preview-actions">
					<button size="mini" @click="resetPreviewTransform">重置</button>
					<button size="mini" @click="closeImgPreview">关闭</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
export default {
	data() {
		return {
			searchForm: {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				microMerchant: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			},
			tableKey: 1,
			useStatusFilterData: [
				{ text: '正常', value: '1', checked: false },
				{ text: '异常', value: '0', checked: false }
			],
			flagBoolFilterData: [
				{ text: '禁用', value: '0', checked: false },
				{ text: '启用', value: '1', checked: false }
			],
			list: [],
			loading: false,
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			showExportMenu: false,
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			],
			offlineSubmitting: false,
			offlineForm: {
				mobile: '',
				packageId: ''
			},
			previewImageUrl: '',
			previewScale: 1,
			previewOffsetX: 0,
			previewOffsetY: 0,
			previewDragging: false,
			previewDragStartX: 0,
			previewDragStartY: 0,
			previewDragOriginX: 0,
			previewDragOriginY: 0,
			offlinePackages: [],
			defaultAvatar: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M24 24a7 7 0 1 0-7-7 7 7 0 0 0 7 7Zm0 4c-7.18 0-13 3.13-13 7v2h26v-2c0-3.87-5.82-7-13-7Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E',
			defaultAgreement: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M15 12h14l4 4v20H15V12Zm14 1.5V17h3.5L29 13.5ZM18 20h12v2H18v-2Zm0 5h12v2H18v-2Zm0 5h9v2h-9v-2Z%27 fill=%27%239ca3af%27/%3E%3C/svg%3E'
		};
	},
	computed: {
		previewImageStyle() {
			return {
				transform: `translate(${this.previewOffsetX}px, ${this.previewOffsetY}px) scale(${this.previewScale})`
			};
		}
	},
	mounted() {
		this.search();
	},
	methods: {
		getMouseClient(e) {
			const evt = e && (e.originalEvent || e);
			return {
				x: Number(evt?.clientX || 0),
				y: Number(evt?.clientY || 0)
			};
		},
		getPreviewViewportRect() {
			const ref = this.$refs.previewViewport;
			const el = ref && ref.$el ? ref.$el : ref;
			if (!el || typeof el.getBoundingClientRect !== 'function') return null;
			return el.getBoundingClientRect();
		},
		resetPreviewTransform() {
			this.previewScale = 1;
			this.previewOffsetX = 0;
			this.previewOffsetY = 0;
			this.previewDragging = false;
		},
		previewImg(url) {
			if (!url) return;
			this.resetPreviewTransform();
			this.previewImageUrl = String(url);
			if (this.$refs.imgPreviewPopup) {
				this.$refs.imgPreviewPopup.open();
				return;
			}
			uni.previewImage({ urls: [url], current: url });
		},
		onPreviewImageLoad() {
			this.resetPreviewTransform();
		},
		onPreviewWheel(e) {
			const rect = this.getPreviewViewportRect();
			if (!rect) return;
			const evt = e && (e.originalEvent || e);
			const deltaY = Number(evt?.deltaY || 0);
			const step = deltaY > 0 ? 0.92 : 1.08;
			const oldScale = this.previewScale;
			const newScale = Math.max(0.2, Math.min(8, Number((oldScale * step).toFixed(4))));
			if (newScale === oldScale) return;
			const mouse = this.getMouseClient(e);
			const mx = mouse.x - rect.left;
			const my = mouse.y - rect.top;
			const contentX = (mx - this.previewOffsetX) / oldScale;
			const contentY = (my - this.previewOffsetY) / oldScale;
			this.previewScale = newScale;
			this.previewOffsetX = mx - contentX * newScale;
			this.previewOffsetY = my - contentY * newScale;
		},
		onPreviewMouseDown(e) {
			const evt = e && (e.originalEvent || e);
			if (evt?.button != null && evt.button !== 0) return;
			const mouse = this.getMouseClient(e);
			this.previewDragging = true;
			this.previewDragStartX = mouse.x;
			this.previewDragStartY = mouse.y;
			this.previewDragOriginX = this.previewOffsetX;
			this.previewDragOriginY = this.previewOffsetY;
		},
		onPreviewMouseMove(e) {
			if (!this.previewDragging) return;
			const mouse = this.getMouseClient(e);
			this.previewOffsetX = this.previewDragOriginX + (mouse.x - this.previewDragStartX);
			this.previewOffsetY = this.previewDragOriginY + (mouse.y - this.previewDragStartY);
		},
		onPreviewMouseUp() {
			this.previewDragging = false;
		},
		closeImgPreview() {
			if (this.$refs.imgPreviewPopup) this.$refs.imgPreviewPopup.close();
			this.previewImageUrl = '';
			this.resetPreviewTransform();
		},
		parseTimestampRange(filter) {
			if (!Array.isArray(filter) || filter.length < 2) return { start: '', end: '' };
			return { start: Number(filter[0]) || '', end: Number(filter[1]) || '' };
		},
		headerFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'deviceId' && filterType === 'search') {
				sf.deviceId = String(filter == null ? '' : filter).trim().slice(0, 50);
			} else if (field === 'wxNickname' && filterType === 'search') {
				sf.wxNickname = String(filter == null ? '' : filter).trim().slice(0, 50);
			} else if (['useStatus', 'flag1', 'flag2', 'flag3', 'microMerchant'].includes(field) && filterType === 'select') {
				sf[field] = Array.isArray(filter) && filter.length ? String(filter[0]) : '';
			} else if (field === 'loginTime' && filterType === 'timestamp') {
				const { start, end } = this.parseTimestampRange(filter);
				sf.loginTimeStart = start;
				sf.loginTimeEnd = end;
			}
			this.pageInfo.currentPage = 1;
			this.search();
		},
		search() {
			this.loading = true;
			this.$request('list', {
				page: this.pageInfo.currentPage,
				pageSize: this.pageInfo.pageSize,
				mobile: this.searchForm.mobile,
				deviceId: this.searchForm.deviceId,
				wxNickname: this.searchForm.wxNickname,
				useStatus: this.searchForm.useStatus,
				flag1: this.searchForm.flag1,
				flag2: this.searchForm.flag2,
				flag3: this.searchForm.flag3,
				microMerchant: this.searchForm.microMerchant,
				loginTimeStart: this.searchForm.loginTimeStart,
				loginTimeEnd: this.searchForm.loginTimeEnd
			}, { functionName: 'merchant' }).then(res => {
				this.loading = false;
				if (res.code === 0) {
					this.list = res.data.list;
					this.pageInfo.total = res.data.total;
				} else {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
				}
			}).catch(() => {
				this.loading = false;
			});
		},
		reset() {
			this.searchForm = {
				mobile: '',
				deviceId: '',
				wxNickname: '',
				useStatus: '',
				flag1: '',
				flag2: '',
				flag3: '',
				microMerchant: '',
				loginTime: '',
				loginTimeStart: '',
				loginTimeEnd: ''
			};
			this.tableKey += 1;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		onPageChanged(page) {
			this.pageInfo.currentPage = page;
			this.search();
		},
		onPageSizeChange(size) {
			this.pageInfo.pageSize = size;
			this.pageInfo.currentPage = 1;
			this.search();
		},
		goAdd() {
			uni.navigateTo({ url: '/pages/merchant/list/add' });
		},
		toggleExportMenu() {
			this.showExportMenu = !this.showExportMenu;
		},
		selectAndExport(type) {
			this.showExportMenu = false;
			this.exportData(type);
		},
		async fetchExportRows() {
			const sf = this.searchForm;
			const ret = await this.$request('list', {
				page: 1,
				pageSize: 10000,
				mobile: sf.mobile,
				deviceId: sf.deviceId,
				wxNickname: sf.wxNickname,
				useStatus: sf.useStatus,
				flag1: sf.flag1,
				flag2: sf.flag2,
				flag3: sf.flag3,
				microMerchant: sf.microMerchant,
				loginTimeStart: sf.loginTimeStart,
				loginTimeEnd: sf.loginTimeEnd
			}, { functionName: 'merchant' });
			if (ret.code !== 0) throw new Error(ret.message || '导出数据获取失败');
			return (ret.data?.list || []).map((x) => ({
				机具号码: x.deviceNo || '',
				微信用户: x.wxUser || '',
				剩余额度: x.remainingQuota || '',
				待提现: x.pendingWithdraw || '',
				已提现: x.withdrawn || '',
				冻结金额: x.frozenAmount || '',
				优惠券: x.couponCount || 0,
				使用状态: x.useStatus || '',
				开关1: x.flag1 ? '启用' : '禁用',
				开关2: x.flag2 ? '启用' : '禁用',
				开关3: x.flag3 ? '启用' : '禁用',
				小微商户: x.microMerchant ? '启用' : '禁用',
				登录时间: x.loginTime || ''
			}));
		},
		downloadFile(filename, content, mimeType) {
			// #ifdef H5
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			// #endif
			// #ifndef H5
			uni.setClipboardData({ data: String(content || '') });
			// #endif
		},
		toCsv(rows) {
			const keys = Object.keys(rows[0] || {});
			const esc = (s) => {
				const t = String(s == null ? '' : s);
				return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
			};
			const lines = [keys.join(',')];
			rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(',')));
			return '\uFEFF' + lines.join('\r\n');
		},
		toTxt(rows) {
			return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n');
		},
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><merchants>${items}</merchants>`;
		},
		toHtmlTable(rows) {
			const keys = Object.keys(rows[0] || {});
			const th = keys.map((k) => `<th>${k}</th>`).join('');
			const tr = rows.map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : r[k]}</td>`).join('')}</tr>`).join('');
			return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
		},
		async exportData(type) {
			try {
				uni.showLoading({ title: '导出中...', mask: true });
				const rows = await this.fetchExportRows();
				if (!rows.length) return uni.showToast({ title: '暂无可导出数据', icon: 'none' });
				const ts = Date.now();
				if (type === 'json') this.downloadFile(`商户列表_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`商户列表_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`商户列表_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`商户列表_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`商户列表_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`商户列表_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},
		async openOfflineRecharge() {
			this.offlineForm = { mobile: '', packageId: '' };
			await this.loadOfflinePackages();
			this.$refs.offlineRechargePopup.open();
		},
		closeOfflineRecharge() {
			this.$refs.offlineRechargePopup.close();
		},
		async loadOfflinePackages() {
			try {
				const ret = await this.$request('quotaList', { page: 1, pageSize: 100 }, { functionName: 'merchant' });
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '套餐加载失败', icon: 'none' });
					this.offlinePackages = [];
					return;
				}
				const rows = ret.data?.list || [];
				this.offlinePackages = rows.map((x) => ({
					value: x.packageId || x.id,
					quotaText: Number(x.realQuota || 0).toFixed(0),
					priceText: Number(x.price || 0).toFixed(2),
					desc: x.description || '',
					title: x.title || ''
				}));
				if (this.offlinePackages.length) this.offlineForm.packageId = this.offlinePackages[0].value;
			} catch (e) {
				this.offlinePackages = [];
				uni.showToast({ title: '套餐加载失败', icon: 'none' });
			}
		},
		async submitOfflineRecharge() {
			const mobile = String(this.offlineForm.mobile || '').trim();
			const packageId = String(this.offlineForm.packageId || '').trim();
			if (!/^1\d{10}$/.test(mobile)) {
				uni.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
				return;
			}
			if (!packageId) {
				uni.showToast({ title: '请选择套餐', icon: 'none' });
				return;
			}
			this.offlineSubmitting = true;
			try {
				const ret = await this.$request('offlineFirstRecharge', { mobile, packageId }, { functionName: 'merchant' });
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '提交失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '充值成功', icon: 'success' });
				this.closeOfflineRecharge();
				this.search();
			} catch (e) {
				uni.showToast({ title: '提交失败', icon: 'none' });
			} finally {
				this.offlineSubmitting = false;
			}
		},
		onSwitch(item, field, value) {
			this.$request('updateSwitch', { id: item.id, field, value }, { functionName: 'merchant' }).then(res => {
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '更新失败', icon: 'none' });
					this.search();
				}
			}).catch(() => {
				uni.showToast({ title: '网络错误', icon: 'none' });
				this.search();
			});
		}
	}
};
</script>

<style scoped>
.uni-container {
	padding: 20px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
.export-menu {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	min-width: 130px;
	background: #fff;
	border: 1px solid #ebeef5;
	border-radius: 8px;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
	z-index: 10;
	padding: 6px;
}
.export-menu-item {
	line-height: 32px;
	padding: 0 10px;
	font-size: 13px;
	color: #303133;
	border-radius: 6px;
	cursor: pointer;
}
.export-menu-item:hover { background: #f5f7fa; }

.table-container-wrapper {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.table-container {
	background-color: #ffffff;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
	overflow: hidden;
	height: 100%;
	display: flex;
	flex-direction: column;
}

.uni-pagination-box {
	padding: 12px 16px;
	text-align: right;
	flex-shrink: 0;
}

.avatar,
.agreement {
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: #f3f4f6;
}

.agreement {
	border-radius: 8px;
}

.cell-multiline {
	white-space: pre-line;
	line-height: 18px;
}

.money {
	color: #2b6bff;
	font-weight: 600;
}

.offline-popup {
	width: 520px;
	max-width: 88vw;
	background: #fff;
	border-radius: 8px;
	padding: 16px;
}

.offline-title {
	font-size: 16px;
	font-weight: 700;
	color: #303133;
	margin-bottom: 12px;
}

.offline-label {
	font-size: 13px;
	color: #606266;
	margin: 10px 0 6px;
}

.offline-label.required::before {
	content: '*';
	color: #f56c6c;
	margin-right: 4px;
}

.offline-input {
	height: 36px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	padding: 0 10px;
	font-size: 13px;
}

.offline-packages {
	max-height: 280px;
	border: 1px solid #ebeef5;
	border-radius: 6px;
	padding: 8px 10px;
}

.offline-package-item {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px 0;
}

.offline-package-content {
	flex: 1;
}

.offline-package-main {
	font-size: 14px;
	color: #303133;
}

.offline-package-desc {
	font-size: 12px;
	color: #409eff;
	margin-top: 4px;
	word-break: break-all;
}

.offline-actions {
	margin-top: 14px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.img-preview-modal {
	width: 760px;
	max-width: 92vw;
	max-height: 90vh;
	background: #fff;
	border-radius: 10px;
	padding: 12px;
	box-sizing: border-box;
}

.img-preview-viewport {
	width: 100%;
	height: 76vh;
	max-height: 76vh;
	background: #f8fafc;
	border-radius: 8px;
	overflow: hidden;
	position: relative;
	cursor: grab;
	user-select: none;
}

.img-preview-viewport:active {
	cursor: grabbing;
}

.img-preview-main {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: auto;
	transform-origin: 0 0;
	will-change: transform;
}

.img-preview-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 10px;
}

.img-preview-tip {
	margin-top: 8px;
	font-size: 12px;
	color: #6b7280;
}
</style>

