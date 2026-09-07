import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { EmptyProjectModal } from "renderer/routes/_authenticated/components/empty-project-modal";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/template-gallery-modal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { NewProjectModal } from "./components/new-project-modal";

export function AddRepositoryModals() {
	const { t } = useLingui();
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();
	if (active.kind === "none") return null;
	const readyMessage = t({
		id: "dashboard.addRepositoryModals.projectReady",
		message: "Project ready.",
	});

	return (
		<>
			<EmptyProjectModal
				key={`empty-${active.requestId}`}
				requestId={active.requestId}
				open={active.kind === "empty-project"}
				onOpenChange={(open, requestId) => {
					if (!open) close(requestId);
				}}
				onSuccess={(result, requestId) => {
					toast.success(
						result.created
							? t({
									id: "dashboard.addRepositoryModals.emptyProjectCreated",
									message: "Project created.",
								})
							: readyMessage,
					);
					resolveNewProject(requestId, result);
				}}
				onError={(message) =>
					toast.error(
						t({
							id: "dashboard.addRepositoryModals.emptyProjectCreateFailed",
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
			<NewProjectModal
				key={`clone-${active.requestId}`}
				requestId={active.requestId}
				open={active.kind === "new-project"}
				onOpenChange={(open, requestId) => {
					if (!open) close(requestId);
				}}
				onSuccess={(result, requestId) => {
					toast.success(
						result.created
							? t({
									id: "dashboard.addRepositoryModals.newProjectCreated",
									message: "Project created.",
								})
							: readyMessage,
					);
					resolveNewProject(requestId, result);
				}}
				onError={(message) =>
					toast.error(
						t({
							id: "dashboard.addRepositoryModals.newProjectCreateFailed",
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
			<TemplateGalleryModal
				key={`template-${active.requestId}`}
				requestId={active.requestId}
				open={active.kind === "template-gallery"}
				onOpenChange={(open, requestId) => {
					if (!open) close(requestId);
				}}
				onCreated={(result, requestId) => {
					toast.success(
						result.created
							? t({
									id: "dashboard.addRepositoryModals.templateProjectCreated",
									message: "Project created.",
								})
							: readyMessage,
					);
					resolveNewProject(requestId, result);
				}}
				onError={(message) =>
					toast.error(
						t({
							id: "dashboard.addRepositoryModals.templateProjectCreateFailed",
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
		</>
	);
}
