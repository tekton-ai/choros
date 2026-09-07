import {
	DEFAULT_PROFILE_ID,
	type ProfileDefinition,
	type ProfileMembership,
	type ProfileVisit,
	profileMemberKey,
} from "shared/profiles";

export interface ProfileWorkspaceIdentity {
	id: string;
	hostId: string;
	projectId: string | null;
}

export function createProfileProjection(
	profiles: readonly ProfileDefinition[],
	memberships: readonly ProfileMembership[],
	pending: ReadonlyMap<string, string> = new Map(),
) {
	const profileIds = new Set(profiles.map((profile) => profile.id));
	const defaultProfileId =
		profiles.find((profile) => profile.isDefault)?.id ?? DEFAULT_PROFILE_ID;
	const ownership = new Map(
		memberships.map(({ member, profileId }) => [
			profileMemberKey(member),
			profileId,
		]),
	);
	const resolve = (key: string) => {
		const profileId = pending.get(key) ?? ownership.get(key);
		return profileId && profileIds.has(profileId)
			? profileId
			: defaultProfileId;
	};
	const getProjectProfileId = (projectKey: string) =>
		resolve(profileMemberKey({ kind: "project", projectKey }));
	const getWorkspaceProfileId = (workspace: ProfileWorkspaceIdentity) =>
		workspace.projectId !== null
			? getProjectProfileId(workspace.projectId)
			: resolve(
					profileMemberKey({
						kind: "session",
						hostId: workspace.hostId,
						workspaceId: workspace.id,
					}),
				);
	return { defaultProfileId, getProjectProfileId, getWorkspaceProfileId };
}

export interface AccessibleProfileWorkspace extends ProfileWorkspaceIdentity {
	hostReachable: boolean;
	worktreeExists: boolean;
	archivedAt?: number | null;
}

/** Ownership and accessibility are checked before deduplication and the UI cap. */
export function getRecentProfileWorkspaces<
	T extends AccessibleProfileWorkspace,
>({
	visits,
	workspaces,
	profileId,
	getWorkspaceProfileId,
	limit = 20,
	excludedWorkspaceIds,
}: {
	visits: readonly ProfileVisit[];
	workspaces: readonly T[];
	profileId: string;
	getWorkspaceProfileId: (workspace: T) => string;
	limit?: number;
	excludedWorkspaceIds?: ReadonlySet<string>;
}): Array<{ workspace: T; visitedAt: number }> {
	const byIdentity = new Map(
		workspaces.map((workspace) => [
			JSON.stringify([workspace.hostId, workspace.id]),
			workspace,
		]),
	);
	const seen = new Set<string>();
	const result: Array<{ workspace: T; visitedAt: number }> = [];
	for (const visit of [...visits].sort((a, b) => b.visitedAt - a.visitedAt)) {
		if (result.length >= limit) break;
		if (visit.profileId !== profileId) continue;
		const key = JSON.stringify([visit.hostId, visit.workspaceId]);
		const workspace = byIdentity.get(key);
		if (
			!workspace ||
			seen.has(key) ||
			excludedWorkspaceIds?.has(key) ||
			workspace.archivedAt != null ||
			!workspace.hostReachable ||
			!workspace.worktreeExists ||
			getWorkspaceProfileId(workspace) !== profileId
		)
			continue;
		seen.add(key);
		result.push({ workspace, visitedAt: visit.visitedAt });
	}
	return result;
}

export type ProfileRoute =
	| { kind: "workspace"; workspaceId: string }
	| { kind: "project"; projectId: string }
	| { kind: "pull-request"; projectId: string | null }
	| { kind: "global" };

function decodeIdentity(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function parseProfileRoute(path: string): ProfileRoute {
	const url = new URL(path, "https://desktop.local");
	const workspace = url.pathname.match(/^\/v2-workspace\/([^/]+)/)?.[1];
	if (workspace)
		return { kind: "workspace", workspaceId: decodeIdentity(workspace) };
	const project = url.pathname.match(/^\/project\/([^/]+)/)?.[1];
	if (project) return { kind: "project", projectId: decodeIdentity(project) };
	if (/^\/pull-requests\/[^/]+/.test(url.pathname)) {
		let projectId = url.searchParams.get("project");
		// TanStack's JSON search serializer quotes string values when needed.
		if (projectId?.startsWith('"')) {
			try {
				projectId = JSON.parse(projectId) as string;
			} catch {
				/* Keep the literal identity. */
			}
		}
		return { kind: "pull-request", projectId };
	}
	return { kind: "global" };
}

export function profileSwitchDestination(
	path: string,
): "recent-workspace" | "/v2-workspaces" | "/pull-requests" | null {
	switch (parseProfileRoute(path).kind) {
		case "workspace":
			return "recent-workspace";
		case "project":
			return "/v2-workspaces";
		case "pull-request":
			return "/pull-requests";
		case "global":
			return null;
	}
}

/** Each explicit intent cancels earlier asynchronous completions, including failures. */
export class ProfileNavigationGeneration {
	private value = 0;
	get current() {
		return this.value;
	}
	next() {
		return ++this.value;
	}
	isCurrent(generation: number) {
		return generation === this.value;
	}
}

export async function resolveProfileRecoveryTarget({
	path,
	profileId,
	getVisits,
	getSnapshot,
	isCurrent,
	onError,
	excludedWorkspaceIds,
}: {
	path: string;
	profileId: string;
	getVisits: () => Promise<ProfileVisit[]>;
	getSnapshot: () => {
		workspaces: AccessibleProfileWorkspace[];
		getWorkspaceProfileId: (workspace: ProfileWorkspaceIdentity) => string;
	};
	isCurrent: () => boolean;
	onError: () => void;
	excludedWorkspaceIds?: ReadonlySet<string>;
}): Promise<string | null> {
	const destination = profileSwitchDestination(path);
	if (!destination) return null;
	if (destination !== "recent-workspace") {
		if (!isCurrent()) return null;
		if (destination !== "/pull-requests") return destination;
		const search = new URL(path, "https://desktop.local").searchParams;
		search.delete("project");
		return destination + (search.size ? `?${search}` : "");
	}
	try {
		const visits = await getVisits();
		if (!isCurrent()) return null;
		const recent = getRecentProfileWorkspaces({
			visits,
			profileId,
			...getSnapshot(),
			excludedWorkspaceIds,
			limit: 1,
		});
		return recent[0]
			? `/v2-workspace/${encodeURIComponent(recent[0].workspace.id)}`
			: "/v2-workspaces";
	} catch {
		if (!isCurrent()) return null;
		onError();
		return "/v2-workspaces";
	}
}
