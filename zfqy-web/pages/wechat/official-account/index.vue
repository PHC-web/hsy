<template>
	<view class="uni-container">
		<view class="uni-header">
			<view class="uni-title">微信公众号配置</view>
		</view>
		<uni-forms ref="form" :modelValue="formData" labelWidth="120">
			<uni-forms-item label="公众号名称">
				<uni-easyinput v-model.trim="formData.name" placeholder="例如：慧收盈服务号" />
			</uni-forms-item>
			<uni-forms-item label="AppID">
				<uni-easyinput v-model.trim="formData.appid" placeholder="请输入公众号 AppID" />
			</uni-forms-item>
			<uni-forms-item label="AppSecret">
				<uni-easyinput v-model.trim="formData.appSecret" placeholder="请输入公众号 AppSecret" />
			</uni-forms-item>
			<uni-forms-item label="Token">
				<uni-easyinput v-model.trim="formData.token" placeholder="请输入消息服务器 Token" />
			</uni-forms-item>
			<uni-forms-item label="EncodingAESKey">
				<uni-easyinput v-model.trim="formData.aesKey" placeholder="请输入 EncodingAESKey" />
			</uni-forms-item>
			<uni-forms-item label="服务器URL">
				<uni-easyinput v-model.trim="formData.serverUrl" placeholder="请输入消息服务器 URL" />
			</uni-forms-item>
		</uni-forms>
		<view class="uni-button-group">
			<button type="primary" class="uni-button" @click="saveConfig">保存配置</button>
		</view>
	</view>
</template>

<script>
const STORAGE_KEY = 'wechat_official_account_config'

export default {
	data() {
		return {
			formData: {
				name: '',
				appid: '',
				appSecret: '',
				token: '',
				aesKey: '',
				serverUrl: ''
			}
		}
	},
	onLoad() {
		const cache = uni.getStorageSync(STORAGE_KEY)
		if (cache) this.formData = cache
	},
	methods: {
		saveConfig() {
			uni.setStorageSync(STORAGE_KEY, this.formData)
			uni.showToast({ title: '保存成功', icon: 'success' })
		}
	}
}
</script>
