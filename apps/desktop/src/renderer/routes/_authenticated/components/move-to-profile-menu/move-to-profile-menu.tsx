import {
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@choros/ui/context-menu";
import { Trans } from "@lingui/react/macro";
import { LuFolderInput } from "react-icons/lu";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import type { ProfileMemberRef } from "shared/profiles";

export function MoveToProfileMenu({ member }: { member: ProfileMemberRef }) {
	const {
		available,
		isReady,
		profiles,
		getProjectProfileId,
		getWorkspaceProfileId,
		moveMembers,
	} = useProfiles();
	const currentProfileId =
		member.kind === "project"
			? getProjectProfileId(member.projectKey)
			: getWorkspaceProfileId({
					id: member.workspaceId,
					hostId: member.hostId,
					projectId: null,
				});
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger disabled={!available || !isReady}>
				<LuFolderInput className="size-4 mr-2" />
				<Trans id="profiles.move.menu">Move to Profile</Trans>
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="max-h-80 w-64 overflow-y-auto">
				<ContextMenuRadioGroup
					value={currentProfileId}
					onValueChange={(profileId) => {
						if (profileId !== currentProfileId)
							void moveMembers([member], profileId);
					}}
				>
					{profiles.map((profile) => (
						<ContextMenuRadioItem
							key={profile.id}
							value={profile.id}
							title={profile.name}
						>
							<span className="truncate">{profile.name}</span>
						</ContextMenuRadioItem>
					))}
				</ContextMenuRadioGroup>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}
