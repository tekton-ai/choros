export interface CdpTarget {
	id: string;
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

export class Cdp {
	readonly events: Array<{ method: string; params: unknown }> = [];
	onEvent?: (event: { method: string; params: unknown }) => void;
	private id = 0;
	private pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	private constructor(private ws: WebSocket) {
		ws.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as {
				id?: number;
				method?: string;
				params?: unknown;
				result?: unknown;
				error?: { message: string };
			};
			if (message.id == null) {
				if (message.method)
					this.onEvent?.({ method: message.method, params: message.params });
				if (
					message.method === "Runtime.exceptionThrown" ||
					message.method === "Runtime.consoleAPICalled"
				) {
					if (this.events.length >= 1000) this.events.shift();
					this.events.push({
						method: message.method,
						params: message.params,
					});
				}
				return;
			}
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timer);
			if (message.error) pending.reject(new Error(message.error.message));
			else pending.resolve(message.result);
		});
		ws.addEventListener("close", () => this.rejectPending());
		ws.addEventListener("error", () => this.rejectPending());
	}

	static async connect(url: string): Promise<Cdp> {
		const ws = new WebSocket(url);
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				ws.close();
				reject(new Error("CDP connection timed out"));
			}, 20_000);
			ws.addEventListener(
				"open",
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true },
			);
			ws.addEventListener(
				"error",
				() => {
					clearTimeout(timer);
					reject(new Error("CDP connection failed"));
				},
				{ once: true },
			);
		});
		return new Cdp(ws);
	}

	send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
		if (this.ws.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error(`CDP closed: ${method}`));
		}
		const id = ++this.id;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP timeout: ${method}`));
			}, 20_000);
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timer,
			});
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	async eval<T>(expression: string): Promise<T> {
		const result = await this.send<{
			result?: { value?: T };
			exceptionDetails?: {
				text: string;
				exception?: { description?: string };
			};
		}>("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
			userGesture: true,
		});
		if (result.exceptionDetails) {
			throw new Error(
				result.exceptionDetails.exception?.description ??
					result.exceptionDetails.text,
			);
		}
		return result.result?.value as T;
	}

	private rejectPending() {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("CDP connection closed"));
		}
		this.pending.clear();
	}

	close() {
		this.rejectPending();
		this.ws.close();
	}
}
