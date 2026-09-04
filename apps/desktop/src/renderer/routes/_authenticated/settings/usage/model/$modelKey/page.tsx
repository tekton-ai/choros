import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider/local-host-service-provider";
import { UsageDrilldownPage } from "../../components/usage-drilldown-page";
import { useRecordUsageSection } from "../../hooks/use-record-usage-section";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/model/$modelKey/",
)({
	component: ModelUsagePage,
});

function ModelUsagePage() {
	const { modelKey } = Route.useParams();
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return (
		<UsageDrilldownPage
			hostUrl={activeHostUrl}
			kind="model"
			entityKey={modelKey}
		/>
	);
}
