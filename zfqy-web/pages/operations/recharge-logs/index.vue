<template>
	<ops-finance-flow-page flow-type="recharge" />
</template>

<script>
import OpsFinanceFlowPage from '../components/OpsFinanceFlowPage.vue';

export default {
	components: { OpsFinanceFlowPage },
	onReady() {
		uni.setNavigationBarTitle({ title: '充值日志' });
	}
};
</script>
