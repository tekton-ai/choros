import type { HostProjectItem } from "renderer/hooks/host-projects/use-host-projects";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";
import {
	type ProfileMemberRef,
	type ProfileMembership,
	profileMemberKey,
} from "shared/profiles";

export interface ProfileManagerMember {
	key: string;
	member: ProfileMemberRef;
	name: string | null;
	detail: string;
	unavailable: boolean;
	profileId: string;
}

/** Missing Host rows must never erase a persisted member or make a Profile empty. */
export function getProfileManagerMembers({
	projects,
	workspaces,
	memberships,
	recoveryMembers,
	getProjectProfileId,
	getWorkspaceProfileId,
}: {
	projects: HostProjectItem[];
	workspaces: HostWorkspaceItem[];
	memberships: ProfileMembership[];
	recoveryMembers: ProfileMemberRef[];
	getProjectProfileId: (id: string) => string;
	getWorkspaceProfileId: (workspace: {
		id: string;
		hostId: string;
		projectId: string | null;
	}) => string;
}): ProfileManagerMember[] {
	const result = new Map<string, ProfileManagerMember>();
	for (const project of projects) {
		const member: ProfileMemberRef = {
			kind: "project",
			projectKey: project.projectKey,
		};
		const key = profileMemberKey(member);
		result.set(key, {
			key,
			member,
			name: project.name,
			detail: project.repoPath ?? project.projectKey,
			unavailable: !project.hostReachable,
			profileId: getProjectProfileId(project.projectKey),
		});
	}
	for (const workspace of workspaces) {
		if (workspace.projectId !== null) continue;
		const member: ProfileMemberRef = {
			kind: "session",
			hostId: workspace.hostId,
			workspaceId: workspace.id,
		};
		const key = profileMemberKey(member);
		result.set(key, {
			key,
			member,
			name: workspace.name || workspace.branch || null,
			detail: `${workspace.hostId} · ${workspace.id}`,
			unavailable: !workspace.hostReachable,
			profileId: getWorkspaceProfileId(workspace),
		});
	}
	for (const member of [
		...memberships.map((membership) => membership.member),
		...recoveryMembers,
	]) {
		const key = profileMemberKey(member);
		if (result.has(key)) continue;
		result.set(key, {
			key,
			member,
			name: null,
			detail:
				member.kind === "project"
					? member.projectKey
					: `${member.hostId} · ${member.workspaceId}`,
			unavailable: true,
			profileId:
				member.kind === "project"
					? getProjectProfileId(member.projectKey)
					: getWorkspaceProfileId({
							id: member.workspaceId,
							hostId: member.hostId,
							projectId: null,
						}),
		});
	}
	return [...result.values()].sort(
		(left, right) =>
			(left.name ?? left.detail).localeCompare(right.name ?? right.detail) ||
			left.key.localeCompare(right.key),
	);
}
