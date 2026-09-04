import { HighlightText } from "renderer/routes/_authenticated/settings/components/highlight-text";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface SettingRowProps {
	label: string;
	hint?: string;
	children: React.ReactNode;
}

export function SettingRow({ label, hint, children }: SettingRowProps) {
	const searchQuery = useSettingsSearchQuery();
	return (
		<div className="flex items-center justify-between gap-8">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<HighlightText text={label} query={searchQuery} />
				</div>
				{hint && (
					<div className="mt-0.5 text-xs text-muted-foreground">
						<HighlightText text={hint} query={searchQuery} />
					</div>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
