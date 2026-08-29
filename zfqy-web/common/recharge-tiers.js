/**
 * 充值档位：完全由额度包配置（membership_name / giftChoiceRequired）驱动，不按价格写死。
 */

export function membershipMetaFromName(name) {
	const n = String(name || '').trim();
	if (n.includes('钻石')) {
		return { tier: 'diamond', defaultName: '钻石会员', descClass: 'pkg-desc--diamond' };
	}
	if (n.includes('铂金')) {
		return { tier: 'platinum', defaultName: '铂金会员', descClass: 'pkg-desc--platinum' };
	}
	if (n.includes('黄金')) {
		return { tier: 'gold', defaultName: '黄金会员', descClass: 'pkg-desc--gold' };
	}
	if (n.includes('白金')) {
		return { tier: 'white_gold', defaultName: '白金会员', descClass: 'pkg-desc--white-gold' };
	}
	if (n.includes('白银')) {
		return { tier: 'silver', defaultName: '白银会员', descClass: 'pkg-desc--default' };
	}
	return { tier: 'normal', defaultName: n || '会员', descClass: 'pkg-desc--default' };
}

export function packageMembershipName(pkg) {
	return String((pkg && (pkg.membershipName || pkg.membership_name)) || '').trim();
}

/** 是否需选赠品：仅看额度包配置（关联商品 / 必选·可选数量），不按会员名称或价格 */
export function packageRequiresGiftChoice(pkg) {
	if (!pkg) return false;
	if (pkg.giftChoiceRequired === true) return true;
	const pickRequired = Number(pkg.pickRequired != null ? pkg.pickRequired : pkg.pick_required || 0);
	const pickTotal = Number(pkg.pickTotal != null ? pkg.pickTotal : pkg.pick_total || 0);
	const related = Array.isArray(pkg.relatedProductIds)
		? pkg.relatedProductIds
		: Array.isArray(pkg.related_product_ids)
			? pkg.related_product_ids
			: Array.isArray(pkg.relatedProducts)
				? pkg.relatedProducts
				: [];
	return pickRequired > 0 || (pickTotal > 0 && related.length > 0) || related.length > 0;
}

export function resolveTierByPackage(pkg) {
	const name = packageMembershipName(pkg);
	const meta = membershipMetaFromName(name);
	return { tier: meta.tier, name: name || meta.defaultName };
}

export function packageDescTierClass(pkg) {
	const name = packageMembershipName(pkg);
	if (name) return membershipMetaFromName(name).descClass;
	return 'pkg-desc--default';
}

/** @deprecated 保留导出避免旧引用报错；请改用 membershipMetaFromName / packageRequiresGiftChoice */
export const DIAMOND_RECHARGE_PRICE = null;
export function isDiamondRechargePrice() {
	return false;
}
export function isRechargeGiftPrice() {
	return false;
}
