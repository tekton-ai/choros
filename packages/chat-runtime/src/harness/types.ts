import type {
	Decision,
	Delta,
	Item,
	SessionState,
	Turn,
	UserContent,
} from "@choros/chat/protocol";

import type { ZodObject, ZodRawShape } from "zod";

export type HarnessToolCallContext = {
	callId: string;
	providerSessionId?: string;
	providerTurnId?: string;
};

export type HarnessToolDefinition<Shape extends ZodRawShape = ZodRawShape> = {
	name: string;
	description: string;
	inputSchema: ZodObject<Shape>;
	requiresApproval?: boolean;
	handler(
		input: Record<string, unknown>,
		context: HarnessToolCallContext,
	): Promise<unknown>;
};

export type HarnessObserver = {
	onEvent?(event: AdapterEvent): void | Promise<void>;
};

export type AdapterEvent =
	| { kind: "item"; item: Item; turnId: string }
	| { kind: "delta"; delta: Delta }
	| { kind: "turn"; turn: Turn }
	| { kind: "session"; session: Partial<SessionState> };

export type HarnessStartOptions = {
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
	env?: Record<string, string>;
	instructions?: string;
	tools?: HarnessToolDefinition[];
	observer?: HarnessObserver;
};

export interface HarnessAdapter {
	start(options: HarnessStartOptions): AsyncIterable<AdapterEvent>;
	prompt(content: UserContent[]): void;
	cancelTurn(): void | Promise<void>;
	respondToApproval(approvalId: string, decision: Decision): void;
	setMode(modeId: string): void;
	dispose(): Promise<{ quiescent: boolean }>;
}
