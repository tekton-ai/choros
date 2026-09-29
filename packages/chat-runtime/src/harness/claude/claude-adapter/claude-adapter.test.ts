import { describe, expect, test } from "bun:test";
import type { AdapterEvent } from "../../types";
import {
	ClaudeAdapter,
	type ClaudeQuery,
	type ClaudeSession,
} from "./claude-adapter";

type Harness = {
	adapter: ClaudeAdapter;
	iterator: AsyncIterator<AdapterEvent>;
	emit: (message: unknown) => void;
	interrupts: number;
	aborted: () => boolean;
	requestTool(toolName: string, input: Record<string, unknown>): Promise<unknown>;
};

function messageStart(id: string): unknown {
	return {
		type: "stream_event",
		event: { type: "message_start", message: { id } },
	};
}

function result(): unknown {
	return {
		type: "result",
		subtype: "success",
		is_error: false,
		usage: { input_tokens: 1, output_tokens: 1 },
	};
}

function createHarness(): Harness {
	const pending: unknown[] = [];
	let waiting: ((result: IteratorResult<unknown>) => void) | null = null;
	let aborted = false;
	let canUseTool: ((
		toolName: string,
		input: Record<string, unknown>,
		context: { toolUseID: string },
	) => Promise<unknown>) | undefined;
	const state = { interrupts: 0 };

	const stream: ClaudeSession = {
		[Symbol.asyncIterator](): AsyncIterator<unknown> {
			return {
				next: () => {
					const next = pending.shift();
					if (next !== undefined) {
						return Promise.resolve({ value: next, done: false });
					}
					if (aborted) {
						return Promise.resolve({ value: undefined, done: true });
					}
					return new Promise<IteratorResult<unknown>>((resolve) => {
						waiting = resolve;
					});
				},
			};
		},
		interrupt: async () => {
			state.interrupts += 1;
		},
	};

	const query: ClaudeQuery = ({ options }) => {
		canUseTool = options.canUseTool as typeof canUseTool;
		options.abortController?.signal.addEventListener("abort", () => {
			aborted = true;
			pending.length = 0;
			const resolve = waiting;
			waiting = null;
			resolve?.({ value: undefined, done: true });
		});
		return stream;
	};

	const adapter = new ClaudeAdapter({ query });
	const iterator = adapter.start({ cwd: "/workspace" })[Symbol.asyncIterator]();

	return {
		adapter,
		iterator,
		emit: (message: unknown) => {
			const resolve = waiting;
			waiting = null;
			if (resolve) resolve({ value: message, done: false });
			else pending.push(message);
		},
		get interrupts() {
			return state.interrupts;
		},
		aborted: () => aborted,
		requestTool: (toolName, input) => {
			if (!canUseTool) throw new Error("permission callback unavailable");
			return canUseTool(toolName, input, { toolUseID: "tool-native" });
		},
	};
}

async function nextTurn(
	iterator: AsyncIterator<AdapterEvent>,
): Promise<AdapterEvent> {
	for (let index = 0; index < 20; index += 1) {
		const next = await iterator.next();
		if (next.done) throw new Error("stream ended");
		if (next.value.kind === "turn") return next.value;
	}
	throw new Error("no turn event");
}

describe("ClaudeAdapter", () => {
	test("a canceled turn interrupts the session without killing it, and the next prompt runs", async () => {
		const harness = createHarness();

		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		const firstTurn = await nextTurn(harness.iterator);
		expect(firstTurn).toMatchObject({ turn: { status: "running" } });

		harness.adapter.cancelTurn();
		expect(harness.interrupts).toBe(1);
		expect(harness.aborted()).toBe(false);

		harness.emit(result());
		const canceled = await nextTurn(harness.iterator);
		expect(canceled).toMatchObject({ turn: { status: "interrupted" } });

		harness.adapter.prompt([{ type: "text", text: "second" }]);
		harness.emit(messageStart("msg_2"));
		const secondTurn = await nextTurn(harness.iterator);
		expect(secondTurn).toMatchObject({ turn: { status: "running" } });
		expect(
			secondTurn.kind === "turn" && firstTurn.kind === "turn"
				? secondTurn.turn.id !== firstTurn.turn.id
				: false,
		).toBe(true);
	});

	test("native tool approvals keep the provider accept path instead of Automation options", async () => {
		const harness = createHarness();
		const permission = harness.requestTool("Bash", { command: "echo hi" });
		const event = await harness.iterator.next();
		expect(event.done).toBe(false);
		expect(event.value).toMatchObject({
			kind: "item",
			item: {
				kind: "approval_request",
				status: "pending",
			},
		});
		if (event.done || event.value.kind !== "item") throw new Error("approval missing");
		expect("options" in event.value.item).toBe(false);
		harness.adapter.respondToApproval(event.value.item.id, { type: "accept" });
		const permissionResult = await permission;
		expect(permissionResult).toMatchObject({ behavior: "allow" });
		await harness.adapter.dispose();
	});

	test("dispose aborts the underlying session", async () => {
		const harness = createHarness();
		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		await nextTurn(harness.iterator);
		const disposal = harness.adapter.dispose();
		expect(harness.aborted()).toBe(true);
		harness.emit(result());
		await disposal;
	});
});
