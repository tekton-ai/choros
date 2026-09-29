import { createFileRoute } from "@tanstack/react-router";
import { AutomationsView } from "./components/automations-view";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

function AutomationsPage() {
	return <AutomationsView />;
}
