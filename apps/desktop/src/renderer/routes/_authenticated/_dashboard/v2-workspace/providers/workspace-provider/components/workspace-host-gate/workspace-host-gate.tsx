import { i18n } from "@choros/i18n";
import { useWorkspaceHostUrl } from "@choros/workspace-client";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { StateScreenShell } from "../../../../components/state-screen-shell";
import { WorkspaceHostUnreachableState } from "../../../../components/workspace-host-unreachable-state";
import { useHostReachability } from "../../../../hooks/use-host-reachability";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../utils/local-host-service-detail";

export function WorkspaceHostGate({
	workspace,
	children,
}: {
	workspace: HostWorkspaceItem;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl();
	const { isUnreachable, isReconnecting, detail, retry } =
		useHostReachability(hostUrl);
	const { machineId, hostServiceStatus } = useLocalHostService();
	const isLocalRestartInFlight =
		workspace.hostId === machineId && hostServiceStatus === "starting";
	const hostName = t({
		id: "workspace.states.hostGateThisDevice",
		message: "This device",
	});

	return (
		<div className="relative flex min-h-0 min-w-0 flex-1">
			<div className="flex min-h-0 min-w-0 flex-1" inert={isUnreachable}>
				{children}
			</div>
			{isUnreachable ? (
				<div className="absolute inset-0 z-50 bg-background">
					<StateScreenShell>
						<WorkspaceHostUnreachableState
							hostName={hostName}
							detail={
								isLocalRestartInFlight
									? i18n._(LOCAL_HOST_SERVICE_DETAIL.starting)
									: detail
							}
							isReconnecting={isReconnecting || isLocalRestartInFlight}
							onRetry={retry}
						/>
					</StateScreenShell>
				</div>
			) : null}
		</div>
	);
}
