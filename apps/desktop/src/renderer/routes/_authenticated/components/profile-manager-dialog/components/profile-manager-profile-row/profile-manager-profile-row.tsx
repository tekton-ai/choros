import { formatNumber } from "@choros/i18n/format";
import { Button } from "@choros/ui/button";
import { cn } from "@choros/ui/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { LuArrowDown, LuArrowUp, LuPencil, LuTrash2 } from "react-icons/lu";
import type { ProfileDefinition } from "shared/profiles";

export function ProfileManagerProfileRow({
	profile,
	selected,
	projects,
	sessions,
	disabled,
	first,
	last,
	onSelect,
	onRename,
	onDelete,
	onReorder,
}: {
	profile: ProfileDefinition;
	selected: boolean;
	projects: number;
	sessions: number;
	disabled: boolean;
	first: boolean;
	last: boolean;
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
	onReorder: (direction: -1 | 1) => void;
}) {
	const { t } = useLingui();
	return (
		<div
			className={cn(
				"flex items-center gap-1 rounded-md p-1",
				selected && "bg-fill-selected",
			)}
		>
			<button
				type="button"
				aria-pressed={selected}
				onClick={onSelect}
				title={profile.name}
				className="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span className="block truncate text-sm font-medium">
					{profile.name}
				</span>
				{profile.isDefault && (
					<span className="text-xs text-muted-foreground">
						<Trans id="profiles.manager.defaultBadge">Default</Trans> ·{" "}
					</span>
				)}
				<span className="text-xs text-muted-foreground">
					<Trans id="profiles.manager.profileCounts">
						Projects: {formatNumber(projects)} · Sessions:{" "}
						{formatNumber(sessions)}
					</Trans>
				</span>
			</button>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0"
				disabled={disabled || first}
				onClick={() => onReorder(-1)}
				title={t({
					id: "profiles.manager.moveUp",
					message: `Move ${profile.name} up`,
				})}
				aria-label={t({
					id: "profiles.manager.moveUp",
					message: `Move ${profile.name} up`,
				})}
			>
				<LuArrowUp className="size-3.5" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0"
				disabled={disabled || last}
				onClick={() => onReorder(1)}
				title={t({
					id: "profiles.manager.moveDown",
					message: `Move ${profile.name} down`,
				})}
				aria-label={t({
					id: "profiles.manager.moveDown",
					message: `Move ${profile.name} down`,
				})}
			>
				<LuArrowDown className="size-3.5" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0"
				disabled={disabled}
				onClick={onRename}
				title={t({
					id: "profiles.manager.rename",
					message: `Rename ${profile.name}`,
				})}
				aria-label={t({
					id: "profiles.manager.rename",
					message: `Rename ${profile.name}`,
				})}
			>
				<LuPencil className="size-3.5" />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0"
				disabled={disabled || profile.isDefault}
				onClick={onDelete}
				title={t({
					id: "profiles.manager.delete",
					message: `Delete ${profile.name}`,
				})}
				aria-label={t({
					id: "profiles.manager.delete",
					message: `Delete ${profile.name}`,
				})}
			>
				<LuTrash2 className="size-3.5" />
			</Button>
		</div>
	);
}
