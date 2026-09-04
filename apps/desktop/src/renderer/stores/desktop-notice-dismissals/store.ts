import { createDismissalsStore } from "renderer/stores/create-dismissals-store";

export const useDesktopNoticeDismissalsStore = createDismissalsStore(
	"desktop-notice-dismissals-v1",
	"DesktopNoticeDismissals",
);
