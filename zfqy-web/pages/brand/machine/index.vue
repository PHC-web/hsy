<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<view class="header-actions">
					<button class="uni-button" type="default" size="mini" @click="reset">重置</button>
					<button class="uni-button" type="default" size="mini" @click="downloadInStockTemplate">下载入库模板</button>
					<button class="uni-button" type="default" size="mini" @click="triggerBatchImport">导入批量入库</button>
					<button class="uni-button" type="default" size="mini" @click="downloadUnbindTemplate">下载解绑模板</button>
					<button class="uni-button" type="default" size="mini" @click="triggerBatchUnbindImport">导入批量解绑</button>
					<button class="uni-button" type="default" size="mini" @click="downloadDeleteTemplate">下载删除模板</button>
					<button class="uni-button" type="default" size="mini" @click="triggerBatchDeleteImport">导入批量删除</button>
					<view class="export-dropdown" @mouseleave="showExportMenu = false">
						<button class="uni-button export-trigger" size="mini" @click="toggleExportMenu">
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
					<button class="uni-button" type="primary" size="mini" @click="addMachine">添加机具</button>
				</view>
			</view>
		</view>
		<view class="uni-container">
			<view class="table-container-wrapper admin-table-slot">
				<view class="table-container">
					<uni-table ref="table" :key="tableKey" border stripe :loading="loading">
						<uni-tr>
							<uni-th align="center" width="96" filter-type="search" @filter-change="headerFilterChange($event, 'deviceId')">设备编码</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="brandFilterData" @filter-change="headerFilterChange($event, 'brandId')">机具品牌</uni-th>
							<uni-th align="center" width="90">累计交易</uni-th>
							<uni-th align="center" width="100">待提/已提</uni-th>
							<uni-th align="center" width="90">冻结金额</uni-th>
							<uni-th align="center" width="90" filter-type="search" @filter-change="headerFilterChange($event, 'speakerId')">自有音箱号</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isBoundFilterData" @filter-change="headerFilterChange($event, 'isBound')">是否绑定</uni-th>
							<uni-th align="center" width="150" filter-type="timestamp" @filter-change="headerFilterChange($event, 'bindTime')">绑定人/时间/手机</uni-th>
							<uni-th align="center" width="100" filter-type="select" :filter-data="isActivatedFilterData" @filter-change="headerFilterChange($event, 'isActivated')">是否激活</uni-th>
							<uni-th align="center" width="130" filter-type="timestamp" @filter-change="headerFilterChange($event, 'activatedTime')">激活时间</uni-th>
							<uni-th align="center" width="100">所属商户</uni-th>
							<uni-th align="center" width="90">业务员</uni-th>
							<uni-th align="center" width="130" filter-type="timestamp" @filter-change="headerFilterChange($event, 'inStockTime')">入库时间</uni-th>
							<uni-th align="center" width="220">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(item, idx) in machineList" :key="item ? item.id : idx" v-if="item">
							<uni-td>{{ item.deviceId }}</uni-td>
							<uni-td>{{ item.brandName }}</uni-td>
							<uni-td>{{ item.totalTransaction }}</uni-td>
							<uni-td>{{ item.pendingWithdrawn }}</uni-td>
							<uni-td>
								<text class="link-like" @click="openFreezeBills(item)">{{ item.frozenAmount }}</text>
							</uni-td>
							<uni-td>{{ item.speakerId }}</uni-td>
							<uni-td>{{ item.isBoundText }}</uni-td>
							<uni-td>
								<view v-if="item.isBound === 1" class="bind-info">
									<text>{{ item.bindUserName || '-' }}</text>
									<text class="bind-meta">{{ item.bindTime || '-' }}</text>
									<text class="bind-meta">{{ item.bindUserMobile || '-' }}</text>
								</view>
								<text v-else>-</text>
							</uni-td>
							<uni-td align="center">{{ item.isActivatedText }}</uni-td>
							<uni-td align="center">{{ item.isActivated ? item.activatedTime : '-' }}</uni-td>
							<uni-td>{{ item.merchant }}</uni-td>
							<uni-td>{{ item.salesman }}</uni-td>
							<uni-td align="center">{{ item.inStockTime }}</uni-td>
							<uni-td>
								<view class="op-actions">
									<view class="op-row">
										<button class="op-btn" size="mini" type="primary" @click="openSwipe(item)">刷卡</button>
										<button class="op-btn" size="mini" type="primary" @click="openTrades(item)">交易</button>
										<button class="op-btn" size="mini" type="primary" @click="抽奖(item)">抽奖</button>
									</view>
									<view class="op-row">
										<button class="op-btn" size="mini" type="default" @click="编辑(item)">编辑</button>
										<button v-if="item.isBound === 1" class="op-btn" size="mini" type="warn" @click="解绑(item)">解绑</button>
										<button v-else class="op-btn" size="mini" type="primary" @click="打开绑定(item)">绑定</button>
										<button class="op-btn" size="mini" type="warn" @click="删除(item)">删除</button>
									</view>
								</view>
							</uni-td>
						</uni-tr>
					</uni-table>
				</view>
			</view>
			<view class="uni-pagination-box admin-page-pagination">
				<uni-pagination show-icon show-page-size :page-size="pageInfo.pageSize" v-model="pageInfo.currentPage" :total="pageInfo.total" @change="onPageChanged" @pageSizeChange="onPageSizeChange" />
			</view>
		</view>

		<uni-popup ref="swipePopup" type="center">
			<view class="popup-card">
				<view class="popup-header">
					<text class="popup-title">虚拟刷卡</text>
					<text class="popup-subtitle">机具编号：{{ (swipeForm && swipeForm.deviceId) || '' }}</text>
				</view>
				<view class="popup-body">
					<uni-forms ref="swipeFormRef" v-model="swipeForm" :rules="swipeRules" validateTrigger="bind" @submit="submitSwipe">
						<uni-forms-item name="amount" label="刷卡金额" required>
							<uni-easyinput v-model="swipeForm.amount" type="number" :clearable="false" placeholder="请输入正数金额" />
						</uni-forms-item>
						<view class="uni-button-group">
							<button style="width: 100px;" type="primary" class="uni-button" :disabled="swipeSubmitting" @click="triggerSwipeSubmit">提交</button>
							<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="swipeSubmitting" @click="$refs.swipePopup.close()">返回</button>
						</view>
					</uni-forms>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="refundPopup" type="center">
			<view class="popup-card">
				<view class="popup-header">
					<text class="popup-title">模拟退款</text>
					<text class="popup-subtitle">原交易单号：{{ (refundForm && refundForm.tradeNo) || '' }}</text>
				</view>
				<view class="popup-body">
					<view class="refund-hint">
						<text>原交易金额：￥{{ refundForm.originalAmountText }}</text>
						<text>已退：￥{{ refundForm.refundedTotalText }}</text>
						<text>可退：￥{{ refundForm.refundableAmountText }}</text>
					</view>
					<uni-forms ref="refundFormRef" v-model="refundForm" :rules="refundRules" validateTrigger="bind" @submit="submitRefund">
						<uni-forms-item name="amount" label="退款金额" required>
							<uni-easyinput v-model="refundForm.amount" type="number" :clearable="false" placeholder="不超过可退金额" />
						</uni-forms-item>
						<view class="uni-button-group">
							<button style="width: 100px;" type="warn" class="uni-button" :disabled="refundSubmitting" @click="triggerRefundSubmit">提交</button>
							<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="refundSubmitting" @click="$refs.refundPopup.close()">返回</button>
						</view>
					</uni-forms>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="bindPopup" type="center">
			<view class="popup-card">
				<view class="popup-header">
					<text class="popup-title">绑定商户</text>
					<text class="popup-subtitle">机具编号：{{ (bindForm && bindForm.deviceId) || '' }}</text>
				</view>
				<view class="popup-body">
					<uni-forms ref="bindFormRef" v-model="bindForm" :rules="bindRules" validateTrigger="bind" @submit="submitBind">
						<uni-forms-item name="mobile" label="商户手机号" required>
							<uni-easyinput v-model="bindForm.mobile" type="number" placeholder="请输入商户手机号码" :maxlength="11" />
						</uni-forms-item>
						<view class="uni-button-group">
							<button style="width: 100px;" type="primary" class="uni-button" :disabled="bindSubmitting" @click="triggerBindSubmit">确定</button>
							<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="bindSubmitting" @click="$refs.bindPopup.close()">取消</button>
						</view>
					</uni-forms>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="tradePopup" type="center">
			<view class="popup-card popup-wide trade-popup-card">
				<view class="popup-header trade-header">
					<view>
						<text class="popup-title">查看交易列表</text>
						<text class="popup-subtitle">机具编号：{{ tradeDeviceId }}</text>
					</view>
					<view class="trade-summary">
						<text class="trade-summary-label">交易额</text>
						<text class="trade-summary-value">￥{{ tradeTotalAmount.toFixed(2) }}</text>
					</view>
				</view>
				<view class="popup-body trade-body trade-body-scrollable">
					<view class="trade-table-wrap">
					<uni-table border stripe :loading="tradeLoading">
						<uni-tr>
							<uni-th align="center" width="120">机具编号</uni-th>
							<uni-th align="center" width="200">交易单号</uni-th>
							<uni-th align="center" width="120">用户信息</uni-th>
							<uni-th align="center" width="90">交易类型</uni-th>
							<uni-th align="center" width="90">交易金额</uni-th>
							<uni-th align="center" width="80">已退</uni-th>
							<uni-th align="center" width="80">可退</uni-th>
							<uni-th align="center" width="90">是否激活</uni-th>
							<uni-th align="center" width="100">累计交易</uni-th>
							<uni-th align="center" width="130">时间</uni-th>
							<uni-th align="center" width="100">操作</uni-th>
						</uni-tr>
						<uni-tr v-for="(row, idx) in tradeList" :key="idx" v-if="row">
							<uni-td align="center">{{ row.deviceId }}</uni-td>
							<uni-td align="center">{{ row.tradeNo }}</uni-td>
							<uni-td align="center" class="trade-user">{{ row.userInfo }}</uni-td>
							<uni-td align="center">{{ row.tradeType }}</uni-td>
							<uni-td align="center" class="trade-money">{{ row.amountText || row.totalTransaction }}</uni-td>
							<uni-td align="center">{{ row.refundedTotalText || '-' }}</uni-td>
							<uni-td align="center">{{ row.refundableAmountText || '-' }}</uni-td>
							<uni-td align="center">{{ row.isActivated }}</uni-td>
							<uni-td align="center" class="trade-money">{{ row.totalTransaction }}</uni-td>
							<uni-td align="center">{{ row.createTime }}</uni-td>
							<uni-td align="center">
								<button
									v-if="row.canSimulateRefund"
									class="uni-button"
									size="mini"
									type="warn"
									@click="openRefund(row)"
								>模拟退款</button>
								<text v-else-if="row.isRefund" class="refund-tag">退款</text>
								<text v-else>-</text>
							</uni-td>
						</uni-tr>
					</uni-table>
					</view>
					<view class="trade-footer">
						<text class="trade-count">显示第 {{ tradePageInfo.from }} 到第 {{ tradePageInfo.to }} 条记录，共 {{ tradePageInfo.total }} 条记录</text>
						<view class="trade-actions">
							<uni-pagination
								show-icon
								show-page-size
								:page-size="tradePageInfo.pageSize"
								v-model="tradePageInfo.page"
								:total="tradePageInfo.total"
								@change="onTradePageChanged"
								@pageSizeChange="onTradePageSizeChange"
							/>
							<button class="uni-button" size="mini" type="default" @click="$refs.tradePopup.close()">关闭</button>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="freezePopup" type="center">
			<view class="popup-card popup-wide freeze-popup-card">
				<view class="popup-header trade-header">
					<view>
						<text class="popup-title">查看冻结账单</text>
						<text class="popup-subtitle">机具编号：{{ freezeDeviceId }}</text>
					</view>
					<text class="popup-close-x" @click="$refs.freezePopup.close()">×</text>
				</view>
				<view class="popup-body trade-body freeze-body">
					<view class="freeze-table-wrap" :class="{ 'freeze-table-wrap--no-scroll': freezeList.length <= 5 }">
					<uni-table class="freeze-table" border stripe :loading="freezeLoading">
						<uni-tr>
							<uni-th align="center" width="180">机器编号</uni-th>
							<uni-th align="center" width="120" filter-type="search" @filter-change="freezeHeaderFilterChange($event, 'releaseMonth')">释放月份</uni-th>
							<uni-th align="center" width="260" filter-type="search" @filter-change="freezeHeaderFilterChange($event, 'tradeNo')">交易单号</uni-th>
							<uni-th align="center" width="120" filter-type="select" :filter-data="freezeTypeFilterData" @filter-change="freezeHeaderFilterChange($event, 'accountType')">账单类型</uni-th>
							<uni-th align="center" width="120">交易金额</uni-th>
							<uni-th align="center" width="120">原来金额</uni-th>
							<uni-th align="center" width="120">账单金额</uni-th>
							<uni-th align="center" width="120">金额比率</uni-th>
							<uni-th align="center" width="120">后来金额</uni-th>
							<uni-th align="center" width="170">账单时间</uni-th>
						</uni-tr>
						<uni-tr v-for="(row, idx) in freezeList" :key="idx">
							<uni-td align="center">{{ row.deviceId }}</uni-td>
							<uni-td align="center">{{ row.releaseMonth }}</uni-td>
							<uni-td align="center">{{ row.tradeNo }}</uni-td>
							<uni-td align="center" :class="row.accountType === '冻结' ? 'freeze-tag' : 'release-tag'">{{ row.accountType }}</uni-td>
							<uni-td align="center">{{ row.tradeAmount }}</uni-td>
							<uni-td align="center">{{ row.originalAmount }}</uni-td>
							<uni-td align="center">{{ row.billAmount }}</uni-td>
							<uni-td align="center">{{ row.ratioText }}</uni-td>
							<uni-td align="center">{{ row.postAmount }}</uni-td>
							<uni-td align="center">{{ row.createTime }}</uni-td>
						</uni-tr>
					</uni-table>
					</view>
					<view class="trade-footer freeze-footer">
						<text class="trade-count">显示第 {{ freezePageInfo.from }} 到第 {{ freezePageInfo.to }} 条记录，共 {{ freezePageInfo.total }} 条记录</text>
						<view class="trade-actions">
							<uni-pagination
								show-icon
								show-page-size
								:page-size="freezePageInfo.pageSize"
								v-model="freezePageInfo.page"
								:total="freezePageInfo.total"
								@change="onFreezePageChanged"
								@pageSizeChange="onFreezePageSizeChange"
							/>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>

		<uni-popup ref="batchUnbindPreviewPopup" type="center">
			<view class="popup-card popup-wide">
				<view class="popup-header">
					<text class="popup-title">批量解绑预览</text>
					<text class="popup-subtitle">共 {{ batchUnbindPreviewRows.length }} 条，确认后执行解绑</text>
				</view>
				<view class="popup-body trade-body">
					<uni-table border stripe>
						<uni-tr>
							<uni-th align="center" width="90">行号</uni-th>
							<uni-th align="center" width="200">机具编号</uni-th>
							<uni-th align="center" width="140">自有音箱号</uni-th>
						</uni-tr>
						<uni-tr v-for="(row, idx) in batchUnbindPreviewRows" :key="idx">
							<uni-td align="center">{{ row.rowNo }}</uni-td>
							<uni-td align="center">{{ row.deviceId }}</uni-td>
							<uni-td align="center">{{ row.speakerId || '-' }}</uni-td>
						</uni-tr>
					</uni-table>
					<view class="trade-footer">
						<text class="trade-count">请确认导入内容无误后再提交</text>
						<view class="trade-actions">
							<button class="uni-button" size="mini" type="default" @click="$refs.batchUnbindPreviewPopup.close()">取消</button>
							<button class="uni-button" size="mini" type="warn" :disabled="batchUnbinding" @click="confirmBatchUnbind">确认解绑</button>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>
		<uni-popup ref="batchDeletePreviewPopup" type="center">
			<view class="popup-card popup-wide">
				<view class="popup-header">
					<text class="popup-title">批量删除预览</text>
					<text class="popup-subtitle">共 {{ batchDeletePreviewRows.length }} 条，确认后执行删除</text>
				</view>
				<view class="popup-body trade-body">
					<uni-table border stripe>
						<uni-tr>
							<uni-th align="center" width="90">行号</uni-th>
							<uni-th align="center" width="220">机具编号</uni-th>
						</uni-tr>
						<uni-tr v-for="(row, idx) in batchDeletePreviewRows" :key="idx">
							<uni-td align="center">{{ row.rowNo }}</uni-td>
							<uni-td align="center">{{ row.deviceId }}</uni-td>
						</uni-tr>
					</uni-table>
					<view class="trade-footer">
						<text class="trade-count">请确认导入内容无误后再提交</text>
						<view class="trade-actions">
							<button class="uni-button" size="mini" type="default" @click="$refs.batchDeletePreviewPopup.close()">取消</button>
							<button class="uni-button" size="mini" type="warn" :disabled="batchDeleting" @click="confirmBatchDelete">确认删除</button>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import UniForms from "@/uni_modules/uni-forms/components/uni-forms/uni-forms";
import UniFormsItem from "@/uni_modules/uni-forms/components/uni-forms-item/uni-forms-item";
import UniEasyinput from "@/uni_modules/uni-easyinput/components/uni-easyinput/uni-easyinput";
import * as XLSX from 'xlsx';

export default {
	components: {
		UniForms,
		UniFormsItem,
		UniEasyinput
	},
	data() {
		return {
			searchForm: {
				deviceId: '',
				brandId: '',
				brandIds: [],
				speakerId: '',
				isBound: '',
				isBoundList: [],
				bindTimeStart: '',
				bindTimeEnd: '',
				isActivated: '',
				isActivatedList: [],
				activatedTimeStart: '',
				activatedTimeEnd: '',
				inStockTimeStart: '',
				inStockTimeEnd: ''
			},
			isBoundFilterData: [
				{ text: '未绑定', value: '0', checked: false },
				{ text: '已绑定', value: '1', checked: false },
				{ text: '已解绑', value: '2', checked: false }
			],
			isActivatedFilterData: [
				{ text: '已激活', value: '1', checked: false },
				{ text: '未激活', value: '0', checked: false }
			],
			machineList: [],
			brandList: [],
			loading: false,
			swipeSubmitting: false,
			swipeForm: {
				deviceId: '',
				amount: ''
			},
			swipeRules: {
				amount: {
					rules: [
						{ required: true, errorMessage: '请输入刷卡金额' },
						{
							validateFunction: (rule, value, data, callback) => {
								const v = Number(value);
								if (!Number.isFinite(v) || v <= 0) {
									callback('刷卡金额只允许输入正数');
									return;
								}
								callback();
							},
							errorMessage: '刷卡金额只允许输入正数'
						}
					]
				}
			},
			refundSubmitting: false,
			refundForm: {
				deviceId: '',
				tradeNo: '',
				originalAmount: 0,
				refundedTotal: 0,
				refundableAmount: 0,
				originalAmountText: '0.00',
				refundedTotalText: '0.00',
				refundableAmountText: '0.00',
				amount: ''
			},
			refundRules: {
				amount: {
					rules: [
						{ required: true, errorMessage: '请输入退款金额' },
						{
							validateFunction: (rule, value, data, callback) => {
								const v = Number(value);
								const max = Number(data.refundableAmount || 0);
								if (!Number.isFinite(v) || v <= 0) {
									callback('退款金额必须为正数');
									return;
								}
								if (v - max > 0.009) {
									callback(`退款金额不能超过可退￥${max.toFixed(2)}`);
									return;
								}
								callback();
							}
						}
					]
				}
			},
			tradeDeviceId: '',
			tradeTotalAmount: 0,
			tradeLoading: false,
			tradeList: [],
			tradePageInfo: {
				page: 1,
				pageSize: 10,
				total: 0,
				from: 0,
				to: 0
			},
			freezeDeviceId: '',
			freezeLoading: false,
			freezeList: [],
			freezeFilters: {
				releaseMonth: '',
				tradeNo: '',
				accountType: ''
			},
			freezeTypeFilterData: [
				{ text: '冻结', value: '冻结', checked: false },
				{ text: '释放', value: '释放', checked: false }
			],
			freezePageInfo: {
				page: 1,
				pageSize: 20,
				total: 0,
				from: 0,
				to: 0
			},
			bindForm: {
				deviceId: '',
				mobile: ''
			},
			bindSubmitting: false,
			bindRules: {
				mobile: {
					rules: [
						{ required: true, errorMessage: '请输入商户手机号码' },
						{ pattern: /^1\d{10}$/, errorMessage: '请输入正确的11位手机号' }
					]
				}
			},
			pageInfo: {
				currentPage: 1,
				pageSize: 10,
				total: 0
			},
			tableKey: 1,
			showExportMenu: false,
			importing: false,
			batchUnbindImporting: false,
			batchUnbinding: false,
			batchUnbindPreviewRows: [],
			batchDeleteImporting: false,
			batchDeleting: false,
			batchDeletePreviewRows: [],
			exportTypeOptions: [
				{ text: 'JSON', value: 'json' },
				{ text: 'XML', value: 'xml' },
				{ text: 'CSV', value: 'csv' },
				{ text: 'TXT', value: 'txt' },
				{ text: 'MS-Word', value: 'word' },
				{ text: 'MS-Excel', value: 'excel' }
			]
		};
	},
	computed: {
		brandFilterData() {
			return (this.brandList || []).map((brand) => ({
				text: brand.label,
				value: String(brand.value),
				checked: false
			}));
		}
	},
	mounted() {
			this.getBrandList();
			this.search();
		},
		methods: {
			// 获取品牌列表
			getBrandList() {
				this.$request('list', { page: 1, pageSize: 1000 }, {
					functionName: 'brand'
				}).then(res => {
					if (res.code === 0) {
						this.brandList = (res.data?.list || []).map(item => ({
							value: String(item.id),
							label: item.brandName
						}));
					}
				});
			},
			
			// 搜索
			search() {
				this.loading = true;
				const sf = this.searchForm;
				this.$request('list', {
					page: this.pageInfo.currentPage,
					pageSize: this.pageInfo.pageSize,
					deviceId: sf.deviceId,
					brandId: sf.brandIds.length ? '' : sf.brandId,
					brandIds: sf.brandIds,
					speakerId: sf.speakerId,
					isBound: sf.isBoundList.length ? '' : sf.isBound,
					isBoundList: sf.isBoundList,
					bindTimeStart: sf.bindTimeStart,
					bindTimeEnd: sf.bindTimeEnd,
					isActivated: sf.isActivatedList.length ? '' : sf.isActivated,
					isActivatedList: sf.isActivatedList,
					activatedTimeStart: sf.activatedTimeStart,
					activatedTimeEnd: sf.activatedTimeEnd,
					inStockTimeStart: sf.inStockTimeStart,
					inStockTimeEnd: sf.inStockTimeEnd
				}, {
					functionName: 'machine'
				}).then(res => {
					this.loading = false;
					if (res.code === 0) {
						this.machineList = res.data.list;
						this.pageInfo.total = res.data.total;
					}
				}).catch(() => {
					this.loading = false;
				});
			},

			runSearchFromHeader() {
				this.pageInfo.currentPage = 1;
				this.search();
			},
			reset() {
				this.searchForm = {
					deviceId: '',
					brandId: '',
					brandIds: [],
					speakerId: '',
					isBound: '',
					isBoundList: [],
					bindTimeStart: '',
					bindTimeEnd: '',
					isActivated: '',
					isActivatedList: [],
					activatedTimeStart: '',
					activatedTimeEnd: '',
					inStockTimeStart: '',
					inStockTimeEnd: ''
				};
				this.isBoundFilterData = [
					{ text: '未绑定', value: '0', checked: false },
					{ text: '已绑定', value: '1', checked: false },
					{ text: '已解绑', value: '2', checked: false }
				];
				this.isActivatedFilterData = [
					{ text: '已激活', value: '1', checked: false },
					{ text: '未激活', value: '0', checked: false }
				];
				this.tableKey += 1;
				this.pageInfo.currentPage = 1;
				this.search();
			},

			parseTimestampRange(filter) {
				if (!Array.isArray(filter) || filter.length < 2) {
					return { start: '', end: '' };
				}
				const a = Number(filter[0]);
				const b = Number(filter[1]);
				return {
					start: Number.isFinite(a) ? a : '',
					end: Number.isFinite(b) ? b : ''
				};
			},

			headerFilterChange(e, field) {
				const { filterType, filter } = e || {};
				const sf = this.searchForm;
				if (field === 'deviceId' && filterType === 'search') {
					sf.deviceId = String(filter == null ? '' : filter).slice(0, 50);
				} else if (field === 'speakerId' && filterType === 'search') {
					sf.speakerId = String(filter == null ? '' : filter).slice(0, 50);
				} else if (field === 'brandId' && filterType === 'select') {
					sf.brandIds = Array.isArray(filter) ? filter.map(String) : [];
					sf.brandId = '';
				} else if (field === 'isBound' && filterType === 'select') {
					sf.isBoundList = Array.isArray(filter) ? filter.map(String) : [];
					sf.isBound = '';
				} else if (field === 'isActivated' && filterType === 'select') {
					sf.isActivatedList = Array.isArray(filter) ? filter.map(String) : [];
					sf.isActivated = '';
				} else if (field === 'bindTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.bindTimeStart = start;
					sf.bindTimeEnd = end;
				} else if (field === 'activatedTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.activatedTimeStart = start;
					sf.activatedTimeEnd = end;
				} else if (field === 'inStockTime' && filterType === 'timestamp') {
					const { start, end } = this.parseTimestampRange(filter);
					sf.inStockTimeStart = start;
					sf.inStockTimeEnd = end;
				}
				this.pageInfo.currentPage = 1;
				this.search();
			},
			
			// 分页变化
			onPageChanged(page) {
				const p = typeof page === 'number' ? page : Number(page?.current || page?.currentPage || page?.page || 1);
				this.pageInfo.currentPage = Number.isFinite(p) && p > 0 ? p : 1;
				this.search();
			},
			
			// 页大小变化
			onPageSizeChange(size) {
				const s = typeof size === 'number' ? size : Number(size?.pageSize || size?.size || size || 10);
				this.pageInfo.pageSize = Number.isFinite(s) && s > 0 ? s : 10;
				this.pageInfo.currentPage = 1;
				this.search();
			},
			
			// 添加机具
			addMachine() {
				// 跳转到添加页面
				uni.navigateTo({
					url: '/pages/brand/machine/add'
				});
			},
			downloadInStockTemplate() {
				// #ifdef H5
				const a = document.createElement('a');
				a.href = '/static/机具入库模板.xlsx';
				a.download = '机具入库模板.xlsx';
				a.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台下载模板', icon: 'none' });
				// #endif
			},
			triggerBatchImport() {
				// #ifdef H5
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.xlsx,.xls';
				input.onchange = (e) => this.onBatchFileSelected(e);
				input.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台导入', icon: 'none' });
				// #endif
			},
			downloadUnbindTemplate() {
				// #ifdef H5
				const a = document.createElement('a');
				a.href = '/static/机具解绑模板.xlsx';
				a.download = '机具解绑模板.xlsx';
				a.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台下载模板', icon: 'none' });
				// #endif
			},
			triggerBatchUnbindImport() {
				// #ifdef H5
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.xlsx,.xls';
				input.onchange = (e) => this.onBatchUnbindFileSelected(e);
				input.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台导入', icon: 'none' });
				// #endif
			},
			downloadDeleteTemplate() {
				// #ifdef H5
				const a = document.createElement('a');
				a.href = '/static/机具删除模板.xlsx';
				a.download = '机具删除模板.xlsx';
				a.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台下载模板', icon: 'none' });
				// #endif
			},
			triggerBatchDeleteImport() {
				// #ifdef H5
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.xlsx,.xls';
				input.onchange = (e) => this.onBatchDeleteFileSelected(e);
				input.click();
				// #endif
				// #ifndef H5
				uni.showToast({ title: '当前仅支持H5后台导入', icon: 'none' });
				// #endif
			},
			normalizeImportHeader(h) {
				return String(h || '').replace(/\s+/g, '').toLowerCase();
			},
			pickValueByHeader(row, headerMap, aliases) {
				for (let i = 0; i < aliases.length; i += 1) {
					const key = headerMap[this.normalizeImportHeader(aliases[i])];
					if (key && row[key] !== undefined && row[key] !== null) {
						return String(row[key]).trim();
					}
				}
				return '';
			},
			async onBatchFileSelected(e) {
				if (this.importing) return;
				const file = e?.target?.files?.[0];
				if (!file) return;
				try {
					this.importing = true;
					uni.showLoading({ title: '导入校验中...', mask: true });
					const ab = await file.arrayBuffer();
					const wb = XLSX.read(ab, { type: 'array' });
					const sheetName = wb.SheetNames && wb.SheetNames[0];
					if (!sheetName) throw new Error('模板无可读取工作表');
					const sheet = wb.Sheets[sheetName];
					const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
					if (!rawRows.length) throw new Error('模板内容为空');

					const firstRow = rawRows[0] || {};
					const headerMap = {};
					Object.keys(firstRow).forEach((k) => {
						headerMap[this.normalizeImportHeader(k)] = k;
					});

					const payloadRows = [];
					for (let i = 0; i < rawRows.length; i += 1) {
						const row = rawRows[i] || {};
						const rowNo = i + 2;
						const deviceId = this.pickValueByHeader(row, headerMap, ['机具编号', '设备编码', 'device_id', 'deviceid']);
						const brandId = this.pickValueByHeader(row, headerMap, ['品牌ID', '品牌id', 'brand_id', 'brandid']);
						const speakerId = this.pickValueByHeader(row, headerMap, ['自有音箱号', '音箱号', 'speaker_id', 'speakerid']);
						if (!deviceId || !brandId) {
							throw new Error(`导入失败，请检查第${rowNo}行：机具编号和品牌ID必填`);
						}
						payloadRows.push({ rowNo, deviceId, brandId, speakerId });
					}

					const res = await this.$request('batchImport', { rows: payloadRows }, { functionName: 'machine' });
					if (res.code !== 0) throw new Error(res.message || '导入失败');
					uni.showToast({ title: `导入成功${res.data?.successCount || payloadRows.length}条`, icon: 'success' });
					this.pageInfo.currentPage = 1;
					this.search();
				} catch (err) {
					uni.showToast({ title: err?.message || '导入失败', icon: 'none' });
				} finally {
					this.importing = false;
					uni.hideLoading();
				}
			},
			async onBatchUnbindFileSelected(e) {
				if (this.batchUnbindImporting) return;
				const file = e?.target?.files?.[0];
				if (!file) return;
				try {
					this.batchUnbindImporting = true;
					uni.showLoading({ title: '解析模板中...', mask: true });
					const ab = await file.arrayBuffer();
					const wb = XLSX.read(ab, { type: 'array' });
					const sheetName = wb.SheetNames && wb.SheetNames[0];
					if (!sheetName) throw new Error('模板无可读取工作表');
					const sheet = wb.Sheets[sheetName];
					const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
					if (!rawRows.length) throw new Error('模板内容为空');

					const firstRow = rawRows[0] || {};
					const headerMap = {};
					Object.keys(firstRow).forEach((k) => {
						headerMap[this.normalizeImportHeader(k)] = k;
					});

					const rows = [];
					for (let i = 0; i < rawRows.length; i += 1) {
						const row = rawRows[i] || {};
						const rowNo = i + 2;
						const deviceId = this.pickValueByHeader(row, headerMap, ['机具编号', '设备编码', 'device_id', 'deviceid']);
						const speakerId = this.pickValueByHeader(row, headerMap, ['自有音箱号', '音箱号', 'speaker_id', 'speakerid']);
						if (!deviceId) {
							throw new Error(`导入失败，请检查第${rowNo}行：机具编号必填`);
						}
						rows.push({ rowNo, deviceId, speakerId });
					}

					this.batchUnbindPreviewRows = rows;
					this.$refs.batchUnbindPreviewPopup.open();
				} catch (err) {
					uni.showToast({ title: err?.message || '导入失败', icon: 'none' });
				} finally {
					this.batchUnbindImporting = false;
					uni.hideLoading();
				}
			},
			async confirmBatchUnbind() {
				if (this.batchUnbinding || !this.batchUnbindPreviewRows.length) return;
				try {
					this.batchUnbinding = true;
					uni.showLoading({ title: '批量解绑中...', mask: true });
					const res = await this.$request(
						'batchUnbind',
						{ rows: this.batchUnbindPreviewRows },
						{ functionName: 'machine' }
					);
					if (res.code !== 0) throw new Error(res.message || '批量解绑失败');
					uni.showToast({ title: `解绑成功${res.data?.successCount || this.batchUnbindPreviewRows.length}条`, icon: 'success' });
					this.batchUnbindPreviewRows = [];
					this.$refs.batchUnbindPreviewPopup.close();
					this.pageInfo.currentPage = 1;
					this.search();
				} catch (err) {
					uni.showToast({ title: err?.message || '批量解绑失败', icon: 'none' });
				} finally {
					this.batchUnbinding = false;
					uni.hideLoading();
				}
			},
			async onBatchDeleteFileSelected(e) {
				if (this.batchDeleteImporting) return;
				const file = e?.target?.files?.[0];
				if (!file) return;
				try {
					this.batchDeleteImporting = true;
					uni.showLoading({ title: '解析模板中...', mask: true });
					const ab = await file.arrayBuffer();
					const wb = XLSX.read(ab, { type: 'array' });
					const sheetName = wb.SheetNames && wb.SheetNames[0];
					if (!sheetName) throw new Error('模板无可读取工作表');
					const sheet = wb.Sheets[sheetName];
					const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
					if (!rawRows.length) throw new Error('模板内容为空');

					const firstRow = rawRows[0] || {};
					const headerMap = {};
					Object.keys(firstRow).forEach((k) => {
						headerMap[this.normalizeImportHeader(k)] = k;
					});

					const rows = [];
					for (let i = 0; i < rawRows.length; i += 1) {
						const row = rawRows[i] || {};
						const rowNo = i + 2;
						const deviceId = this.pickValueByHeader(row, headerMap, ['机具编号', '设备编码', 'device_id', 'deviceid']);
						if (!deviceId) {
							throw new Error(`删除失败，请检查第${rowNo}行：机具编号必填`);
						}
						rows.push({ rowNo, deviceId });
					}

					this.batchDeletePreviewRows = rows;
					this.$refs.batchDeletePreviewPopup.open();
				} catch (err) {
					uni.showToast({ title: err?.message || '导入失败', icon: 'none' });
				} finally {
					this.batchDeleteImporting = false;
					uni.hideLoading();
				}
			},
			async confirmBatchDelete() {
				if (this.batchDeleting || !this.batchDeletePreviewRows.length) return;
				try {
					this.batchDeleting = true;
					uni.showLoading({ title: '批量删除中...', mask: true });
					const res = await this.$request(
						'batchDelete',
						{ rows: this.batchDeletePreviewRows },
						{ functionName: 'machine' }
					);
					if (res.code !== 0) throw new Error(res.message || '批量删除失败');
					uni.showToast({ title: `删除成功${res.data?.successCount || this.batchDeletePreviewRows.length}条`, icon: 'success' });
					this.batchDeletePreviewRows = [];
					this.$refs.batchDeletePreviewPopup.close();
					this.pageInfo.currentPage = 1;
					this.search();
				} catch (err) {
					uni.showToast({ title: err?.message || '批量删除失败', icon: 'none' });
				} finally {
					this.batchDeleting = false;
					uni.hideLoading();
				}
			},

			openSwipe(item) {
				if (item?.isBound !== 1 || !item?.bindUserId) {
					uni.showToast({ title: '未绑定用户不允许刷卡', icon: 'none' });
					return;
				}
				this.swipeForm = {
					deviceId: item.deviceId,
					amount: ''
				};
				this.$refs.swipePopup.open();
			},

			triggerSwipeSubmit() {
				this.$refs.swipeFormRef.submit();
			},

			submitSwipe(event) {
				if (this.swipeSubmitting) return;
				const { value, errors } = event.detail || {};
				if (errors) return;

				this.swipeSubmitting = true;
				uni.showLoading({ title: '提交中...', mask: true });
				this.$request('virtualSwipe', {
					deviceId: this.swipeForm.deviceId,
					amount: value.amount
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						uni.showToast({ title: '刷卡成功', icon: 'success' });
						this.$refs.swipePopup.close();
						this.search();
					} else {
						uni.showToast({ title: res.message || '刷卡失败', icon: 'none' });
					}
				}).catch(err => {
					uni.showModal({ content: err?.message || '请求服务失败', showCancel: false });
				}).finally(() => {
					this.swipeSubmitting = false;
					uni.hideLoading();
				});
			},

			openRefund(row) {
				if (!row || !row.canSimulateRefund) return;
				const orig = Math.abs(Number(row.amount || 0));
				const refunded = Number(row.refundedTotal || 0);
				const refundable = Number(row.refundableAmount || 0);
				this.refundForm = {
					deviceId: row.deviceId || this.tradeDeviceId,
					tradeNo: row.tradeNo,
					originalAmount: orig,
					refundedTotal: refunded,
					refundableAmount: refundable,
					originalAmountText: orig.toFixed(2),
					refundedTotalText: refunded.toFixed(2),
					refundableAmountText: refundable.toFixed(2),
					amount: refundable > 0 ? String(refundable) : ''
				};
				this.$refs.refundPopup.open();
			},

			triggerRefundSubmit() {
				this.$refs.refundFormRef.submit();
			},

			submitRefund(event) {
				if (this.refundSubmitting) return;
				const { value, errors } = event.detail || {};
				if (errors) return;
				this.refundSubmitting = true;
				uni.showLoading({ title: '提交中...', mask: true });
				this.$request('virtualRefund', {
					deviceId: this.refundForm.deviceId,
					tradeNo: this.refundForm.tradeNo,
					amount: value.amount
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						uni.showToast({ title: '模拟退款成功', icon: 'success' });
						this.$refs.refundPopup.close();
						this.fetchTrades();
						this.search();
					} else {
						uni.showToast({ title: res.message || '模拟退款失败', icon: 'none' });
					}
				}).catch(err => {
					uni.showModal({ content: err?.message || '请求服务失败', showCancel: false });
				}).finally(() => {
					this.refundSubmitting = false;
					uni.hideLoading();
				});
			},

			openTrades(item) {
				this.tradeDeviceId = item.deviceId;
				const num = Number(String(item.totalTransaction || '').replace(/[^\d.]/g, ''));
				this.tradeTotalAmount = Number.isFinite(num) ? num : 0;
				this.tradePageInfo.page = 1;
				this.fetchTrades();
				this.$refs.tradePopup.open();
			},

			fetchTrades() {
				this.tradeLoading = true;
				this.$request('tradeList', {
					deviceId: this.tradeDeviceId,
					page: this.tradePageInfo.page,
					pageSize: this.tradePageInfo.pageSize
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						this.tradeList = (res.data && res.data.list) ? res.data.list : [];
						this.tradePageInfo.total = (res.data && res.data.total) || 0;
						const from = this.tradePageInfo.total === 0 ? 0 : (this.tradePageInfo.page - 1) * this.tradePageInfo.pageSize + 1;
						const to = Math.min(this.tradePageInfo.page * this.tradePageInfo.pageSize, this.tradePageInfo.total);
						this.tradePageInfo.from = from;
						this.tradePageInfo.to = to;
					} else {
						uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					}
				}).finally(() => {
					this.tradeLoading = false;
				});
			},
			onTradePageChanged(page) {
				const nextPage = Number((page && (page.current || page.page || page.currentPage)) || page || 1);
				this.tradePageInfo.page = Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1;
				this.fetchTrades();
			},
			onTradePageSizeChange(size) {
				const nextSize = Number((size && (size.pageSize || size.size || size.current)) || size || 10);
				this.tradePageInfo.pageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 10;
				this.tradePageInfo.page = 1;
				this.fetchTrades();
			},

			openFreezeBills(item) {
				this.freezeDeviceId = item.deviceId;
				this.freezeFilters = {
					releaseMonth: '',
					tradeNo: '',
					accountType: ''
				};
				this.freezeTypeFilterData = [
					{ text: '冻结', value: '冻结', checked: false },
					{ text: '释放', value: '释放', checked: false }
				];
				this.freezePageInfo.page = 1;
				this.fetchFreezeBills();
				this.$refs.freezePopup.open();
			},
			freezeHeaderFilterChange(e, field) {
				const { filterType, filter } = e || {};
				if (field === 'releaseMonth' && filterType === 'search') {
					this.freezeFilters.releaseMonth = String(filter == null ? '' : filter).trim().slice(0, 7);
				} else if (field === 'tradeNo' && filterType === 'search') {
					this.freezeFilters.tradeNo = String(filter == null ? '' : filter).trim().slice(0, 80);
				} else if (field === 'accountType' && filterType === 'select') {
					const arr = Array.isArray(filter) ? filter.map(String) : [];
					this.freezeFilters.accountType = arr[0] || '';
				}
				this.freezePageInfo.page = 1;
				this.fetchFreezeBills();
			},
			fetchFreezeBills() {
				this.freezeLoading = true;
				const f = this.freezeFilters || {};
				this.$request('freezeBillList', {
					deviceId: this.freezeDeviceId,
					page: this.freezePageInfo.page,
					pageSize: this.freezePageInfo.pageSize,
					releaseMonth: String(f.releaseMonth || '').trim(),
					tradeNo: String(f.tradeNo || '').trim(),
					accountType: String(f.accountType || '').trim()
				}, { functionName: 'machine' }).then((res) => {
					if (res.code === 0) {
						this.freezeList = (res.data && res.data.list) ? res.data.list : [];
						this.freezePageInfo.total = (res.data && res.data.total) || 0;
						const from = this.freezePageInfo.total === 0 ? 0 : (this.freezePageInfo.page - 1) * this.freezePageInfo.pageSize + 1;
						const to = Math.min(this.freezePageInfo.page * this.freezePageInfo.pageSize, this.freezePageInfo.total);
						this.freezePageInfo.from = from;
						this.freezePageInfo.to = to;
					} else {
						uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					}
				}).finally(() => {
					this.freezeLoading = false;
				});
			},
			onFreezePageChanged(page) {
				const nextPage = Number(
					(page && (page.current || page.page || page.currentPage)) || page || 1
				);
				this.freezePageInfo.page = Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1;
				this.fetchFreezeBills();
			},
			onFreezePageSizeChange(size) {
				const nextSize = Number(
					(size && (size.pageSize || size.size || size.current)) || size || 20
				);
				this.freezePageInfo.pageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 20;
				this.freezePageInfo.page = 1;
				this.fetchFreezeBills();
			},
		
		// 刷卡
		刷卡(item) {
			this.openSwipe(item);
		},
		
		// 交易
		交易(item) {
			this.openTrades(item);
		},
		
		// 抽奖
		抽奖(item) {
			uni.showToast({ title: '抽奖功能开发中', icon: 'none' });
		},
		
		// 编辑
		编辑(item) {
			uni.showToast({ title: '编辑功能开发中', icon: 'none' });
		},
		
		// 打开绑定弹窗
			打开绑定(item) {
				this.bindForm = {
					deviceId: item.deviceId,
					mobile: ''
				};
				this.$refs.bindPopup.open();
			},

			triggerBindSubmit() {
				this.$refs.bindFormRef.submit();
			},

			submitBind(event) {
				if (this.bindSubmitting) return;
				const { value, errors } = event.detail || {};
				if (errors) return;

				this.bindSubmitting = true;
				uni.showLoading({ title: '提交中...', mask: true });
				this.$request('bind', {
					id: this.bindForm.deviceId,
					mobile: value.mobile
				}, { functionName: 'machine' }).then(res => {
					if (res.code === 0) {
						uni.showToast({ title: '绑定成功', icon: 'success' });
						this.$refs.bindPopup.close();
						this.search();
					} else {
						uni.showToast({ title: res.message || '绑定失败', icon: 'none' });
					}
				}).catch(err => {
					uni.showToast({ title: err?.message || '请求失败', icon: 'none' });
				}).finally(() => {
					this.bindSubmitting = false;
					uni.hideLoading();
				});
			},

			// 解绑
			解绑(item) {
				uni.showModal({
					title: '确认解绑',
					content: '此操作将解绑机器、删除流水、删除返邮，确定要解绑吗？此操作将无法恢复！',
					confirmText: '确定解绑',
					cancelText: '取消',
					success: (res) => {
						if (res.confirm) {
							uni.showLoading({ title: '解绑中...', mask: true });
							this.$request('unbind', { id: item.deviceId }, { functionName: 'machine' }).then(r => {
								uni.hideLoading();
								if (r.code === 0) {
									uni.showToast({ title: '解绑成功', icon: 'success' });
									this.search();
								} else {
									uni.showToast({ title: r.message || '解绑失败', icon: 'none' });
								}
							}).catch(() => {
								uni.hideLoading();
								uni.showToast({ title: '请求失败', icon: 'none' });
							});
						}
					}
				});
			},
		
		// 删除
		删除(item) {
			const deviceId = item?.deviceId || '-';
			uni.showModal({
				title: '确认删除',
				content: `你确定要删除机具 ${deviceId} 么？`,
				confirmText: '确定删除',
				cancelText: '取消',
				success: (res) => {
					if (!res.confirm) return;
					uni.showLoading({ title: '删除中...', mask: true });
					this.$request('delete', { id: deviceId }, { functionName: 'machine' }).then((ret) => {
						if (ret.code !== 0) {
							uni.showToast({ title: ret.message || '删除失败', icon: 'none' });
							return;
						}
						uni.showToast({ title: '删除成功', icon: 'success' });
						this.search();
					}).catch(() => {
						uni.showToast({ title: '请求失败', icon: 'none' });
					}).finally(() => {
						uni.hideLoading();
					});
				}
			});
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
			const res = await this.$request('list', {
				page: 1,
				pageSize: 10000,
				deviceId: sf.deviceId,
				brandId: sf.brandIds.length ? '' : sf.brandId,
				brandIds: sf.brandIds,
				speakerId: sf.speakerId,
				isBound: sf.isBoundList.length ? '' : sf.isBound,
				isBoundList: sf.isBoundList,
				bindTimeStart: sf.bindTimeStart,
				bindTimeEnd: sf.bindTimeEnd,
				isActivated: sf.isActivatedList.length ? '' : sf.isActivated,
				isActivatedList: sf.isActivatedList,
				activatedTimeStart: sf.activatedTimeStart,
				activatedTimeEnd: sf.activatedTimeEnd,
				inStockTimeStart: sf.inStockTimeStart,
				inStockTimeEnd: sf.inStockTimeEnd
			}, { functionName: 'machine' });
			if (res.code !== 0) throw new Error(res.message || '导出数据获取失败');
			return (res.data?.list || []).map((x) => ({
				设备编码: x.deviceId || '',
				机具品牌: x.brandName || '',
				累计交易: x.totalTransaction || '',
				待提已提: x.pendingWithdrawn || '',
				冻结金额: x.frozenAmount || '',
				自有音箱号: x.speakerId || '',
				是否绑定: x.isBoundText || '',
				绑定人时间手机: [x.bindUserName, x.bindTime, x.bindUserMobile].filter(Boolean).join(' / '),
				是否激活: x.isActivatedText || '',
				激活时间: x.activatedTime || '',
				所属商户: x.merchant || '',
				业务员: x.salesman || '',
				入库时间: x.inStockTime || ''
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
		toTxt(rows) { return rows.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n'); },
		toXml(rows) {
			const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const items = rows.map((r) => `<item>${Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</item>`).join('');
			return `<?xml version="1.0" encoding="UTF-8"?><machines>${items}</machines>`;
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
				if (type === 'json') this.downloadFile(`机具管理_${ts}.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
				else if (type === 'xml') this.downloadFile(`机具管理_${ts}.xml`, this.toXml(rows), 'application/xml;charset=utf-8');
				else if (type === 'csv') this.downloadFile(`机具管理_${ts}.csv`, this.toCsv(rows), 'text/csv;charset=utf-8');
				else if (type === 'txt') this.downloadFile(`机具管理_${ts}.txt`, this.toTxt(rows), 'text/plain;charset=utf-8');
				else if (type === 'word') this.downloadFile(`机具管理_${ts}.doc`, this.toHtmlTable(rows), 'application/msword');
				else if (type === 'excel') this.downloadFile(`机具管理_${ts}.xls`, this.toHtmlTable(rows), 'application/vnd.ms-excel');
			} catch (e) {
				uni.showToast({ title: e.message || '导出失败', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		}
	}
};
</script>

<style scoped>




.uni-button {
	margin-left: 10px;
}
.header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.export-dropdown { position: relative; }
.export-trigger { display: flex; align-items: center; gap: 8px; }
.export-icon { font-size: 12px; }
.export-caret { font-size: 12px; opacity: 0.8; }
.export-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 130px; background: #fff; border: 1px solid #ebeef5; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.12); z-index: 10; padding: 6px; }
.export-menu-item { line-height: 32px; padding: 0 10px; font-size: 13px; color: #303133; border-radius: 6px; cursor: pointer; }
.export-menu-item:hover { background: #f5f7fa; }

.link-like {
	color: #2b6bff;
	cursor: pointer;
	text-decoration: underline;
}

.freeze-popup-card {
	width: 1620px !important;
	max-width: calc(100vw - 24px) !important;
	height: 88vh;
	max-height: 88vh;
	display: flex;
	flex-direction: column;
}

.freeze-body {
	overflow: hidden;
	display: flex;
	flex-direction: column;
	flex: 1;
	min-height: 0;
}

.freeze-table-wrap {
	flex: 1;
	min-height: 0;
	overflow-x: auto;
	overflow-y: auto;
	padding-bottom: 4px;
}

.freeze-footer {
	flex-shrink: 0;
	position: sticky;
	bottom: 0;
	z-index: 2;
	background: #fff;
}

.freeze-table :deep(th),
.freeze-table :deep(.uni-table-th),
.freeze-table :deep(.uni-table-th-content) {
	white-space: nowrap;
}

.freeze-tag {
	color: #18bc37;
	font-weight: 600;
}

.release-tag {
	color: #909399;
	font-weight: 600;
}

.uni-container {
	padding: 20px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

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

.bind-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 13px;
}
.bind-info .bind-meta {
	font-size: 12px;
	color: #606266;
}

.op-actions {
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
}

.op-row {
	display: grid;
	grid-template-columns: repeat(3, 62px);
	gap: 6px;
	justify-content: center;
}

.op-btn {
	margin: 0 !important;
	width: 62px;
	height: 26px;
	line-height: 26px;
	padding: 0;
	border-radius: 6px;
	text-align: center;
	font-size: 12px;
}

.op-btn[type="warn"] {
	background-color: #f56c6c;
	border-color: #f56c6c;
}

.op-btn[type="warn"]:active {
	opacity: 0.9;
}

.popup-card {
	width: 520px;
	background: #fff;
	border-radius: 12px;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
	overflow: hidden;
}

.popup-wide {
	width: 1080px;
	max-width: calc(100vw - 80px);
}

.trade-popup-card {
	width: 1320px;
	max-width: calc(100vw - 24px);
	height: 86vh;
	max-height: 86vh;
	display: flex;
	flex-direction: column;
}

.popup-header {
	padding: 14px 18px;
	border-bottom: 1px solid #ebeef5;
	background: #f7f9fc;
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}

.popup-close-x {
	font-size: 22px;
	line-height: 1;
	font-weight: 500;
	cursor: pointer;
	user-select: none;
	opacity: 0.85;
	padding: 0 4px;
}

.popup-close-x:hover {
	opacity: 1;
}

.popup-title {
	font-size: 16px;
	font-weight: 700;
	color: #2c3e50;
}

.popup-subtitle {
	font-size: 12px;
	color: #6b7280;
	margin-left: 12px;
}

.popup-body {
	padding: 16px 18px;
}

.trade-header {
	background: #2f3f52;
	color: #fff;
	border-bottom: 0;
}

.trade-header .popup-title,
.trade-header .popup-subtitle {
	color: #fff;
}

.trade-summary {
	display: flex;
	align-items: center;
	gap: 8px;
}

.trade-summary-label {
	font-size: 12px;
	opacity: 0.85;
}

.trade-summary-value {
	font-size: 14px;
	font-weight: 700;
	color: #ff4d4f;
}

.trade-body {
	padding: 0;
}

.trade-body-scrollable {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-height: 0;
	overflow: hidden;
}

.trade-table-wrap {
	flex: 1;
	min-height: 0;
	overflow: auto;
}

.trade-user {
	white-space: pre-line;
	color: #111827;
}

.refund-hint {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 13px;
	color: #303133;
	margin-bottom: 12px;
}

.refund-tag {
	color: #f56c6c;
	font-size: 12px;
}

.trade-money {
	color: #2b6bff;
	font-weight: 700;
}

.trade-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 10px 14px;
	border-top: 1px solid #ebeef5;
	background: #fff;
}

.trade-count {
	font-size: 12px;
	color: #6b7280;
}

</style>