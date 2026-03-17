<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
			<view class="uni-group">
				<button class="uni-button" type="default" size="mini" @click="cancel">取消</button>
				<button class="uni-button" type="primary" size="mini" @click="submitForm">提交保存</button>
			</view>
		</view>
		<view class="uni-container">
			<view class="form-container">
				<form-input 
					v-model="formData.deviceId" 
					label="设备编号" 
					placeholder="请输入设备编号" 
					:maxlength="50"
					:required="true"
				/>
				
				<form-select v-model="formData.brandId" label="机具品牌" :required="true">
					<option value="">选择</option>
					<option v-for="brand in brandList" :key="brand.value" :value="brand.value">{{ brand.label }}</option>
				</form-select>
				
				<form-input 
					v-model="formData.speakerId" 
					label="自有音箱号" 
					placeholder="请输入自有音箱号" 
					:maxlength="50"
				/>
				
				<form-input 
					v-model="formData.merchant" 
					label="所属商户" 
					placeholder="请输入所属商户"
				/>
				
				<form-input 
					v-model="formData.salesman" 
					label="业务员" 
					placeholder="请输入业务员"
				/>
			</view>
		</view>
	</view>
</template>

<script>
import FormInput from '@/components/form/FormInput.vue';
import FormSelect from '@/components/form/FormSelect.vue';

export default {
	components: {
		FormInput,
		FormSelect
	},
	data() {
		return {
			formData: {
				deviceId: '',
				brandId: '',
				speakerId: '',
				merchant: '管理员',
				salesman: '管理员'
			},
			brandList: []
		};
	},
	mounted() {
		this.getBrandList();
	},
	methods: {
		// 获取品牌列表
		getBrandList() {
			this.$request('getBrands', {}, {
				functionName: 'machine'
			}).then(res => {
				if (res.code === 0) {
					this.brandList = res.data;
				}
			});
		},
		
		// 提交表单
		submitForm() {
			// 表单验证
			if (!this.formData.deviceId) {
				uni.showToast({ title: '请输入设备编号', icon: 'none' });
				return;
			}
			
			if (!this.formData.brandId) {
				uni.showToast({ title: '请选择机具品牌', icon: 'none' });
				return;
			}
			
			// 提交数据
			this.$request('add', this.formData, {
				functionName: 'machine'
			}).then(res => {
				if (res.code === 0) {
					uni.showToast({ title: '添加成功', icon: 'success' });
					// 跳转回列表页面
					uni.navigateBack();
				} else {
					uni.showToast({ title: res.message, icon: 'none' });
				}
			}).catch(() => {
				uni.showToast({ title: '添加失败', icon: 'none' });
			});
		},
		
		// 取消
		cancel() {
			uni.navigateBack();
		}
	}
};
</script>

<style scoped>
.fix-top-window {
	position: relative;
	width: 100%;
	height: 100vh;
	padding-top: 50px;
	box-sizing: border-box;
}

.uni-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0 20px;
	height: 50px;
	background-color: #ffffff;
	border-bottom: 1px solid #ebeef5;
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 100;
}

.uni-group {
	display: flex;
	align-items: center;
}

.uni-button {
	margin-left: 10px;
}

.uni-container {
	padding: 20px;
	height: calc(100vh - 50px);
	overflow-y: auto;
}

.form-container {
	background-color: #ffffff;
	padding: 20px;
	border-radius: 4px;
	box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.form-item {
	margin-bottom: 20px;
}

.form-item label {
	display: block;
	margin-bottom: 8px;
	font-size: 14px;
	color: #606266;
}

.form-item label.required::before {
	content: '*';
	color: #f56c6c;
	margin-right: 4px;
}

.form-item input,
.form-item select {
	width: 100%;
	padding: 10px 15px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	font-size: 14px;
}

.form-item input:focus,
.form-item select:focus {
	outline: none;
	border-color: #409eff;
	box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.form-hint {
	font-size: 12px;
	color: #909399;
	margin-top: 5px;
	text-align: right;
}
</style>