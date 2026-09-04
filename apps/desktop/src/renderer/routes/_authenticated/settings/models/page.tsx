import { ChatServiceProvider } from "@choros/provider-auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { createChatServiceIpcClient } from "renderer/components/provider-auth/provider-auth-client";
import { electronQueryClient } from "renderer/providers/electron-trpc-provider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ModelsSettings } from "./components/models-settings";

export const Route = createFileRoute("/_authenticated/settings/models/")({
	component: ModelsSettingsPage,
});

const chatServiceIpcClient = createChatServiceIpcClient();

function ModelsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "models").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<ChatServiceProvider
			client={chatServiceIpcClient}
			queryClient={electronQueryClient}
		>
			<ModelsSettings visibleItems={visibleItems} />
		</ChatServiceProvider>
	);
}
