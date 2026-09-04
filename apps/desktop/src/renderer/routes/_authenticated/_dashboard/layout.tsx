import {
	CatchBoundary,
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CommandPaletteHost } from "renderer/command-palette";
import { useQuickCreateWorkspace } from "renderer/hooks/use-quick-create-workspace";
import { useHotkey } from "renderer/hotkeys";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar";
import { DashboardSidebarPortsProvider } from "renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/providers/dashboard-sidebar-ports-provider";
import { useDevSeedV2Sidebar } from "renderer/routes/_authenticated/hooks/use-dev-seed-v2-sidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { ResizablePanel } from "renderer/screens/main/components/resizable-panel";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/sync-persisted-store-across-windows";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/add-repository-modals";
import { DashboardContentError } from "./components/dashboard-content-error";
import { TopBar } from "./components/top-bar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

/** v1 only — v2 deletes go through the globally-mounted DeleteWorkspaceMount
 * (see delete-workspace-intent store). */

function DashboardLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const portsDisplayMode = usePortsDisplayMode();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const quickCreateWorkspace = useQuickCreateWorkspace();
	useDevSeedV2Sidebar();
	useEffect(() => {
		const stopWorkspaceSidebarSync = syncPersistedStoreAcrossWindows(
			useWorkspaceSidebarStore,
		);
		const stopSectionCollapseSync = syncPersistedStoreAcrossWindows(
			useSidebarSectionsCollapseStore,
		);
		const stopAgentStateSync = syncPersistedStoreAcrossWindows(
			useV2NotificationStore,
		);

		return () => {
			stopWorkspaceSidebarSync();
			stopSectionCollapseSync();
			stopAgentStateSync();
		};
	}, []);
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentV2WorkspaceId =
		v2WorkspaceMatch !== false ? v2WorkspaceMatch.workspaceId : null;
	const onV2WorkspaceRoute = v2WorkspaceMatch !== false;
	const onNewWorkspaceRoute = matchRoute({ to: "/new-workspace" }) !== false;
	const onDashboardViewRoute =
		matchRoute({ to: "/pull-requests", fuzzy: true }) !== false ||
		matchRoute({ to: "/plugins", fuzzy: true }) !== false ||
		matchRoute({ to: "/v2-workspaces", fuzzy: true }) !== false;

	const currentV2Workspace = useMemo(
		() =>
			currentV2WorkspaceId != null
				? (hostWorkspaces.find(
						(workspace) => workspace.id === currentV2WorkspaceId,
					) ?? null)
				: null,
		[hostWorkspaces, currentV2WorkspaceId],
	);

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }));
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
		if (!isWorkspaceSidebarOpen) {
			setWorkspaceSidebarOpen(true);
		} else {
			toggleWorkspaceSidebarCollapsed();
		}
	});
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspaceModal(currentV2Workspace?.projectId ?? undefined),
	);
	useHotkey("QUICK_CREATE_WORKSPACE", () =>
		quickCreateWorkspace(currentV2Workspace?.projectId ?? null),
	);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (
				currentV2WorkspaceId &&
				currentV2Workspace &&
				currentV2Workspace.type !== "main"
			) {
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: currentV2WorkspaceId,
					workspaceName: currentV2Workspace.name || currentV2Workspace.branch,
				});
			}
		},
		{
			enabled:
				!!currentV2WorkspaceId &&
				!!currentV2Workspace &&
				currentV2Workspace.type !== "main",
		},
	);

	// Collapsed rail on the v2 workspace route: the rail's headroom strip
	// continues the pane tab bar, so the panel must not draw its own
	// full-height border — the sidebar's inner border (which stops below the
	// strip) is the only divider.
	const railContinuesTabBar =
		onV2WorkspaceRoute &&
		isWorkspaceSidebarOpen &&
		isWorkspaceSidebarCollapsed();

	const sidebarPanel = isWorkspaceSidebarOpen && (
		<ResizablePanel
			width={workspaceSidebarWidth}
			onWidthChange={setWorkspaceSidebarWidth}
			isResizing={isWorkspaceSidebarResizing}
			onResizingChange={setWorkspaceSidebarIsResizing}
			minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
			maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
			handleSide="right"
			clampWidth={false}
			className={railContinuesTabBar ? "border-r-0" : undefined}
			onDoubleClickHandle={() =>
				setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
			}
		>
			<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
		</ResizablePanel>
	);

	// Only lift the sidebar out of the TopBar column when v2 + expanded.
	// Collapsed/closed sidebars stay inside so the TopBar runs full-width.
	const sidebarOutsideColumn =
		isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed();

	// On the v2 workspace route with an open sidebar the TopBar row is merged
	// into the pane tab bar (which provides the drag region and hosts the
	// right-sidebar toggle). Expanded sidebars host the traffic-light pad in
	// their header; collapsed rails host it via their headroom spacer plus the
	// tab bar's leading inset. Only a fully closed sidebar keeps the TopBar,
	// whose inset then keeps content clear of the macOS traffic lights. The
	// new-workspace page brings its own drag strip, and the dashboard views
	// (automations/tasks/workspaces) carry drag fillers in their own headers,
	// so they hide the TopBar whenever the expanded sidebar sits outside the
	// column — otherwise it renders as an empty strip above their headers.
	const hideTopBar =
		(onV2WorkspaceRoute && isWorkspaceSidebarOpen) ||
		((onNewWorkspaceRoute || onDashboardViewRoute) && sidebarOutsideColumn);

	return (
		// The single ports-data provider for both layout modes. It lives up here
		// (not in the sidebar) because in topbar mode the pill renders inside
		// subtrees that remount on workspace navigation (TopBar / the workspace
		// tab bar) — the data must survive those remounts or the pill blinks out
		// for the first empty-data frames. The inline chip in the sidebar reads
		// the same context; polling stays off when nothing renders ports (v1, or
		// a collapsed/closed sidebar in inline mode).
		<DashboardSidebarPortsProvider
			enabled={
				portsDisplayMode === "topbar" ||
				(isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed())
			}
		>
			<div className="flex h-full w-full overflow-hidden">
				<CommandPaletteHost />
				{sidebarOutsideColumn && sidebarPanel}
				<div className="flex flex-1 flex-col min-w-0 min-h-0">
					{!hideTopBar && <TopBar />}
					<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
						{!sidebarOutsideColumn && sidebarPanel}
						<div className="relative flex flex-1 min-h-0 min-w-0">
							<CatchBoundary
								getResetKey={() => location.href}
								errorComponent={DashboardContentError}
							>
								<Outlet />
							</CatchBoundary>
						</div>
					</div>
				</div>
				<div
					id="workspace-right-sidebar-slot"
					className="flex h-full shrink-0"
				/>
				<AddRepositoryModals />
			</div>
		</DashboardSidebarPortsProvider>
	);
}
