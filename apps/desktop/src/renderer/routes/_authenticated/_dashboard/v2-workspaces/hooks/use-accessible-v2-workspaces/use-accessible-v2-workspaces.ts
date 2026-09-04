import type { CheckItem } from "@choros/local-db";
import { useLingui } from "@lingui/react/macro";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolve-project-icon-url";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/use-terminal-agent-statuses";
import { useHostWorkspacesSource } from "renderer/hooks/host-workspaces/use-host-workspaces";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	DEVICE_FILTER_ALL_DEVICES,
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_SESSIONS,
	type V2WorkspacesAgentStatusFilter,
	type V2WorkspacesDeviceFilter,
	type V2WorkspacesPinFilter,
	type V2WorkspacesPrStateFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2-workspaces-filter-store";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/collections-provider/dashboard-sidebar-local";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { type PaneStatus, pickHigherStatus } from "shared/tabs-types";

export type V2WorkspaceHostType = "local-device" | "remote-device";

/** Host vocabulary — includes merge-queue, unlike the old cloud join. */
export type V2WorkspacePrState =
	| "open"
	| "merged"
	| "closed"
	| "draft"
	| "queued";

export type V2WorkspacePrReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending";

export type V2WorkspacePrChecksStatus =
	| "none"
	| "pending"
	| "success"
	| "failure";

export interface V2WorkspacePrSummary {
	prNumber: number;
	title: string;
	url: string;
	state: V2WorkspacePrState;
	checksStatus: V2WorkspacePrChecksStatus;
	reviewDecision: V2WorkspacePrReviewDecision;
	checks: CheckItem[];
	/** First observed merged (epoch ms); null unless merged. */
	mergedAt: number | null;
}

export interface V2WorkspaceDiffStats {
	additions: number;
	deletions: number;
	fileCount: number;
}

export interface AccessibleV2Workspace {
	id: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	createdAt: Date;
	createdByUserId: string | null;
	createdByName: string | null;
	createdByImage: string | null;
	isCreatedByCurrentUser: boolean;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/** Null for project-less "session" workspaces. */
	projectName: string | null;
	projectRepoId: string | null;
	projectIconUrl: string | null;
	hostId: string;
	hostName: string;
	hostIsOnline: boolean;
	hostType: V2WorkspaceHostType;
	isInSidebar: boolean;
	pr: V2WorkspacePrSummary | null;
	/** Highest-priority live agent status across the workspace's terminals. */
	agentStatus: PaneStatus;
	/** Most recent agent event across the workspace's terminals (epoch ms);
	 * null when no agent has ever run here. */
	lastAgentEventAt: number | null;
	/** Working-tree + against-base churn; null until the host answers. */
	diffStats: V2WorkspaceDiffStats | null;
	/** Non-null = archived tombstone (soft-deleted workspace). */
	archivedAt: number | null;
	archiveReason: "merged" | "deleted" | null;
}

export interface V2WorkspaceHostOption {
	hostId: string;
	hostName: string;
	isOnline: boolean;
	isLocal: boolean;
}

export interface V2WorkspaceProjectOption {
	projectId: string;
	projectName: string;
	iconUrl: string | null;
	count: number;
}

export interface UseAccessibleV2WorkspacesResult {
	all: AccessibleV2Workspace[];
	/** Row-source settlement — gates empty states only, never rendered rows. */
	isReady: boolean;
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<string, { projectName: string; iconUrl: string | null }>;
}

interface UseAccessibleV2WorkspacesOptions {
	searchQuery?: string;
	/** Omitted = no device scoping (programmatic callers like the palette). */
	deviceFilter?: V2WorkspacesDeviceFilter;
	/** Empty/omitted = all projects. May contain PROJECT_FILTER_SESSIONS. */
	projectFilters?: string[];
	/** Empty/omitted = any PR state (including no PR). */
	prStateFilters?: V2WorkspacesPrStateFilter[];
	/** Empty/omitted = any agent status. */
	agentStatusFilters?: V2WorkspacesAgentStatusFilter[];
	/** Omitted = "all" — sidebar-pinned and unpinned alike. */
	pinFilter?: V2WorkspacesPinFilter;
	/**
	 * Also surface archived tombstones (with `archivedAt` set). Requires a
	 * device filter — the archived fetch rides the scoped host source.
	 */
	includeArchived?: boolean;
}

function workspaceMatchesSearch(
	workspace: AccessibleV2Workspace,
	searchQuery: string,
): boolean {
	if (!searchQuery.trim()) return true;
	const query = searchQuery.trim().toLowerCase();
	return (
		workspace.name.toLowerCase().includes(query) ||
		(workspace.projectName ?? "Sessions").toLowerCase().includes(query) ||
		workspace.branch.toLowerCase().includes(query) ||
		workspace.hostName.toLowerCase().includes(query) ||
		(workspace.createdByName ?? "").toLowerCase().includes(query) ||
		(workspace.pr ? `#${workspace.pr.prNumber}`.includes(query) : false) ||
		(workspace.pr?.title.toLowerCase().includes(query) ?? false)
	);
}

function matchesProjectFilters(
	workspace: AccessibleV2Workspace,
	projectFilters: string[],
): boolean {
	if (projectFilters.length === 0) return true;
	if (workspace.projectId === null) {
		return projectFilters.includes(PROJECT_FILTER_SESSIONS);
	}
	return projectFilters.includes(workspace.projectId);
}

function matchesPrStateFilters(
	workspace: AccessibleV2Workspace,
	prStateFilters: V2WorkspacesPrStateFilter[],
): boolean {
	if (prStateFilters.length === 0) return true;
	return workspace.pr != null && prStateFilters.includes(workspace.pr.state);
}

function matchesPinFilter(
	workspace: AccessibleV2Workspace,
	pinFilter: V2WorkspacesPinFilter,
): boolean {
	if (pinFilter === "all") return true;
	// Archived tombstones may keep stale sidebar metadata; they are never
	// pinned regardless of what that metadata says.
	if (workspace.archivedAt !== null) return pinFilter === "unpinned";
	return pinFilter === "pinned"
		? workspace.isInSidebar
		: !workspace.isInSidebar;
}

function matchesAgentStatusFilters(
	workspace: AccessibleV2Workspace,
	agentStatusFilters: V2WorkspacesAgentStatusFilter[],
): boolean {
	if (agentStatusFilters.length === 0) return true;
	return agentStatusFilters.includes(workspace.agentStatus);
}

// useQueries returns a fresh array each render; key the map on a content
// fingerprint so its identity only changes when the entries do.
function useStableByWorkspaceId<T>(entries: [string, T][]): Map<string, T> {
	const fingerprint = useMemo(
		() => JSON.stringify([...entries].sort(([a], [b]) => a.localeCompare(b))),
		[entries],
	);
	return useMemo<Map<string, T>>(
		() => new Map(JSON.parse(fingerprint) as [string, T][]),
		[fingerprint],
	);
}

export function useAccessibleV2Workspaces(
	options: UseAccessibleV2WorkspacesOptions = {},
): UseAccessibleV2WorkspacesResult {
	const { t } = useLingui();
	const searchQuery = options.searchQuery ?? "";
	const deviceFilter = options.deviceFilter;
	const projectFilters = options.projectFilters ?? [];
	const prStateFilters = options.prStateFilters ?? [];
	const agentStatusFilters = options.agentStatusFilters ?? [];
	const pinFilter = options.pinFilter ?? "all";
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	// With a specific device filter (the page), rows come from a single
	// `workspace.list` against that host — no fan-out, so ten idle hosts can't
	// slow down or silently thin out the list. "All devices" is the user opting
	// into that fan-out: the scoped source runs unscoped (undefined), sharing
	// query keys with the provider so nothing fetches twice, and archived
	// tombstones still ride along. Without a filter (palette, dev seeding),
	// rows come from the provider's already-running fan-out. Both hooks always
	// run per the rules of hooks; the unused one is passed null / left unread
	// and does no work of its own.
	const scopedHostId =
		deviceFilter === undefined
			? null
			: deviceFilter === DEVICE_FILTER_ALL_DEVICES
				? undefined
				: deviceFilter === DEVICE_FILTER_THIS_DEVICE
					? machineId
					: deviceFilter;
	const scopedSource = useHostWorkspacesSource(scopedHostId, {
		includeArchived: options.includeArchived ?? false,
	});
	const fanoutSource = useHostWorkspaces();
	const { workspaces: hostWorkspaces, isReady } =
		deviceFilter === undefined ? fanoutSource : scopedSource;

	// Projects are fully local — the host fan-out is the identity source.
	const { projects: hostProjects } = useHostProjects();

	const { data: sidebarStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarState: collections.v2WorkspaceLocalState })
				.select(({ sidebarState }) => ({
					workspaceId: sidebarState.workspaceId,
					isHidden: sidebarState.sidebarState.isHidden,
				})),
		[collections],
	);

	const { data: sidebarProjectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProject: collections.v2SidebarProjects })
				.select(({ sidebarProject }) => ({
					projectId: sidebarProject.projectId,
				})),
		[collections],
	);

	const rows = useMemo(() => {
		const projectsById = new Map(
			hostProjects.map((project) => [project.projectKey, project]),
		);
		const sidebarStateByWorkspaceId = new Map(
			sidebarStateRows.map((row) => [row.workspaceId, row]),
		);
		const sidebarProjectIds = new Set(
			sidebarProjectRows.map((row) => row.projectId),
		);

		return hostWorkspaces.flatMap((workspace) => {
			const project = workspace.projectId
				? projectsById.get(workspace.projectId)
				: null;
			if (workspace.projectId && !project) return [];
			const sidebarState = sidebarStateByWorkspaceId.get(workspace.id);
			return [
				{
					id: workspace.id,
					name: workspace.name,
					branch: workspace.branch,
					type: workspace.type,
					createdAt: workspace.createdAt,
					createdByUserId: null,
					createdByName: null,
					createdByImage: null,
					projectId: project?.projectKey ?? null,
					projectName: project?.name ?? null,
					projectRepoId: null,
					projectIconUrl: project ? resolveProjectIconUrl(project) : null,
					hostId: machineId,
					hostName: t({
						id: "dashboard.workspaces.hostThisDevice",
						message: "This device",
					}),
					hostIsOnline: workspace.hostReachable,
					sidebarProjectId:
						project && sidebarProjectIds.has(project.projectKey)
							? project.projectKey
							: null,
					sidebarWorkspaceId: sidebarState?.workspaceId ?? null,
					sidebarIsHidden: sidebarState?.isHidden ?? false,
					archivedAt: workspace.archivedAt ?? null,
					archiveReason: workspace.archiveReason ?? null,
				},
			];
		});
	}, [
		hostProjects,
		hostWorkspaces,
		machineId,
		sidebarProjectRows,
		sidebarStateRows,
		t,
	]);

	// The authoritative link lives in host.db (`workspace.pullRequestId`), not
	// any collection. With host-scoped rows this derives a single target ("All
	// devices" derives one per host with visible rows); a client-side
	// `repositoryId::branch` map mistracks on fork branch collisions. Unscoped
	// callers (palette, dev seeding) don't render PR data, so skip the queries
	// entirely rather than fanning them out per host.
	const pullRequestQueryTargets = useMemo(
		() =>
			activeHostUrl && deviceFilter !== undefined
				? [
						{
							organizationId: "local",
							machineId,
							hostUrl: activeHostUrl,
							workspaceIds: rows.map((row) => row.id),
						},
					]
				: [],
		[activeHostUrl, deviceFilter, machineId, rows],
	);

	const pullRequestQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			// Host identity only — see getDashboardSidebarPullRequestQueryKey:
			// URL or membership in the key cold-starts the cache on every
			// port change / workspace add/remove.
			queryKey: [
				"v2-workspaces",
				"pull-requests",
				target.organizationId,
				target.machineId,
			] as const,
			refetchInterval: 10_000,
			enabled: target.hostUrl !== null,
			queryFn: async () => {
				if (!target.hostUrl) return { workspaces: [] };
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.pullRequests.getByWorkspaces.query({
					workspaceIds: target.workspaceIds,
				});
			},
		})),
	});

	// The host is the sole PR source: its snapshot already carries the full
	// 5-valued state (incl. merge queue), review decision, and checks — the
	// old cloud Electric join re-derived a worse 4-valued state and could
	// never match sessions or repo-unmatched projects.
	const prSummaryEntries = useMemo<[string, V2WorkspacePrSummary][]>(() => {
		const entries: [string, V2WorkspacePrSummary][] = [];
		for (const query of pullRequestQueries) {
			const data = query.data;
			if (!data) continue;
			for (const row of data.workspaces) {
				const pr = row.pullRequest;
				if (!pr) continue;
				entries.push([
					row.workspaceId,
					{
						prNumber: pr.number,
						title: pr.title,
						url: pr.url,
						state: pr.state,
						checksStatus: pr.checksStatus,
						reviewDecision: pr.reviewDecision ?? "pending",
						checks: pr.checks.map((check) => ({
							name: check.name,
							status: check.status,
							url: check.url ?? undefined,
						})),
						mergedAt: pr.mergedAt,
					},
				]);
			}
		}
		return entries;
	}, [pullRequestQueries]);
	const prByWorkspaceId = useStableByWorkspaceId(prSummaryEntries);

	// Live agent status, one host-wide query per host — never per workspace
	// (a 100-row board must not fan out 100 binding queries).
	const terminalAgentQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			queryKey: [
				"v2-workspaces",
				"terminal-agents",
				target.organizationId,
				target.machineId,
			] as const,
			refetchInterval: 10_000,
			enabled: target.hostUrl !== null,
			queryFn: async () => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.terminalAgents.list.query();
			},
		})),
	});
	// Batched totals, one query per host (mirrors the PR/agent queries above).
	// Slower cadence: totals only feed row chips, not the Changes tab.
	const diffStatsQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			queryKey: [
				"v2-workspaces",
				"diff-stats",
				target.organizationId,
				target.machineId,
			] as const,
			refetchInterval: 30_000,
			enabled: target.hostUrl !== null,
			queryFn: async () => {
				if (!target.hostUrl) return { workspaces: [] };
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.git.getDiffStatsByWorkspaces.query({
					// Server caps the batch at 500 (MAX_DIFF_STATS_BATCH); rows
					// beyond it simply show no stats rather than failing the call.
					workspaceIds: target.workspaceIds.slice(0, 500),
				});
			},
		})),
	});
	const diffStatsEntries = useMemo<[string, V2WorkspaceDiffStats][]>(() => {
		const entries: [string, V2WorkspaceDiffStats][] = [];
		for (const query of diffStatsQueries) {
			for (const row of query.data?.workspaces ?? []) {
				entries.push([
					row.workspaceId,
					{
						additions: row.additions,
						deletions: row.deletions,
						fileCount: row.fileCount,
					},
				]);
			}
		}
		return entries;
	}, [diffStatsQueries]);
	const diffStatsByWorkspaceId = useStableByWorkspaceId(diffStatsEntries);

	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);
	const agentActivityEntries = useMemo<
		[
			string,
			{ status: PaneStatus; lastEventAt: number; agents: [string, number][] },
		][]
	>(() => {
		const byWorkspace = new Map<
			string,
			{ status: PaneStatus; lastEventAt: number; agents: Map<string, number> }
		>();
		for (const query of terminalAgentQueries) {
			for (const binding of query.data ?? []) {
				const status = deriveTerminalAgentStatus({
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					lastSeenAt: terminalSeenAt[binding.terminalId],
				});
				const prev = byWorkspace.get(binding.workspaceId) ?? {
					status: "idle" as PaneStatus,
					lastEventAt: 0,
					agents: new Map<string, number>(),
				};
				prev.status = pickHigherStatus(prev.status, status);
				prev.lastEventAt = Math.max(prev.lastEventAt, binding.lastEventAt);
				prev.agents.set(
					binding.agentId,
					Math.max(prev.agents.get(binding.agentId) ?? 0, binding.lastEventAt),
				);
				byWorkspace.set(binding.workspaceId, prev);
			}
		}
		return [...byWorkspace.entries()].map(([id, value]) => [
			id,
			{
				status: value.status,
				lastEventAt: value.lastEventAt,
				agents: [...value.agents.entries()],
			},
		]);
	}, [terminalAgentQueries, terminalSeenAt]);
	const agentActivityByWorkspaceId =
		useStableByWorkspaceId(agentActivityEntries);

	const enriched = useMemo<AccessibleV2Workspace[]>(() => {
		const deduped = new Map<string, AccessibleV2Workspace>();
		for (const row of rows) {
			if (deduped.has(row.id)) continue;
			const hostType: V2WorkspaceHostType =
				row.hostId === machineId ? "local-device" : "remote-device";
			const isAutoVisibleMain =
				row.type === "main" &&
				row.hostId === machineId &&
				row.sidebarProjectId != null;
			const isInSidebar =
				isSidebarWorkspaceVisible({ isHidden: row.sidebarIsHidden }) &&
				(row.sidebarWorkspaceId != null || isAutoVisibleMain);
			const pr = prByWorkspaceId.get(row.id) ?? null;

			deduped.set(row.id, {
				id: row.id,
				name: row.name,
				branch: row.branch,
				type: row.type,
				createdAt: new Date(row.createdAt),
				createdByUserId: row.createdByUserId,
				createdByName: row.createdByName ?? null,
				createdByImage: row.createdByImage ?? null,
				isCreatedByCurrentUser: false,
				projectId: row.projectId,
				projectName: row.projectName,
				projectRepoId: row.projectRepoId,
				projectIconUrl: row.projectIconUrl ?? null,
				hostId: row.hostId,
				hostName: row.hostName,
				hostIsOnline: row.hostIsOnline,
				hostType,
				isInSidebar,
				pr,
				agentStatus: agentActivityByWorkspaceId.get(row.id)?.status ?? "idle",
				lastAgentEventAt:
					agentActivityByWorkspaceId.get(row.id)?.lastEventAt ?? null,
				diffStats: diffStatsByWorkspaceId.get(row.id) ?? null,
				archivedAt: row.archivedAt,
				archiveReason: row.archiveReason,
			});
		}
		return Array.from(deduped.values()).sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
	}, [
		rows,
		machineId,
		prByWorkspaceId,
		agentActivityByWorkspaceId,
		diffStatsByWorkspaceId,
	]);

	const searchFiltered = useMemo(
		() =>
			enriched.filter((workspace) =>
				workspaceMatchesSearch(workspace, searchQuery),
			),
		[enriched, searchQuery],
	);

	const fullyFiltered = useMemo(
		() =>
			searchFiltered.filter(
				(workspace) =>
					matchesProjectFilters(workspace, projectFilters) &&
					matchesPrStateFilters(workspace, prStateFilters) &&
					matchesAgentStatusFilters(workspace, agentStatusFilters) &&
					matchesPinFilter(workspace, pinFilter),
			),
		[
			searchFiltered,
			projectFilters,
			prStateFilters,
			agentStatusFilters,
			pinFilter,
		],
	);

	const hostOptions = useMemo<V2WorkspaceHostOption[]>(
		() => [
			{
				hostId: machineId,
				hostName: t({
					id: "dashboard.workspaces.hostThisDevice",
					message: "This device",
				}),
				isOnline: activeHostUrl !== null,
				isLocal: true,
			},
		],
		[activeHostUrl, machineId, t],
	);

	const projectOptions = useMemo<V2WorkspaceProjectOption[]>(() => {
		const byProject = new Map<string, V2WorkspaceProjectOption>();
		for (const workspace of searchFiltered) {
			// Sessions aren't a project; the filter dropdown stays project-only.
			if (workspace.projectId === null) continue;
			const existing = byProject.get(workspace.projectId);
			if (existing) {
				existing.count += 1;
				continue;
			}
			byProject.set(workspace.projectId, {
				projectId: workspace.projectId,
				projectName: workspace.projectName ?? "",
				iconUrl: workspace.projectIconUrl,
				count: 1,
			});
		}
		return Array.from(byProject.values()).sort((a, b) =>
			a.projectName.localeCompare(b.projectName),
		);
	}, [searchFiltered]);

	const hostsById = useMemo(
		() =>
			new Map([
				[
					machineId,
					{
						hostName: t({
							id: "dashboard.workspaces.hostThisDevice",
							message: "This device",
						}),
						isOnline: activeHostUrl !== null,
						isLocal: true,
					},
				] as const,
			]),
		[activeHostUrl, machineId, t],
	);

	const projectsById = useMemo(() => {
		const map = new Map<
			string,
			{ projectName: string; iconUrl: string | null }
		>();
		for (const workspace of enriched) {
			if (workspace.projectId === null) continue;
			if (map.has(workspace.projectId)) continue;
			map.set(workspace.projectId, {
				projectName: workspace.projectName ?? "",
				iconUrl: workspace.projectIconUrl,
			});
		}
		return map;
	}, [enriched]);

	return {
		all: fullyFiltered,
		isReady,
		hostOptions,
		projectOptions,
		hostsById,
		projectsById,
	};
}
