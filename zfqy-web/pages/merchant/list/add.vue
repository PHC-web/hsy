<template>
	<view class="uni-container">
		<view class="form-tip">用于在公众号 H5 未开发前模拟商户注册，填写机具号及模拟的微信信息即可生成一条商户记录。</view>
		<uni-forms ref="form" v-model="formData" :rules="rules" validateTrigger="bind" @submit="submit">
			<uni-forms-item name="device_id" label="机具号" required>
				<uni-easyinput v-model="formData.device_id" placeholder="请输入机具号（与机具列表中的编号一致）" />
			</uni-forms-item>

			<uni-forms-item name="wx_nickname" label="微信昵称">
				<uni-easyinput v-model="formData.wx_nickname" placeholder="模拟微信昵称，不填默认「模拟用户」" />
			</uni-forms-item>

			<uni-forms-item name="mobile" label="手机号">
				<uni-easyinput v-model="formData.mobile" type="number" placeholder="模拟手机号，选填" :maxlength="11" />
			</uni-forms-item>

			<uni-forms-item name="wx_avatar" label="头像URL">
				<uni-easyinput v-model="formData.wx_avatar" placeholder="模拟微信头像图片链接，选填" />
			</uni-forms-item>

			<uni-forms-item name="agreement_img" label="协议图片URL">
				<uni-easyinput v-model="formData.agreement_img" placeholder="协议签署图链接，选填" />
			</uni-forms-item>

			<uni-forms-item name="brand_name" label="品牌名">
				<uni-easyinput v-model="formData.brand_name" placeholder="选填，不填则按机具号从机具表自动带出" />
			</uni-forms-item>

			<view class="uni-button-group">
				<button style="width: 120px;" type="primary" class="uni-button" :disabled="isSubmitting" @click="submitForm">模拟注册</button>
				<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="isSubmitting" @click="goToList">返回列表</button>
			</view>
		</uni-forms>
	</view>
</template>

<script>
export default {
	onBackPress() {
		this.goToList();
		return true;
	},
	data() {
		return {
			isSubmitting: false,
			formData: {
				device_id: '',
				wx_nickname: '',
				mobile: '',
				wx_avatar: '',
				agreement_img: '',
				brand_name: ''
			},
			rules: {
				device_id: {
					rules: [
						{ required: true, errorMessage: '请输入机具号' },
						{ maxLength: 50, errorMessage: '机具号不能超过50位' }
					]
				},
				mobile: {
					rules: [
						{ pattern: /^\d{0,11}$/, errorMessage: '手机号只能为数字且不超过11位' }
					]
				}
			}
		};
	},
	methods: {
		goToList() {
			uni.navigateTo({
				url: '/pages/merchant/list/index'
			});
		},
		submitForm() {
			this.$refs.form.submit();
		},
		submit(event) {
			if (this.isSubmitting) return;
			const { value, errors } = event.detail || {};
			if (errors) return;

			this.isSubmitting = true;
			uni.showLoading({ title: '提交中...', mask: true });
			this.$request('simulateRegister', value, { functionName: 'merchant' }).then(res => {
				if (res.code === 0) {
					uni.showToast({ title: '模拟注册成功', icon: 'success' });
					setTimeout(() => this.goToList(), 500);
				} else {
					uni.showToast({ title: res.message || '注册失败', icon: 'none' });
				}
			}).catch(err => {
				uni.showModal({
					content: err?.message || '请求服务失败',
					showCancel: false
				});
			}).finally(() => {
				this.isSubmitting = false;
				uni.hideLoading();
			});
		}
	}
};
</script>

<style scoped>
.uni-container {
	padding: 20px;
}
.form-tip {
	color: #909399;
	font-size: 13px;
	line-height: 1.5;
	margin-bottom: 16px;
	padding: 10px 12px;
	background: #f4f4f5;
	border-radius: 4px;
}
.uni-button-group {
	margin-top: 20px;
}
::v-deep .uni-forms-item__label {
	width: 100px !important;
}
</style>
