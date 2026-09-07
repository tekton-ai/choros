import { formatNumber } from "@choros/i18n/format";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@choros/ui/alert-dialog";
import { Button } from "@choros/ui/button";
import { Trans } from "@lingui/react/macro";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import type { ProfileDefinition } from "shared/profiles";

export function ProfileDeleteDialog({
	profile,
	defaultName,
	projects,
	sessions,
	pending,
	onClose,
	onConfirm,
}: {
	profile: ProfileDefinition | null;
	defaultName: string;
	projects: number;
	sessions: number;
	pending: boolean;
	onClose: () => void;
	onConfirm: (moveToDefault: boolean) => void;
}) {
	const { available, isReady } = useProfiles();
	const nonempty = projects + sessions > 0;
	return (
		<AlertDialog
			open={profile !== null}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans id="profiles.delete.title">
							Delete Profile “{profile?.name}”?
						</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>
								<Trans id="profiles.delete.counts">
									Projects: {formatNumber(projects)}; independent sessions:{" "}
									{formatNumber(sessions)}. Counts include saved members that
									are currently unavailable.
								</Trans>
							</p>
							{nonempty ? (
								<p>
									<Trans id="profiles.delete.moveWarning">
										All members will move to the default Profile “{defaultName}”
										before this Profile is deleted. Project workspaces and their
										running content follow the project. Terminals, agents, and
										development servers will not stop.
									</Trans>
								</p>
							) : (
								<p>
									<Trans id="profiles.delete.emptyWarning">
										This empty Profile will be deleted. Your projects and
										running work will not be stopped.
									</Trans>
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" disabled={pending} onClick={onClose}>
						<Trans id="profiles.delete.cancel">Cancel</Trans>
					</Button>
					<Button
						variant="destructive"
						disabled={
							pending || !available || !isReady || !profile || profile.isDefault
						}
						onClick={() => onConfirm(nonempty)}
					>
						{nonempty ? (
							<Trans id="profiles.delete.moveAndDelete">
								Move all to Default and delete
							</Trans>
						) : (
							<Trans id="profiles.delete.confirm">Delete Profile</Trans>
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
