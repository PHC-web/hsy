<template>
	<ops-finance-flow-page flow-type="refund" />
</template>

<script>
import OpsFinanceFlowPage from '../components/OpsFinanceFlowPage.vue';

export default {
	components: { OpsFinanceFlowPage },
	onReady() {
		uni.setNavigationBarTitle({ title: '退款日志' });
	}
};
</script>
