<template>
	<view>
		<view class="form-item-card" :class="{ 'disabled': disabled, 'error': error }">
			<view class="form-item-inner">
				<view class="form-label-section" :class="{ 'required': required }">
					<text v-if="required" class="required-star">*</text>
					<text v-if="label" class="form-label">{{ label }}</text>
				</view>
				<view class="form-divider" v-if="label"></view>
				<view class="form-date-picker-section" @click="showPicker = true">
					<input
						:value="displayValue"
						:placeholder="placeholder"
						class="form-date-picker-input"
						readonly
						:disabled="disabled"
					/>
					<view class="form-date-picker-icon">📅</view>
				</view>
			</view>
			<view v-if="error" class="form-error">{{ error }}</view>
		</view>
		
		<!-- 日期选择器 - 移到外部，避免层级问题 -->
		<uni-datetime-picker
			v-if="showPicker"
			v-model="pickerValue"
			type="daterange"
			:start="startDate"
			:end="endDate"
			@change="handleDateChange"
			@close="showPicker = false"
			@clear="handleClear"
			:range="true"
			:disabled="disabled"
		>
			<view slot="shortcut" class="datetime-shortcut">
				<button @click="selectTimeRange('today')">今天</button>
				<button @click="selectTimeRange('yesterday')">昨天</button>
				<button @click="selectTimeRange('7days')">最近7天</button>
				<button @click="selectTimeRange('30days')">最近30天</button>
				<button @click="selectTimeRange('lastMonth')">上月</button>
			</view>
		</uni-datetime-picker>
	</view>
</template>

<script>
export default {
	name: 'FormDatePicker',
	props: {
		value: {
			type: String,
			default: ''
		},
		label: {
			type: String,
			default: ''
		},
		placeholder: {
			type: String,
			default: '选择日期范围'
		},
		disabled: {
			type: Boolean,
			default: false
		},
		required: {
			type: Boolean,
			default: false
		},
		error: {
			type: String,
			default: ''
		},
		startDate: {
			type: String,
			default: '2020-01-01'
		},
		endDate: {
			type: String,
			default: '2030-12-31'
		}
	},
	data() {
		return {
			showPicker: false,
			pickerValue: [],
			internalValue: ''
		};
	},
	computed: {
		displayValue() {
			return this.internalValue || this.value || '';
		}
	},
	watch: {
		value(newVal) {
			this.internalValue = newVal;
			this.parseValueToPicker(newVal);
		}
	},
	mounted() {
		this.internalValue = this.value;
		this.parseValueToPicker(this.value);
	},
	methods: {
		parseValueToPicker(val) {
			if (!val) {
				this.pickerValue = [];
				return;
			}
			const parts = val.split(' - ');
			if (parts.length === 2) {
				this.pickerValue = [new Date(parts[0]).getTime(), new Date(parts[1]).getTime()];
			}
		},
		
		handleDateChange(e) {
			let start, end;
			if (e.detail && e.detail.value) {
				[start, end] = e.detail.value;
			} else if (Array.isArray(e)) {
				[start, end] = e;
			}
			
			if (start && end) {
				const startStr = this.formatDate(new Date(start));
				const endStr = this.formatDate(new Date(end));
				const newValue = `${startStr} - ${endStr}`;
				this.internalValue = newValue;
				this.$emit('input', newValue);
				this.$emit('change', newValue, {
					start: new Date(start).getTime(),
					end: new Date(end).getTime()
				});
			}
			this.showPicker = false;
		},
		
		handleClear() {
			this.internalValue = '';
			this.pickerValue = [];
			this.$emit('input', '');
			this.$emit('change', '', {
				start: null,
				end: null
			});
			this.showPicker = false;
		},
		
		selectTimeRange(type) {
			const now = new Date();
			let startDate, endDate;
			
			switch (type) {
				case 'today':
					startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
					endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
					break;
				case 'yesterday':
					startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
					endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
					break;
				case '7days':
					startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
					startDate.setHours(0, 0, 0, 0);
					endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
					break;
				case '30days':
					startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
					startDate.setHours(0, 0, 0, 0);
					endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
					break;
				case 'lastMonth':
					startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
					endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
					break;
			}
			
			const startStr = this.formatDate(startDate);
			const endStr = this.formatDate(endDate);
			const newValue = `${startStr} - ${endStr}`;
			
			this.internalValue = newValue;
			this.pickerValue = [startDate.getTime(), endDate.getTime()];
			this.$emit('input', newValue);
			this.$emit('change', newValue, {
				start: startDate.getTime(),
				end: endDate.getTime()
			});
			this.showPicker = false;
		},
		
		formatDate(date) {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			const seconds = String(date.getSeconds()).padStart(2, '0');
			return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
		}
	}
};
</script>

<style scoped>
.form-item-card {
	margin-bottom: 16px;
	border-radius: 20px;
	background-color: #ffffff;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
	padding: 2px;
	transition: all 0.3s ease;
}

.form-item-card:not(.disabled):hover {
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
	transform: translateY(-2px);
}

.form-item-card.disabled {
	background-color: #f0f2f5;
	box-shadow: none;
}

.form-item-card.error {
	box-shadow: 0 4px 16px rgba(245, 108, 108, 0.2);
}

.form-item-inner {
	display: flex;
	align-items: center;
	background-color: #ffffff;
	border-radius: 18px;
	padding: 8px 16px;
}

.form-item-card.disabled .form-item-inner {
	background-color: #f0f2f5;
}

.form-label-section {
	display: flex;
	align-items: center;
	min-width: 80px;
	flex-shrink: 0;
}

.required-star {
	color: #f56c6c;
	font-size: 14px;
	margin-right: 2px;
	line-height: 1;
}

.form-label {
	font-size: 14px;
	color: #303133;
	font-weight: 400;
	line-height: 1.4;
}

.form-divider {
	width: 1px;
	height: 24px;
	background-color: #e4e7ed;
	margin: 0 12px;
	flex-shrink: 0;
}

.form-date-picker-section {
	flex: 1;
	display: flex;
	align-items: center;
	position: relative;
	cursor: pointer;
}

.form-date-picker-input {
	flex: 1;
	border: none;
	background: transparent;
	font-size: 14px;
	color: #606266;
	line-height: 1.5;
	padding: 6px 24px 6px 0;
	cursor: pointer;
}

.form-date-picker-input:focus {
	outline: none;
}

.form-date-picker-input:disabled {
	color: #c0c4cc;
	cursor: not-allowed;
}

.form-date-picker-input::placeholder {
	color: #c0c4cc;
}

.form-date-picker-icon {
	position: absolute;
	right: 0;
	top: 50%;
	transform: translateY(-50%);
	font-size: 14px;
	color: #909399;
	pointer-events: none;
	transition: all 0.3s ease;
}

.form-error {
	font-size: 12px;
	color: #f56c6c;
	margin-top: 4px;
	padding-left: 16px;
}

.datetime-shortcut {
	display: flex;
	flex-wrap: wrap;
	padding: 10px;
	background-color: #f5f7fa;
	border-bottom: 1px solid #ebeef5;
	border-radius: 8px 8px 0 0;
}

.datetime-shortcut button {
	margin: 5px;
	padding: 6px 12px;
	font-size: 12px;
	border: 1px solid #dcdfe6;
	border-radius: 4px;
	background-color: #ffffff;
	transition: all 0.3s ease;
}

.datetime-shortcut button:hover {
	border-color: #409eff;
	color: #409eff;
	transform: translateY(-1px);
	box-shadow: 0 2px 4px rgba(64, 158, 255, 0.2);
}

.datetime-shortcut button:active {
	transform: translateY(0);
}
</style>
