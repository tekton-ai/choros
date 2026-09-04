import { getPluginByName } from "@choros/shared/plugins";
import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/redirect";
import { PluginDetail } from "./components/plugin-detail";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/plugins/$pluginName/",
)({
	component: PluginDetailPage,
});

function PluginDetailPage() {
	const { pluginName } = Route.useParams();
	const plugin = getPluginByName(pluginName);

	if (!plugin) return <Redirect to="/plugins" />;

	return <PluginDetail plugin={plugin} />;
}
