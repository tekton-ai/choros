import { createFileRoute } from "@tanstack/react-router";
import { AutomationRunView } from "./components/automation-run-view";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/runs/$runId/",
)({ component: AutomationRunPage });

function AutomationRunPage() {
	const { runId } = Route.useParams();
	return <AutomationRunView runId={runId} />;
}
