import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { createWorkspaceNavigation } from "./create-workspace-navigation";

export function useWorkspaceCreateNavigation() {
	const router = useRouter();
	const { captureSubmission, isSubmissionCurrent, runSubmissionNavigation } =
		useProfiles();
	const requestId = useRef<string | null>(null);
	return useCallback(() => {
		const profileContext = captureSubmission();
		requestId.current = profileContext.requestId;
		let modal = useNewWorkspaceModalStore.getState();
		let resetKey = useNewWorkspaceDraftStore.getState().resetKey;
		const navigation = createWorkspaceNavigation({
			context: profileContext,
			isCurrent: isSubmissionCurrent,
			getLocation: () => ({
				href: router.state.location.href,
				key: router.state.location.state.__TSR_key,
			}),
			isUiCurrent: () =>
				requestId.current === profileContext.requestId &&
				modal === useNewWorkspaceModalStore.getState() &&
				resetKey === useNewWorkspaceDraftStore.getState().resetKey,
			captureUi: () => {
				modal = useNewWorkspaceModalStore.getState();
				resetKey = useNewWorkspaceDraftStore.getState().resetKey;
			},
			navigate: (workspaceId, replace) =>
				runSubmissionNavigation(profileContext, () =>
					router.navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId },
						replace,
					}),
				),
		});
		return { profileContext, ...navigation };
	}, [captureSubmission, isSubmissionCurrent, router, runSubmissionNavigation]);
}
