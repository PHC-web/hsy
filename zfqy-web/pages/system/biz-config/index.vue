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
				<text class="intro-text">本页用于统一配置 H5 充值、兑换、退款与风控参数。修改后保存即生效。</text>
				<text class="intro-text">其中“退款周期”仅对新充值用户生效，已充值用户沿用原规则。</text>
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
				<view class="period-block">
					<text class="period-title">兑换券铂金会员（兑换码/兑换券开通的非付费会员）</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.exchangeCoupon.dayMax" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.exchangeCoupon.weekMax" type="number" placeholder="300" />
						</view>
					</view>
				</view>
				<view class="period-block">
					<text class="period-title">600 元黄金会员 + 800 元白金会员</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.paidGoldPlatinum.dayMax" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.paidGoldPlatinum.weekMax" type="number" placeholder="500" />
						</view>
					</view>
				</view>
				<view class="period-block">
					<text class="period-title">1000 元钻石会员</text>
					<view class="form-grid">
						<view class="field">
							<text class="label">每日上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.paidDiamond.dayMax" type="number" placeholder="200" />
						</view>
						<view class="field">
							<text class="label">每周上限(积分)</text>
							<uni-easyinput v-model="form.withdrawPeriodLimits.paidDiamond.weekMax" type="number" placeholder="500" />
						</view>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">2）优化金额分期策略</view>
				<text class="card-tip">例：阈值 300 元；300 及以上分 5 期，300 以下一次返还。</text>
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
						<uni-easyinput v-model="form.optimizeConfig.belowInstallments" type="number" placeholder="如 1" />
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
	optimizeConfig: { thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 1 },
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
			form: defaultForm(),
			egressIp: '',
			wxPayMchOptions: [
				{ mchId: '1111130439', label: '帆帆电子' },
				{ mchId: '1646399792', label: '志帆科技' }
			]
		};
	},
	computed: {
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
		wxMchLabel(mchId) {
			const hit = this.wxPayMchOptions.find((x) => x.mchId === mchId);
			return hit ? `${hit.label}（${hit.mchId}）` : mchId || '-';
		},
		pickWxPayMch(scene, mchId) {
			if (!this.form.wxPayMch) this.form.wxPayMch = defaultWxPayMch();
			this.form.wxPayMch[scene] = mchId;
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
				merged.withdrawPeriodLimits = Object.assign(
					{
						exchangeCoupon: { dayMax: 200, weekMax: 300 },
						paidGoldPlatinum: { dayMax: 200, weekMax: 500 },
						paidDiamond: { dayMax: 200, weekMax: 500 }
					},
					merged.withdrawPeriodLimits || {}
				);
				['exchangeCoupon', 'paidGoldPlatinum', 'paidDiamond'].forEach((k) => {
					merged.withdrawPeriodLimits[k] = Object.assign(
						{ dayMax: 0, weekMax: 0 },
						merged.withdrawPeriodLimits[k] || {}
					);
				});
				if (Array.isArray(res.data?.wxPayMchOptions) && res.data.wxPayMchOptions.length) {
					this.wxPayMchOptions = res.data.wxPayMchOptions;
				}
				merged.wxPayMch = Object.assign(defaultWxPayMch(), merged.wxPayMch || {});
				merged.h5UiStyle = String(merged.h5UiStyle || 'A').toUpperCase() === 'B' ? 'B' : 'A';
				const ids = Array.isArray(merged.testMerchantIds) ? merged.testMerchantIds : [];
				merged.testMerchantIdsText = ids.join('\n');
				const ruleLines = Array.isArray(merged.h5RefundRuleLines) ? merged.h5RefundRuleLines : [];
				merged.refundRuleLinesText = ruleLines.join('\n');
				delete merged.h5RefundRuleLines;
				delete merged.wxPayMchOptions;
				delete merged.wxPayMchDefaults;
				delete merged.wxPayMchEffective;
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
				const payload = JSON.parse(JSON.stringify(this.form));
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
				const res = await this.$request('bizConfigSave', payload, { functionName: 'merchant' });
				if (res.code !== 0) return uni.showToast({ title: res.message || '保存失败', icon: 'none' });
				uni.showToast({ title: '保存成功', icon: 'success' });
				this.load();
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
.intro-title { font-size: 15px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.intro-text { display: block; font-size: 12px; color: #606266; line-height: 1.6; }
.card-title { font-size: 14px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.card-tip { display: block; font-size: 12px; color: #909399; margin-bottom: 10px; }
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
