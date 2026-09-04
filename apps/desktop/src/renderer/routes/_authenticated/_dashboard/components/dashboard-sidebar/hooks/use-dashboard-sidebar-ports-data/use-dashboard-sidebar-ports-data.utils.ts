import type { PortChangedPayload } from "@choros/workspace-client";
import type { DetectedPort } from "shared/types";
import type { DashboardSidebarWorkspaceHostType } from "../../types";

export interface DashboardSidebarPort extends RemotePort {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
}

interface RemotePort extends DetectedPort {
	label: string | null;
}

export interface DashboardSidebarPortGroup {
	workspaceId: string;
	workspaceName: string;
	hostType: DashboardSidebarWorkspaceHostType;
	ports: DashboardSidebarPort[];
}

export interface DashboardSidebarPortsLoadError {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	message: string;
}

export interface HostPortsResult {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	ports: RemotePort[];
}

type HostPortsMetadata = Pick<
	HostPortsResult,
	"hostId" | "hostType" | "hostUrl"
>;

export interface HostPortsQueryTarget {
	machineId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	workspaceIds: string[];
}

export interface DashboardSidebarWorkspaceRow {
	id: string;
	name: string;
	hostId: string;
}

export function getHostPortsQueryKey(host: HostPortsQueryTarget) {
	// Host identity only: hostUrl churns on restarts, and workspaceIds in the
	// key cold-started the whole ports cache on any membership change. The
	// queryFn reads both from the target at fetch time.
	return ["host-service", "ports", "getAll", host.machineId] as const;
}

function getPortCacheKey(
	port: Pick<DetectedPort, "workspaceId" | "terminalId" | "port">,
): string {
	return `${port.workspaceId}:${port.terminalId}:${port.port}`;
}

export function applyPortEventsToHostPortsResult(
	result: HostPortsResult | undefined,
	events: PortChangedPayload[],
	host?: HostPortsMetadata,
): HostPortsResult | undefined {
	if (events.length === 0) return result;

	const initialResult =
		result ??
		(events.some((event) => event.eventType === "add") && host
			? { ...host, ports: [] }
			: undefined);
	if (!initialResult) return result;

	let ports = initialResult.ports;
	let changed = initialResult !== result;

	for (const event of events) {
		const eventPortKey = getPortCacheKey(event.port);
		const portsWithoutEventPort = ports.filter(
			(port) => getPortCacheKey(port) !== eventPortKey,
		);
		if (portsWithoutEventPort.length !== ports.length) {
			changed = true;
		}

		if (event.eventType === "add") {
			ports = [...portsWithoutEventPort, { ...event.port, label: event.label }];
			changed = true;
		} else {
			ports = portsWithoutEventPort;
		}
	}

	if (!changed) return result;
	return { ...initialResult, ports };
}

export function groupDashboardSidebarPorts({
	hostPortResults,
	workspaces,
}: {
	hostPortResults: Array<HostPortsResult | undefined>;
	workspaces: DashboardSidebarWorkspaceRow[];
}): DashboardSidebarPortGroup[] {
	const workspacesById = new Map(
		workspaces.map((workspace) => [
			workspace.id,
			{
				name: workspace.name,
			},
		]),
	);
	const groupMap = new Map<string, DashboardSidebarPortGroup>();

	for (const result of hostPortResults) {
		if (!result) continue;

		for (const port of result.ports) {
			const workspace = workspacesById.get(port.workspaceId);
			if (!workspace) continue;

			const dashboardPort: DashboardSidebarPort = {
				...port,
				hostId: result.hostId,
				hostType: result.hostType,
				hostUrl: result.hostUrl,
			};

			const existing = groupMap.get(port.workspaceId);
			if (existing) {
				existing.ports.push(dashboardPort);
			} else {
				groupMap.set(port.workspaceId, {
					workspaceId: port.workspaceId,
					workspaceName: workspace.name,
					hostType: result.hostType,
					ports: [dashboardPort],
				});
			}
		}
	}

	return Array.from(groupMap.values())
		.map((group) => ({
			...group,
			ports: group.ports.sort((a, b) => a.port - b.port),
		}))
		.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
}
