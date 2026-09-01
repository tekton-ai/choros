import { getRequestOrigin } from "@/lib/oauth-metadata";

export function GET(request: Request): Response {
	const origin = getRequestOrigin(request);

	return Response.json(
		{
			servers: [
				{
					name: "choros",
					description:
						"Choros MCP server — orchestrate parallel coding agents, workspaces, automations, and tasks.",
					url: `${origin}/mcp`,
					transport: "streamable-http",
					serverCard: `${origin}/.well-known/mcp/server-card.json`,
					authentication: {
						type: "oauth2",
						resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
					},
					documentation: "https://docs.choros.sh/mcp-server",
				},
				{
					name: "choros-docs",
					description:
						"Choros documentation over MCP — search and read docs pages.",
					url: "https://docs.choros.sh/mcp",
					transport: "streamable-http",
					authentication: { type: "none" },
				},
			],
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
			},
		},
	);
}
