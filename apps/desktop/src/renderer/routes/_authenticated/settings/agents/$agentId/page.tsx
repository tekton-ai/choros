import { createFileRoute } from "@tanstack/react-router";
import { AgentsSettingsPage } from "../components/agents-settings-page";

export const Route = createFileRoute(
	"/_authenticated/settings/agents/$agentId/",
)({
	component: AgentSettingsRoute,
});

function AgentSettingsRoute() {
	const { agentId } = Route.useParams();
	return <AgentsSettingsPage initialAgentId={agentId} />;
}
