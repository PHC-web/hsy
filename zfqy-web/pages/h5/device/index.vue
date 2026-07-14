<template>
	<view class="page">
		<view class="h5-glass-bg" aria-hidden="true">
			<view class="h5-glass-orb h5-glass-orb-a"></view>
			<view class="h5-glass-orb h5-glass-orb-b"></view>
			<view class="h5-glass-orb h5-glass-orb-c"></view>
			<view class="h5-glass-mesh"></view>
		</view>

		<view class="nav-bar">
			<view class="nav-back" @click="goBack">
				<text class="bi bi-chevron-left nav-back-ico"></text>
				<text class="nav-back-txt">返回</text>
			</view>
			<text class="nav-title">码牌绑定</text>
			<text class="nav-placeholder"></text>
		</view>

		<scroll-view class="scroll" scroll-y :show-scrollbar="false">
			<view class="content">
				<view class="card h5-glass-panel">
					<text class="label">已绑定码牌（{{ bindings.length }}）</text>
					<view v-if="bindings.length" class="bind-list">
						<view v-for="b in bindings" :key="b.deviceId" class="bind-item">
							<view class="bind-main">
								<text class="bind-device">{{ b.deviceId }}</text>
							</view>
							<text class="bind-meta">{{ b.brandName || '-' }} · {{ b.bindTimeText || '-' }}</text>
							<button class="btn-unbind" size="mini" type="warn" @click="unbindOne(b)">解绑</button>
						</view>
					</view>
					<text v-else class="hint">当前尚未绑定码牌</text>
					<text class="label mt">新机具号（码牌）</text>
					<input class="input" type="text" maxlength="80" placeholder="请输入机具号码" placeholder-class="ph" v-model="deviceInput" />
					<text class="hint">支持绑定多个码牌，绑定后流水按同一商户合并统计；解绑某个码牌不影响其他已绑定码牌。</text>
					<button class="btn-save" type="primary" :loading="saving" :disabled="saveDisabled" @click="save">新增绑定</button>
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
import { h5BindMachine, h5MachineBindingList, h5UnbindMachine, h5MachineBindLogList } from '@/pages/h5/common/api';

export default {
	data() {
		return {
			bindings: [],
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
			if (this.saving || !s) return true;
			return this.bindings.some((x) => String(x.deviceId || '').trim() === s);
		}
	},
	onShow() {
		this.loadBindings();
		this.resetLogs();
		this.loadLogs(true);
	},
	methods: {
		goBack() {
			uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/h5/mine/index' }) });
		},
		async loadBindings() {
			const res = await h5MachineBindingList();
			if (res.code !== 0) return;
			this.bindings = Array.isArray(res.data?.list) ? res.data.list : [];
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
				await this.loadBindings();
				this.deviceInput = '';
				this.resetLogs();
				await this.loadLogs(true);
			} finally {
				this.saving = false;
			}
		},
		async unbindOne(item) {
			const did = String(item?.deviceId || '').trim();
			if (!did) return;
			const ok = await new Promise((resolve) =>
				uni.showModal({
					title: '确认解绑',
					content: `确认解绑码牌 ${did} 吗？`,
					success: (r) => resolve(!!r.confirm)
				})
			);
			if (!ok) return;
			this.saving = true;
			try {
				const res = await h5UnbindMachine(did);
				if (res.code !== 0) {
					uni.showToast({ title: res.message || '解绑失败', icon: 'none' });
					return;
				}
				uni.showToast({ title: '解绑成功', icon: 'success' });
				await this.loadBindings();
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
	flex-shrink: 0;
}

.nav-title {
	color: #0f172a;
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
	color: #64748b;
	margin-bottom: 6px;
}

.label.mt {
	margin-top: 14px;
}

.input {
	height: 44px;
	padding: 0 12px;
	border-radius: 12px;
	background: #e2e8f0;
	border: 1px solid #e2e8f0;
	color: #0f172a;
	font-size: 15px;
}

.ph {
	color: #64748b;
}

.hint {
	display: block;
	margin-top: 10px;
	font-size: 11px;
	color: #64748b;
	line-height: 1.5;
}

.bind-list {
	margin-top: 8px;
}

.bind-item {
	padding: 10px 12px;
	border: 1px solid rgba(255, 255, 255, 0.72);
	border-radius: 10px;
	margin-bottom: 8px;
	background: rgba(255, 255, 255, 0.45);
	backdrop-filter: blur(12px) saturate(160%);
	-webkit-backdrop-filter: blur(12px) saturate(160%);
}

.bind-main {
	display: flex;
	align-items: center;
	gap: 8px;
}

.bind-device {
	font-size: 14px;
	font-weight: 700;
	color: #334155;
}

.bind-meta {
	display: block;
	margin-top: 4px;
	margin-bottom: 8px;
	font-size: 11px;
	color: #64748b;
}

.btn-unbind {
	border-radius: 999px;
}

.btn-save {
	margin-top: 16px;
	border-radius: 999px;
}

.section-title {
	font-size: 14px;
	font-weight: 700;
	color: #0f172a;
	margin: 8px 0 10px;
}

.empty {
	padding: 20px;
	text-align: center;
	color: #64748b;
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
	background: #dcfce7;
	color: #15803d;
}

.tag-unbind {
	background: #fee2e2;
	color: #b91c1c;
}

.log-time {
	font-size: 12px;
	color: #64748b;
}

.log-content {
	display: block;
	font-size: 13px;
	color: #475569;
	line-height: 1.45;
	word-break: break-all;
}

.log-reason {
	display: block;
	margin-top: 6px;
	font-size: 12px;
	color: #64748b;
}

.btn-more {
	margin-top: 8px;
	margin-bottom: 16px;
	background: #f1f5f9;
	border: 1px solid #e2e8f0;
	color: #334155;
	font-size: 13px;
	border-radius: 999px;
	border: none;
}
</style>
