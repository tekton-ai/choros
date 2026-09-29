import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { useProfiles } from "../../providers/profile-provider";
import { registerProfileTargetHandler } from "./profile-navigation-bridge";

export function ProfileNavigationController() {
	const { openTarget, openWorkspace, selectProfile } = useProfiles();
	useEffect(() => registerProfileTargetHandler(openTarget), [openTarget]);
	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE &&
				event.data
			) {
				void openWorkspace(event.data.workspaceId, {
					source: event.data.source,
				});
			}
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_AUTOMATION_RUN &&
				event.data
			) {
				if (event.data.profileId) selectProfile(event.data.profileId);
				openTarget(`/automations/runs/${encodeURIComponent(event.data.runId)}`);
			}
		},
	});
	return null;
}
