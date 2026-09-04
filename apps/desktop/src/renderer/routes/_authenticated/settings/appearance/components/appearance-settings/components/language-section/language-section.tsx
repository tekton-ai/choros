import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@choros/i18n";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@choros/ui/select";
import { toast } from "@choros/ui/sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/highlight-text";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

const AUTO = "auto";

export function LanguageSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	const setLanguage = electronTrpc.settings.setLanguage.useMutation({
		onSuccess: async () => {
			await utils.settings.getLanguage.invalidate();
		},
		onError: () =>
			toast.error(
				t({
					id: "settings.appearance.language.updateFailed",
					message: "Failed to update language",
				}),
			),
	});

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<HighlightText
						text={t({
							id: "settings.appearance.language.label",
							message: "Language",
						})}
						query={searchQuery}
					/>
				</div>
				<div className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							id: "settings.appearance.language.hint",
							message:
								"App display language. Auto follows your system language.",
						})}
						query={searchQuery}
					/>
				</div>
			</div>
			<Select
				value={language ?? AUTO}
				onValueChange={(value) =>
					setLanguage.mutate({ language: value === AUTO ? null : value })
				}
			>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={AUTO}>
						<Trans id="settings.appearance.language.auto">Auto (system)</Trans>
					</SelectItem>
					{SUPPORTED_LOCALES.map((locale) => (
						<SelectItem key={locale} value={locale}>
							{LOCALE_LABELS[locale]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
