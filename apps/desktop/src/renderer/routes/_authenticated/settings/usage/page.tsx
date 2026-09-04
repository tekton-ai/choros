import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider/local-host-service-provider";
import { UsageView } from "./components/usage-view";
import { useRecordUsageSection } from "./hooks/use-record-usage-section";

export const Route = createFileRoute("/_authenticated/settings/usage/")({
	component: UsagePage,
});

function UsagePage() {
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return <UsageView hostUrl={activeHostUrl} />;
}
