import type { SelectInvitation } from "@choros/db/schema";
import { errorMessage } from "@choros/i18n/errors";
import { Button } from "@choros/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { toast } from "@choros/ui/sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineXMark } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";

interface InvitationActionsProps {
	invitation: SelectInvitation;
}

export function InvitationActions({ invitation }: InvitationActionsProps) {
	const { t } = useLingui();
	const [isCanceling, setIsCanceling] = useState(false);

	const handleCancel = async () => {
		setIsCanceling(true);
		try {
			await authClient.organization.cancelInvitation({
				invitationId: invitation.id,
			});
			toast.success(
				t({
					id: "settings.team.invitationCanceledToast",
					message: "Invitation canceled",
				}),
			);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						id: "settings.team.invitationCancelFailedToast",
						message: "Failed to cancel invitation",
					}),
				),
			);
		} finally {
			setIsCanceling(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<HiEllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onSelect={handleCancel}
					disabled={isCanceling}
					className="text-destructive gap-2"
				>
					<HiOutlineXMark className="h-4 w-4" />
					<Trans id="settings.team.invitationCancel">Cancel</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
