/**
 * Paywall was removed with the Billing router. `usePaywall` / `Paywall`
 * remain as pass-through stubs so existing gate-feature callsites compile
 * and simply run the callback without an upsell dialog. Kept as a stub
 * (rather than deleting every callsite) because a follow-up may bring back
 * a lightweight license/entitlement gate that would re-use this shape.
 */
import type { GatedFeature } from "./constants";

export function Paywall(): null {
	return null;
}

export function usePaywall(): {
	hasAccess: (feature: GatedFeature) => boolean;
	gateFeature: (
		feature: GatedFeature,
		callback: () => void | Promise<void>,
		context?: Record<string, unknown>,
	) => void;
	userPlan: "free" | "pro" | "team";
	isReady: boolean;
} {
	return {
		hasAccess: () => true,
		gateFeature: (_feature, callback) => {
			void callback();
		},
		userPlan: "team",
		isReady: true,
	};
}

export const paywall = (
	_feature: GatedFeature,
	_context?: Record<string, unknown>,
): void => {
	// no-op: paywall dialog removed
};
