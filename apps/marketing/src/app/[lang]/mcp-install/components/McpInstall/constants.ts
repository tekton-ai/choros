import { MCP_SERVER_URL } from "@/lib/api-url";

export interface McpInstallTab {
	id: string;
	label: string;
	kind: "cli" | "config";
	content: string;
	filename?: string;
}

export const DEFAULT_MCP_INSTALL_TAB: McpInstallTab = {
	id: "claude-code",
	label: "Claude Code",
	kind: "cli",
	content: `claude mcp add choros --transport http ${MCP_SERVER_URL}`,
};

export const MCP_INSTALL_TABS: McpInstallTab[] = [
	DEFAULT_MCP_INSTALL_TAB,
	{
		id: "codex",
		label: "Codex",
		kind: "cli",
		content: `codex mcp add choros --url ${MCP_SERVER_URL}`,
	},
	{
		id: "gemini",
		label: "Gemini CLI",
		kind: "cli",
		content: `gemini mcp add --transport http choros ${MCP_SERVER_URL}`,
	},
	{
		id: "amp",
		label: "Amp CLI",
		kind: "cli",
		content: `amp mcp add --workspace choros ${MCP_SERVER_URL}`,
	},
	{
		id: "claude-desktop",
		label: "Claude Desktop",
		kind: "config",
		filename: "claude_desktop_config.json",
		content: `{
  "mcpServers": {
    "choros": {
      "type": "http",
      "url": "${MCP_SERVER_URL}"
    }
  }
}`,
	},
	{
		id: "cursor",
		label: "Cursor",
		kind: "config",
		filename: ".cursor/mcp.json",
		content: `{
  "mcpServers": {
    "choros": {
      "url": "${MCP_SERVER_URL}"
    }
  }
}`,
	},
];
