<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<text class="nav-back" @click="goBack">‹ 返回</text>
			<text class="nav-title">码牌绑定</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="content">
				<view class="card h5-glass-panel">
					<text class="label">当前绑定机具号</text>
					<text class="current">{{ currentDevice || '未绑定' }}</text>
					<text class="label mt">新机具号（码牌）</text>
					<input class="input" type="text" maxlength="80" placeholder="请输入机具号码" placeholder-class="ph" v-model="deviceInput" />
					<text class="hint">绑定新码牌时，若已绑定其他机具将自动解绑旧机具（不清空账户余额类数据）。解除全部绑定请在「我的」页使用「解除绑定」。</text>
					<button class="btn-save" type="primary" :loading="saving" :disabled="saveDisabled" @click="save">保存绑定</button>
				</view>

				<view class="section-title">绑定 / 解绑记录</view>
				<view v-if="!logs.length && !logLoading" class="empty h5-glass-panel">暂无记录</view>
				<view v-for="item in logs" :key="item.id" class="log-row h5-glass-panel">
					<view class="log-top">
						<text class="log-tag" :class="item.action === 'unbind' ? 'tag-unbind' : 'tag-bind'">{{ item.actionText }}</text>
						<text class="log-time">{{ item.timeText }}</text>
					</view>
					<text class="log-content">{{ item.content }}</text>
					<text v-if="item.reason" class="log-reason">原因：{{ item.reason }}</text>
				</view>
				<button v-if="hasMore" class="btn-more" :loading="logLoading" @click="loadMore">加载更多</button>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import { h5MineInfo, h5BindMachine, h5MachineBindLogList } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			currentDevice: '',
			deviceInput: '',
			saving: false,
			logs: [],
			logPage: 1,
			logTotal: 0,
			logLoading: false,
			hasMore: false
		};
	},
	computed: {
		saveDisabled() {
			const s = String(this.deviceInput || '').trim();
			return this.saving || !s || s === String(this.currentDevice || '').trim();
		}
	},
	onShow() {
		this.prefill();
		this.resetLogs();
		this.loadLogs(true);
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async prefill() {
			const res = await h5MineInfo();
			if (res.code === 0 && res.data?.merchant) {
				this.currentDevice = String(res.data.merchant.deviceId || '').trim();
				this.deviceInput = this.currentDevice;
			}
		},
		resetLogs() {
			this.logs = [];
			this.logPage = 1;
			this.logTotal = 0;
			this.hasMore = false;
		},
		async loadLogs(reset) {
			if (reset) {
				this.logPage = 1;
				this.logs = [];
			}
			this.logLoading = true;
			try {
				const res = await h5MachineBindLogList({ page: this.logPage, pageSize: 15 });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '加载失败', icon: 'none' });
					return;
				}
				const list = res.data?.list || [];
				this.logTotal = res.data?.total || 0;
				this.logs = reset ? list : this.logs.concat(list);
				this.hasMore = this.logs.length < this.logTotal;
			} finally {
				this.logLoading = false;
			}
		},
		loadMore() {
			if (!this.hasMore || this.logLoading) return;
			this.logPage += 1;
			this.loadLogs(false);
		},
		async save() {
			const d = String(this.deviceInput || '').trim();
			if (!d) {
				uni.showToast({ title: '请输入机具号', icon: 'none' });
				return;
			}
			this.saving = true;
			try {
				const res = await h5BindMachine({ deviceId: d });
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '绑定失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: res.message || '成功', icon: 'success' });
				this.currentDevice = res.data?.merchant?.deviceId || d;
				this.resetLogs();
				await this.loadLogs(true);
			} finally {
				this.saving = false;
			}
		}
	}
};
</script>

<style src="@/common/h5-glass.css"></style>
<style scoped>
.page {
	min-height: 100vh;
	position: relative;
	box-sizing: border-box;
	background: transparent;
}

.nav-bar {
	position: relative;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(12px + env(safe-area-inset-top, 0px)) 12px 10px;
}

.nav-back {
	color: rgba(226, 232, 240, 0.95);
	font-size: 15px;
	min-width: 64px;
}

.nav-title {
	color: #f8fafc;
	font-size: 17px;
	font-weight: 700;
}

.nav-placeholder {
	min-width: 64px;
}

.scroll {
	position: absolute;
	left: 0;
	right: 0;
	top: 52px;
	bottom: 0;
	z-index: 1;
	box-sizing: border-box;
}

.content {
	padding: 0 16px 32px;
}

.card {
	padding: 16px;
	margin-bottom: 14px;
}

.label {
	display: block;
	font-size: 12px;
	color: rgba(186, 199, 216, 0.9);
	margin-bottom: 6px;
}

.label.mt {
	margin-top: 14px;
}

.current {
	display: block;
	font-size: 16px;
	font-weight: 700;
	color: #a7f3d0;
	word-break: break-all;
}

.input {
	height: 44px;
	padding: 0 12px;
	border-radius: 12px;
	background: rgba(15, 23, 42, 0.45);
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: #f8fafc;
	font-size: 15px;
}

.ph {
	color: rgba(148, 163, 184, 0.85);
}

.hint {
	display: block;
	margin-top: 10px;
	font-size: 11px;
	color: rgba(203, 213, 225, 0.82);
	line-height: 1.5;
}

.btn-save {
	margin-top: 16px;
	border-radius: 999px;
}

.section-title {
	font-size: 14px;
	font-weight: 700;
	color: rgba(248, 250, 252, 0.92);
	margin: 8px 0 10px;
}

.empty {
	padding: 20px;
	text-align: center;
	color: rgba(148, 163, 184, 0.9);
	font-size: 13px;
}

.log-row {
	padding: 12px 14px;
	margin-bottom: 10px;
}

.log-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.log-tag {
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 999px;
	font-weight: 600;
}

.tag-bind {
	background: rgba(34, 197, 94, 0.2);
	color: #86efac;
}

.tag-unbind {
	background: rgba(248, 113, 113, 0.2);
	color: #fecaca;
}

.log-time {
	font-size: 12px;
	color: rgba(148, 163, 184, 0.95);
}

.log-content {
	display: block;
	font-size: 13px;
	color: rgba(226, 232, 240, 0.95);
	line-height: 1.45;
	word-break: break-all;
}

.log-reason {
	display: block;
	margin-top: 6px;
	font-size: 12px;
	color: rgba(148, 163, 184, 0.9);
}

.btn-more {
	margin-top: 8px;
	margin-bottom: 16px;
	background: rgba(255, 255, 255, 0.08);
	color: #e2e8f0;
	font-size: 13px;
	border-radius: 999px;
	border: none;
}
</style>
