import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useV2UserPreferences } from "renderer/hooks/use-v2-user-preferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/use-dashboard-sidebar-state";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import { StateScreenShell } from "../components/state-screen-shell";
import { WorkspaceCreateErrorState } from "../components/workspace-create-error-state";
import { WorkspaceCreatingState } from "../components/workspace-creating-state";
import { WorkspaceNotFoundState } from "../components/workspace-not-found-state";
import { useRemoteHostStatus } from "../hooks/use-remote-host-status";
import { useWorkspaceMissVerdict } from "../hooks/use-workspace-miss-verdict";
import { WorkspaceProvider } from "../providers/workspace-provider";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId",
)({
	component: V2WorkspaceLayout,
});

function V2WorkspaceLayout() {
	// Owned by this segment, so the param is available by definition. This used
	// to live on the parent route, which had to match its own child to recover
	// the id and then render an empty shell for the "no id" case that route
	// could always reach and this one cannot.
	const { workspaceId } = Route.useParams();
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const pendingTransaction = useWorkspaceTransactionsStore((state) =>
		workspaceId ? (state.byWorkspaceId[workspaceId] ?? null) : null,
	);
	// The create transaction clears when the workspaces.create mutation
	// settles — not when the host-served row first arrives, which happens
	// mid-create before agent/terminal panes are seeded.
	const isCreatePending = pendingTransaction?.type === "insert";

	const { toggleShowPresetsBar } = useV2UserPreferences();
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "toggle-presets-bar") {
				toggleShowPresetsBar();
			}
		},
	});

	const {
		workspaces: hostWorkspaces,
		isReady,
		hostsSettled,
		cache,
	} = useHostWorkspaces();
	const workspace = useMemo(
		() =>
			workspaceId != null
				? (hostWorkspaces.find((candidate) => candidate.id === workspaceId) ??
					null)
				: null,
		[hostWorkspaces, workspaceId],
	);
	const { data: failedEntries } = useLiveQuery(
		(q) =>
			q
				.from({ failed: collections.failedWorkspaceCreates })
				.where(({ failed }) => eq(failed.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const failedEntry = failedEntries?.[0] ?? null;

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	// Sandboxes ship with the app's own host-service build, so the remote
	// version gate has nothing to check and no host row to check it against.
	const hostStatus = useRemoteHostStatus(workspace);

	// "Not found" is a verdict, not a cache read: a CLI-created workspace can
	// trail its own deep link (missed broadcast, second host-service instance,
	// stale boot snapshot), so the route forces a refetch and waits for it —
	// bounded — before declaring the id missing.
	const missConfirmed = useWorkspaceMissVerdict(
		{
			workspaceId,
			workspaceFound: workspace !== null,
			suspended: pendingTransaction !== null || failedEntry !== null,
			hostsEnumerated: hostsSettled,
			hasLiveTargets: cache.hasLiveTargets,
			mirrorSettled: isReady,
		},
		cache.refetchAll,
	);

	if (!workspace) {
		if (failedEntry) {
			return (
				<StateScreenShell>
					<WorkspaceCreateErrorState entry={failedEntry} />
				</StateScreenShell>
			);
		}
		if (!missConfirmed) {
			return <StateScreenShell>{null}</StateScreenShell>;
		}
		return (
			<StateScreenShell>
				<WorkspaceNotFoundState workspaceId={workspaceId} />
			</StateScreenShell>
		);
	}

	if (isCreatePending) {
		return (
			<StateScreenShell>
				<WorkspaceCreatingState
					name={workspace.name}
					branch={workspace.branch}
					startedAt={new Date(workspace.createdAt).getTime()}
					isSession={workspace.type === "session"}
				/>
			</StateScreenShell>
		);
	}

	if (hostStatus.status === "loading") {
		return <StateScreenShell>{null}</StateScreenShell>;
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			<Outlet />
		</WorkspaceProvider>
	);
}
