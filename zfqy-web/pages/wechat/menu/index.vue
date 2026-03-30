<template>
	<view class="uni-container">
		<view class="uni-header">
			<view class="uni-title">微信底部菜单</view>
			<view class="uni-group">
				<button size="mini" type="primary" @click="addMenu">新增菜单</button>
			</view>
		</view>

		<uni-table border stripe emptyText="暂无底部菜单">
			<uni-tr>
				<uni-th align="center">菜单名称</uni-th>
				<uni-th align="center">类型</uni-th>
				<uni-th align="center">值/链接</uni-th>
				<uni-th align="center">排序</uni-th>
				<uni-th align="center">操作</uni-th>
			</uni-tr>
			<uni-tr v-for="(item, index) in menuList" :key="index">
				<uni-td>{{ item.name }}</uni-td>
				<uni-td>{{ item.type }}</uni-td>
				<uni-td>{{ item.value }}</uni-td>
				<uni-td align="center">{{ item.sort }}</uni-td>
				<uni-td align="center">
					<view class="uni-group" style="justify-content: center;">
						<button size="mini" type="primary" @click="editMenu(index)">编辑</button>
						<button size="mini" type="warn" @click="removeMenu(index)">删除</button>
					</view>
				</uni-td>
			</uni-tr>
		</uni-table>

		<uni-popup ref="editPopup" type="dialog">
			<uni-popup-dialog
				mode="input"
				title="菜单名称"
				:value="editForm.name"
				@confirm="onEditNameConfirm"
				@close="closeEdit"
			/>
		</uni-popup>
	</view>
</template>

<script>
const STORAGE_KEY = 'wechat_bottom_menu_config'

export default {
	data() {
		return {
			menuList: [],
			editIndex: -1,
			editForm: {
				name: '',
				type: 'view',
				value: '',
				sort: 100
			}
		}
	},
	onLoad() {
		const cache = uni.getStorageSync(STORAGE_KEY)
		this.menuList = Array.isArray(cache) ? cache : []
	},
	methods: {
		saveAll() {
			uni.setStorageSync(STORAGE_KEY, this.menuList)
		},
		addMenu() {
			this.editIndex = -1
			this.editForm = { name: '', type: 'view', value: '', sort: 100 }
			this.$refs.editPopup.open()
		},
		editMenu(index) {
			this.editIndex = index
			this.editForm = { ...this.menuList[index] }
			this.$refs.editPopup.open()
		},
		onEditNameConfirm(name) {
			if (!name) return
			this.editForm.name = name
			uni.showModal({
				title: '菜单类型',
				content: '确定使用 view 类型（链接跳转）？点取消则为 click 类型（事件）',
				success: (res) => {
					this.editForm.type = res.confirm ? 'view' : 'click'
					uni.showModal({
						title: '请输入值',
						editable: true,
						placeholderText: this.editForm.type === 'view' ? '请输入跳转链接URL' : '请输入事件KEY',
						success: (ret) => {
							if (!ret.confirm) return
							this.editForm.value = ret.content || ''
							if (this.editIndex === -1) {
								this.menuList.push({ ...this.editForm })
							} else {
								this.$set(this.menuList, this.editIndex, { ...this.editForm })
							}
							this.menuList.sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
							this.saveAll()
							uni.showToast({ title: '保存成功', icon: 'success' })
						}
					})
				}
			})
		},
		closeEdit() {
			this.editIndex = -1
		},
		removeMenu(index) {
			uni.showModal({
				title: '提示',
				content: '确认删除该菜单吗？',
				success: (res) => {
					if (!res.confirm) return
					this.menuList.splice(index, 1)
					this.saveAll()
				}
			})
		}
	}
}
</script>
