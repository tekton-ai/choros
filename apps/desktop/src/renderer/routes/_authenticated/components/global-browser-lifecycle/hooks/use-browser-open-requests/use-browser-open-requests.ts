import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { openExplicitV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface BrowserOpenRequest {
	workspaceId: string;
	url: string;
	target: "current-tab" | "new-tab";
	requestId: string;
}

/**
 * Consumes external browser-open requests (CLI/agents via the browser
 * bridge). Navigating with the openUrl search params reuses the exact flow
 * the ports sidebar uses — the workspace route's useConsumeOpenUrlRequest
 * creates the pane, and its webview registration answers the bridge.
 */
export function useBrowserOpenRequests() {
	useEffect(() => {
		const subscription = electronTrpcClient.browser.onOpenRequest.subscribe(
			undefined,
			{
				onData: (request: BrowserOpenRequest) => {
					openExplicitV2Workspace(request.workspaceId, {
						openUrl: request.url,
						openUrlTarget: request.target,
						openUrlRequestId: request.requestId,
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, []);
}
