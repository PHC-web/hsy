<template>
	<view>
		<view class="uni-header">
			<view class="uni-group">
				<view class="uni-title">{{$t('demo.icons.title')}}（uni-icons / element-icons / bootstrap-icons）</view>
				<view class="uni-sub-title">{{$t('demo.icons.describle')}}</view>
			</view>
			<view class="uni-group icon-actions">
				<view
					@click="iconType = 'uni'"
					:class="['type-btn', { active: iconType === 'uni' }]"
				>
					uni 图标
				</view>
				<view
					@click="iconType = 'el'"
					:class="['type-btn', { active: iconType === 'el' }]"
				>
					element 图标
				</view>
				<view
					@click="iconType = 'bi'"
					:class="['type-btn', { active: iconType === 'bi' }]"
				>
					bootstrap 图标
				</view>
				<uni-easyinput
					class="icon-search"
					v-model.trim="keyword"
					:clearable="true"
					placeholder="搜索图标，如：user / s-home / house"
				/>
			</view>
		</view>
		<view class="uni-container">
			<view class="icons">
				<view v-for="(icon,index) in filteredIcons" :key="index" class="icon-item pointer">
					<view @click="setClipboardData('tag',icon)" :class="iconClass(icon)"></view>
					<text @click="setClipboardData('class',icon)" class="icon-text">{{ currentPrefix }}{{icon }}</text>
				</view>
			</view>
		</view>
		<!-- 在非H5环境下显示fix-window组件 -->
		<!-- #ifndef H5 -->
		<fix-window v-if="fixWindow" />
		<!-- #endif -->
	</view>
</template>

<script>
	import icons from './uni-icons.js'
	import elementIcons from './element-icons.js'
	import bootstrapIcons from './bootstrap-icons.js'

	export default {
		data() {
			return {
				icons,
				elementIcons,
				bootstrapIcons,
				iconType: 'uni',
				keyword: ''
			}
		},
		props:{
			tag: {
				type: Boolean,
				default: true
			},
			fixWindow: {
				type: Boolean,
				default: true
			}
		},
		computed: {
			currentPrefix() {
				if (this.iconType === 'uni') return 'uni-icons-'
				if (this.iconType === 'el') return 'el-icon-'
				return 'bi bi-'
			},
			currentIcons() {
				if (this.iconType === 'uni') return this.icons
				if (this.iconType === 'el') return this.elementIcons
				return this.bootstrapIcons
			},
			filteredIcons() {
				if (!this.keyword) return this.currentIcons
				const key = this.keyword.toLowerCase()
				return this.currentIcons.filter(icon => icon.toLowerCase().includes(key))
			}
		},
		methods: {
			iconClass(icon) {
				return this.currentPrefix + icon
			},
			setClipboardData(type, icon) {
				let data = this.currentPrefix + icon

				if (this.tag && type === 'tag') {
					data = '<view class="' + data + '"></view>'
				}

				uni.setClipboardData({
					data,
					success(res) {
						uni.showToast({
							icon: 'none',
							title: '复制 ' + data + ' 成功！'
						})
					},
					fail(res) {
						uni.showModal({
							content: '复制 ' + data + ' 失败！',
							showCancel: false
						})
					}
				})
			}
		}
	}
</script>


<style lang="scss">
	/* #ifndef H5 */
	page {
		padding-top: 85px;
	}
	/* #endif */
	.icons {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
	}

	.icon-actions {
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 10px;
	}

	.type-btn {
		padding: 4px 10px;
		border: 1px solid #dcdfe6;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		color: #606266;
	}

	.type-btn.active {
		color: #fff;
		background: #409eff;
		border-color: #409eff;
	}

	.icon-search {
		width: 220px;
	}

	.icon-item {
		display: flex;
		width: 16.6%;
		height: 120px;
		font-size: 30px;
		text-align: center;
		justify-content: center;
		align-items: center;
		flex-direction: column;
	}

	.icon-item:hover,
	.icon-item:hover .icon-text {
		color: $uni-color-primary;
	}

	.icon-text {
		color: #99a9bf;
		font-size: 12px;
		text-align: center;
		height: 1em;
		line-height: 1em;
		margin-top: 15px;
	}

	/* #ifdef H5 */
	@media only screen and (max-width: 500px) {
		.icon-item {
			width: 33.3%;
		}
	}
	/* #endif */
</style>
