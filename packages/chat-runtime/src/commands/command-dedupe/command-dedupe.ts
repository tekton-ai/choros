import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../../db";
import { chatCommandReceipts } from "../../db";

function canonical(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
		.join(",")}}`;
}

function hash(value: unknown): string {
	return createHash("sha256").update(canonical(value)).digest("hex");
}

export const DEFAULT_DEDUPE_CAPACITY = 500;

export class CommandDedupe {
	private readonly results = new Map<string, unknown>();

	constructor(
		private readonly capacity: number = DEFAULT_DEDUPE_CAPACITY,
		private readonly db?: ChatDb,
	) {}

	run<T>(commandId: string, execute: () => T): T;
	run<T>(commandId: string, parameters: unknown, execute: () => T): T;
	run<T>(
		commandId: string,
		parametersOrExecute: unknown | (() => T),
		maybeExecute?: () => T,
	): T {
		const execute =
			typeof parametersOrExecute === "function"
				? (parametersOrExecute as () => T)
				: (maybeExecute as () => T);
		const parameters =
			typeof parametersOrExecute === "function" ? null : parametersOrExecute;
		const parametersHash = hash(parameters);
		if (this.results.has(commandId)) {
			const cached = this.results.get(commandId) as {
				parametersHash: string;
				result: T;
			};
			if (cached.parametersHash !== parametersHash) {
				throw new Error(
					`command ${commandId} was reused with different parameters`,
				);
			}
			this.touch(commandId);
			return cached.result;
		}
		const receipt = this.db
			?.select()
			.from(chatCommandReceipts)
			.where(eq(chatCommandReceipts.commandKey, commandId))
			.get();
		if (receipt) {
			if (receipt.parametersHash !== parametersHash) {
				throw new Error(
					`command ${commandId} was reused with different parameters`,
				);
			}
			const decoded = JSON.parse(receipt.resultJson) as {
				hasValue: boolean;
				value?: T;
			};
			const result = (decoded.hasValue ? decoded.value : undefined) as T;
			this.results.set(commandId, { parametersHash, result });
			this.evict();
			return result;
		}
		const result = execute();
		this.db
			?.insert(chatCommandReceipts)
			.values({
				commandKey: commandId,
				parametersHash,
				resultJson: JSON.stringify({
					hasValue: result !== undefined,
					...(result === undefined ? {} : { value: result }),
				}),
				createdAt: Date.now(),
			})
			.run();
		this.results.set(commandId, { parametersHash, result });
		this.evict();
		return result;
	}

	has(commandId: string): boolean {
		return this.results.has(commandId);
	}

	get size(): number {
		return this.results.size;
	}

	private touch(commandId: string): void {
		const cached = this.results.get(commandId);
		this.results.delete(commandId);
		this.results.set(commandId, cached);
	}

	private evict(): void {
		while (this.results.size > this.capacity) {
			const oldest = this.results.keys().next();
			if (oldest.done) return;
			this.results.delete(oldest.value);
		}
	}
}
