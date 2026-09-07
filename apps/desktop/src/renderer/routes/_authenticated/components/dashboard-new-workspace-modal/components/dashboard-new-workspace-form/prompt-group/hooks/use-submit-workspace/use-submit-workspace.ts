import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import type { NewWorkspacePromptContextApi } from "renderer/stores/new-workspace-prompt-context";
import { usePromptHistoryStore } from "renderer/stores/prompt-history";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { useWorkspaceCreateNavigation } from "renderer/stores/workspace-creates/use-workspace-create-navigation";
import { useDashboardNewWorkspaceDraft } from "../../../../../dashboard-new-workspace-draft-context";
import type { WorkspaceCreateAgent } from "../../types";
import type { UseUploadAttachmentsApi } from "../use-upload-attachments";
import { resolveNames } from "./resolve-names";

/**
 * Submits a workspace create against the new `workspaces.create` host
 * procedure. Attachment uploads run optimistically through `useUploadAttachments`
 * — submit only blocks on whatever uploads are still in flight, then dispatches
 * the create with the resulting `attachmentIds` on the agent launch sugar.
 */
export function useSubmitWorkspace(
	projectId: string | null,
	selectedAgent: WorkspaceCreateAgent,
	selectedModel: string | null,
	selectedEffort: string | null,
	selectedMode: string | null,
	uploadAttachments: UseUploadAttachmentsApi,
	promptContext: NewWorkspacePromptContextApi,
) {
	const { t } = useLingui();
	const beginNavigation = useWorkspaceCreateNavigation();
	const { closeAndResetDraft, draft } = useDashboardNewWorkspaceDraft();
	const { submit } = useWorkspaceCreates();
	const { machineId } = useLocalHostService();

	const isSession = draft.isSession;

	const submitWorkspace = useCallback(async () => {
		const navigation = beginNavigation();
		if (!projectId && !isSession) {
			toast.error(
				t({
					id: "dashboard.newWorkspaceModal.submit.selectProjectFirst",
					message: "Select a project first",
				}),
			);
			return;
		}
		if (isSession && draft.linkedPR !== null) {
			toast.error(
				t({
					id: "dashboard.newWorkspaceModal.submit.prRequiresProject",
					message: "Checking out a PR requires a project",
				}),
			);
			return;
		}

		const hostId = draft.hostId ?? machineId;
		if (!hostId) {
			toast.error(
				t({
					id: "dashboard.newWorkspaceModal.submit.noActiveHost",
					message: "No active host",
				}),
			);
			return;
		}

		const { readyIds: attachmentIds, errors } =
			await uploadAttachments.awaitUploads();
		if (errors.length > 0) {
			const first = errors[0];
			toast.error(
				first.filename
					? t({
							id: "dashboard.newWorkspaceModal.submit.attachmentUploadFailedNamed",
							message: `Attachment upload failed (${first.filename}): ${first.message}`,
						})
					: t({
							id: "dashboard.newWorkspaceModal.submit.attachmentUploadFailed",
							message: `Attachment upload failed: ${first.message}`,
						}),
			);
			return;
		}

		const { branchName, workspaceName } = resolveNames(draft);

		const isPrCheckout = draft.linkedPR !== null;

		const linkedTaskId = draft.linkedIssues.find(
			(issue) => issue.source === "internal" && issue.taskId,
		)?.taskId;

		const hasAnyContext =
			!!draft.prompt.trim() ||
			draft.linkedPR !== null ||
			draft.linkedIssues.length > 0 ||
			attachmentIds.length > 0;
		const wantAgent = selectedAgent !== "none" && hasAnyContext;

		const finalPrompt = wantAgent
			? await promptContext.build({
					userPrompt: draft.prompt,
					linkedPR: draft.linkedPR,
					linkedIssues: draft.linkedIssues,
					timeoutMs: 2000,
				})
			: null;

		const agents = wantAgent
			? [
					{
						agent: selectedAgent,
						prompt: finalPrompt ?? "",
						attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
						model: selectedModel ?? undefined,
						effort: selectedEffort ?? undefined,
						mode: selectedMode ?? undefined,
					},
				]
			: undefined;

		// PR path supplies a name (PR title) so the in-flight UI has
		// something to show immediately. Branch path leaves both `name`
		// and `branch` undefined when the user didn't type — a typed name
		// seeds the branch slug; otherwise the server creates with a
		// friendly random and AI-renames once names arrive.
		const prName = isPrCheckout
			? draft.linkedPR?.title || `PR #${draft.linkedPR?.prNumber}`
			: undefined;

		const trimmedPrompt = draft.prompt.trim();
		const workspaceId = crypto.randomUUID();
		const snapshot = isSession
			? {
					id: workspaceId,
					projectId: null,
					name: workspaceName ?? undefined,
					agents,
					namingPrompt: !wantAgent && trimmedPrompt ? trimmedPrompt : undefined,
				}
			: {
					id: workspaceId,
					projectId: projectId as string,
					name: isPrCheckout ? prName : (workspaceName ?? undefined),
					branch: isPrCheckout ? undefined : (branchName ?? undefined),
					skipBranchPrefix:
						!isPrCheckout && branchName !== null && draft.branchNameFromProvider
							? true
							: undefined,
					pr: isPrCheckout ? draft.linkedPR?.prNumber : undefined,
					baseBranch: draft.baseBranch ?? undefined,
					taskId: linkedTaskId,
					agents,
					namingPrompt:
						!isPrCheckout && !wantAgent && trimmedPrompt
							? trimmedPrompt
							: undefined,
				};

		if (trimmedPrompt) {
			usePromptHistoryStore.getState().recordPrompt(trimmedPrompt);
		}

		const handle = submit({
			hostId,
			snapshot,
			profileContext: navigation.profileContext,
		});
		void navigation.follow(handle, closeAndResetDraft).catch((error) => {
			console.error("[useSubmitWorkspace] failed to open workspace", error);
		});
	}, [
		closeAndResetDraft,
		draft,
		isSession,
		beginNavigation,
		machineId,
		projectId,
		promptContext,
		selectedAgent,
		selectedModel,
		selectedEffort,
		selectedMode,
		submit,
		t,
		uploadAttachments,
	]);

	return { submitWorkspace, isCreating: false };
}
