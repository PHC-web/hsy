<template>
	<view class="sign-wrap" :class="{ 'sign-wrap--disabled': disabled }">
		<canvas
			canvas-id="signCanvas"
			id="signCanvas"
			class="sign-canvas"
			@touchstart="onStart"
			@touchmove="onMove"
			@touchend="onEnd"
		/>
		<view class="sign-actions">
			<button class="sign-btn" type="default" size="mini" :disabled="disabled" @click="clearPad">重签</button>
			<button
				class="sign-btn"
				type="primary"
				size="mini"
				:disabled="disabled || submitting"
				:loading="submitting"
				@click="submitPad"
			>
				确认签名
			</button>
		</view>
		<text v-if="disabled && disabledTip" class="sign-disabled-tip">{{ disabledTip }}</text>
	</view>
</template>

<script>
export default {
	name: 'SignaturePad',
	props: {
		disabled: { type: Boolean, default: false },
		disabledTip: { type: String, default: '' }
	},
	data() {
		return {
			ctx: null,
			lastPoint: null,
			isEmpty: true,
			submitting: false
		};
	},
	mounted() {
		this.ctx = uni.createCanvasContext('signCanvas', this);
		this.ctx.setLineWidth(2.4);
		this.ctx.setStrokeStyle('#1f2937');
		this.ctx.setLineCap('round');
		this.ctx.setLineJoin('round');
		this.ctx.draw();
	},
	methods: {
		pointFromTouch(e) {
			const t = (e.changedTouches && e.changedTouches[0]) || {};
			return { x: Number(t.x || 0), y: Number(t.y || 0) };
		},
		onStart(e) {
			if (this.disabled) return;
			this.lastPoint = this.pointFromTouch(e);
		},
		onMove(e) {
			if (this.disabled || !this.lastPoint) return;
			const p = this.pointFromTouch(e);
			this.ctx.beginPath();
			this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
			this.ctx.lineTo(p.x, p.y);
			this.ctx.stroke();
			this.ctx.draw(true);
			this.lastPoint = p;
			this.isEmpty = false;
		},
		onEnd() {
			this.lastPoint = null;
		},
		clearPad() {
			if (this.disabled) return;
			this.ctx.clearRect(0, 0, 9999, 9999);
			this.ctx.draw();
			this.isEmpty = true;
		},
		submitPad() {
			if (this.disabled) {
				uni.showToast({ title: this.disabledTip || '请稍候，协议准备中', icon: 'none' });
				return;
			}
			if (this.isEmpty) {
				uni.showToast({ title: '请先签名', icon: 'none' });
				return;
			}
			this.submitting = true;
			// #ifdef H5
			try {
				const dom = document.getElementById('signCanvas');
				if (dom && typeof dom.toDataURL === 'function') {
					const dataUrl = dom.toDataURL('image/png');
					this.$emit('signed', { dataUrl });
					this.submitting = false;
					return;
				}
			} catch (e) {}
			// #endif
			uni.canvasToTempFilePath(
				{
					canvasId: 'signCanvas',
					success: (res) => {
						this.$emit('signed', { tempFilePath: res.tempFilePath });
					},
					fail: () => {
						uni.showToast({ title: '签名生成失败', icon: 'none' });
					},
					complete: () => {
						this.submitting = false;
					}
				},
				this
			);
		}
	}
};
</script>

<style scoped>
.sign-wrap {
	width: 100%;
}
.sign-wrap--disabled .sign-canvas {
	opacity: 0.55;
}
.sign-canvas {
	width: 100%;
	height: 180px;
	border: 1px dashed #d1d5db;
	border-radius: 8px;
	background: #fff;
}
.sign-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
	margin-top: 10px;
	width: 100%;
	box-sizing: border-box;
}
.sign-btn {
	margin: 0;
	width: 100%;
	box-sizing: border-box;
	max-width: 100%;
}
.sign-disabled-tip {
	display: block;
	margin-top: 8px;
	font-size: 12px;
	color: #64748b;
	line-height: 1.4;
}
</style>
