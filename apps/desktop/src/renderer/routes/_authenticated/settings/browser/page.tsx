import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { BrowserSettings } from "./components/browser-settings";

export const Route = createFileRoute("/_authenticated/settings/browser/")({
	component: BrowserSettingsPage,
});

function BrowserSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "browser",
				searchQuery,
				isV2: true,
			}),
		[searchQuery],
	);

	return <BrowserSettings visibleItems={visibleItems} />;
}
