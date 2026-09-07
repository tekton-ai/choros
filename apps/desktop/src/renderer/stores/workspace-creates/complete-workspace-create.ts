import type {
	ProfileAssignmentResult,
	ProfileMemberRef,
	ProfileSubmissionContext,
} from "shared/profiles";

export interface CreatedWorkspaceResult {
	workspace: { id: string; projectId: string | null };
}

export type SubmitOutcome =
	| {
			ok: true;
			workspaceId: string;
			profileAssignment: ProfileAssignmentResult;
	  }
	| { ok: false; error: string };

/** Only Host rejection is a failed creation. Classification cannot retry Host work. */
export function completeWorkspaceCreate<T extends CreatedWorkspaceResult>({
	create,
	hostId,
	optimisticWorkspaceId,
	profileContext,
	assignCreatedMember,
	registerPendingMember,
	getProjectProfileId,
	onCreated,
	onFailed,
	clearPendingMember,
}: {
	create: () => Promise<T>;
	hostId: string;
	optimisticWorkspaceId: string;
	profileContext: ProfileSubmissionContext;
	assignCreatedMember: (
		member: ProfileMemberRef,
		context: ProfileSubmissionContext,
	) => Promise<ProfileAssignmentResult>;
	registerPendingMember: (
		member: ProfileMemberRef,
		context: ProfileSubmissionContext,
	) => () => void;
	getProjectProfileId: (projectKey: string) => string;
	onCreated: (result: T) => void;
	onFailed: (message: string) => void;
	clearPendingMember: () => void;
}): Promise<SubmitOutcome> {
	return create()
		.then<SubmitOutcome, SubmitOutcome>(
			async (result) => {
				const canonicalSession =
					result.workspace.projectId === null
						? {
								kind: "session" as const,
								hostId,
								workspaceId: result.workspace.id,
							}
						: null;
				const clearCanonicalMember =
					canonicalSession && result.workspace.id !== optimisticWorkspaceId
						? registerPendingMember(canonicalSession, profileContext)
						: () => {};
				try {
					const profileAssignment = canonicalSession
						? await assignCreatedMember(canonicalSession, profileContext)
						: {
								profileId: getProjectProfileId(
									result.workspace.projectId as string,
								),
								assigned: true,
							};
					onCreated(result);
					return {
						ok: true,
						workspaceId: result.workspace.id,
						profileAssignment,
					};
				} finally {
					clearCanonicalMember();
				}
			},
			(error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				onFailed(message);
				return { ok: false, error: message };
			},
		)
		.finally(clearPendingMember);
}
