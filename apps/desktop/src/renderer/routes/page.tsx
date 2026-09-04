import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/redirect";

export const Route = createFileRoute("/")({
	component: RootIndexPage,
});

function RootIndexPage() {
	return <Redirect to="/v2-workspaces" replace />;
}
