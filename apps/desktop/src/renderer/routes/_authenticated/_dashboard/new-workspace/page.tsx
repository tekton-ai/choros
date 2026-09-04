import { PromptInputProvider } from "@choros/ui/ai-elements/prompt-input";
import { createFileRoute } from "@tanstack/react-router";
import { NewWorkspaceScreen } from "renderer/routes/_authenticated/components/dashboard-new-workspace-modal/components/new-workspace-screen";
import { DashboardNewWorkspaceDraftProvider } from "renderer/routes/_authenticated/components/dashboard-new-workspace-modal/dashboard-new-workspace-draft-context";
import { newWorkspaceAttachmentsStore } from "renderer/stores/new-workspace-attachments";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/new-workspace/",
)({
	validateSearch: (
		search: Record<string, unknown>,
	): { projectId?: string; session?: boolean } => ({
		projectId:
			typeof search.projectId === "string" ? search.projectId : undefined,
		session: search.session === true ? true : undefined,
	}),
	component: NewWorkspacePage,
});

/**
 * Experiment test arm (new-workspace-screen): the create surface as a real
 * route. Store opens are redirected here by DashboardNewWorkspaceModal.
 */
function NewWorkspacePage() {
	const { projectId, session } = Route.useSearch();
	return (
		<DashboardNewWorkspaceDraftProvider onClose={() => {}}>
			<PromptInputProvider attachmentsStore={newWorkspaceAttachmentsStore}>
				<NewWorkspaceScreen
					isOpen
					preSelectedProjectId={projectId ?? null}
					preSelectedSession={session === true}
				/>
				{/* Window-drag surface replacing the hidden TopBar's drag region.
				    Stops short of the top-right corner so the screen's naming
				    instructions + prompt history buttons underneath stay
				    clickable. */}
				<div className="drag absolute left-0 right-20 top-0 z-50 h-12" />
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
