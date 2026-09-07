import type { ProfileSubmissionContext } from "shared/profiles";
import type { FinalizedProjectSetupResult } from "./use-finalize-project-setup";

interface CompletionTarget {
	profiles: {
		activeProfileId: string;
		captureSubmission: () => ProfileSubmissionContext;
		isSubmissionCurrent: (context: ProfileSubmissionContext) => boolean;
		getProjectProfileId: (projectId: string) => string;
		selectProfile: (profileId: string) => void;
	};
	onSelect: (projectId: string) => void;
}

/** A completed Host operation may only select into its original waiting UI. */
export function createProjectCompletion(readCurrent: () => CompletionTarget) {
	let pending: ProfileSubmissionContext | null = null;
	const isPending = (context: ProfileSubmissionContext) =>
		pending?.requestId === context.requestId &&
		readCurrent().profiles.isSubmissionCurrent(context);
	return {
		begin() {
			const context = readCurrent().profiles.captureSubmission();
			pending = context;
			return context;
		},
		cancel() {
			pending = null;
		},
		isPending,
		complete(
			context: ProfileSubmissionContext,
			result: FinalizedProjectSetupResult,
		) {
			const { profiles, onSelect } = readCurrent();
			if (
				!isPending(context) ||
				!result.profileContext ||
				!profiles.isSubmissionCurrent(result.profileContext)
			) {
				return false;
			}
			pending = null;
			// Reimport preserves the latest owner, including moves during setup.
			const owner = profiles.getProjectProfileId(result.projectId);
			if (profiles.activeProfileId !== owner) profiles.selectProfile(owner);
			onSelect(result.projectId);
			return true;
		},
	};
}
