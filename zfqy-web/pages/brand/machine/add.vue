<template>
	<view class="uni-container">
		<uni-forms ref="form" v-model="formData" :rules="rules" validateTrigger="bind" @submit="submit">
			<uni-forms-item name="brandId" label="产品品牌" required>
				<uni-data-select v-model="formData.brandId" :localdata="brandList" placeholder="请选择产品品牌" />
			</uni-forms-item>

			<uni-forms-item name="deviceId" label="机具编号" required>
				<uni-easyinput v-model="formData.deviceId" :clearable="false" placeholder="请输入机具编号（50位以内）" />
			</uni-forms-item>

			<view class="uni-button-group">
				<button style="width: 100px;" type="primary" class="uni-button" :disabled="isSubmitting" @click="submitForm">提交</button>
				<button style="width: 100px; margin-left: 15px;" class="uni-button" :disabled="isSubmitting" @click="goToList">返回</button>
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
				deviceId: '',
				brandId: '',
				speakerId: ''
			},
			brandList: [],
			rules: {
				brandId: {
					rules: [
						{ required: true, errorMessage: '请选择产品品牌' }
					]
				},
				deviceId: {
					rules: [
						{ required: true, errorMessage: '请输入机具编号' },
						{ maxLength: 50, errorMessage: '机具编号不能超过50位' }
					]
				}
			}
		};
	},
	mounted() {
		this.getBrandList();
	},
	methods: {
		goToList() {
			uni.redirectTo({
				url: '/pages/brand/machine/index'
			});
		},
		// 获取品牌列表
		getBrandList() {
			this.$request('list', { page: 1, pageSize: 1000 }, {
				functionName: 'brand'
			}).then(res => {
				if (res.code === 0) {
					this.brandList = (res.data?.list || []).map(item => ({
						value: item.id,
						text: item.brandName
					}));
				}
			});
		},

		/**
		 * 触发表单提交
		 */
		submitForm() {
			this.$refs.form.submit();
		},

		/**
		 * 表单提交
		 */
		submit(event) {
			if (this.isSubmitting) return;
			const { value, errors } = event.detail || {};
			if (errors) return;

			this.isSubmitting = true;
			uni.showLoading({
				title: '提交中...',
				mask: true
			});
			this.$request('add', value, {
				functionName: 'machine'
			}).then(res => {
				if (res.code === 0) {
					uni.showToast({ title: '添加成功', icon: 'success' });
					setTimeout(() => this.goToList(), 500);
				} else {
					uni.showToast({ title: res.message || '添加失败', icon: 'none' });
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

<style>
	::v-deep .uni-forms-item__label {
		width: 90px !important;
	}
</style>