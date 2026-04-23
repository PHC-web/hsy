<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<scroll-view class="mine-scroll" scroll-y :show-scrollbar="false">
			<view class="mine-inner">
				<text class="page-title">我的</text>

				<view class="notice-marquee h5-glass-panel">
					<view class="notice-track">
						<text class="notice-text">温馨提示：本平台只针对正常商户交易进行补贴，套现行为会出发风控，将不允补贴。</text>
						<text class="notice-text notice-text--copy">温馨提示：本平台只针对正常商户交易进行补贴，套现行为会出发风控，将不允补贴。</text>
					</view>
				</view>

				<view class="profile-card h5-glass-panel">
					<image class="avatar" :src="avatarUrl" mode="aspectFill" />
					<view class="profile-main">
						<text class="name">{{ mine.wxNickname || '微信用户' }}</text>
						<text class="sub">{{ mine.mobile || '-' }}</text>
						<text class="sub">{{ mine.brandName || '-' }} / {{ deviceDisplayText }}</text>
					</view>
				</view>
				<view class="fixed-notice h5-glass-panel">
					
					<text class="fixed-notice-content">各大银行卡皆可参与活动奖励</text>
				</view>
				<view class="acct-card h5-glass-panel" @click="onAcctCardClick">
					<view
						class="acct-item"
						:class="{ 'acct-item--link': showWithdrawEntry }"
						@click.stop="onAvailableRewardClick"
					>
						<text class="k">可用奖励</text>
						<view class="acct-reward-right">
							<text class="v">¥{{ account.availableReward }}</text>
						</view>
					</view>
					<view class="acct-item">
						<text class="k">预估免额度</text>
						<text class="v">¥{{ account.estimatedFreeQuota }}</text>
					</view>
					<view class="acct-item acct-item--link" @click.stop="toggleAccountPoints">
						<text class="k">账号积分</text>
						<text class="v">{{ displayAccountPoints }}</text>
					</view>
					<text v-if="agreementNeedSign" class="acct-hint">点击此区域签署「{{ agreement.title || '开户优惠活动计划书' }}」</text>
				</view>

				

				

				<view class="menu-card h5-glass-panel">
					<view class="menu-item" @click="goDevice">
						<text class="menu-title">码牌绑定</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goFinance">
						<text class="menu-title">财务管理</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goCoupons">
						<text class="menu-title">优惠券</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goPendingReturn">
						<text class="menu-title">待返积分</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goMobile">
						<text class="menu-title">手机号维护</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="onViewAgreement">
						<text class="menu-title">查看协议</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goFeedback">
						<text class="menu-title">客服反馈</text>
						<view class="menu-right">
							<view v-if="feedbackUnread" class="menu-badge" aria-hidden="true"></view>
							<text class="menu-arrow">›</text>
						</view>
					</view>
					<view class="menu-item" @click="goRecharge">
						<text class="menu-title">额度预存</text>
						<text class="menu-arrow">›</text>
					</view>
			<!-- 		<view class="menu-item" @click="goPayNotify">
						<text class="menu-title">支付结果异步通知地址</text>
						<text class="menu-arrow">›</text>
					</view>
					<view class="menu-item" @click="goRefundNotify">
						<text class="menu-title">退款结果异步通知地址</text>
						<text class="menu-arrow">›</text>
					</view> -->
				</view>

				<view class="mine-bottom-spacer"></view>
			</view>
		</scroll-view>

		<view class="tabbar h5-glass-tabbar">
			<view class="tab" @click="goHome">首页</view>
			<view class="tab" @click="goIncome">收益</view>
			<view class="tab active">我的</view>
		</view>
		<view v-if="loading" class="loading-mask">
			<view class="loading-card">
				<view class="loading-spinner"></view>
				<text class="loading-text">加载中...</text>
			</view>
		</view>

		<uni-popup ref="agreementPopup" type="bottom">
			<view class="agreement-sheet agreement-sheet--dark">
				<view class="sheet-head">
					<text class="sheet-title">{{ agreement.title || '开户优惠活动计划书签署' }}</text>
				</view>
				<scroll-view scroll-y class="agreement-text">
					<text v-for="(line, idx) in agreementLines" :key="idx" :class="line.cls">{{ line.text }}</text>
				</scroll-view>
				<signature-pad @signed="onSigned" />
			</view>
		</uni-popup>
		<uni-popup ref="agreementViewPopup" type="bottom">
			<view class="agreement-view-sheet agreement-sheet--dark">
				<view class="sheet-head">
					<text class="sheet-title">我的协议</text>
				</view>
				<scroll-view scroll-y class="agreement-view-scroll">
					<image
						class="agreement-preview-image"
						:src="mine.agreementImg || ''"
						mode="widthFix"
						@click="previewAgreementImage"
					/>
				</scroll-view>
				<view class="agreement-view-actions">
					<button class="agreement-view-btn" size="mini" @click="closeAgreementViewer">关闭</button>
					<button class="agreement-view-btn" type="primary" size="mini" @click="resignAgreement">重新签署</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
import SignaturePad from '@/pages/h5/components/SignaturePad.vue';
import { h5MineInfo, h5SignAgreement, h5FeedbackSummary } from '@/pages/h5/common/api';
import { H5_APP_LOGO } from '@/pages/h5/common/branding';

export default {
	components: { SignaturePad },
	data() {
		return {
			loading: false,
			mine: {},
			account: {
				availableReward: '0.00',
				estimatedFreeQuota: '0.00',
				accountPoints: '0.00'
			},
			accountPointsVisible: false,
			defaultAvatar: H5_APP_LOGO,
			feedbackUnread: false,
			agreement: {
				needSign: false,
				currentVersion: '',
				title: '开户优惠活动计划书',
				pdfFileId: '',
				notifyAllResign: false
			},
			agreementLines: [
				{ cls: 'p p-title', text: '慧收盈“开户优惠”活动计划书（完整内容）' },
				{ cls: 'p p-sub', text: '重要须知' },
				{ cls: 'p', text: '本计划书是您（个人或单一实体）与本公司及本公司的合作单位之间关于慧收盈“权益商户”以及权益商户权益中本公司提供的“开户优惠”活动计划书。' },
				{ cls: 'p', text: '公司特别提醒，用户欲使用“权益商户”服务，必须事先认真阅读本计划书条款，包括免除或限制公司责任的免责条款及对用户权利限制条款。' },
				{ cls: 'p', text: '请您审阅并通过签字确认方式选择接受或不接受本计划书条款，以确认是否参加本次优惠活动。' },
				{ cls: 'p', text: '如您不同意本计划书条款或对公司后续修改不同意，您不应使用本服务并且不进行签字确认；否则，您的登录、下载、查看等使用行为将视为您对本计划书全部条款的完全接受。' },
				{ cls: 'p', text: '公司为改善用户体验将持续升级版本、功能与规则，计划书条款也可能随之更新；更新后将在网页公告，公告即生效并替代原条款。' },
				{ cls: 'p', text: '您可随时在平台查阅最新版条款；如不同意条款，您将不能获得使用本服务的权利。' },

				{ cls: 'p p-sub', text: '一、总则及定义' },
				{ cls: 'p', text: '（一）“权益商户”服务是公司设立的客户端增值服务。' },
				{ cls: 'p', text: '（二）“权益商户”服务的所有权和运营权，以及相关制度和活动解释权均归公司所有。' },
				{ cls: 'p', text: '（三）用户在自愿使用前必须仔细阅读并接受本条款；一经注册使用即视为知悉并接受全部规定。' },
				{ cls: 'p', text: '（四）本服务宗旨为向权益商户提供正常客户端服务之外的增值服务。' },

				{ cls: 'p p-sub', text: '二、公司郑重声明' },
				{ cls: 'p', text: '“权益商户”服务不影响收款设备正常使用，不影响收款设备厂家现有免费服务并保证服务质量。' },

				{ cls: 'p p-sub', text: '三、使用“权益商户”服务' },
				{ cls: 'p', text: '（一）公司提供“权益商户”系列优惠及积分兑换功能，具体功能和标准以平台公布为准。' },
				{ cls: 'p', text: '（二）用户除享受增值服务外，也可参加公司后续活动，形式、内容、奖品、规则由公司制定并公布。' },
				{ cls: 'p', text: '（三）用户在使用时应注意：' },
				{ cls: 'p', text: '1. 保证具备签署与履行本计划书所需授权与民事能力，提交真实、合法、准确、完整、有效资料；资料变更需及时告知，否则由用户承担相应后果。' },
				{ cls: 'p', text: '2. 遵守国家法律法规，不得制作、发布、传播违法违规、骚扰、侮辱、恐吓、淫秽等信息。' },
				{ cls: 'p', text: '3. 不得实施危害网络安全行为，包括未经许可入侵系统、篡改数据、传播恶意程序等。' },
				{ cls: 'p', text: '4. 不得利用系统漏洞获取不正当利益，不得进行套现、虚假交易；公司有权要求整改或暂停/终止服务。' },
				{ cls: 'p', text: '5. 不得出租、出借、出售、购买账号或收款物料，不得将他人交易冒充为自身交易。' },
				{ cls: 'p', text: '6. 不得用于赌博、欺诈、洗钱、电诈、非法互联网金融及其他违法活动；后果由用户自行承担。' },
				{ cls: 'p', text: '7. 用户应妥善保管收款物料，采取防护措施防止条码被覆盖、替换、污损、篡改，并进行定期检查。' },
				{ cls: 'p', text: '8. 用户不得私自以公司名义对外承诺或举办未经授权活动；公司有权停止服务并追究法律责任。' },

				{ cls: 'p p-sub', text: '四、服务及计划书条款的变更' },
				{ cls: 'p', text: '（一）服务所有权和运作权归公司，公司按发布章程、条款和规则执行服务。' },
				{ cls: 'p', text: '（二）公司可在必要时修改条款并在重要页面提示；用户继续使用视为接受变动。' },
				{ cls: 'p', text: '（三）公司与合作方可按需要调整服务、收费标准、收费方式及条款，并通过后台通知或其他方式告知。' },
				{ cls: 'p', text: '（四）各项服务内容、收费标准、方式及条款以最终发布通知为准。' },
				{ cls: 'p', text: '（五）公司保留随时修改服务内容、收费标准或中断服务的权利，公告即视为通知。' },

				{ cls: 'p p-sub', text: '五、保密条款' },
				{ cls: 'p', text: '（一）公司尊重个人隐私，未经授权不向第三方公开非公开资料，但法律另有规定除外。' },
				{ cls: 'p', text: '（二）未经公司书面同意，用户应对专有信息保密，不得向任何人披露；监管或司法要求时可依法披露。' },
				{ cls: 'p', text: '（三）本保密条款长期有效。' },

				{ cls: 'p p-sub', text: '六、服务风险及免责声明' },
				{ cls: 'p', text: '（一）服务可能受不可抗力、网络故障、系统不稳定、通信线路等影响，公司对及时性、安全性、准确性不作担保。' },
				{ cls: 'p', text: '（二）用户应自行承担因他人违法内容或侵权行为导致的风险，公司不承担相关损害责任。' },
				{ cls: 'p', text: '（三）用户参加活动或使用增值服务造成人身或财务损失的，用户可向服务提供商主张权利。' },
				{ cls: 'p', text: '（四）因不可抗力、系统升级等造成中断或损失，公司不承担补偿责任。' },
				{ cls: 'p', text: '（五）各项服务使用期限可能调整，具体以公告为准。' },
				{ cls: 'p', text: '（六）对账数据不一致时以公司数据为准；结算存在小数进位误差的，用户予以认可。' },

				{ cls: 'p p-sub', text: '七、服务终止' },
				{ cls: 'p', text: '（一）因政府行为或不可抗力导致服务无法继续，公司将尽快通知，但不承担相关损失。' },
				{ cls: 'p', text: '（二）用户持续违反章程时，公司有权停止服务；用户也可主动停止使用并通知终止。' },

				{ cls: 'p p-sub', text: '八、知识产权' },
				{ cls: 'p', text: '公司及关联公司平台内容、系统、程序及资料受知识产权保护；未经许可不得复制、传播、改编、展示。' },

				{ cls: 'p p-sub', text: '九、与相关法律的关系' },
				{ cls: 'p', text: '本计划书适用中华人民共和国现行法律法规；如个别条款与法律抵触，依法解释或视为无效，不影响其他条款效力。' },

				{ cls: 'p p-sub', text: '十、保障' },
				{ cls: 'p', text: '用户同意保障并维护公司权益，承担因超范围使用服务引起的一切费用与损失（含合理维权支出）。' },

				{ cls: 'p p-sub', text: '十一、意见及建议' },
				{ cls: 'p', text: '用户可通过客户服务渠道提交意见建议（地址、联系人、电话以公司公布为准）。' },

				{ cls: 'p p-sub', text: '附件1：权益商户服务细则（完整条款）' },
				{ cls: 'p', text: '第一条 充值与额度：用户自愿签署后可选择充值套餐，充值金额兑换交易积分额度。' },
				{ cls: 'p', text: '示例套餐：基础套餐 600元；进阶套餐 800元；尊享套餐 1000元（具体额度以正式公告为准）。' },
				{ cls: 'p', text: '第二条 续费机制：额度用尽后可随时续费，原额度与新额度合并计算；无强制续费。' },
				{ cls: 'p', text: '第三条 积分赠送规则：赠送积分=实际交易金额×0.0038（最高），分5个月释放；次月需达成同等交易考核方可释放对应期积分。' },
				{ cls: 'p', text: '第四条 服务终止：用户主动终止后未使用权益作废；存在虚假交易、套现等违规时公司可立即终止并冻结账户。' },
				{ cls: 'p', text: '公司权利义务：提供稳定、安全服务并进行风险监测；依法保护用户信息与商业秘密。' },
				{ cls: 'p', text: '用户权利义务：不得转借出租收款物料，不得用于非法交易，不得违规破解或篡改系统。' },
				{ cls: 'p', text: '违约责任：任何一方违约均承担责任；用户存在擅自终止、虚构交易、违规操作等行为时，公司有权取消资格并追偿。' },
				{ cls: 'p', text: '争议解决：优先友好协商，协商不成提交公司所在地人民法院诉讼解决。' },
				{ cls: 'p', text: '其他条款：本活动为先签署后参与；附件与主文同等效力；自签字盖章之日起生效，到期前未书面终止可自动续签。' },

				{ cls: 'p p-sub', text: '签署页' },
				{ cls: 'p', text: '用户（签字/盖章）：' },
				{ cls: 'p', text: '日期：____________' },
				{ cls: 'p', text: '我已完整阅读并理解本计划书全部内容，自愿签署并同意遵守。' }
			]
		};
	},
	computed: {
		avatarUrl() {
			const u = String(this.mine.wxAvatar || '').trim();
			return u || this.defaultAvatar;
		},
		showWithdrawEntry() {
			return Number(this.account.availableReward || 0) > 0;
		},
		displayAccountPoints() {
			if (!this.accountPointsVisible) return '*****';
			return `¥${this.account.accountPoints}`;
		},
		deviceDisplayText() {
			const d = this.mine.deviceDisplay || this.mine.deviceId || '未绑定';
			return String(d);
		},
		agreementNeedSign() {
			return !!this.agreement.needSign;
		}
	},
	onShow() {
		this.loadMine();
	},
	methods: {
		async loadMine() {
			this.loading = true;
			try {
				const res = await h5MineInfo();
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '获取失败', icon: 'none' });
					return;
				}
				this.mine = Object.assign({}, (res.data && res.data.merchant) || {}, {
					deviceDisplay: (res.data && res.data.device && res.data.device.display) || ''
				});
				this.account = (res.data && res.data.account) || this.account;
				this.agreement = Object.assign({}, this.agreement, (res.data && res.data.agreement) || {});
				const fb = await h5FeedbackSummary();
				if (fb.code === 0 && fb.data) {
					this.feedbackUnread = !!fb.data.unreadReply;
				}
			} finally {
				this.loading = false;
			}
		},
		goDevice() {
			uni.navigateTo({ url: '/pages/h5/device/index' });
		},
		goFinance() {
			uni.navigateTo({ url: '/pages/h5/finance/index' });
		},
		goCoupons() {
			uni.navigateTo({ url: '/pages/h5/coupons/index' });
		},
		goPendingReturn() {
			uni.navigateTo({ url: '/pages/h5/pending-return/index' });
		},
		goMobile() {
			uni.navigateTo({ url: '/pages/h5/mobile/index' });
		},
		goFeedback() {
			uni.navigateTo({ url: '/pages/h5/feedback/index' });
		},
		onAcctCardClick() {
			if (!this.agreementNeedSign) return;
			this.$refs.agreementPopup.open();
		},
		onViewAgreement() {
			if (this.agreementNeedSign) {
				this.$refs.agreementPopup.open();
				return;
			}
			this.$refs.agreementViewPopup.open();
		},
		previewAgreementImage() {
			const src = String(this.mine.agreementImg || '').trim();
			if (!src) return;
			uni.previewImage({ urls: [src], current: src });
		},
		closeAgreementViewer() {
			this.$refs.agreementViewPopup.close();
		},
		resignAgreement() {
			this.$refs.agreementViewPopup.close();
			setTimeout(() => this.$refs.agreementPopup.open(), 120);
		},
		onAvailableRewardClick() {
			const ar = Number(this.account.availableReward || 0);
			if (ar <= 0) return;
			if (this.agreementNeedSign) {
				uni.showToast({ title: '请先签署优惠活动计划书', icon: 'none' });
				this.$refs.agreementPopup.open();
				return;
			}
			uni.navigateTo({ url: '/pages/h5/withdraw/index' });
		},
		toggleAccountPoints() {
			if (!this.accountPointsVisible) {
				this.accountPointsVisible = true;
				return;
			}
			this.onAccountPointsExchangeClick();
		},
		onAccountPointsExchangeClick() {
			if (this.agreementNeedSign) {
				uni.showToast({ title: '请先签署优惠活动计划书', icon: 'none' });
				this.$refs.agreementPopup.open();
				return;
			}
			uni.navigateTo({ url: '/pages/h5/withdraw/index' });
		},
		drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, color = '#334155', font = '500 26px sans-serif') {
			ctx.font = font;
			ctx.fillStyle = color;
			const s = String(text || '');
			let line = '';
			for (let i = 0; i < s.length; i += 1) {
				const ch = s[i];
				const test = line + ch;
				if (ctx.measureText(test).width > maxWidth && line) {
					ctx.fillText(line, x, y);
					y += lineHeight;
					line = ch;
				} else {
					line = test;
				}
			}
			if (line) {
				ctx.fillText(line, x, y);
				y += lineHeight;
			}
			return y;
		},
		buildAgreementCompositeImage(signatureImage) {
			// #ifndef H5
			return Promise.resolve(signatureImage);
			// #endif
			// #ifdef H5
			return new Promise((resolve, reject) => {
				try {
					const contentWidth = 1120;
					const pagePadding = 52;
					const lineHeight = 36;
					const signAreaHeight = 210;
					const draftCanvas = document.createElement('canvas');
					const draftCtx = draftCanvas.getContext('2d');
					if (!draftCtx) {
						resolve(signatureImage);
						return;
					}

					let estimateHeight = 180 + signAreaHeight;
					const textMaxWidth = contentWidth - pagePadding * 2;
					(this.agreementLines || []).forEach((line) => {
						const t = String((line && line.text) || '');
						draftCtx.font = line && line.cls && line.cls.includes('p-title') ? '700 30px sans-serif' : line && line.cls && line.cls.includes('p-sub') ? '700 27px sans-serif' : '500 26px sans-serif';
						const rows = Math.max(1, Math.ceil(draftCtx.measureText(t).width / textMaxWidth));
						estimateHeight += rows * lineHeight + 8;
					});

					const canvas = document.createElement('canvas');
					canvas.width = contentWidth;
					canvas.height = Math.max(estimateHeight, 1200);
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						resolve(signatureImage);
						return;
					}

					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, canvas.width, canvas.height);

					let y = 70;
					ctx.fillStyle = '#0f172a';
					ctx.font = '700 38px sans-serif';
					ctx.fillText('慧收盈“开户优惠”活动计划书', pagePadding, y);
					y += 56;

					for (const line of this.agreementLines || []) {
						const cls = (line && line.cls) || '';
						const text = (line && line.text) || '';
						const isTitle = cls.includes('p-title');
						const isSub = cls.includes('p-sub');
						const color = isTitle ? '#0f172a' : isSub ? '#1e293b' : '#334155';
						const font = isTitle ? '700 30px sans-serif' : isSub ? '700 27px sans-serif' : '500 26px sans-serif';
						y = this.drawWrappedText(ctx, text, pagePadding, y, textMaxWidth, lineHeight, color, font);
						y += 8;
					}

					const signTop = Math.max(y + 24, canvas.height - signAreaHeight - 36);
					ctx.strokeStyle = '#94a3b8';
					ctx.lineWidth = 2;
					ctx.setLineDash([10, 8]);
					ctx.strokeRect(pagePadding, signTop, textMaxWidth, signAreaHeight);
					ctx.setLineDash([]);
					ctx.fillStyle = '#475569';
					ctx.font = '600 26px sans-serif';
					ctx.fillText('用户签字/盖章', pagePadding + 16, signTop + 42);

					const signImg = new Image();
					signImg.onload = () => {
						const signW = 280;
						const signH = 120;
						const signX = pagePadding + textMaxWidth - signW - 16;
						const signY = signTop + 58;
						ctx.drawImage(signImg, signX, signY, signW, signH);
						ctx.fillStyle = '#64748b';
						ctx.font = '500 24px sans-serif';
						const ds = new Date();
						const dateText = `签署日期：${ds.getFullYear()}-${String(ds.getMonth() + 1).padStart(2, '0')}-${String(ds.getDate()).padStart(2, '0')}`;
						ctx.fillText(dateText, pagePadding + 16, signTop + signAreaHeight - 18);
						resolve(canvas.toDataURL('image/png', 0.92));
					};
					signImg.onerror = () => resolve(signatureImage);
					signImg.src = signatureImage;
				} catch (e) {
					reject(e);
				}
			});
			// #endif
		},
		async onSigned(payload) {
			const signatureImage = payload && (payload.dataUrl || payload.tempFilePath);
			if (!signatureImage) {
				uni.showToast({ title: '签名图生成失败', icon: 'none' });
				return;
			}
			uni.showLoading({ title: '提交签署...', mask: true });
			try {
				const agreementImage = await this.buildAgreementCompositeImage(signatureImage);
				const res = await h5SignAgreement({
					signatureImage: agreementImage,
					agreementVersion: this.agreement.currentVersion || ''
				});
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '签署失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '签署成功', icon: 'success' });
				this.$refs.agreementViewPopup.close();
				this.$refs.agreementPopup.close();
				this.loadMine();
			} finally {
				uni.hideLoading();
			}
		},
		goHome() {
			uni.redirectTo({ url: '/pages/h5/home/index' });
		},
		goIncome() {
			uni.redirectTo({ url: '/pages/h5/income/index' });
		},
		goRecharge() {
			if (this.agreementNeedSign) {
				uni.showToast({ title: '请先签署优惠活动计划书', icon: 'none' });
				this.$refs.agreementPopup.open();
				return;
			}
			uni.navigateTo({ url: '/pages/h5/recharge/index' });
		},
		goPayNotify() {
			uni.navigateTo({ url: '/pages/h5/notify/pay/index' });
		},
		goRefundNotify() {
			uni.navigateTo({ url: '/pages/h5/notify/refund/index' });
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	height: 100vh;
	position: relative;
	overflow: hidden;
	box-sizing: border-box;
	background: transparent;
}

.mine-scroll {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	z-index: 1;
	box-sizing: border-box;
}

.mine-inner {
	padding: 12px 16px 8px;
}

.page-title {
	display: block;
	font-size: 22px;
	font-weight: 700;
	color: rgba(248, 250, 252, 0.96);
	margin-bottom: 14px;
	letter-spacing: 0.02em;
}

.notice-marquee {
	overflow: hidden;
	padding: 10px 0;
	margin-bottom: 14px;
}

.notice-track {
	display: flex;
	width: max-content;
	animation: marquee-move 14s linear infinite;
}

.notice-text {
	flex-shrink: 0;
	padding-left: 14px;
	font-size: 12px;
	font-weight: 600;
	color: rgba(251, 191, 36, 0.95);
	white-space: nowrap;
}

.notice-text--copy {
	padding-left: 48px;
}

@keyframes marquee-move {
	0% {
		transform: translateX(0);
	}
	100% {
		transform: translateX(-50%);
	}
}

.profile-card {
	display: flex;
	gap: 12px;
	align-items: center;
	padding: 16px;
	margin-bottom: 14px;
}

.avatar {
	width: 58px;
	height: 58px;
	border-radius: 18px;
	border: 2px solid rgba(255, 255, 255, 0.18);
	background: rgba(15, 23, 42, 0.4);
}

.name {
	display: block;
	font-size: 17px;
	font-weight: 700;
	color: #f8fafc;
}

.sub {
	display: block;
	margin-top: 4px;
	color: rgba(203, 213, 225, 0.85);
	font-size: 12px;
}

.acct-card {
	padding: 6px 14px 12px;
	margin-bottom: 14px;
}

.acct-item {
	display: flex;
	justify-content: space-between;
	padding: 12px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.acct-item:last-child {
	border-bottom: 0;
}

.acct-item--link {
	cursor: pointer;
}

.acct-reward-right {
	display: flex;
	align-items: center;
	gap: 8px;
}

.withdraw-entry {
	font-size: 12px;
	font-weight: 600;
	color: rgba(167, 243, 208, 0.95);
	white-space: nowrap;
}

.acct-hint {
	display: block;
	margin-top: 8px;
	font-size: 11px;
	color: rgba(251, 191, 36, 0.9);
	line-height: 1.45;
}

.fixed-notice,
.example-card {
	padding: 12px 14px;
	margin-bottom: 14px;
}

.fixed-notice-title,
.example-title {
	display: block;
	font-size: 13px;
	font-weight: 700;
	color: #f8fafc;
	margin-bottom: 6px;
}

.fixed-notice-content,
.example-content {
	display: block;
	font-size: 12px;
	line-height: 1.6;
	color: rgba(226, 232, 240, 0.92);
}

.fixed-notice-content {
	text-align: center;
	color: #fbbf24;
	font-weight: 700;
	font-size: 14px;
}

.k {
	color: rgba(186, 199, 216, 0.95);
	font-size: 13px;
}

.v {
	color: #a7f3d0;
	font-weight: 700;
}

.menu-card {
	overflow: hidden;
	margin-bottom: 8px;
}

.menu-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.menu-right {
	display: flex;
	align-items: center;
	gap: 8px;
}

.menu-badge {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #f87171;
	box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.5);
}

.menu-item:last-child {
	border-bottom: 0;
}

.menu-title {
	color: #e2e8f0;
	font-size: 14px;
}

.menu-arrow {
	color: rgba(148, 163, 184, 0.9);
	font-size: 18px;
	line-height: 1;
}

.mine-bottom-spacer {
	height: 20px;
}

.tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 20;
	display: flex;
	height: calc(56px + env(safe-area-inset-bottom, 0px));
	padding-bottom: env(safe-area-inset-bottom, 0px);
	box-sizing: border-box;
	align-items: flex-start;
}

.tab {
	flex: 1;
	text-align: center;
	line-height: 56px;
	font-size: 14px;
}
.loading-mask {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(2, 6, 23, 0.45);
	backdrop-filter: blur(2px);
	-webkit-backdrop-filter: blur(2px);
}
.loading-card {
	min-width: 120px;
	padding: 16px 18px;
	border-radius: 14px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	background: rgba(15, 23, 42, 0.86);
	border: 1px solid rgba(255, 255, 255, 0.14);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}
.loading-spinner {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid rgba(148, 163, 184, 0.35);
	border-top-color: #a5b4fc;
	animation: h5-spin 0.8s linear infinite;
}
.loading-text {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.95);
}
@keyframes h5-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.agreement-sheet {
	border-radius: 20px 20px 0 0;
	padding: 16px 16px 12px;
	margin: 0;
	max-height: 88vh;
	box-sizing: border-box;
}

.agreement-sheet--dark {
	background: rgba(15, 23, 42, 0.92);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-bottom: none;
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
}

.agreement-view-sheet {
	border-radius: 20px 20px 0 0;
	padding: 16px 16px 12px;
	margin: 0;
	max-height: 88vh;
	box-sizing: border-box;
}

.agreement-view-scroll {
	max-height: 62vh;
	margin-top: 10px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 10px;
	box-sizing: border-box;
	background: rgba(0, 0, 0, 0.2);
}

.agreement-preview-image {
	display: block;
	width: 100%;
	border-radius: 8px;
	background: #fff;
}

.agreement-view-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 12px;
}

.agreement-view-btn {
	margin: 0;
}

.sheet-title {
	font-size: 16px;
	font-weight: 700;
	color: #f8fafc;
}

.agreement-text {
	max-height: 42vh;
	margin-top: 10px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 10px;
	box-sizing: border-box;
	background: rgba(0, 0, 0, 0.2);
}

.p {
	display: block;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.92);
	line-height: 1.6;
	margin-bottom: 6px;
}

.p-title {
	font-size: 13px;
	font-weight: 700;
	color: #f8fafc;
}

.p-sub {
	font-weight: 700;
	color: #cbd5e1;
	margin-top: 8px;
}
</style>

