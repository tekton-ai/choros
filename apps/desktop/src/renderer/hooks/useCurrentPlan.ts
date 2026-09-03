import type { PlanTier } from "@choros/shared/billing";

/**
 * Billing was removed; there is no live plan to read. Callers still expect
 * the shape (plan tier + readiness) so this stub keeps them compiling and
 * treats every session as fully entitled. `resolveCurrentPlan` and
 * `isPaidPlanTier` stay because they're pure helpers over data callers
 * still pass around (session plan strings).
 */
interface ResolveCurrentPlanArgs {
	subscriptionPlan?: string | null;
	sessionPlan?: string | null;
	subscriptionsLoaded: boolean;
}

export function isPaidPlanTier(
	plan: string | null | undefined,
): plan is "pro" | "enterprise" {
	return plan === "pro" || plan === "enterprise";
}

export function resolveCurrentPlan({
	subscriptionPlan,
	sessionPlan,
	subscriptionsLoaded,
}: ResolveCurrentPlanArgs): PlanTier {
	if (isPaidPlanTier(subscriptionPlan)) {
		return subscriptionPlan;
	}
	if (subscriptionsLoaded) {
		return "free";
	}
	if (isPaidPlanTier(sessionPlan)) {
		return sessionPlan;
	}
	return "free";
}

export function useCurrentPlan(): { plan: PlanTier; isReady: boolean } {
	return { plan: "pro", isReady: true };
}
