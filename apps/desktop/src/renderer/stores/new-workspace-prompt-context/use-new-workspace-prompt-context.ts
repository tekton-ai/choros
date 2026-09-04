import { useEffect, useMemo } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/use-host-target-url";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { buildSubmitPrompt } from "./build-submit-prompt";
import { fetchGitHubIssueBody, fetchPrBody } from "./fetchers";
import { useNewWorkspacePromptContextStore } from "./store";

export interface NewWorkspacePromptContextApi {
	build: (args: {
		userPrompt: string;
		linkedPR: LinkedPR | null;
		linkedIssues: LinkedIssue[];
		timeoutMs: number;
	}) => Promise<string>;
}

export function useNewWorkspacePromptContext(args: {
	projectId: string | null;
	hostId: string | null;
	linkedPR: LinkedPR | null;
	linkedIssues: LinkedIssue[];
}): NewWorkspacePromptContextApi {
	const { projectId, hostId, linkedPR, linkedIssues } = args;
	const { machineId, activeHostUrl } = useLocalHostService();

	const hostUrl = useMemo(() => {
		const id = hostId ?? machineId;
		if (!id) return null;
		return resolveHostUrl({ hostId: id, machineId, activeHostUrl });
	}, [hostId, machineId, activeHostUrl]);

	useEffect(() => {
		if (!projectId || !hostUrl) return;
		const store = useNewWorkspacePromptContextStore.getState();

		if (linkedPR) {
			const prNumber = linkedPR.prNumber;
			store.register(`pr:${prNumber}`, () =>
				fetchPrBody({ prNumber, projectId, hostUrl }),
			);
		}

		for (const issue of linkedIssues) {
			if (issue.source === "github" && issue.number != null) {
				const issueNumber = issue.number;
				store.register(`github-issue:${issueNumber}`, () =>
					fetchGitHubIssueBody({ issueNumber, projectId, hostUrl }),
				);
			}
		}
	}, [projectId, hostUrl, linkedPR, linkedIssues]);

	return useMemo<NewWorkspacePromptContextApi>(
		() => ({
			build: async (buildArgs) => {
				await useNewWorkspacePromptContextStore
					.getState()
					.awaitPending(buildArgs.timeoutMs);
				return buildSubmitPrompt({
					userPrompt: buildArgs.userPrompt,
					linkedPR: buildArgs.linkedPR,
					linkedIssues: buildArgs.linkedIssues,
				});
			},
		}),
		[],
	);
}
