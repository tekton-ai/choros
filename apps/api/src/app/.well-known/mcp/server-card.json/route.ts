import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@choros/mcp";
import { getRequestOrigin } from "@/lib/oauth-metadata";

async function listTools() {
	const server = createMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "server-card", version: "1.0.0" });
	try {
		await client.connect(clientTransport);
		const { tools } = await client.listTools();
		return tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			...(tool.annotations ? { annotations: tool.annotations } : {}),
			inputSchema: tool.inputSchema,
		}));
	} finally {
		await client.close();
		await server.close();
	}
}

export async function GET(request: Request): Promise<Response> {
	const origin = getRequestOrigin(request);

	const card = {
		name: "choros",
		title: "Choros",
		icon: "https://choros.sh/apple-touch-icon.png",
		description:
			"Choros MCP server: create Git-worktree workspaces, launch coding-agent sessions, schedule automations, open terminals, and manage tasks on behalf of a Choros user.",
		version: "0.1.0",
		serverUrl: `${origin}/mcp`,
		transport: "streamable-http",
		documentationUrl: "https://docs.choros.sh/mcp-server",
		authentication: {
			type: "oauth2",
			resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
			description:
				"OAuth 2.1 authorization code + PKCE with RFC 7591 dynamic client registration, or a user-issued Choros API key as a Bearer token. Walkthrough: https://choros.sh/auth.md",
		},
		tools: await listTools(),
	};

	return Response.json(card, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
