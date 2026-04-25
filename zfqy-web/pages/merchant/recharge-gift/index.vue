<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group header-row">
				<input v-model="orderNo" class="kw-input" placeholder="充值订单号" @confirm="search" />
				<input v-model="keyword" class="kw-input" placeholder="微信/手机/机具" @confirm="search" />
				<picker mode="selector" :range="statusLabels" :value="statusIndex" @change="onStatusPick">
					<view class="picker-val">{{ statusLabels[statusIndex] }}</view>
				</picker>
				<button size="mini" @click="search">查询</button>
				<button size="mini" type="primary" @click="loadList">刷新</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="page-intro">
				<text class="page-title">充值赠品发货</text>
				<text class="page-sub">1000 元档及 0.2 元测试档用户选择的蓝牙音响 / 扫码POS机，请维护快递单号与签收状态</text>
			</view>
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" border stripe :loading="loading" empty-text="暂无记录">
						<uni-tr>
							<uni-th align="center" width="160">充值订单号</uni-th>
							<uni-th align="center" width="100">赠品</uni-th>
							<uni-th align="center" width="100">微信</uni-th>
							<uni-th align="center" width="110">手机</uni-th>
							<uni-th align="center" width="100">机具</uni-th>
							<uni-th align="center" width="90">品牌</uni-th>
							<uni-th align="center" width="140">快递单号</uni-th>
							<uni-th align="center" width="90">签收状态</uni-th>
							<uni-th align="center" width="150">创建时间</uni-th>
							<uni-th align="center" width="80">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="item in list" :key="item.id">
							<uni-td align="center" class="cell-mono">{{ item.orderNo }}</uni-td>
							<uni-td align="center">{{ item.giftLabel }}</uni-td>
							<uni-td align="center">{{ item.wxNickname || '—' }}</uni-td>
							<uni-td align="center">{{ item.mobile || '—' }}</uni-td>
							<uni-td align="center">{{ item.deviceId || '—' }}</uni-td>
							<uni-td align="center">{{ item.brandName || '—' }}</uni-td>
							<uni-td align="center">{{ item.trackingNo || '—' }}</uni-td>
							<uni-td align="center">{{ statusText(item.receiptStatus) }}</uni-td>
							<uni-td align="center" class="cell-time">{{ item.createTime }}</uni-td>
							<uni-td align="center">
								<button size="mini" type="primary" @click="openEdit(item)">维护</button>
							</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>
			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination
					show-icon
					show-page-size
					:page-size="pageInfo.pageSize"
					v-model="pageInfo.currentPage"
					:total="pageInfo.total"
					@change="onPageChanged"
					@pageSizeChange="onPageSizeChange"
				/>
			</view>
		</view>

		<uni-popup ref="editPopup" type="center">
			<view class="edit-popup">
				<view class="edit-head">
					<text class="edit-title">发货信息</text>
					<text class="edit-close" @click="closeEdit">×</text>
				</view>
				<view v-if="editRow" class="edit-body">
					<text class="edit-line">订单号：{{ editRow.orderNo }}</text>
					<text class="edit-line">赠品：{{ editRow.giftLabel }}</text>
					<text class="edit-label">快递单号</text>
					<input v-model="formTracking" class="edit-input" placeholder="填写物流单号" />
					<text class="edit-label">签收状态</text>
					<picker mode="selector" :range="editStatusLabels" :value="formStatusIndex" @change="onFormStatusPick">
						<view class="picker-val edit-picker">{{ editStatusLabels[formStatusIndex] }}</view>
					</picker>
					<button type="primary" :loading="saving" class="edit-save" @click="saveEdit">保存</button>
				</view>
			</view>
		</uni-popup>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
const STATUS_VALUES = ['', 'pending', 'shipped', 'signed'];
const STATUS_LABELS = ['全部', '待发货', '已发货', '已签收'];

export default {
	data() {
		return {
			orderNo: '',
			keyword: '',
			statusIndex: 0,
			statusLabels: STATUS_LABELS,
			loading: false,
			list: [],
			pageInfo: { currentPage: 1, pageSize: 10, total: 0 },
			editRow: null,
			formTracking: '',
			formStatusIndex: 1,
			editStatusLabels: ['待发货', '已发货', '已签收'],
			editStatusValues: ['pending', 'shipped', 'signed'],
			saving: false
		};
	},
	onLoad() {
		this.loadList();
	},
	methods: {
		statusText(s) {
			const m = { pending: '待发货', shipped: '已发货', signed: '已签收' };
			return m[s] || s || '—';
		},
		onStatusPick(e) {
			this.statusIndex = Number(e.detail.value || 0);
			this.search();
		},
		onFormStatusPick(e) {
			this.formStatusIndex = Number(e.detail.value || 0);
		},
		search() {
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		buildReceiptStatus() {
			return STATUS_VALUES[this.statusIndex] || '';
		},
		async loadList() {
			this.loading = true;
			try {
				const ret = await this.$request(
					'rechargeGiftShipmentList',
					{
						page: this.pageInfo.currentPage,
						pageSize: this.pageInfo.pageSize,
						orderNo: this.orderNo.trim(),
						keyword: this.keyword.trim(),
						receiptStatus: this.buildReceiptStatus()
					},
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '加载失败', icon: 'none' });
					return;
				}
				this.list = ret.data?.list || [];
				this.pageInfo.total = ret.data?.total || 0;
			} catch {
				uni.showToast({ title: '加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		onPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.loadList();
		},
		onPageSizeChange(size) {
			const s = typeof size === 'number' ? size : Number(size?.pageSize || size?.size || size || 10);
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
			this.pageInfo.currentPage = 1;
			this.loadList();
		},
		openEdit(item) {
			this.editRow = item;
			this.formTracking = item.trackingNo || '';
			const ix = this.editStatusValues.indexOf(item.receiptStatus || 'pending');
			this.formStatusIndex = ix >= 0 ? ix : 0;
			this.$refs.editPopup.open();
		},
		closeEdit() {
			this.$refs.editPopup.close();
			this.editRow = null;
		},
		async saveEdit() {
			if (!this.editRow) return;
			this.saving = true;
			try {
				const ret = await this.$request(
					'rechargeGiftShipmentUpdate',
					{
						id: this.editRow.id,
						trackingNo: this.formTracking.trim(),
						receiptStatus: this.editStatusValues[this.formStatusIndex] || 'pending'
					},
					{ functionName: 'merchant' }
				);
				if (ret.code !== 0) {
					uni.showToast({ title: ret.message || '保存失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '已保存', icon: 'success' });
				this.closeEdit();
				await this.loadList();
			} finally {
				this.saving = false;
			}
		}
	}
};
</script>

<style scoped>
.header-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.kw-input {
	width: 160px;
	height: 30px;
	padding: 0 8px;
	border: 1px solid #e5e7eb;
	border-radius: 4px;
	font-size: 13px;
}
.picker-val {
	min-width: 100px;
	padding: 4px 10px;
	border: 1px solid #e5e7eb;
	border-radius: 4px;
	font-size: 13px;
	color: #374151;
}
.page-intro {
	margin-bottom: 12px;
}
.page-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	color: #111827;
}
.page-sub {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: #6b7280;
	line-height: 1.5;
}
.cell-mono {
	font-size: 12px;
	word-break: break-all;
}
.cell-time {
	font-size: 12px;
}
.edit-popup {
	width: 320px;
	max-width: 90vw;
	background: #fff;
	border-radius: 12px;
	padding: 0 0 16px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}
.edit-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
	border-bottom: 1px solid #e5e7eb;
}
.edit-title {
	font-size: 16px;
	font-weight: 600;
}
.edit-close {
	font-size: 22px;
	line-height: 1;
	color: #9ca3af;
	padding: 4px;
}
.edit-body {
	padding: 12px 16px 0;
}
.edit-line {
	display: block;
	font-size: 13px;
	color: #374151;
	margin-bottom: 8px;
}
.edit-label {
	display: block;
	margin-top: 10px;
	margin-bottom: 4px;
	font-size: 12px;
	color: #6b7280;
}
.edit-input {
	width: 100%;
	height: 36px;
	padding: 0 10px;
	border: 1px solid #e5e7eb;
	border-radius: 6px;
	font-size: 14px;
	box-sizing: border-box;
}
.edit-picker {
	margin-top: 4px;
}
.edit-save {
	margin-top: 16px;
	width: 100%;
}
</style>
