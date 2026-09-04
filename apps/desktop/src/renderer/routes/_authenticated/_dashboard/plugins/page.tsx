import { createFileRoute } from "@tanstack/react-router";
import { PluginsView } from "./components/plugins-view";

export const Route = createFileRoute("/_authenticated/_dashboard/plugins/")({
	component: PluginsPage,
});

function PluginsPage() {
	return <PluginsView />;
}
