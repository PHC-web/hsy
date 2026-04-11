import { getSession } from './session';

function merchantCall(action, params = {}) {
	return uniCloud.callFunction({
		name: 'merchant',
		data: {
			action,
			params
		}
	}).then((r) => r.result || {});
}

function merchantIdentity(extra = {}) {
	const session = getSession();
	return Object.assign(
		{
			merchantId: session.merchantId || '',
			userId: session.userId || ''
		},
		extra
	);
}

export function h5AuthSync(payload) {
	return merchantCall('h5AuthSync', payload);
}

export function h5WechatLogin(payload) {
	return merchantCall('h5WechatLogin', payload);
}

export function h5SendBindMobileCode(payload) {
	return merchantCall('h5SendBindMobileCode', merchantIdentity(payload));
}

export function h5BindMobileVerify(payload) {
	return merchantCall('h5BindMobileVerify', merchantIdentity(payload));
}

export function h5BindMachine(payload) {
	return merchantCall('h5BindMachine', merchantIdentity(payload));
}

export function h5MineInfo() {
	return merchantCall('h5MineInfo', merchantIdentity());
}

export function h5HomeDashboard() {
	return merchantCall('h5HomeDashboard', merchantIdentity());
}

export function h5SignAgreement(payload) {
	return merchantCall('h5SignAgreement', merchantIdentity(payload));
}

export function h5IncomeList() {
	return merchantCall('h5IncomeList', merchantIdentity());
}

export function h5RechargeOptions() {
	return merchantCall('h5RechargeOptions', merchantIdentity());
}

export function h5RechargeCreate(packageId) {
	return merchantCall('h5RechargeCreate', merchantIdentity({ packageId }));
}

export function h5RechargeConfirm(orderNo) {
	return merchantCall('h5RechargeConfirm', merchantIdentity({ orderNo }));
}

export function h5RefundReset(reason) {
	return merchantCall('h5RefundReset', merchantIdentity({ reason }));
}

export function h5IncomeClaim(packetId) {
	return merchantCall('h5IncomeClaim', merchantIdentity({ packetId }));
}

export function h5IncomeClaimAll() {
	return merchantCall('h5IncomeClaimAll', merchantIdentity());
}

export function h5Unbind(reason) {
	return merchantCall('h5Unbind', merchantIdentity({ reason }));
}

