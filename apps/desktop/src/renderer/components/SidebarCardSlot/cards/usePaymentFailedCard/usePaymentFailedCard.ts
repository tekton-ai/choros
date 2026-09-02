import type { SidebarCardEntry } from "../../types";

/**
 * Billing was removed; there is no failed-payment state to surface. This
 * stub returns null so the sidebar card slot renders nothing without
 * changing every mount site.
 */
export function usePaymentFailedCard(_args: {
	surface: "v1" | "v2";
}): SidebarCardEntry | null {
	return null;
}
