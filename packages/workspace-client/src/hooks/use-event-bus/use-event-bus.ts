import { useMemo } from "react";
import { type EventBusHandle, getEventBus } from "../../lib/event-bus";
import { useWorkspaceClient } from "../../providers/workspace-client-provider";

/**
 * Returns an EventBusHandle for the current host.
 * One WS connection is shared across all components using the same host.
 */
export function useEventBus(): EventBusHandle {
	const { hostUrl, getWsToken } = useWorkspaceClient();
	return useMemo(() => getEventBus(hostUrl, getWsToken), [hostUrl, getWsToken]);
}
