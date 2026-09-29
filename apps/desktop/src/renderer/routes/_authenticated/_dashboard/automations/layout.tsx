import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Redirect } from "renderer/components/redirect";
import { useAutomationsExperimentEnabled } from "renderer/stores/automations-experiment";

export const Route = createFileRoute("/_authenticated/_dashboard/automations")({
	component: AutomationsLayout,
});

function AutomationsLayout() {
	const enabled = useAutomationsExperimentEnabled();
	if (!enabled) return <Redirect to="/settings/experimental" replace />;
	return <Outlet />;
}
