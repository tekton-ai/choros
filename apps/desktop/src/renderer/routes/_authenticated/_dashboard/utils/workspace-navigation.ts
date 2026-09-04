import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";

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
