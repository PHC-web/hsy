<template>
	<view class="form-item-card" :class="{ 'disabled': disabled, 'error': error }">
		<view class="form-item-inner">
			<view class="form-label-section" :class="{ 'required': required }">
				<text v-if="required" class="required-star">*</text>
				<text v-if="label" class="form-label">{{ label }}</text>
			</view>
			<view class="form-divider" v-if="label"></view>
			<view class="form-input-section">
				<input
					:type="type"
					:value="value"
					:placeholder="placeholder"
					:maxlength="maxlength"
					:disabled="disabled"
					:readonly="readonly"
					@input="handleInput"
					@focus="handleFocus"
					@blur="handleBlur"
					class="form-input"
				/>
				<view v-if="maxlength" class="form-hint">{{ value ? value.length : 0 }}/{{ maxlength }}</view>
			</view>
		</view>
		<view v-if="error" class="form-error">{{ error }}</view>
	</view>
</template>

<script>
export default {
	name: 'FormInput',
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
			default: ''
		},
		type: {
			type: String,
			default: 'text',
			validator: (value) => ['text', 'number', 'password', 'email', 'tel'].includes(value)
		},
		maxlength: {
			type: [String, Number],
			default: 0
		},
		disabled: {
			type: Boolean,
			default: false
		},
		readonly: {
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
	methods: {
		handleInput(e) {
			this.$emit('input', e.target.value);
			this.$emit('change', e.target.value);
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

.form-input-section {
	flex: 1;
	display: flex;
	align-items: center;
	position: relative;
}

.form-input {
	flex: 1;
	border: none;
	background: transparent;
	font-size: 14px;
	color: #606266;
	line-height: 1.5;
	padding: 6px 0;
}

.form-input:focus {
	outline: none;
}

.form-input:disabled {
	color: #c0c4cc;
}

.form-input::placeholder {
	color: #c0c4cc;
}

.form-hint {
	font-size: 12px;
	color: #909399;
	margin-left: 8px;
	flex-shrink: 0;
}

.form-error {
	font-size: 12px;
	color: #f56c6c;
	margin-top: 4px;
	padding-left: 16px;
}
</style>
