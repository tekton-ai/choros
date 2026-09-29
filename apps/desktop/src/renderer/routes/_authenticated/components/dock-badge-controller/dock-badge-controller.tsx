import { useEffect } from "react";
import { useAutomations } from "renderer/hooks/host-service/use-automations";
import { useV2AttentionWorkspaceCount } from "renderer/hooks/host-service/use-v2-notification-status";
import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Mirrors the unread + attention-needed workspace count onto the OS
 * dock/taskbar badge. Cleared on unmount (e.g. sign-out) so a stale count
 * never lingers on the app icon.
 */
export function DockBadgeController() {
	const workspaceCount = useV2AttentionWorkspaceCount();
	const automations = useAutomations();
	const automationCount =
		automations.attentionRuns.length +
		automations.automations.filter(
			(automation) => !automations.ownershipFor(automation).targetAvailable,
		).length;
	const count = workspaceCount + automationCount;

	useEffect(() => {
		void electronTrpcClient.notifications.setDockBadge.mutate({ count });
	}, [count]);

	useEffect(() => {
		return () => {
			void electronTrpcClient.notifications.setDockBadge.mutate({ count: 0 });
		};
	}, []);

	return null;
}
