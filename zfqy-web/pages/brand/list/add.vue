<template>
	<view class="fix-top-window">
		<view class="uni-container">
			<view class="form-container">
				<!-- 添加模式下显示的字段 -->
				<view v-if="!isEdit" class="form-item">
					<label class="required">品牌标识</label>
					<input type="text" v-model="formData.brandId" placeholder="品牌标识" maxlength="20" />
					<view class="form-hint">{{ formData.brandId.length }}/20</view>
				</view>
				
				<!-- 编辑模式和添加模式都显示的字段 -->
				<view class="form-item">
					<label class="required">品牌名称</label>
					<input type="text" v-model="formData.brandName" placeholder="品牌名称" maxlength="20" />
					<view class="form-hint">{{ formData.brandName.length }}/20</view>
				</view>
				
				<view class="form-item">
					<label class="required">激活条件（元）</label>
					<input type="number" v-model="formData.activationCondition" placeholder="刷卡多少算激活" min="0" step="0.01" />
				</view>
				
				<!-- 添加模式下显示的字段 -->
				<view v-if="!isEdit" class="form-item">
					<label>激活返邮</label>
					<input type="number" v-model="formData.returnMachine" placeholder="激活返邮金额" min="0" step="0.01" />
				</view>
				
				<view v-if="!isEdit" class="form-item">
					<label>公钥</label>
					<textarea v-model="formData.publicKey" placeholder="数据回传方提供的公钥" rows="4" maxlength="400"></textarea>
					<view class="form-hint">{{ formData.publicKey.length }}/400</view>
				</view>
				
				<view v-if="!isEdit" class="form-item">
					<label>私钥</label>
					<textarea v-model="formData.privateKey" placeholder="自己生成的私钥" rows="4" maxlength="400"></textarea>
					<view class="form-hint">{{ formData.privateKey.length }}/400</view>
				</view>
				
				<view class="form-item">
					<label>激活薪资（元）（给到业务员）</label>
					<input type="number" v-model="formData.activationSalary" placeholder="激活每台机具薪资" min="0" step="0.01" />
				</view>
				<view class="form-actions">
					<button class="uni-button" type="default" @click="cancel">取消</button>
					<button class="uni-button" type="primary" @click="submitForm">提交保存</button>
				</view>
			</view>
		</view>
		<!-- #ifndef H5 -->
		<fix-window />
		<!-- #endif -->
	</view>
</template>

<script>
export default {
	data() {
		return {
			isEdit: false,
			brandId: '',
			formData: {
				brandId: '',
				brandName: '',
				activationCondition: '',
				returnMachine: '',
				publicKey: '',
				privateKey: '',
				activationSalary: ''
			}
		};
	},
	onLoad(options) {
		if (options.id) {
			this.isEdit = true;
			this.brandId = options.id;
			this.getBrandDetail(options.id);
		}
	},
	methods: {
		cancel() {
			uni.navigateBack();
		},
		getBrandDetail(id) {
			this.$request('get', { id }, {
				functionName: 'brand'
			}).then(res => {
				if (res.code === 0) {
					const data = res.data;
					this.formData = {
						brandId: data.brand_id,
						brandName: data.brand_name,
						activationCondition: data.activation_condition,
						returnMachine: data.return_machine || '',
						publicKey: data.public_key || '',
						privateKey: data.private_key || '',
						activationSalary: data.activation_salary
					};
				}
			}).catch(err => {
				console.error('获取品牌详情失败:', err);
			});
		},
		submitForm() {
			// 添加模式的验证
			if (!this.isEdit) {
				if (!this.formData.brandId) {
					uni.showToast({ title: '请输入品牌标识', icon: 'none' });
					return;
				}
				if (this.formData.brandId.length > 20) {
					uni.showToast({ title: '品牌标识不能超过20字', icon: 'none' });
					return;
				}
			}
			
			// 通用验证
			if (!this.formData.brandName) {
				uni.showToast({ title: '请输入品牌名称', icon: 'none' });
				return;
			}
			if (this.formData.brandName.length > 20) {
				uni.showToast({ title: '品牌名称不能超过20字', icon: 'none' });
				return;
			}
			if (!this.formData.activationCondition) {
				uni.showToast({ title: '请输入激活条件', icon: 'none' });
				return;
			}
			if (parseFloat(this.formData.activationCondition) <= 0) {
				uni.showToast({ title: '激活条件必须是正数', icon: 'none' });
				return;
			}
			
			// 非必填字段的验证
			if (this.formData.returnMachine && parseFloat(this.formData.returnMachine) <= 0) {
				uni.showToast({ title: '激活返邮必须是正数', icon: 'none' });
				return;
			}
			if (this.formData.activationSalary && parseFloat(this.formData.activationSalary) <= 0) {
				uni.showToast({ title: '激活薪资必须是正数', icon: 'none' });
				return;
			}
			if (this.formData.publicKey.length > 400) {
				uni.showToast({ title: '公钥不能超过400字', icon: 'none' });
				return;
			}
			if (this.formData.privateKey.length > 400) {
				uni.showToast({ title: '私钥不能超过400字', icon: 'none' });
				return;
			}

			const action = this.isEdit ? 'update' : 'add';
			const data = this.isEdit 
				? { id: this.brandId, ...this.formData }
				: this.formData;

			this.$request(action, data, {
				functionName: 'brand'
			}).then(res => {
				if (res.code === 0) {
					uni.showToast({ title: this.isEdit ? '更新成功' : '添加成功', icon: 'success' });
					setTimeout(() => {
						uni.$emit('brand-list-refresh');
						uni.navigateBack();
					}, 1500);
				} else {
					uni.showToast({ title: res.message || '操作失败', icon: 'none' });
				}
			}).catch(err => {
				uni.showToast({ title: '网络错误', icon: 'none' });
				console.error('操作失败:', err);
			});
		}
	}
};
</script>

<style scoped>
.fix-top-window {
	padding-top: 0;
}

.uni-container {
	padding: 20px;
}

.form-container {
	background-color: #fff;
	padding: 20px;
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-item {
	margin-bottom: 20px;
}

.form-item label {
	display: block;
	margin-bottom: 8px;
	font-weight: bold;
}

.required::after {
	content: '*';
	color: #ff4d4f;
	margin-left: 4px;
}

.form-item input,
.form-item select,
.form-item textarea {
	width: 100%;
	padding: 10px;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 14px;
}

.form-item textarea {
	resize: vertical;
	min-height: 100px;
}

.form-hint {
	font-size: 12px;
	color: #999;
	margin-top: 5px;
	text-align: right;
}

.uni-group {
	display: flex;
	gap: 10px;
}

.uni-button {
	margin: 0;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	margin-top: 24px;
}
</style>