import { z } from "zod";
import { Cdp, type CdpTarget } from "../lib/cdp";
import { eventually } from "./runtime";

const socketCreatedSchema = z.object({
	requestId: z.string(),
	url: z.string(),
});
const socketFrameSchema = z.object({
	requestId: z.string(),
	response: z.object({ opcode: z.number(), payloadData: z.string() }),
});
const terminalMessageSchema = z.object({ type: z.string() });
interface TerminalReadiness {
	workspaceId: string;
	attached: boolean;
	synced: boolean;
}

export class ProfileUi {
	private readonly terminals = new Map<string, TerminalReadiness>();
	private constructor(
		readonly cdp: Cdp,
		readonly targetId: string,
	) {
		cdp.onEvent = ({ method, params }) => {
			if (method === "Network.webSocketCreated") {
				const { requestId, url } = socketCreatedSchema.parse(params);
				const endpoint = new URL(url);
				const workspaceId = endpoint.searchParams.get("workspaceId");
				if (workspaceId && endpoint.pathname.startsWith("/terminal/")) {
					// Do not retain or log the URL: it contains the Host bearer token.
					this.terminals.set(requestId, {
						workspaceId,
						attached: false,
						synced: false,
					});
				}
			} else if (method === "Network.webSocketFrameReceived") {
				const frame = socketFrameSchema.parse(params);
				const terminal = this.terminals.get(frame.requestId);
				if (!terminal || frame.response.opcode !== 1) return;
				const message = terminalMessageSchema.parse(
					JSON.parse(frame.response.payloadData),
				);
				if (message.type === "attached") terminal.attached = true;
				if (message.type === "synced") terminal.synced = true;
			} else if (method === "Network.webSocketClosed") {
				const { requestId } = socketCreatedSchema
					.pick({ requestId: true })
					.parse(params);
				this.terminals.delete(requestId);
			}
		};
	}

	static async connect(target: CdpTarget) {
		if (!target.webSocketDebuggerUrl)
			throw new Error("Renderer has no CDP URL");
		const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		await cdp.send("Runtime.enable");
		await cdp.send("Page.enable");
		const ui = new ProfileUi(cdp, target.id);
		await cdp.send("Network.enable");
		return ui;
	}

	async wait(expression: string, label = expression, timeoutMs = 15_000) {
		return eventually(
			label,
			async () => (await this.cdp.eval<boolean>(expression)) || false,
			timeoutMs,
		);
	}

	async terminalReady() {
		const workspaceId = await this.cdp.eval<string>(
			"location.hash.split('/')[2]?.split('?')[0]",
		);
		await eventually(
			"renderer terminal attached and replay synced",
			async () => {
				for (const terminal of this.terminals.values()) {
					if (
						terminal.workspaceId === workspaceId &&
						terminal.attached &&
						terminal.synced
					)
						return true;
				}
				return false;
			},
			30_000,
		);
	}

	private element(selector: string, text?: string) {
		return `(() => {
			const matches = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => {
				const r = e.getBoundingClientRect();
				return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
					&& ${text === undefined ? "true" : `(e.textContent || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)})`};
			});
			const actionable = matches.filter(e => {
				e.scrollIntoView({block:'center', inline:'nearest'});
				const r = e.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
				return hit && (hit === e || e.contains(hit));
			});
			if (actionable.length !== 1) return null;
			return actionable[0];
		})()`;
	}

	async click(selector: string, text?: string) {
		const find = this.element(selector, text);
		const point = await eventually(
			`click ${selector}${text ? ` (${text})` : ""}`,
			() =>
				this.cdp.eval<{ x: number; y: number } | null>(`(() => {
			const e = ${find};
			if (!e || e.disabled || e.getAttribute('aria-disabled') === 'true') return null;
			e.scrollIntoView({block:'center', inline:'nearest'});
			const r = e.getBoundingClientRect();
			const x = r.x+r.width/2, y = r.y+r.height/2;
			const hit = document.elementFromPoint(x,y);
			return hit && (e === hit || e.contains(hit)) ? {x,y} : null;
		})()`),
		);
		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mousePressed",
			...point,
			button: "left",
			clickCount: 1,
		});
		await this.cdp.send("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			...point,
			button: "left",
			clickCount: 1,
		});
	}

	button(text: string) {
		return this.click("button", text);
	}

	async key(key: string, code = key, modifiers = 0) {
		await this.cdp.send("Input.dispatchKeyEvent", {
			type: "keyDown",
			key,
			code,
			modifiers,
			...(code === "KeyA" && modifiers ? { commands: ["selectAll"] } : {}),
			...(key === "Enter"
				? { text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 }
				: {}),
		});
		await this.cdp.send("Input.dispatchKeyEvent", {
			type: "keyUp",
			key,
			code,
			modifiers,
		});
	}

	async fill(selector: string, value: string) {
		await this.click(selector);
		await this.wait(
			`document.activeElement?.matches(${JSON.stringify(selector)})`,
			`focus ${selector}`,
		);
		await this.key("a", "KeyA", process.platform === "darwin" ? 4 : 2);
		await this.cdp.send("Input.insertText", { text: value });
		await this.wait(
			`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
			`fill ${selector}`,
		);
	}

	async profile(name: string) {
		await this.click('button[aria-label^="Work Profile:"]');
		await this.click(`[role="menuitemradio"][title=${JSON.stringify(name)}]`);
		await this.wait(
			`document.querySelector('button[aria-label^="Work Profile:"]')?.textContent.trim() === ${JSON.stringify(name)}`,
			`active Profile ${name}`,
		);
		await this.wait(
			`!document.querySelector('[role="menu"]')`,
			"profile menu dismissed",
		);
	}

	async experiments() {
		if (
			!(await this.cdp.eval<boolean>("location.hash.startsWith('#/settings/')"))
		) {
			await this.click('button[aria-label="Settings"]');
		}
		await this.click('a[href*="settings/experimental"]');
		await this.wait(
			"!!document.querySelector('#wait-for-setup-before-agent:not(:disabled)')",
			"experimental controls ready",
		);
	}

	async back() {
		await this.click("a", "Back");
		await this.wait(
			"!!document.querySelector('button[aria-label^=\"Work Profile:\"]') || document.body.innerText.includes('Page Not Found')",
			"settings return",
		);
		if (
			await this.cdp.eval<boolean>(
				"document.body.innerText.includes('Page Not Found')",
			)
		) {
			throw new Error(
				`Settings Back reached Page Not Found: ${await this.cdp.eval<string>("location.hash")}`,
			);
		}
	}

	async workspaceList() {
		if (await this.cdp.eval<boolean>("location.hash.startsWith('#/settings/')"))
			await this.back();
		await this.button("Workspaces");
		await this.wait(
			"location.hash === '#/v2-workspaces' && !!document.querySelector('input[placeholder^=\"Search workspaces\"]')",
			"workspace list ready",
		);
	}

	async recoverDashboard() {
		// Recovery between independent cases never changes the failed result.
		if (
			await this.cdp.eval<boolean>(
				"document.body.innerText.includes('Page Not Found')",
			)
		) {
			await this.click("a", "Go back home");
		}
		if (
			await this.cdp.eval<boolean>("location.hash.startsWith('#/settings/')")
		) {
			try {
				await this.back();
			} catch {
				await this.click("a", "Go back home");
			}
		}
		await this.wait(
			"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
			"dashboard recovered",
		);
	}

	async state() {
		return this.cdp.eval<{
			url: string;
			text: string;
			switches: Record<string, boolean>;
			persisted: Record<string, string | null>;
		}>(`({
			url: location.href,
			text: document.body.innerText,
			switches: Object.fromEntries([...document.querySelectorAll('[role=switch]')].map(e => [e.id,e.getAttribute('aria-checked') === 'true'])),
			persisted: Object.fromEntries(['inline-workspace-ports','workspace-agents-row'].map(key => [key,localStorage.getItem(key)]))
		})`);
	}

	async screenshot(path: string) {
		const { data } = await this.cdp.send<{ data: string }>(
			"Page.captureScreenshot",
			{ format: "png" },
		);
		await Bun.write(path, Buffer.from(data, "base64"));
	}

	errors() {
		return this.cdp.events.filter((event) => {
			if (event.method === "Runtime.exceptionThrown") return true;
			const params = event.params;
			return (
				params !== null &&
				typeof params === "object" &&
				"type" in params &&
				params.type === "error"
			);
		});
	}
}
