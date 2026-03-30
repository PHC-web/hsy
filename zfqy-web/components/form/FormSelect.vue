<template>
	<view class="form-item-card" :class="{ 'disabled': disabled, 'error': error }">
		<view class="form-item-inner">
			<view class="form-label-section" :class="{ 'required': required }">
				<text v-if="required" class="required-star">*</text>
				<text v-if="label" class="form-label">{{ label }}</text>
			</view>
			<view class="form-divider" v-if="label"></view>
			<view class="form-select-section">
				<select
					:value="stringValue"
					:disabled="disabled"
					@change="handleChange"
					@focus="handleFocus"
					@blur="handleBlur"
					class="form-select"
				>
					<option v-for="(opt, idx) in renderedOptions" :key="`${idx}-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
				</select>
				<view class="form-select-arrow">▼</view>
			</view>
		</view>
		<view v-if="error" class="form-error">{{ error }}</view>
	</view>
</template>

<script>
export default {
	name: 'FormSelect',
	props: {
		value: {
			type: [String, Number],
			default: ''
		},
		label: {
			type: String,
			default: ''
		},
		placeholder: {
			type: String,
			default: '选择'
		},
		options: {
			type: Array,
			default() {
				return [];
			}
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
		}
	},
	computed: {
		stringValue() {
			return this.value === null || this.value === undefined ? '' : String(this.value);
		},
		placeholderText() {
			return this.placeholder || '选择';
		},
		renderedOptions() {
			if (Array.isArray(this.options) && this.options.length > 0) {
				return this.options.map(opt => ({
					value: opt && opt.value !== undefined && opt.value !== null ? String(opt.value) : '',
					label: opt && opt.label !== undefined && opt.label !== null ? String(opt.label) : ''
				}));
			}
			const nodes = this.$slots.default || [];
			const result = [];
			const walk = (list) => {
				(list || []).forEach(node => {
					if (!node) return;
					if (node.tag === 'option') {
						const attrs = (node.data && node.data.attrs) || {};
						const val = attrs.value === undefined || attrs.value === null ? '' : String(attrs.value);
						const label = ((node.children || []).map(c => c.text || '').join('')).trim();
						result.push({ value: val, label: label || val || this.placeholderText });
						return;
					}
					if (node.children && node.children.length) {
						walk(node.children);
					}
				});
			};
			walk(nodes);
			return result;
		},
	},
	methods: {
		handleChange(e) {
			// 最稳：用原生 select 的 selectedIndex 映射到 options（避免各端 value/detail 不一致）
			const el = (e && e.target) || (e && e.currentTarget);
			let next = '';
			if (el && typeof el.selectedIndex === 'number' && el.selectedIndex >= 0) {
				const opt = this.renderedOptions[el.selectedIndex];
				next = opt ? String(opt.value) : '';
			} else {
				const targetVal = el ? el.value : undefined;
				let raw;
				if (targetVal !== undefined && targetVal !== null) {
					raw = targetVal;
				} else if (e && e.detail && e.detail.value !== undefined) {
					const detailVal = e.detail.value;
					if (/^\d+$/.test(String(detailVal))) {
						const idx = Number(detailVal);
						raw = this.renderedOptions[idx] ? this.renderedOptions[idx].value : detailVal;
					} else {
						raw = detailVal;
					}
				} else {
					raw = '';
				}
				next = raw === undefined || raw === null ? '' : String(raw);
			}
			this.$emit('input', next);
			this.$emit('change', next);
		},
		handleFocus(e) {
			this.$emit('focus', e);
		},
		handleBlur(e) {
			this.$emit('blur', e);
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

.form-select-section {
	flex: 1;
	display: flex;
	align-items: center;
	position: relative;
}

.form-select {
	flex: 1;
	border: none;
	background: transparent;
	font-size: 14px;
	color: #606266;
	line-height: 1.5;
	padding: 6px 24px 6px 0;
	appearance: none;
	-webkit-appearance: none;
	-moz-appearance: none;
	cursor: pointer;
}

.form-select:focus {
	outline: none;
}

.form-select:disabled {
	color: #c0c4cc;
	cursor: not-allowed;
}

.form-select-arrow {
	position: absolute;
	right: 0;
	top: 50%;
	transform: translateY(-50%);
	font-size: 12px;
	color: #909399;
	pointer-events: none;
	transition: all 0.3s ease;
}

.form-select:focus + .form-select-arrow {
	color: #409eff;
	transform: translateY(-50%) rotate(180deg);
}

.form-select-section.disabled .form-select-arrow {
	color: #c0c4cc;
}

.form-error {
	font-size: 12px;
	color: #f56c6c;
	margin-top: 4px;
	padding-left: 16px;
}
</style>
