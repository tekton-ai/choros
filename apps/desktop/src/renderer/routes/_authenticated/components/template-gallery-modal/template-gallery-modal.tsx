import { errorMessage } from "@choros/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@choros/ui/dialog";
import { toast } from "@choros/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import {
	type FinalizedProjectSetupResult,
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useProjectModalRequest } from "renderer/routes/_authenticated/_dashboard/components/add-repository-modals/hooks/use-project-modal-request/use-project-modal-request";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { TemplateCard } from "./components/template-card";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

interface TemplateGalleryModalProps {
	requestId: string;
	open: boolean;
	onOpenChange: (open: boolean, requestId: string) => void;
	onCreated: (result: FinalizedProjectSetupResult, requestId: string) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

export function TemplateGalleryModal({
	requestId,
	open,
	onOpenChange,
	onCreated,
	onError,
}: TemplateGalleryModalProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const { captureSubmission } = useProfiles();
	const isCurrentRequest = useProjectModalRequest(requestId, open);
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.choros/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);

	const handleSelect = async (template: ProjectTemplate) => {
		if (!template.repo || cloningId) return;
		const profileContext = captureSubmission();
		if (!parentDir) {
			const message = "Projects directory not ready yet.";
			if (onError) onError(message);
			else toast.error("Could not create project", { description: message });
			return;
		}
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "createProject",
			});
			return;
		}
		setCloningId(template.id);
		let result: ProjectSetupResult;
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			result = await client.project.create.mutate({
				name: deriveProjectNameFromUrl(template.repo),
				mode: { kind: "template", parentDir, url: template.repo },
			});
		} catch (err) {
			const message = errorMessage(err);
			if (onError) onError(message);
			else toast.error("Could not create project", { description: message });
			if (isCurrentRequest(requestId)) setCloningId(null);
			return;
		}
		const finalized = await finalizeSetup(
			activeHostUrl,
			result,
			profileContext,
		);
		onCreated(finalized, requestId);
		if (isCurrentRequest(requestId)) {
			setCloningId(null);
			onOpenChange(false, requestId);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && cloningId) return;
		onOpenChange(next, requestId);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent
				className="sm:max-w-5xl"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Start from a template</DialogTitle>
					<DialogDescription>
						Scaffold a new project from a starter, cloned with a fresh git
						history.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-3 gap-3">
					{PROJECT_TEMPLATES.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							cloning={cloningId === template.id}
							disabled={cloningId !== null || !parentDir}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
