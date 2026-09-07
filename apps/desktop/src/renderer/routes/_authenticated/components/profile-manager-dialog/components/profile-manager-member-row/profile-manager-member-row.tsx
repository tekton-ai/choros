import { Checkbox } from "@choros/ui/checkbox";
import { Trans, useLingui } from "@lingui/react/macro";
import { LuFolder, LuMessageSquare } from "react-icons/lu";
import type { ProfileManagerMember } from "../../utils/profile-manager-members";
import { ProfileDestinationSelect } from "../profile-destination-select";

export function ProfileManagerMemberRow({
	item,
	checked,
	disabled,
	onCheck,
	onMove,
}: {
	item: ProfileManagerMember;
	checked: boolean;
	disabled: boolean;
	onCheck: (checked: boolean) => void;
	onMove: (profileId: string) => void;
}) {
	const { t } = useLingui();
	const kind =
		item.member.kind === "project"
			? t({ id: "profiles.manager.project", message: "Project" })
			: t({ id: "profiles.manager.session", message: "Session" });
	const name = item.name ?? kind;
	const Icon = item.member.kind === "project" ? LuFolder : LuMessageSquare;
	return (
		<div className="flex items-center gap-3 border-b border-border/50 px-1 py-2 last:border-0">
			<Checkbox
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheck(value === true)}
				aria-label={t({
					id: "profiles.manager.selectMember",
					message: `Select ${name}: ${item.detail}`,
				})}
			/>
			<Icon
				className="size-4 shrink-0 text-muted-foreground"
				aria-label={kind}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm" title={name}>
					{name}
				</p>
				<p
					className="truncate text-xs text-muted-foreground"
					title={item.detail}
				>
					{item.detail}
				</p>
				{item.unavailable && (
					<p className="text-xs text-muted-foreground">
						<Trans id="profiles.manager.memberUnavailable">
							Unavailable — saved ownership is retained
						</Trans>
					</p>
				)}
			</div>
			<ProfileDestinationSelect
				value={item.profileId}
				disabled={disabled}
				onChange={onMove}
				label={t({
					id: "profiles.manager.memberProfile",
					message: `Profile for ${name}`,
				})}
			/>
		</div>
	);
}
