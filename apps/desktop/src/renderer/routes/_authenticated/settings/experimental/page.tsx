import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { ExperimentalSettings } from "./components/experimental-settings";

export const Route = createFileRoute("/_authenticated/settings/experimental/")({
	component: ExperimentalSettingsPage,
});

function ExperimentalSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "experimental",
				searchQuery,
				isV2: true,
			}),
		[searchQuery],
	);

	return <ExperimentalSettings visibleItems={visibleItems} />;
}
