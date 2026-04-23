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

			<view class="card">
				<view class="card-title">1）充值金额对应奖励配置</view>
				<text class="card-tip">示例：充值 600 元，奖励额度 3800 元，可配置前台展示提示。</text>
				<view class="table-head">
					<text>充值金额(元)</text>
					<text>奖励额度(元)</text>
					<text>免额度(可选)</text>
					<text>展示提示文案</text>
					<text>操作</text>
				</view>
				<view v-for="(item, idx) in form.rechargeRules" :key="idx" class="rule-row">
					<uni-easyinput v-model="item.price" type="number" placeholder="如 600" />
					<uni-easyinput v-model="item.rewardYuan" type="number" placeholder="如 3800" />
					<uni-easyinput v-model="item.quota" type="number" placeholder="如 1000000" />
					<uni-easyinput v-model.trim="item.tip" placeholder="如：600元配置100万额度..." />
					<button size="mini" type="warn" @click="removeRule(idx)">删除</button>
				</view>
				<button size="mini" @click="addRule">+ 新增映射</button>
			</view>

			<view class="card">
				<view class="card-title">2）积分兑换区间</view>
				<text class="card-tip">用于“奖励提现”页单笔兑换范围控制。</text>
				<view class="form-grid">
					<view class="field">
						<text class="label">会员最小值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.memberMin" type="number" placeholder="如 10" />
					</view>
					<view class="field">
						<text class="label">会员最大值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.memberMax" type="number" placeholder="如 200" />
					</view>
					<view class="field">
						<text class="label">非会员最小值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.nonMemberMin" type="number" placeholder="如 30" />
					</view>
					<view class="field">
						<text class="label">非会员最大值(元)</text>
						<uni-easyinput v-model="form.withdrawRange.nonMemberMax" type="number" placeholder="如 200" />
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">3）优化金额分期策略</view>
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
				<view class="card-title">4）充值退款周期（仅新充值用户）</view>
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
				</view>
			</view>

			<view class="card">
				<view class="card-title">5）交易类型优化率（进入风控比例）</view>
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
				<view class="card-title">6）测试商户白名单（无门槛积分兑换）</view>
				<text class="card-tip">命中商户可不受最低兑换金额与提现时间限制。支持输入商户 user_id 或商户记录 _id，多个ID可用逗号或换行分隔。</text>
				<uni-easyinput
					v-model.trim="form.testMerchantIdsText"
					type="textarea"
					:inputBorder="true"
					:autoHeight="true"
					placeholder="示例：\n668f98c7ab1234567890abcd\nuid_merchant_test_001, uid_merchant_test_002"
				/>
			</view>
		</view>
	</view>
</template>

<script>
const defaultForm = () => ({
	rechargeRules: [{ price: 600, rewardYuan: 3800, quota: 1000000, tip: '' }],
	withdrawRange: { memberMin: 10, memberMax: 200, nonMemberMin: 30, nonMemberMax: 200 },
	optimizeConfig: { thresholdYuan: 300, aboveInstallments: 5, belowInstallments: 1 },
	refundCycle: { cycleDays: 180, windowDays: 3 },
	riskRates: { '06': 100, '31': 100, '05': 0, '04': 0, '02': 0, '01': 0 },
	testMerchantIds: [],
	testMerchantIdsText: ''
});

export default {
	data() {
		return { loading: false, saving: false, form: defaultForm(), egressIp: '' };
	},
	mounted() {
		this.load();
	},
	methods: {
		addRule() {
			this.form.rechargeRules.push({ price: 0, rewardYuan: 0, quota: 0, tip: '' });
		},
		removeRule(idx) {
			this.form.rechargeRules.splice(idx, 1);
		},
		async load() {
			this.loading = true;
			try {
				const res = await this.$request('bizConfigGet', {}, { functionName: 'merchant' });
				if (res.code !== 0) return uni.showToast({ title: res.message || '加载失败', icon: 'none' });
				const merged = Object.assign(defaultForm(), res.data || {});
				const ids = Array.isArray(merged.testMerchantIds) ? merged.testMerchantIds : [];
				merged.testMerchantIdsText = ids.join('\n');
				this.form = merged;
			} finally {
				this.loading = false;
			}
		},
		async save() {
			this.saving = true;
			try {
				const payload = JSON.parse(JSON.stringify(this.form));
				payload.rechargeRules = (payload.rechargeRules || [])
					.map((x) => ({
						price: Number(x.price || 0),
						rewardYuan: Number(x.rewardYuan || 0),
						quota: Number(x.quota || 0),
						tip: String(x.tip || '').trim()
					}))
					.filter((x) => x.price > 0 && x.rewardYuan >= 0)
					.sort((a, b) => a.price - b.price);
				payload.testMerchantIds = Array.from(
					new Set(
						String(payload.testMerchantIdsText || '')
							.split(/[\n,，;\s]+/)
							.map((x) => String(x || '').trim())
							.filter(Boolean)
					)
				);
				delete payload.testMerchantIdsText;
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
.table-head {
	display: grid;
	grid-template-columns: 120px 120px 140px 1fr 64px;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 12px;
	color: #909399;
}
.rule-row {
	display: grid;
	grid-template-columns: 120px 120px 140px 1fr 64px;
	gap: 8px;
	margin-bottom: 8px;
	align-items: center;
}
.rule-row button { margin: 0 auto; display: block; }
.form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(240px, 1fr));
	gap: 10px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 12px; color: #606266; }

@media (max-width: 1200px) {
	.table-head,
	.rule-row { grid-template-columns: 1fr; }
	.form-grid { grid-template-columns: 1fr; }
}
</style>
