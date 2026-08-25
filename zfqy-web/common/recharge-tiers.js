/** 充值会员档位价格（元） */
export const GOLD_RECHARGE_PRICE = 600;
export const PLATINUM_RECHARGE_PRICE = 800;
export const DIAMOND_RECHARGE_PRICE = 998;

export function isDiamondRechargePrice(price) {
	const p = Number(price || 0);
	return p >= DIAMOND_RECHARGE_PRICE || p === 0.2;
}

export function isRechargeGiftPrice(price) {
	return Number(Number(price || 0).toFixed(2)) === DIAMOND_RECHARGE_PRICE;
}
