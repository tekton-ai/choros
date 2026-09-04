import { createDismissalsStore } from "renderer/stores/create-dismissals-store";

/** Dismissals for the v2 setup-script card, keyed by v2 projectId. */
export const useV2SetupCardDismissalsStore = createDismissalsStore(
	"v2-setup-card-dismissals-v1",
	"V2SetupCardDismissals",
);
