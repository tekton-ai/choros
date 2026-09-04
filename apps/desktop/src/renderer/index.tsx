import { initSentry } from "./lib/sentry";

initSentry();

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/boot-error-boundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { sweepDeadPersistedKeys } from "./lib/persisted-keys";
import { persistentHistory } from "./lib/persistent-hash-history";
import { pruneExpiredTerminalState } from "./lib/terminal/terminal-buffer-gc";
import { electronQueryClient } from "./providers/electron-trpc-provider";
import { routeTree } from "./route-tree.gen";
import { NotFound } from "./routes/not-found";

import "./globals.css";
import "./styles/bundled-fonts.css";

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

// Before any terminal mounts: unbounded persisted scrollback wedged the
// renderer once it grew to hundreds of orphaned buffers (23.7 MB observed).
pruneExpiredTerminalState();
// Keys from removed features otherwise live on user profiles forever.
sweepDeadPersistedKeys();

const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	defaultNotFoundComponent: NotFound,
	context: {
		queryClient: electronQueryClient,
	},
});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};
const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
if (ipcRenderer) {
	ipcRenderer.on("deep-link-navigate", handleDeepLink);
} else {
	reportBootError(
		"Renderer preload not available (window.ipcRenderer missing)",
	);
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		if (ipcRenderer) {
			ipcRenderer.off("deep-link-navigate", handleDeepLink);
		}
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<RouterProvider router={router} />
		</BootErrorBoundary>,
	);
	markBootMounted();
}
