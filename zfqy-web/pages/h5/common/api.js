import pako from 'pako';
import { getSession } from './session';

function b64ToU8(b64) {
	const binary = atob(b64);
	const len = binary.length;
	const u8 = new Uint8Array(len);
	for (let i = 0; i < len; i += 1) u8[i] = binary.charCodeAt(i);
	return u8;
}

function unpackH5CompressedResult(r) {
	if (!r || r._cmp !== 1 || !r._b) return r;
	try {
		const text = pako.ungzip(b64ToU8(r._b), { to: 'string' });
		return JSON.parse(text);
	} catch (e) {
		console.error('H5 响应解压失败', e);
		return { code: 500, message: '数据解析失败' };
	}
}

function merchantCall(action, params = {}) {
	return uniCloud
		.callFunction({
			name: 'merchant',
			data: {
				action,
				params
			}
		})
		.then((r) => unpackH5CompressedResult(r.result || {}));
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

const H5_CACHE_TTL_MS = 5 * 60 * 1000;
const H5_CACHE_PREFIX = 'h5_cache_v1';

function cacheKey(name) {
	const s = getSession() || {};
	const uid = String(s.userId || s.merchantId || 'anon');
	return `${H5_CACHE_PREFIX}:${name}:${uid}`;
}

function getCached(name, maxAgeMs = H5_CACHE_TTL_MS) {
	try {
		const raw = uni.getStorageSync(cacheKey(name));
		if (!raw || typeof raw !== 'object') return null;
		const ts = Number(raw.ts || 0);
		if (!ts || Date.now() - ts > maxAgeMs) return null;
		return raw.value || null;
	} catch (e) {
		return null;
	}
}

function setCached(name, value) {
	try {
		uni.setStorageSync(cacheKey(name), { ts: Date.now(), value });
	} catch (e) {}
}

function removeCached(name) {
	try {
		uni.removeStorageSync(cacheKey(name));
	} catch (e) {}
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

export function h5SetMobileDirect(payload) {
	return merchantCall('h5SetMobileDirect', merchantIdentity(payload));
}

export function h5BindMachine(payload) {
	return merchantCall('h5BindMachine', merchantIdentity(payload));
}

export function h5MachineBindingList(payload) {
	return merchantCall('h5MachineBindingList', merchantIdentity(payload));
}

export function h5UnbindMachine(deviceId) {
	return merchantCall('h5UnbindMachine', merchantIdentity({ deviceId }));
}

export function h5MachineBindLogList(payload) {
	return merchantCall('h5MachineBindLogList', merchantIdentity(payload));
}

export function h5FinanceRecords(payload) {
	return merchantCall('h5FinanceRecords', merchantIdentity(payload));
}

export function h5MineInfo() {
	return merchantCall('h5MineInfo', Object.assign(merchantIdentity(), { cmp: 1 }));
}

export async function h5MineInfoCached(options = {}) {
	const maxAgeMs = Number(options.maxAgeMs || H5_CACHE_TTL_MS);
	const force = !!options.force;
	if (!force) {
		const hit = getCached('mine_info', maxAgeMs);
		if (hit) return hit;
	}
	const res = await h5MineInfo();
	if (res && res.code === 0) setCached('mine_info', res);
	return res;
}

export function h5WithdrawInfo() {
	return merchantCall('h5WithdrawInfo', merchantIdentity());
}

export function h5WithdrawApply(payload) {
	return merchantCall('h5WithdrawApply', merchantIdentity(payload));
}

export function h5WithdrawConfirmPackage(withdrawNo) {
	return merchantCall('h5WithdrawConfirmPackage', merchantIdentity({ withdrawNo }));
}

export function h5HomeDashboard() {
	return merchantCall('h5HomeDashboard', Object.assign(merchantIdentity(), { cmp: 1 }));
}

export async function h5HomeDashboardCached(options = {}) {
	const maxAgeMs = Number(options.maxAgeMs || H5_CACHE_TTL_MS);
	const force = !!options.force;
	if (!force) {
		const hit = getCached('home_dashboard', maxAgeMs);
		if (hit) return hit;
	}
	const res = await h5HomeDashboard();
	if (res && res.code === 0) setCached('home_dashboard', res);
	return res;
}

export function h5InvalidateHomeCache() {
	removeCached('home_dashboard');
	removeCached('mine_info');
}

export async function h5RefreshHomeCache() {
	h5InvalidateHomeCache();
	const [dashboard, mine] = await Promise.allSettled([
		h5HomeDashboardCached({ force: true }),
		h5MineInfoCached({ force: true })
	]);
	return { dashboard, mine };
}

/** 协议签署：客户端设备指纹（持久）+ 机型摘要，供云端写入 agreement_sign_device */
export function collectAgreementSignClientMeta() {
	try {
		const si = uni.getSystemInfoSync();
		const key = 'h5_agreement_device_fp_v1';
		let fp = '';
		try {
			fp = uni.getStorageSync(key) || '';
		} catch (e) {}
		if (!fp || typeof fp !== 'string') {
			fp = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
			try {
				uni.setStorageSync(key, fp);
			} catch (e) {}
		}
		const detail = [
			si.uniPlatform || si.platform,
			si.model || si.deviceModel || '',
			si.system || '',
			si.brand || ''
		]
			.filter(Boolean)
			.join(' | ')
			.slice(0, 240);
		return {
			agreementDeviceFingerprint: String(fp).slice(0, 64),
			agreementDeviceDetail: detail
		};
	} catch (e) {
		return { agreementDeviceFingerprint: '', agreementDeviceDetail: '' };
	}
}

export function h5SignAgreement(payload) {
	const meta = collectAgreementSignClientMeta();
	return merchantCall('h5SignAgreement', merchantIdentity(Object.assign({}, meta, payload)));
}

export function h5IncomeList() {
	return merchantCall('h5IncomeList', merchantIdentity());
}

export function h5PendingReturnPoints() {
	return merchantCall('h5PendingReturnPoints', merchantIdentity());
}

export function h5CouponMyList() {
	return merchantCall('h5CouponMyList', merchantIdentity());
}

export function h5ExchangeCouponRedeem(code) {
	const p = typeof code === 'string' ? { code } : (code || {});
	return merchantCall('h5ExchangeCouponRedeem', merchantIdentity(p));
}

export function h5RechargeOptions() {
	return merchantCall('h5RechargeOptions', merchantIdentity());
}

export function h5RechargeCreate(payload) {
	const p = typeof payload === 'string' ? { packageId: payload } : payload || {};
	return merchantCall('h5RechargeCreate', merchantIdentity(p));
}

export function h5RechargeConfirm(orderNo) {
	return merchantCall('h5RechargeConfirm', merchantIdentity({ orderNo }));
}

export function h5RefundReset(reason) {
	const p = typeof reason === 'string' ? { reason } : (reason || {});
	return merchantCall('h5RefundReset', merchantIdentity(p));
}

export function h5RefundEntryValidate(payload) {
	return merchantCall('h5RefundEntryValidate', merchantIdentity(payload || {}));
}

/** H5 退款：待用户在微信内确认收款时，拉取 requestMerchantTransfer 所需 package */
export function h5RefundConfirmPackage(payload) {
	return merchantCall('h5RefundConfirmPackage', merchantIdentity(payload || {}));
}

export function h5TransferStatus(outBillNo) {
	return merchantCall('h5TransferStatus', merchantIdentity({ outBillNo }));
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

export function h5FeedbackSummary() {
	return merchantCall('h5FeedbackSummary', merchantIdentity());
}

export function h5FeedbackGetOpen() {
	return merchantCall('h5FeedbackGetOpen', merchantIdentity());
}

export function h5FeedbackSend(payload) {
	return merchantCall('h5FeedbackSend', merchantIdentity(payload));
}

export function h5FeedbackClose() {
	return merchantCall('h5FeedbackClose', merchantIdentity());
}

