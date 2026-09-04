import { createFileRoute } from "@tanstack/react-router";
import { UsageResourcesPage } from "../components/usage-resources-page";
import { useRecordUsageSection } from "../hooks/use-record-usage-section";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/resources/",
)({
	component: ResourcesPage,
});

function ResourcesPage() {
	useRecordUsageSection("resources");

	return <UsageResourcesPage />;
}
