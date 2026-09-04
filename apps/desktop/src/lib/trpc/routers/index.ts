import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserHistoryRouter } from "./browser-history";
import { createDeviceRouter } from "./device";
import { createDownloadsRouter } from "./downloads";
import { createExternalRouter } from "./external";
import { createGithubStarRouter } from "./github-star";
import { createHostServiceCoordinatorRouter } from "./host-service-coordinator";
import { createKeyboardLayoutRouter } from "./keyboard-layout";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPermissionsRouter } from "./permissions";
import { createPluginsRouter } from "./plugins";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createScreenshotsRouter } from "./screenshots";
import { createSettingsRouter } from "./settings";
import { createSystemRouter } from "./system";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		downloads: createDownloadsRouter(),
		screenshots: createScreenshotsRouter(),
		auth: createAuthRouter(),
		autoUpdate: createAutoUpdateRouter(),
		window: createWindowRouter(),
		terminal: createTerminalRouter(),
		notifications: createNotificationsRouter(getWindow),
		permissions: createPermissionsRouter(),
		plugins: createPluginsRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		githubStar: createGithubStarRouter(),
		settings: createSettingsRouter(),
		system: createSystemRouter(),
		device: createDeviceRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(getWindow),
		hostServiceCoordinator: createHostServiceCoordinatorRouter(),
		keyboardLayout: createKeyboardLayoutRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
