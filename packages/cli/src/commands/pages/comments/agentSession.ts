export function agentSessionId(): string | undefined {
	return process.env.CHOROS_PANE_ID || process.env.CHOROS_TERMINAL_ID;
}
