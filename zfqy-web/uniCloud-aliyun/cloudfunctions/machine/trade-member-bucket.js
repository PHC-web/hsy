'use strict';

/**
 * machine 云函数包内副本：线上仅打包本目录，无法 require 上级 common。
 * 与 cloudfunctions/common/trade-member-bucket.js 保持同步。
 */

function isRechargeMemberForTradeBucket(merchant) {
	if (!merchant) return false;
	const tier = String(merchant.member_tier || merchant.membership_tier || merchant.h5_member_tier || '').toLowerCase();
	if (tier === 'diamond' || tier === 'platinum' || tier === 'white_gold' || tier === 'gold') return true;
	const name = String(merchant.membership_name || '').trim();
	if (name.includes('钻石') || name.includes('铂金') || name.includes('白金')) return true;
	if (Number(merchant.recharge_total_yuan || 0) > 0) return true;
	const price = Number(merchant.recharge_package_price || 0);
	if (Number.isFinite(price) && price >= 600) return true;
	const pkgId = String(merchant.recharge_package_id || '').trim();
	if (pkgId && pkgId !== 'pkg_0_1' && !pkgId.startsWith('pkg_0_')) return true;
	return false;
}

function tradeMemberBucketForMerchant(merchant) {
	return isRechargeMemberForTradeBucket(merchant) ? 'member' : 'non_member';
}

module.exports = {
	isRechargeMemberForTradeBucket,
	tradeMemberBucketForMerchant
};
