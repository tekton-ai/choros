import { usePortKillActions } from "renderer/hooks/ports/use-port-kill-actions";
import type { DashboardSidebarPort } from "../use-dashboard-sidebar-ports-data";

const HOST_PORTS_QUERY_PREFIX = ["host-service", "ports", "getAll"] as const;

export function useDashboardSidebarPortKill() {
	return usePortKillActions<DashboardSidebarPort>({
		refreshQueryKey: HOST_PORTS_QUERY_PREFIX,
	});
}
