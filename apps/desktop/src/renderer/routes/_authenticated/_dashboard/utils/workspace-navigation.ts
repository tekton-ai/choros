import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";
import { requestProfileTarget } from "renderer/routes/_authenticated/components/profile-navigation-controller/profile-navigation-bridge";

export interface V2WorkspaceSearchParams {
	openUrl?: string;
	openUrlTarget?: "current-tab" | "new-tab";
	openUrlRequestId?: string;
}

export function navigateToV2Workspace(
	workspaceId: string,
	navigate: UseNavigateResult<string>,
	options?: Omit<NavigateOptions, "to" | "params" | "search"> & {
		search?: V2WorkspaceSearchParams;
	},
): Promise<void> {
	const { search, ...rest } = options ?? {};
	return navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search: search ?? {},
		...rest,
	});
}

/** CLI/agent browser requests are explicit opens, not ordinary Profile history. */
export function openExplicitV2Workspace(
	workspaceId: string,
	search: V2WorkspaceSearchParams = {},
): void {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value !== undefined) params.set(key, value);
	}
	requestProfileTarget(
		`/v2-workspace/${encodeURIComponent(workspaceId)}${params.size ? `?${params}` : ""}`,
	);
}
