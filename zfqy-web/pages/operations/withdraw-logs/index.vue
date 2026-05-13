<template>
	<ops-finance-flow-page flow-type="withdraw" />
</template>

<script>
import OpsFinanceFlowPage from '../components/OpsFinanceFlowPage.vue';

export default {
	components: { OpsFinanceFlowPage },
	onReady() {
		uni.setNavigationBarTitle({ title: '提现日志' });
	}
};
</script>
