import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider/local-host-service-provider";
import { UsageWorkspacesPage } from "../components/usage-workspaces-page";
import { useRecordUsageSection } from "../hooks/use-record-usage-section";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/workspaces/",
)({
	component: WorkspacesUsagePage,
});

function WorkspacesUsagePage() {
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return <UsageWorkspacesPage hostUrl={activeHostUrl} />;
}
