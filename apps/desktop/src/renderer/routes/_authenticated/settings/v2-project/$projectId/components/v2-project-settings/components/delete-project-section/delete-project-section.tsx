import { errorMessage } from "@choros/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@choros/ui/alert-dialog";
import { Button } from "@choros/ui/button";
import { toast } from "@choros/ui/sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/use-host-target-url";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
	hostIds: string[];
}

export function DeleteProjectSection({
	projectId,
	projectName,
	hostIds,
}: DeleteProjectSectionProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const hostUrl = useHostUrls(hostIds).find((host) => host.url)?.url ?? null;
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (!hostUrl) {
			toast.error(
				t({
					id: "settings.project.delete.localHostUnavailableToast",
					message: "The local host service is unavailable",
				}),
			);
			return;
		}
		setIsDeleting(true);
		try {
			await getHostServiceClientByUrl(hostUrl).project.remove.mutate({
				projectId,
			});
			toast.success(
				t({
					id: "settings.project.delete.successToast",
					message: `Deleted "${projectName}"`,
				}),
			);
			setIsOpen(false);
			await navigate({ to: "/settings/projects" });
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						id: "settings.project.delete.failedToast",
						message: "Failed to delete",
					}),
				),
			);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1 text-sm font-medium">
				<Trans id="settings.project.delete.label">Delete project</Trans>
			</div>
			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="destructive" size="sm">
						<Trans id="settings.project.delete.button">Delete project</Trans>
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans id="settings.project.delete.confirmTitle">
								Delete "{projectName}"?
							</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans id="settings.project.delete.confirmLocalDescription">
								This removes the project and its Choros workspace records from
								this device. This cannot be undone.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>
							<Trans id="settings.project.delete.cancel">Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isDeleting}
							onClick={(event) => {
								event.preventDefault();
								void handleDelete();
							}}
						>
							<Trans id="settings.project.delete.confirmAction">Delete</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
