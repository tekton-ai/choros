import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import {
	parseV2ResourceSessions,
	type WorkspaceSessionMap,
} from "./session-normalization";

export type ResourceMetricsSurface = "v2";

export interface WorkspaceMetadata {
	workspaceName: string;
	projectId: string;
	projectName: string;
}

const RESOURCE_SESSIONS_FETCH_TIMEOUT_MS = 2500;

function isAbortError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"name" in error &&
		(error as { name?: unknown }).name === "AbortError"
	);
}

function mergeWorkspaceSessionMaps(
	target: WorkspaceSessionMap,
	source: WorkspaceSessionMap,
): void {
	for (const [workspaceId, entries] of source) {
		const targetEntries = target.get(workspaceId);
		if (targetEntries) {
			targetEntries.push(...entries);
		} else {
			target.set(workspaceId, [...entries]);
		}
	}
}

async function collectV2WorkspaceSessionMap(): Promise<WorkspaceSessionMap> {
	const workspaceSessionMap: WorkspaceSessionMap = new Map();
	const connection = getHostServiceCoordinator().getConnection();
	if (!connection) return workspaceSessionMap;

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		RESOURCE_SESSIONS_FETCH_TIMEOUT_MS,
	);
	try {
		const response = await fetch(
			`http://127.0.0.1:${connection.port}/terminal/resource-sessions`,
			{
				headers: { Authorization: `Bearer ${connection.secret}` },
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			console.warn(
				`[resource-metrics] Failed to list terminal resource sessions: ${response.status}`,
			);
			return workspaceSessionMap;
		}
		mergeWorkspaceSessionMaps(
			workspaceSessionMap,
			parseV2ResourceSessions(await response.json()),
		);
	} catch (error) {
		console.warn(
			isAbortError(error)
				? "[resource-metrics] Timed out listing terminal resource sessions"
				: "[resource-metrics] Failed to list terminal resource sessions",
			error,
		);
	} finally {
		clearTimeout(timeoutId);
	}
	return workspaceSessionMap;
}

export function collectWorkspaceSessionMap(): Promise<WorkspaceSessionMap> {
	return collectV2WorkspaceSessionMap();
}

export function getWorkspaceMetadata(_workspaceId: string): WorkspaceMetadata {
	return {
		workspaceName: `Workspace ${_workspaceId.slice(0, 8)}`,
		projectId: "v2",
		projectName: "V2 Workspaces",
	};
}
