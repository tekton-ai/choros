import { query } from "@anthropic-ai/claude-agent-sdk";
import type { HarnessAdapter } from "../../types";
import { ClaudeAdapter } from "../claude-adapter";

/**
 * The one place the real SDK is wired in: everything else takes `query`
 * injected so tests never spawn a Claude Code process.
 */
export function createClaudeAdapter(options?: {
	pathToClaudeCodeExecutable?: string;
}): HarnessAdapter {
	return new ClaudeAdapter({
		query,
		pathToClaudeCodeExecutable: options?.pathToClaudeCodeExecutable,
	});
}
