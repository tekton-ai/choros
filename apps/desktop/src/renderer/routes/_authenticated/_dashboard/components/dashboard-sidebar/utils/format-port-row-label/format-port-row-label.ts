import type { DashboardSidebarPort } from "../../hooks/use-dashboard-sidebar-ports-data";

export function formatPortRowLabel(port: DashboardSidebarPort): {
	text: string;
	title?: string;
} {
	return { text: `localhost:${port.port}` };
}
