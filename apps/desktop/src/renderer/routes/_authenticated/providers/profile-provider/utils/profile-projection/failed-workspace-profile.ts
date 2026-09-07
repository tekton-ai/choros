import type { ProfileDefinition } from "shared/profiles";

export interface FailedProfileWorkspace {
	id: string;
	hostId: string;
	input: { projectId: string | null };
}

/** A failed attempt is a retry screen, not a canonical member or visit. */
export function resolveFailedWorkspaceProfileId({
	failure,
	capturedProfileId,
	profiles,
	defaultProfileId,
	getProjectProfileId,
}: {
	failure: FailedProfileWorkspace;
	capturedProfileId: string | undefined;
	profiles: readonly ProfileDefinition[];
	defaultProfileId: string;
	getProjectProfileId: (projectId: string) => string;
}): string {
	if (failure.input.projectId !== null)
		return getProjectProfileId(failure.input.projectId);
	return capturedProfileId &&
		profiles.some((profile) => profile.id === capturedProfileId)
		? capturedProfileId
		: defaultProfileId;
}
