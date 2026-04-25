<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" @click="search">刷新</button>
				<button size="mini" type="primary" @click="openGenerate">生成兑换券</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-wrap admin-table-slot">
				<uni-table border stripe :loading="loading" empty-text="暂无兑换券">
					<uni-tr>
						<uni-th align="center" width="180" filter-type="search" @filter-change="onFilterChange($event, 'codeKeyword')">兑换码</uni-th>
						<uni-th align="center" width="170">生成日期</uni-th>
						<uni-th align="center" width="170">有效期开始</uni-th>
						<uni-th align="center" width="170">有效期结束</uni-th>
						<uni-th align="center" width="100" filter-type="search" @filter-change="onFilterChange($event, 'memberStart')">会员时长起(天)</uni-th>
						<uni-th align="center" width="100" filter-type="search" @filter-change="onFilterChange($event, 'memberEnd')">会员时长止(天)</uni-th>
						<uni-th align="center" width="120" filter-type="select" :filter-data="usedFilterData" @filter-change="onFilterChange($event, 'used')">是否兑换</uni-th>
						<uni-th align="center" width="140">兑换商户</uni-th>
						<uni-th align="center" width="170">兑换日期</uni-th>
						<uni-th align="center" width="120">生成人员</uni-th>
					</uni-tr>
					<uni-tr v-for="item in list" :key="item.id">
						<uni-td align="center">{{ item.code }}</uni-td>
						<uni-td align="center">{{ item.generateTime || '-' }}</uni-td>
						<uni-td align="center">{{ item.validFrom || '-' }}</uni-td>
						<uni-td align="center">{{ item.validTo || '-' }}</uni-td>
						<uni-td align="center">{{ item.memberDays }}</uni-td>
						<uni-td align="center">{{ item.memberDays }}</uni-td>
						<uni-td align="center">{{ item.usedText }}</uni-td>
						<uni-td align="center">{{ item.usedMerchantName || '-' }}</uni-td>
						<uni-td align="center">{{ item.usedTime || '-' }}</uni-td>
						<uni-td align="center">{{ item.generateUser || '-' }}</uni-td>
					</uni-tr>
				</uni-table>
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

		<uni-popup ref="genPopup" type="center">
			<view class="dialog-panel">
				<view class="dialog-title">生成兑换券</view>
				<uni-forms :modelValue="genForm" label-width="110">
					<uni-forms-item label="生成数量">
						<uni-easyinput v-model="genForm.count" type="number" placeholder="1~200" />
					</uni-forms-item>
					<uni-forms-item label="有效开始时间">
						<uni-datetime-picker v-model="genForm.validFrom" type="datetime" />
					</uni-forms-item>
					<uni-forms-item label="有效结束时间">
						<uni-datetime-picker v-model="genForm.validTo" type="datetime" />
					</uni-forms-item>
					<uni-forms-item label="会员时长(天)">
						<uni-easyinput v-model="genForm.memberDays" type="number" placeholder="如 30" />
					</uni-forms-item>
				</uni-forms>
				<view class="dialog-actions">
					<button type="primary" size="mini" :loading="generating" @click="submitGenerate">确认生成</button>
					<button size="mini" @click="$refs.genPopup.close()">取消</button>
				</view>
			</view>
		</uni-popup>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
export default {
	data() {
		return {
			loading: false,
			generating: false,
			list: [],
			searchForm: { codeKeyword: '', used: '', usedList: [], memberStart: '', memberEnd: '' },
			usedFilterData: [
				{ text: '否', value: '0', checked: false },
				{ text: '已兑换', value: '1', checked: false }
			],
			pageInfo: { currentPage: 1, pageSize: 20, total: 0 },
			genForm: {
				count: 10,
				validFrom: Date.now(),
				validTo: Date.now() + 90 * 24 * 60 * 60 * 1000,
				memberDays: 30
			}
		};
	},
	onLoad() {
		this.search();
	},
	methods: {
		openGenerate() {
			this.$refs.genPopup.open();
		},
		buildPayload() {
			const sf = this.searchForm;
			return {
				codeKeyword: sf.codeKeyword,
				used: sf.usedList.length ? String(sf.usedList[0]) : sf.used,
				memberStart: sf.memberStart,
				memberEnd: sf.memberEnd
			};
		},
		onFilterChange(e, field) {
			const { filterType, filter } = e || {};
			const sf = this.searchForm;
			if (field === 'codeKeyword' && filterType === 'search') sf.codeKeyword = String(filter == null ? '' : filter).slice(0, 80);
			if (field === 'used' && filterType === 'select') {
				sf.usedList = Array.isArray(filter) ? filter.map(String) : [];
				sf.used = '';
			}
			if (field === 'memberStart' && filterType === 'search') sf.memberStart = Number(filter || 0) || '';
			if (field === 'memberEnd' && filterType === 'search') sf.memberEnd = Number(filter || 0) || '';
			this.pageInfo.currentPage = 1;
			this.search();
		},
		async search() {
			this.loading = true;
			try {
				const res = await this.$request(
					'exchangeCouponList',
					{
						page: this.pageInfo.currentPage,
						pageSize: this.pageInfo.pageSize,
						...this.buildPayload()
					},
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				this.list = res.data?.list || [];
				this.pageInfo.total = res.data?.total || 0;
			} finally {
				this.loading = false;
			}
		},
		async submitGenerate() {
			this.generating = true;
			try {
				const res = await this.$request(
					'exchangeCouponGenerate',
					{
						count: Number(this.genForm.count || 0),
						validFrom: Number(this.genForm.validFrom || 0),
						validTo: Number(this.genForm.validTo || 0),
						memberDays: Number(this.genForm.memberDays || 0)
					},
					{ functionName: 'merchant' }
				);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '生成失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: `已生成${res.data?.count || 0}个`, icon: 'success' });
				this.$refs.genPopup.close();
				this.search();
			} finally {
				this.generating = false;
			}
		},
		onPageChanged(page) {
			const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
			this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
			this.search();
		},
		onPageSizeChange(size) {
			const s = typeof size === 'number' ? size : Number(size?.pageSize || size?.size || size || 10);
			this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
			this.pageInfo.currentPage = 1;
			this.search();
		}
	}
};
</script>

<style scoped>
.table-wrap { min-height: 0; }
.dialog-panel {
	width: 560px;
	background: #fff;
	padding: 16px;
	border-radius: 8px;
}
.dialog-title {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 12px;
}
.dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
