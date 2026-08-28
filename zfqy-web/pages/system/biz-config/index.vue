<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button size="mini" :disabled="loading" @click="load">刷新</button>
				<button size="mini" :disabled="loading" @click="fetchEgressIp">获取出口IP</button>
				<button size="mini" type="primary" :loading="saving" @click="save">保存配置</button>
			</view>
		</view>
		<view class="uni-container">
			<view v-if="egressIp" class="ip-card">
				<view class="ip-title">当前云函数出口 IP</view>
				<text class="ip-value">{{ egressIp }}</text>
				<text class="ip-tip">请将该 IP 加到微信商家转账接口白名单（生产环境）</text>
			</view>

			<view class="intro-card">
				<view class="intro-title">参数配置说明</view>
				<text class="intro-text">本页用于统一配置 H5 充值、兑换、退款与风控参数。修改后保存即生效，并同步刷新 Redis 配置。</text>
				<text class="intro-text">其中“退款周期”仅对新充值用户生效，已充值用户沿用原规则。</text>
				<view class="redis-meta">
					<text class="redis-meta-label">Redis 更新时间</text>
					<text class="redis-meta-value">{{ redisUpdatedAtText || '暂无（保存配置后写入）' }}</text>
					<text class="redis-meta-status" :class="{ ok: redisAlive, warn: !redisAlive }">
						{{ redisAlive ? '缓存有效' : '缓存未命中/已过期' }}
					</text>
				</view>
			</view>

			<view class="card card-wx-mch">
				<view class="card-title">微信支付商户号（升级 / 退款 / 提现）</view>
				<text class="card-tip">切换后立即生效：新发起的充值、退款商家转账、积分提现将使用所选商户号及对应证书。历史订单仍按下单时记录的商户号处理。</text>
				<view class="wx-mch-table">
					<view class="wx-mch-head">
						<text class="wx-mch-col-scene">业务场景</text>
						<text class="wx-mch-col-opt">商户号选择</text>
					</view>
					<view v-for="row in wxPayMchRows" :key="row.key" class="wx-mch-row">
						<view class="wx-mch-scene">
							<text class="wx-mch-scene-title">{{ row.title }}</text>
							<text class="wx-mch-scene-desc">{{ row.desc }}</text>
						</view>
						<view class="wx-mch-opts">
							<button
								v-for="opt in wxPayMchOptions"
								:key="row.key + opt.mchId"
								size="mini"
								:type="form.wxPayMch[row.key] === opt.mchId ? 'primary' : 'default'"
								@click="pickWxPayMch(row.key, opt.mchId)"
							>
								{{ opt.label }}（{{ opt.mchId }}）
							</button>
						</view>
					</view>
				</view>
				<view class="wx-mch-summary">
					<text>当前生效：</text>
					<text>升级 {{ wxMchLabel(form.wxPayMch.recharge) }}</text>
					<text>退款 {{ wxMchLabel(form.wxPayMch.refund) }}</text>
					<text>提现 {{ wxMchLabel(form.wxPayMch.withdraw) }}</text>
				</view>
			</view>

			<view class="card">
				<view class="card-title">1）积分兑换区间</view>
				<text class="card-tip">用于“奖励提现”页单笔兑换范围控制；最低值按提现次数分段生效。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">会员第1-5笔最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.memberFirst5" type="number" placeholder="如 10" />
					</view>
					<view class="field">
						<text class="label">会员第6-10笔最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.member6To10" type="number" placeholder="如 30" />
					</view>
					<view class="field">
						<text class="label">会员第11笔起最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.member11Plus" type="number" placeholder="如 50" />
					</view>
					<view class="field">
						<text class="label">非会员前3笔最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.nonMemberFirst3" type="number" placeholder="如 30" />
					</view>
					<view class="field">
						<text class="label">非会员第4-6笔最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.nonMember4To6" type="number" placeholder="如 50" />
					</view>
					<view class="field">
						<text class="label">非会员第7笔起最小值(元)</text>
						<uni-easyinput v-model="form.withdrawMinByCount.nonMember7Plus" type="number" placeholder="如 100" />
					</view>
					<view class="field">
						<text class="label">会员最大值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.memberMax" type="number" placeholder="如 200" />
					</view>
					<view class="field">
						<text class="label">非会员最大值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.nonMemberMax" type="number" placeholder="如 200" />
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">1.1）日/周累计提现上限</view>
				<text class="card-tip">
					按会员分档限制「自然日 / 自然周（周一至周日，北京时间）」累计提现积分（含审核中、待打款、已到账；不含已拒绝/已退回）。填写 0 表示该分档不限额。测试商户白名单不受此限制。
				</text>
				<text class="card-tip" :style="{ color: cfBuildOk ? '#67c23a' : '#e6a23c' }">
					云函数版本：{{ cfBuild || '未识别（可能未部署最新 merchant）' }}
				</text>
				<text class="card-tip">限额独立表：hsy-biz-period-limits（请先上传该表 schema）</text>
				<view class="period-block">
					<text class="period-title">兑换券铂金会员（兑换码/兑换券开通的非付费会员）</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="periodExchangeDay" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="periodExchangeWeek" type="number" placeholder="300" />
						</view>
					</view>
				</view>
				<view class="period-block">
					<text class="period-title">黄金 / 白金 / 铂金会员（按额度包会员名称）</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="periodGoldDay" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="periodGoldWeek" type="number" placeholder="500" />
						</view>
					</view>
				</view>
				<view class="period-block">
					<text class="period-title">钻石会员（按额度包会员名称）</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="periodDiamondDay" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="periodDiamondWeek" type="number" placeholder="500" />
						</view>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">2）优化金额分期策略</view>
				<text class="card-tip">按阈值拆分分期数；每期最低可获 0.01 积分时，对应最低流水 = 0.01 × 分期数 ÷ 0.0038。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">分期阈值金额(元)</text>
						<uni-easyinput v-model="form.optimizeConfig.thresholdYuan" type="number" placeholder="如 300" />
					</view>
					<view class="field">
						<text class="label">阈值以上分期数</text>
						<uni-easyinput v-model="form.optimizeConfig.aboveInstallments" type="number" placeholder="如 5" />
					</view>
					<view class="field">
						<text class="label">阈值以下分期数</text>
						<uni-easyinput v-model="form.optimizeConfig.belowInstallments" type="number" placeholder="如 5" />
					</view>
				</view>
				<view class="optimize-min-trade">
					<text class="optimize-min-trade-title">最低可积分流水（实时）</text>
					<view class="optimize-min-trade-row">
						<text>
							≥ {{ optimizeThresholdText }} 元（{{ optimizeAboveInstallments }} 期）：
							最低 {{ optimizeMinTradeAboveText }} 元
						</text>
					</view>
					<view class="optimize-min-trade-row">
						<text>
							&lt; {{ optimizeThresholdText }} 元（{{ optimizeBelowInstallments }} 期）：
							最低 {{ optimizeMinTradeBelowText }} 元
						</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">2.1）H5 待领取奖励有效期</view>
				<text class="card-tip">流水或分期待返生成权益气泡后，自该笔流水/生成时刻起算有效天数；到期后 H5 权益页不再展示，且不可领取。例：7 天表示 7 月 1 日 23:00 的流水，7 月 8 日 23:00 过期。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">有效天数</text>
						<uni-easyinput v-model="form.incomePacketClaimValidDays" type="number" placeholder="默认 7" />
						<text class="field-hint">保存后写入业务参数并刷新 Redis，云函数生成待领取奖励时读取。</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">3）充值退款周期（仅新充值用户）</view>
				<text class="card-tip">例：锁定 180 天，到期后开放 3 天窗口。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">锁定周期(天)</text>
						<uni-easyinput v-model="form.refundCycle.cycleDays" type="number" placeholder="如 180" />
					</view>
					<view class="field">
						<text class="label">退款窗口(天)</text>
						<uni-easyinput v-model="form.refundCycle.windowDays" type="number" placeholder="如 3" />
					</view>
					<view class="field">
						<text class="label">锁定期违约金比例(%)</text>
						<uni-easyinput v-model="form.refundPenaltyRate" type="number" placeholder="0~100，默认50" />
					</view>
					<view class="field field--wide">
						<text class="label">退款拆单单笔上限(元)</text>
						<uni-easyinput v-model="form.refundTransferSliceMaxYuan" type="number" placeholder="默认200，微信场景常用200" />
						<text class="field-hint">H5 充值退款走商家转账时，单笔超过该金额会拆成多笔；保存后写入 Redis 供云函数快速读取。环境变量 REFUND_TRANSFER_SLICE_MAX_YUAN 仅在未配置该项时生效。</text>
					</view>
					<view class="field field--wide field-row-switch">
						<text class="label">允许撤销审核同意（开发联调）</text>
						<switch :checked="form.refundApproveRevokeDevEnabled" @change="onRefundApproveRevokeDevChange" />
						<text class="field-hint">开启后，退款列表可对「已同意」且未到账的退款显示「撤销同意(开发)」。依赖业务参数存储，无需云函数环境变量；生产环境请勿开启。</text>
					</view>
					<view class="field field--wide">
						<text class="label">H5「退款与周期」规则说明（每行一条）</text>
						<uni-easyinput
							v-model="form.refundRuleLinesText"
							type="textarea"
							:inputBorder="true"
							:autoHeight="true"
							:maxlength="16000"
							placeholder="每行一条说明；留空保存后将使用系统默认三条说明"
						/>
						<text class="field-hint">最多 20 行、每行最多 800 字。可使用占位符：`{cycleDays}`（锁定天数）、`{windowDays}`（退款窗口天数）、`{penaltyRate}`（锁定期违约金比例，与上方一致）。保存后写入业务参数并刷新 Redis，H5 展示为替换占位符后的文案。</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">4）交易类型优化率（进入风控比例）</view>
				<text class="card-tip">填写 0~100，100 表示该交易类型全部进入风控，0 表示都不进风控。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">贷记卡(06) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['06']" type="number" placeholder="如 100" />
					</view>
					<view class="field">
						<text class="label">白条(31) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['31']" type="number" placeholder="如 100" />
					</view>
					<view class="field">
						<text class="label">借记卡(05) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['05']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">银联未优惠(04) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['04']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">微信(02) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['02']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">支付宝(01) 风险率%</text>
						<uni-easyinput v-model="form.riskRates['01']" type="number" placeholder="如 0" />
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">4.1）按流水优化（第二层抽检）</view>
				<text class="card-tip">
					仅对「未命中上方 §4 风控」的真实流水生效：商户注册满 N 天后，再按渠道比例进入「优化管理」待审（无企微通知）。判定时间优先 create_time；存量无该字段时回退 bind_time / 机具绑定时间。流水优化白名单商户跳过本层，仍可进 §4 风控。默认关闭且比例为 0。只处理「生效日起」及之后的交易；更早的历史单不抽检。
				</text>
				<view class="ui-style-opts" style="margin-bottom: 12px">
					<button
						size="mini"
						:type="form.pointsOptimizeFlowEnabled ? 'warn' : 'default'"
						@click="form.pointsOptimizeFlowEnabled = false"
					>
						关闭
					</button>
					<button
						size="mini"
						:type="form.pointsOptimizeFlowEnabled ? 'primary' : 'default'"
						@click="form.pointsOptimizeFlowEnabled = true"
					>
						开启
					</button>
				</view>
				<text class="ui-style-current">
					当前：{{ form.pointsOptimizeFlowEnabled ? '已开启' : '已关闭' }}
				</text>
				<view class="form-grid" style="margin-top: 12px">
					<view class="field">
						<text class="label">生效日起（北京时间）</text>
						<uni-easyinput
							v-model="form.flowOptimizeEffectiveFromDate"
							placeholder="如 2026-08-13，保存开启时留空则默认今天"
						/>
					</view>
					<view class="field">
						<text class="label">注册满 N 天</text>
						<uni-easyinput v-model="form.flowOptimizeMinRegisterDays" type="number" placeholder="如 30" />
					</view>
					<view class="field">
						<text class="label">贷记卡(06) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['06']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">白条(31) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['31']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">借记卡(05) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['05']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">银联未优惠(04) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['04']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">微信(02) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['02']" type="number" placeholder="如 0" />
					</view>
					<view class="field">
						<text class="label">支付宝(01) 优化率%</text>
						<uni-easyinput v-model="form.flowOptimizeRates['01']" type="number" placeholder="如 0" />
					</view>
				</view>
				<view class="ui-style-opts" style="margin-top: 12px">
					<button size="mini" type="warn" plain :loading="clearFlowOptLoading" @click="clearHistoricalFlowOpt">
						清理误标优化流水
					</button>
				</view>
				<text class="card-tip" style="margin-top: 8px">
					清理范围：① 生效日之前的优化标记；② 已领取首期积分但仍挂着优化待审的误标流水。还原为普通流水，不删交易、不改已领积分。请先保存「生效日起」再执行。
				</text>
			</view>

			<view class="card">
				<view class="card-title">5.1）登录周积分优化总开关</view>
				<text class="card-tip">
					关闭时不执行登录周待返优化；开启后按设计对未领分期待返各片每周 ×0.75。白名单商户不受影响。H5
					不展示本开关。默认关闭。
				</text>
				<view class="ui-style-opts">
					<button
						size="mini"
						:type="form.pointsOptimizeLoginEnabled ? 'warn' : 'default'"
						@click="form.pointsOptimizeLoginEnabled = false"
					>
						关闭
					</button>
					<button
						size="mini"
						:type="form.pointsOptimizeLoginEnabled ? 'primary' : 'default'"
						@click="form.pointsOptimizeLoginEnabled = true"
					>
						开启
					</button>
				</view>
				<text class="ui-style-current">
					当前：{{ form.pointsOptimizeLoginEnabled ? '已开启' : '已关闭' }}
				</text>
			</view>

			<view class="card">
				<view class="card-title">5）测试商户白名单（无门槛积分兑换）</view>
				<text class="card-tip">命中商户可不受最低兑换金额、提现办理时间限制，且白银会员不受「当月流水≥5万才可提现」限制。支持输入商户 user_id 或商户记录 _id，多个ID可用逗号或换行分隔。</text>
				<uni-easyinput
					v-model.trim="form.testMerchantIdsText"
					type="textarea"
					:inputBorder="true"
					:autoHeight="true"
					:maxlength="8000"
					placeholder="示例：\n668f98c7ab1234567890abcd\nuid_merchant_test_001, uid_merchant_test_002"
				/>
			</view>
			<view class="card">
				<view class="card-title">6）H5 联系客服电话</view>
				<text class="card-tip">用于 H5 权益页右上角“联系客服”按钮展示及拨号，支持固话或手机号。</text>
				<uni-easyinput v-model.trim="form.servicePhone" placeholder="如 400-668-5796" />
			</view>

			<view class="card">
				<view class="card-title">7）H5 界面风格</view>
				<text class="card-tip">A = 紫色深色（原风格）；B = 明亮亮色。保存后 H5 端约 30 秒内自动切换，也可让用户刷新页面立即生效。</text>
				<view class="ui-style-opts">
					<button
						size="mini"
						:type="form.h5UiStyle === 'A' ? 'primary' : 'default'"
						@click="form.h5UiStyle = 'A'"
					>
						A 紫色深色
					</button>
					<button
						size="mini"
						:type="form.h5UiStyle === 'B' ? 'primary' : 'default'"
						@click="form.h5UiStyle = 'B'"
					>
						B 明亮亮色
					</button>
				</view>
				<text class="ui-style-current">当前：{{ form.h5UiStyle === 'B' ? 'B 明亮亮色' : 'A 紫色深色' }}</text>
			</view>
		</view>
	</view>
</template>

<script>
const defaultWxPayMch = () => ({
	recharge: '1111130439',
	refund: '1646399792',
	withdraw: '1646399792'
});

const defaultForm = () => ({
	wxPayMch: defaultWxPayMch(),
	withdrawRange: { memberMin: 10, memberMax: 200, nonMemberMin: 30, nonMemberMax: 200 },
	withdrawMinByCount: {
		memberFirst5: 10,
		member6To10: 30,
		member11Plus: 50,
		nonMemberFirst3: 30,
		nonMember4To6: 50,
		nonMember7Plus: 100
	},
	withdrawPeriodLimits: {
		exchangeCoupon: { dayMax: 200, weekMax: 300 },
		paidGoldPlatinum: { dayMax: 200, weekMax: 500 },
		paidDiamond: { dayMax: 200, weekMax: 500 }
	},
	optimizeConfig: { thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 5 },
	pointsOptimizeLoginEnabled: false,
	pointsOptimizeFlowEnabled: false,
	flowOptimizeMinRegisterDays: 30,
	flowOptimizeEffectiveFromDate: '',
	flowOptimizeRates: { '06': 0, '31': 0, '05': 0, '04': 0, '02': 0, '01': 0 },
	incomePacketClaimValidDays: 7,
	refundCycle: { cycleDays: 180, windowDays: 3 },
	refundPenaltyRate: 50,
	refundTransferSliceMaxYuan: 200,
	refundApproveRevokeDevEnabled: false,
	riskRates: { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 },
	testMerchantIds: [],
	testMerchantIdsText: '',
	servicePhone: '400-668-5796',
	h5UiStyle: 'A',
	refundRuleLinesText: ''
});

export default {
	data() {
		return {
			loading: false,
			saving: false,
			clearFlowOptLoading: false,
			form: defaultForm(),
			// 日/周限额用顶层字段绑定，避免深层对象 v-model 写不进去
			periodExchangeDay: 200,
			periodExchangeWeek: 300,
			periodGoldDay: 200,
			periodGoldWeek: 500,
			periodDiamondDay: 200,
			periodDiamondWeek: 500,
			cfBuild: '',
			egressIp: '',
			redisUpdatedAt: 0,
			redisUpdatedAtText: '',
			redisAlive: false,
			wxPayMchOptions: [
				{ mchId: '1111130439', label: '帆帆电子' },
				{ mchId: '1646399792', label: '志帆科技' }
			]
		};
	},
	computed: {
		cfBuildOk() {
			return String(this.cfBuild || '').indexOf('PERIOD_V4') === 0;
		},
		optimizeThresholdText() {
			const n = Number(this.form?.optimizeConfig?.thresholdYuan);
			return Number.isFinite(n) && n >= 0 ? String(n) : '300';
		},
		optimizeAboveInstallments() {
			const n = Math.floor(Number(this.form?.optimizeConfig?.aboveInstallments));
			return Number.isFinite(n) && n >= 1 ? n : 5;
		},
		optimizeBelowInstallments() {
			const n = Math.floor(Number(this.form?.optimizeConfig?.belowInstallments));
			return Number.isFinite(n) && n >= 1 ? n : 5;
		},
		optimizeMinTradeAboveText() {
			return this.calcMinSubsidyTradeYuan(this.optimizeAboveInstallments);
		},
		optimizeMinTradeBelowText() {
			return this.calcMinSubsidyTradeYuan(this.optimizeBelowInstallments);
		},
		wxPayMchRows() {
			return [
				{
					key: 'recharge',
					title: '升级（充值）',
					desc: 'H5 会员套餐 JSAPI 支付、支付回调入账'
				},
				{
					key: 'refund',
					title: '退款',
					desc: 'H5 充值退款商家转账（用户确认收款）'
				},
				{
					key: 'withdraw',
					title: '提现',
					desc: 'H5 积分兑换提现商家转账'
				}
			];
		}
	},
	mounted() {
		this.load();
	},
	methods: {
		formatFlowOptEffectiveDate(raw) {
			if (raw == null || raw === '') return '';
			if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
				return raw.trim().slice(0, 10);
			}
			const n = Number(raw);
			if (!(n > 0)) return '';
			try {
				return new Intl.DateTimeFormat('en-CA', {
					timeZone: 'Asia/Shanghai',
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				}).format(new Date(n));
			} catch (e) {
				const d = new Date(n + 8 * 3600000);
				const p = (x) => String(x).padStart(2, '0');
				return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
			}
		},
		async clearHistoricalFlowOpt() {
			const dateStr = String(this.form.flowOptimizeEffectiveFromDate || '').trim();
			if (!dateStr) {
				uni.showToast({ title: '请先填写并保存生效日起', icon: 'none' });
				return;
			}
			const ok = await new Promise((resolve) => {
				uni.showModal({
					title: '清理误标优化流水',
					content: `将清理：\n1）「${dateStr}」之前的优化标记\n2）已领积分但仍挂优化待审的流水\n确认？`,
					success: (r) => resolve(!!r.confirm)
				});
			});
			if (!ok) return;
			this.clearFlowOptLoading = true;
			try {
				let cursorId = '';
				let batch = 0;
				let cleared = 0;
				let clearedBefore = 0;
				let clearedClaimed = 0;
				for (;;) {
					batch += 1;
					const res = await this.$request(
						'adminClearFlowOptBeforeEffectiveFrom',
						{
							apply: true,
							clearClaimed: true,
							chunkSize: 100,
							effectiveFrom: dateStr,
							...(cursorId ? { cursorId } : {})
						},
						{ functionName: 'merchant' }
					);
					if (res.code !== 0) {
						uni.showToast({ title: res.message || '清理失败', icon: 'none' });
						return;
					}
					const d = res.data || {};
					cleared += Number(d.cleared || 0);
					clearedBefore += Number(d.clearedBefore || 0);
					clearedClaimed += Number(d.clearedClaimed || 0);
					if (d.samples && d.samples.length) console.table(d.samples);
					console.log(`清理第 ${batch} 批`, d);
					if (d.done) break;
					cursorId = d.nextCursor || '';
					if (!cursorId) break;
				}
				uni.showToast({
					title: `清理 ${cleared}（历史${clearedBefore}/已领${clearedClaimed}）`,
					icon: 'none',
					duration: 3000
				});
			} finally {
				this.clearFlowOptLoading = false;
			}
		},
		calcMinSubsidyTradeYuan(installments) {
			const n = Math.max(1, Number(installments) || 1);
			// 每期最低 0.01 积分 → 最低流水 = 0.01 * 期数 / 0.0038，向上取整到分
			const raw = (0.01 * n) / 0.0038;
			return (Math.ceil(raw * 100 - 1e-9) / 100).toFixed(2);
		},
		wxMchLabel(mchId) {
			const hit = this.wxPayMchOptions.find((x) => x.mchId === mchId);
			return hit ? `${hit.label}（${hit.mchId}）` : mchId || '-';
		},
		pickWxPayMch(scene, mchId) {
			if (!this.form.wxPayMch) this.form.wxPayMch = defaultWxPayMch();
			this.form.wxPayMch[scene] = mchId;
		},
		numOr(v, fallback) {
			const n = Number(v);
			return Number.isFinite(n) && n >= 0 ? n : fallback;
		},
		syncPeriodFieldsFrom(limits) {
			const p = this.applyPeriodLimitsFrom({ withdrawPeriodLimits: limits || {} });
			this.periodExchangeDay = p.exchangeCoupon.dayMax;
			this.periodExchangeWeek = p.exchangeCoupon.weekMax;
			this.periodGoldDay = p.paidGoldPlatinum.dayMax;
			this.periodGoldWeek = p.paidGoldPlatinum.weekMax;
			this.periodDiamondDay = p.paidDiamond.dayMax;
			this.periodDiamondWeek = p.paidDiamond.weekMax;
		},
		buildPeriodLimitsFromFields() {
			return {
				exchangeCoupon: {
					dayMax: this.numOr(this.periodExchangeDay, 200),
					weekMax: this.numOr(this.periodExchangeWeek, 300)
				},
				paidGoldPlatinum: {
					dayMax: this.numOr(this.periodGoldDay, 200),
					weekMax: this.numOr(this.periodGoldWeek, 500)
				},
				paidDiamond: {
					dayMax: this.numOr(this.periodDiamondDay, 200),
					weekMax: this.numOr(this.periodDiamondWeek, 500)
				}
			};
		},
		async loadPeriodLimitsFromClientDb() {
			try {
				const db = uniCloud.database();
				const r = await db.collection('hsy-biz-period-limits').where({ key: 'default' }).limit(1).get();
				const rows = (r && r.result && r.result.data) || (r && r.data) || [];
				if (!rows.length) return null;
				const d = rows[0];
				return {
					exchangeCoupon: d.exchangeCoupon || { dayMax: 200, weekMax: 300 },
					paidGoldPlatinum: d.paidGoldPlatinum || { dayMax: 200, weekMax: 500 },
					paidDiamond: d.paidDiamond || { dayMax: 200, weekMax: 500 }
				};
			} catch (e) {
				console.error('loadPeriodLimitsFromClientDb failed', e);
				return null;
			}
		},
		async savePeriodLimitsToClientDb(limits) {
			const db = uniCloud.database();
			const payload = {
				key: 'default',
				exchangeCoupon: limits.exchangeCoupon,
				paidGoldPlatinum: limits.paidGoldPlatinum,
				paidDiamond: limits.paidDiamond,
				update_time: Date.now()
			};
			const r = await db.collection('hsy-biz-period-limits').where({ key: 'default' }).limit(1).get();
			const rows = (r && r.result && r.result.data) || (r && r.data) || [];
			if (rows.length) {
				await db.collection('hsy-biz-period-limits').doc(rows[0]._id).update(payload);
			} else {
				await db.collection('hsy-biz-period-limits').add(payload);
			}
			return payload;
		},
		applyPeriodLimitsFrom(data) {
			const base = {
				exchangeCoupon: { dayMax: 200, weekMax: 300 },
				paidGoldPlatinum: { dayMax: 200, weekMax: 500 },
				paidDiamond: { dayMax: 200, weekMax: 500 }
			};
			const src = (data && data.withdrawPeriodLimits) || {};
			const out = Object.assign({}, base, src);
			['exchangeCoupon', 'paidGoldPlatinum', 'paidDiamond'].forEach((k) => {
				const g = out[k] || {};
				out[k] = {
					dayMax: Number.isFinite(Number(g.dayMax)) ? Number(g.dayMax) : base[k].dayMax,
					weekMax: Number.isFinite(Number(g.weekMax)) ? Number(g.weekMax) : base[k].weekMax
				};
			});
			return out;
		},
		async load() {
			this.loading = true;
			try {
				const res = await this.$request('bizConfigGet', {}, { functionName: 'merchant' });
				if (res.code !== 0) return uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				const merged = Object.assign(defaultForm(), res.data || {});
				const wm = merged.withdrawMinByCount || {};
				if (wm.memberFirst5 == null && wm.memberFirst3 != null) wm.memberFirst5 = wm.memberFirst3;
				if (wm.member6To10 == null && wm.member4To6 != null) wm.member6To10 = wm.member4To6;
				if (wm.member11Plus == null && wm.member7Plus != null) wm.member11Plus = wm.member7Plus;
				merged.withdrawMinByCount = wm;
				merged.withdrawPeriodLimits = this.applyPeriodLimitsFrom(merged);
				// 独立表覆盖：不依赖云函数是否已更新
				const fromDb = await this.loadPeriodLimitsFromClientDb();
				if (fromDb) {
					merged.withdrawPeriodLimits = this.applyPeriodLimitsFrom({ withdrawPeriodLimits: fromDb });
				}
				this.syncPeriodFieldsFrom(merged.withdrawPeriodLimits);
				this.cfBuild = String((res.data && res.data.cfBuild) || '');
				this.redisUpdatedAt = Number((res.data && res.data.redisUpdatedAt) || 0) || 0;
				this.redisUpdatedAtText = String((res.data && res.data.redisUpdatedAtText) || '') || '';
				this.redisAlive = !!(res.data && res.data.redisAlive);
				if (Array.isArray(res.data?.wxPayMchOptions) && res.data.wxPayMchOptions.length) {
					this.wxPayMchOptions = res.data.wxPayMchOptions;
				}
				merged.wxPayMch = Object.assign(defaultWxPayMch(), merged.wxPayMch || {});
				merged.h5UiStyle = String(merged.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A';
				merged.pointsOptimizeLoginEnabled = !!merged.pointsOptimizeLoginEnabled;
				merged.pointsOptimizeFlowEnabled = !!merged.pointsOptimizeFlowEnabled;
				merged.flowOptimizeMinRegisterDays = Math.max(
					0,
					Math.floor(Number(merged.flowOptimizeMinRegisterDays != null ? merged.flowOptimizeMinRegisterDays : 30) || 30)
				);
				merged.flowOptimizeEffectiveFromDate = this.formatFlowOptEffectiveDate(
					merged.flowOptimizeEffectiveFrom || merged.flowOptimizeEffectiveFromDate
				);
				merged.flowOptimizeRates = Object.assign(
					{ '06': 0, '31': 0, '05': 0, '04': 0, '02': 0, '01': 0 },
					merged.flowOptimizeRates || {}
				);
				const ids = Array.isArray(merged.testMerchantIds) ? merged.testMerchantIds : [];
				merged.testMerchantIdsText = ids.join('\n');
				const ruleLines = Array.isArray(merged.h5RefundRuleLines) ? merged.h5RefundRuleLines : [];
				merged.refundRuleLinesText = ruleLines.join('\n');
				delete merged.h5RefundRuleLines;
				delete merged.wxPayMchOptions;
				delete merged.wxPayMchDefaults;
				delete merged.wxPayMchEffective;
				delete merged._savedWithdrawPeriodLimits;
				delete merged.cfBuild;
				delete merged._debugPeriod;
				delete merged.redisUpdatedAt;
				delete merged.redisUpdatedAtText;
				delete merged.redisAlive;
				this.form = merged;
			} finally {
				this.loading = false;
			}
		},
		onRefundApproveRevokeDevChange(e) {
			this.form.refundApproveRevokeDevEnabled = !!(e && e.detail && e.detail.value);
		},
		async save() {
			this.saving = true;
			try {
				const periodLimits = this.buildPeriodLimitsFromFields();
				const sentDiamondWeek = Number(periodLimits.paidDiamond.weekMax);

				// 1）先写独立表（不依赖 merchant 云函数版本）
				let clientSavedWeek = NaN;
				try {
					const saved = await this.savePeriodLimitsToClientDb(periodLimits);
					clientSavedWeek = Number(saved.paidDiamond && saved.paidDiamond.weekMax);
					this.syncPeriodFieldsFrom(periodLimits);
				} catch (e) {
					uni.showModal({
						title: '限额表写入失败',
						content:
							'请先在 uniCloud 控制台上传数据库 schema：hsy-biz-period-limits，再重试。\n' +
							String((e && (e.message || e.errMsg)) || e),
						showCancel: false
					});
					return;
				}

				const payload = JSON.parse(JSON.stringify(this.form));
				payload.withdrawPeriodLimits = periodLimits;
				payload.flowOptimizeEffectiveFromDate = String(payload.flowOptimizeEffectiveFromDate || '').trim();
				payload.flowOptimizeEffectiveFrom = payload.flowOptimizeEffectiveFromDate;
				delete payload.flowOptimizeEffectiveFromDate;
				payload.periodExchangeDay = periodLimits.exchangeCoupon.dayMax;
				payload.periodExchangeWeek = periodLimits.exchangeCoupon.weekMax;
				payload.periodGoldDay = periodLimits.paidGoldPlatinum.dayMax;
				payload.periodGoldWeek = periodLimits.paidGoldPlatinum.weekMax;
				payload.periodDiamondDay = periodLimits.paidDiamond.dayMax;
				payload.periodDiamondWeek = periodLimits.paidDiamond.weekMax;
				payload.testMerchantIds = Array.from(
					new Set(
						String(payload.testMerchantIdsText || '')
							.split(/[\n,，;\s]+/)
							.map((x) => String(x || '').trim())
							.filter(Boolean)
					)
				);
				delete payload.testMerchantIdsText;
				payload.h5RefundRuleLines = String(payload.refundRuleLinesText || '')
					.split(/\r?\n/)
					.map((x) => String(x || '').trim())
					.filter(Boolean);
				delete payload.refundRuleLinesText;

				// 2）再走云函数保存其它参数（兼容旧版）
				const res = await this.$request('bizConfigSave', payload, { functionName: 'merchant' });
				if (res.code !== 0) return uni.showToast({ title: res.message || '保存失败', icon: 'none' });
				this.cfBuild = String((res.data && res.data.cfBuild) || this.cfBuild || '');
				if (res.data && res.data.redisUpdatedAtText) {
					this.redisUpdatedAt = Number(res.data.redisUpdatedAt || 0) || 0;
					this.redisUpdatedAtText = String(res.data.redisUpdatedAtText || '');
					this.redisAlive = res.data.redisAlive !== false;
				}

				await this.load();
				const loadedWeek = Number(this.periodDiamondWeek);
				if (loadedWeek === sentDiamondWeek || clientSavedWeek === sentDiamondWeek) {
					uni.showToast({
						title: '保存成功',
						icon: 'success'
					});
				} else {
					uni.showModal({
						title: '日周限额未落库',
						content: [
							`提交 ${sentDiamondWeek}，刷新后 ${loadedWeek}`,
							`clientDb=${clientSavedWeek}`,
							`cfBuild=${this.cfBuild || '无'}`,
							`msg=${res.message || ''}`,
							'请上传：1) hsy-biz-period-limits schema  2) 最新 merchant 云函数'
						].join('\n'),
						showCancel: false
					});
				}
			} finally {
				this.saving = false;
			}
		},
		async fetchEgressIp() {
			this.loading = true;
			try {
				const res = await this.$request('debugGetEgressIp', {}, { functionName: 'merchant' });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					return;
				}
				this.egressIp = (res.data && res.data.ip) || '';
				if (!this.egressIp) {
					uni.showToast({ title: '未获取到出口IP', icon: 'none' });
					return;
				}
				uni.showModal({
					title: '当前出口IP',
					content: this.egressIp,
					showCancel: false
				});
			} finally {
				this.loading = false;
			}
		}
	}
};
</script>

<style scoped>
.uni-container { padding: 16px; }
.ip-card { background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.ip-title { font-size: 13px; color: #389e0d; font-weight: 700; margin-bottom: 4px; }
.ip-value { display: block; font-size: 20px; color: #135200; font-weight: 700; letter-spacing: 0.02em; }
.ip-tip { display: block; margin-top: 6px; font-size: 12px; color: #237804; }
.uni-header .uni-group {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-left: auto;
}
.uni-header .uni-group button {
	margin: 0;
	min-width: 76px;
}
.intro-card,
.card { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 14px; margin-bottom: 12px; }
.redis-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	margin-top: 10px;
	padding: 8px 10px;
	background: #f5f7fa;
	border-radius: 6px;
}
.redis-meta-label {
	font-size: 12px;
	color: #909399;
}
.redis-meta-value {
	font-size: 13px;
	font-weight: 600;
	color: #303133;
}
.redis-meta-status {
	font-size: 12px;
	padding: 2px 8px;
	border-radius: 10px;
	background: #fef0f0;
	color: #f56c6c;
}
.redis-meta-status.ok {
	background: #f0f9eb;
	color: #67c23a;
}
.redis-meta-status.warn {
	background: #fdf6ec;
	color: #e6a23c;
}
.intro-title { font-size: 15px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.intro-text { display: block; font-size: 12px; color: #606266; line-height: 1.6; }
.card-title { font-size: 14px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.card-tip { display: block; font-size: 12px; color: #909399; margin-bottom: 10px; }
.optimize-min-trade {
	margin-top: 12px;
	padding: 10px 12px;
	background: #f5f7fa;
	border-radius: 6px;
	border: 1px solid #ebeef5;
}
.optimize-min-trade-title {
	display: block;
	font-size: 13px;
	font-weight: 600;
	color: #303133;
	margin-bottom: 6px;
}
.optimize-min-trade-row {
	font-size: 13px;
	color: #606266;
	line-height: 1.7;
}
.period-block { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ebeef5; }
.period-block:first-of-type { margin-top: 4px; padding-top: 0; border-top: 0; }
.period-title { display: block; font-size: 13px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.ui-style-opts {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}
.ui-style-opts button { margin: 0; min-width: 110px; }
.ui-style-current { display: block; font-size: 12px; color: #606266; }
.form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(240px, 1fr));
	gap: 10px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field--wide { grid-column: 1 / -1; }
.field-row-switch .label { margin-bottom: 0; }
.field-row-switch switch { align-self: flex-start; }
.field-hint { font-size: 11px; color: #909399; line-height: 1.45; margin-top: 2px; }
.label { font-size: 12px; color: #606266; }
.card-wx-mch { border-color: #d9ecff; background: linear-gradient(180deg, #f5faff 0%, #fff 48px); }
.wx-mch-table { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.wx-mch-head { display: none; }
.wx-mch-row {
	display: grid;
	grid-template-columns: minmax(160px, 220px) 1fr;
	gap: 12px;
	align-items: center;
	padding: 10px 0;
	border-bottom: 1px dashed #ebeef5;
}
.wx-mch-row:last-child { border-bottom: none; }
.wx-mch-scene-title { display: block; font-size: 13px; font-weight: 700; color: #303133; }
.wx-mch-scene-desc { display: block; margin-top: 4px; font-size: 11px; color: #909399; line-height: 1.45; }
.wx-mch-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.wx-mch-opts button { margin: 0; }
.wx-mch-summary {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	font-size: 12px;
	color: #606266;
	padding-top: 8px;
	border-top: 1px solid #ebeef5;
}
.wx-mch-summary text:first-child { font-weight: 700; color: #303133; }

@media (max-width: 1200px) {
	.form-grid { grid-template-columns: 1fr; }
	.wx-mch-row { grid-template-columns: 1fr; }
}
</style>
