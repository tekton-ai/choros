import { Button } from "@choros/ui/button";
import { Spinner } from "@choros/ui/spinner";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DndProvider } from "react-dnd";
import { Redirect } from "renderer/components/redirect";
import { env } from "renderer/env.renderer";
import { useDelayElapsed } from "renderer/hooks/use-delay-elapsed";
import { useOnlineStatus } from "renderer/hooks/use-online-status";
import { useSettingsExternalChangeListener } from "renderer/hooks/use-settings-external-change-listener";
import { useSignOut } from "renderer/hooks/use-sign-out";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { canEnterLocalProduct } from "renderer/lib/auth-state";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isOnboardingComplete } from "renderer/lib/onboarding-state";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { DaemonAutoUpdateFailureDialog } from "renderer/routes/_authenticated/components/daemon-auto-update-failure-dialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_authenticated/components/dashboard-new-workspace-modal";
import { DiffThemeSync } from "renderer/routes/_authenticated/components/diff-theme-sync";
import { StarNagObserver } from "renderer/routes/_authenticated/components/star-nag-observer";
import { useSettingsStore } from "renderer/stores/settings-state";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { AgentHooks } from "./components/agent-hooks";
import { DockBadgeController } from "./components/dock-badge-controller";
import { FileMenuListener } from "./components/file-menu-listener";
import { GlobalBrowserLifecycle } from "./components/global-browser-lifecycle";
import { TeardownLogsDialog } from "./components/teardown-logs-dialog";
import { V2NotificationController } from "./components/v2-notification-controller";
import { WindowTitle } from "./components/window-title";
import { createPierreWorker } from "./lib/pierre-worker";
import { CollectionsProvider } from "./providers/collections-provider";
import { HostWorkspacesProvider } from "./providers/host-workspaces-provider";
import { LocalHostServiceProvider } from "./providers/local-host-service-provider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

const signInRedirect = <Redirect to="/sign-in" replace />;
const onboardingRedirect = <Redirect to="/onboarding" replace />;

const SESSION_PENDING_TIMEOUT_MS = 15_000;

function AuthenticatedLayout() {
	const {
		data: session,
		isPending,
		isRefetching,
		refetch,
	} = authClient.useSession();
	const hasLocalToken = !!getAuthToken();
	const isOnline = useOnlineStatus();
	const navigate = useNavigate();
	const location = useLocation();
	const setOriginRoute = useSettingsStore((s) => s.setOriginRoute);

	const isSignedIn = canEnterLocalProduct({
		hasSession: !!session?.user,
		hasStoredToken: hasLocalToken,
		skipValidation: env.SKIP_ENV_VALIDATION,
	});
	const isAuthPending =
		isOnline &&
		(isPending || (isRefetching && !session?.user && hasLocalToken)) &&
		!env.SKIP_ENV_VALIDATION;
	const authPendingTimedOut = useDelayElapsed(
		isAuthPending,
		SESSION_PENDING_TIMEOUT_MS,
	);
	const signOut = useSignOut();
	const [isSigningOut, setIsSigningOut] = useState(false);

	useSettingsExternalChangeListener();

	// Seed the parked-terminal eviction cap from settings (SUPER-1545).
	const { data: parkedRuntimeCap } =
		electronTrpc.settings.getTerminalParkedRuntimeCap.useQuery();
	useEffect(() => {
		if (parkedRuntimeCap !== undefined) {
			terminalRuntimeRegistry.setParkedRuntimeCap(parkedRuntimeCap);
		}
	}, [parkedRuntimeCap]);

	// Update workspace-run pane state on terminal exit
	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE &&
				event.data
			) {
				localStorage.setItem("lastViewedWorkspaceId", event.data.workspaceId);
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: event.data.workspaceId },
				});
				return;
			}
		},
	});

	useEffect(() => {
		if (!location.pathname.startsWith("/settings")) {
			setOriginRoute(location.pathname);
		}
	}, [location.pathname, setOriginRoute]);

	// Menu navigation subscription
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "account";
				navigate({ to: `/settings/${section}` as "/settings/account" });
			}
		},
	});

	// Never redirect while the session is unresolved — a redirect held open
	// across re-renders loops the router until the renderer OOMs (#5729).
	if (isAuthPending) {
		return (
			<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<div className="drag absolute inset-x-0 top-0 h-12" />
				<Spinner className="size-8" />
				{authPendingTimedOut && (
					<>
						<div className="text-center select-text cursor-text">
							<h2 className="text-lg font-medium">
								Still restoring your session
							</h2>
							<p className="text-sm text-muted-foreground">
								Choros can't confirm your sign-in with the server.
							</p>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => refetch()}>
								Retry
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={isSigningOut}
								onClick={async () => {
									setIsSigningOut(true);
									try {
										await signOut();
									} finally {
										void navigate({ to: "/sign-in", replace: true });
									}
								}}
							>
								Sign out
							</Button>
						</div>
					</>
				)}
			</div>
		);
	}

	if (!isSignedIn) {
		return signInRedirect;
	}

	if (!isOnboardingComplete() && !location.pathname.startsWith("/onboarding")) {
		return onboardingRedirect;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<WindowTitle />
				<GlobalBrowserLifecycle />
				<LocalHostServiceProvider>
					<HostWorkspacesProvider>
						<WorkerPoolContextProvider
							poolOptions={{ workerFactory: createPierreWorker, poolSize: 8 }}
							highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
						>
							<DiffThemeSync />
							<AgentHooks />
							<FileMenuListener />
							<V2NotificationController />
							<DockBadgeController />
							<StarNagObserver />
							<DaemonAutoUpdateFailureDialog />
							<Outlet />
							<DashboardNewWorkspaceModal />
							<TeardownLogsDialog />
						</WorkerPoolContextProvider>
					</HostWorkspacesProvider>
				</LocalHostServiceProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
