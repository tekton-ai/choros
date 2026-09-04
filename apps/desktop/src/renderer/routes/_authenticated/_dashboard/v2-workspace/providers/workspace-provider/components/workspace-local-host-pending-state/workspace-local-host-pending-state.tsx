import { i18n } from "@choros/i18n";
import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { useDelayElapsed } from "renderer/hooks/use-delay-elapsed";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { StateScreenShell } from "../../../../components/state-screen-shell";
import { WorkspaceHostUnreachableState } from "../../../../components/workspace-host-unreachable-state";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../utils/local-host-service-detail";

/**
 * The workspace lives on this device but the local host service has no port
 * yet — it is starting, wedged, or stopped. The provider polls for it every 5s,
 * so hold a blank frame briefly (normal at boot) before saying anything.
 */
const LOCAL_HOST_GRACE_MS = 10_000;

export function WorkspaceLocalHostPendingState() {
	const { t } = useLingui();
	const { hostServiceStatus } = useLocalHostService();
	const showState = useDelayElapsed(true, LOCAL_HOST_GRACE_MS);

	const restart = electronTrpc.hostServiceCoordinator.restart.useMutation({
		onError: (error) => {
			toast.error(
				t({
					id: "workspace.states.localHostPendingRestartFailed",
					message: "Couldn't restart the host service",
				}),
				{
					description: t({
						id: "workspace.states.localHostPendingRestartFailedDescription",
						message: `${error.message} — try the Choros tray menu > Host Service > Restart.`,
					}),
				},
			);
		},
	});

	if (!showState) return <div className="flex h-full w-full" />;

	// Restarting mid-start races the pending spawn, exactly as the tray menu
	// avoids — and "running" here means a healthy service whose port is still
	// in flight. Both show progress instead of inviting a restart.
	const isStarting =
		hostServiceStatus === "starting" ||
		hostServiceStatus === "running" ||
		restart.isPending;

	return (
		<StateScreenShell>
			<WorkspaceHostUnreachableState
				hostName={t({
					id: "workspace.states.localHostPendingThisDevice",
					message: "This device",
				})}
				detail={i18n._(LOCAL_HOST_SERVICE_DETAIL[hostServiceStatus])}
				isReconnecting={isStarting}
				retryLabel={t({
					id: "workspace.states.localHostPendingRestartService",
					message: "Restart host service",
				})}
				retryBusyLabel={t({
					id: "workspace.states.localHostPendingStarting",
					message: "Starting…",
				})}
				onRetry={() => {
					if (!isStarting) restart.mutate();
				}}
			/>
		</StateScreenShell>
	);
}
