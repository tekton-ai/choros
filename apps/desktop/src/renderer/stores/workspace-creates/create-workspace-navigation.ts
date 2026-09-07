import type { ProfileSubmissionContext } from "shared/profiles";
import type { SubmitOutcome } from "./complete-workspace-create";

/** A create may change IDs, but it never owns a later navigation or draft. */
export function createWorkspaceNavigation({
	context,
	isCurrent,
	getLocation,
	isUiCurrent,
	captureUi,
	navigate,
}: {
	context: ProfileSubmissionContext;
	isCurrent: (context: ProfileSubmissionContext) => boolean;
	getLocation: () => { href: string; key: string | undefined };
	isUiCurrent: () => boolean;
	captureUi: () => void;
	navigate: (workspaceId: string, replace: boolean) => Promise<void>;
}) {
	let expectedLocation = getLocation();
	const canNavigate = () => {
		const location = getLocation();
		return (
			isCurrent(context) &&
			isUiCurrent() &&
			location.href === expectedLocation.href &&
			location.key === expectedLocation.key
		);
	};
	return {
		isCurrent: canNavigate,
		async follow(
			handle: {
				workspaceId: string;
				completed: Promise<SubmitOutcome>;
				started?: boolean;
			},
			onStart?: () => void,
			alreadyOpen = false,
		) {
			if (handle.started === false || !canNavigate()) return;
			onStart?.();
			captureUi();
			if (!alreadyOpen) {
				await navigate(handle.workspaceId, false);
				const location = getLocation();
				if (
					!isCurrent(context) ||
					!isUiCurrent() ||
					location.href.split("?")[0] !== `/v2-workspace/${handle.workspaceId}`
				)
					return;
				expectedLocation = location;
			}
			const outcome = await handle.completed;
			if (
				outcome.ok &&
				outcome.profileAssignment.profileId === context.profileId &&
				outcome.workspaceId !== handle.workspaceId &&
				canNavigate()
			) {
				await navigate(outcome.workspaceId, true);
			}
		},
	};
}
