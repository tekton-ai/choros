import { describe, expect, it, mock } from "bun:test";
import type {
	IBufferRange,
	ILinkProvider,
	Terminal as XTerm,
} from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

function createMockTerminal() {
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const ownerDocument = new EventTarget();
	const listeners = new Map<string, () => void>();
	let insideTerminal = true;
	let selection = "";
	let selectionPosition: IBufferRange | undefined;
	const subscribe = (name: string) => (listener: () => void) => {
		listeners.set(name, listener);
		return { dispose: () => listeners.delete(name) };
	};
	const setSelection = (text: string, position?: IBufferRange) => {
		selection = text;
		selectionPosition = position;
		listeners.get("selection")?.();
	};
	const terminal = {
		options: {
			linkHandler: null,
		},
		element: {
			ownerDocument,
			contains: () => insideTerminal,
			querySelector: () => ({
				getBoundingClientRect: () => ({
					left: 0,
					top: 0,
					right: 800,
					bottom: 240,
					width: 800,
					height: 240,
				}),
			}),
		},
		getSelection: () => selection,
		getSelectionPosition: () => selectionPosition,
		onSelectionChange: subscribe("selection"),
		onWriteParsed: subscribe("write"),
		onScroll: subscribe("scroll"),
		onResize: subscribe("resize"),
		registerLinkProvider: (provider: ILinkProvider) => {
			registeredProviders.push(provider);
			return {
				dispose: () => {
					disposedProviders.push(provider);
				},
			};
		},
		buffer: {
			onBufferChange: subscribe("buffer"),
			active: {
				viewportY: 0,
				getLine: () => null,
			},
		},
		cols: 80,
		rows: 24,
	} as unknown as XTerm;

	return {
		terminal,
		registeredProviders,
		disposedProviders,
		listeners,
		contextSelect(text?: string, position?: IBufferRange, inside = true) {
			insideTerminal = inside;
			const nativeRightClick = () => {
				if (text !== undefined) setSelection(text, position);
			};
			// The manager's capture listener runs before xterm's native selection.
			ownerDocument.addEventListener("contextmenu", nativeRightClick);
			const cursor = (position ?? selectionPosition)?.start ?? { x: 0, y: 0 };
			ownerDocument.dispatchEvent(
				Object.assign(new Event("contextmenu"), {
					clientX: cursor.x * 10 + 5,
					clientY: cursor.y * 10 + 5,
				}),
			);
			ownerDocument.removeEventListener("contextmenu", nativeRightClick);
			insideTerminal = true;
		},
		manualSelect(text: string, position: IBufferRange) {
			ownerDocument.dispatchEvent(
				Object.assign(new Event("mousedown"), { button: 0 }),
			);
			setSelection(text, position);
		},
	};
}

describe("TerminalLinkManager", () => {
	it("routes OSC 8 hyperlinks through the terminal URL handler", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onLinkHover = mock();
		const onLinkLeave = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onLinkHover,
			onLinkLeave,
		});

		const linkHandler = terminal.options.linkHandler;
		expect(linkHandler).toBeTruthy();
		expect(linkHandler?.allowNonHttpProtocols).toBe(false);

		const event = {} as MouseEvent;
		linkHandler?.activate(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.hover?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.leave?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});

		expect(onUrlClick).toHaveBeenCalledWith(event, "https://example.com");
		expect(onLinkHover).toHaveBeenCalledWith(event, { kind: "url" });
		expect(onLinkLeave).toHaveBeenCalled();
	});

	it("clears only the OSC link handler it installed", () => {
		const { terminal, disposedProviders } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const installedHandler = terminal.options.linkHandler;
		expect(installedHandler).toBeTruthy();

		manager.dispose();

		expect(terminal.options.linkHandler).toBeNull();
		expect(disposedProviders.length).toBe(2);
	});

	it("does not clear a link handler installed by another owner", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const replacementHandler = {
			activate: mock(),
		};
		terminal.options.linkHandler = replacementHandler;

		manager.dispose();

		expect(terminal.options.linkHandler).toBe(replacementHandler);
	});

	it("copies the real URI for either OMP hyperlink span without changing the selection", () => {
		const { terminal, contextSelect } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		const uri = "https://www.baidu.com";
		for (const [display, start] of [
			["baidu", 0],
			["(https://www.baidu.com)", 6],
		] as const) {
			const range = {
				start: { x: start + 1, y: 1 },
				end: { x: start + display.length, y: 1 },
			};
			terminal.options.linkHandler?.hover?.({} as MouseEvent, uri, range);
			contextSelect(display, {
				start: { x: start, y: 0 },
				end: { x: start + display.length, y: 0 },
			});
			expect(manager.getContextCopyText()).toBe(uri);
			expect(terminal.getSelection()).toBe(display);
			terminal.options.linkHandler?.leave?.({} as MouseEvent, uri, range);
			expect(manager.getContextCopyText()).toBe(uri);
			// Reopening on the same auto-selection does not produce another change event.
			contextSelect();
			expect(manager.getContextCopyText()).toBe(uri);
		}
	});

	it("preserves deliberate selections even when they exactly match the hyperlink span", () => {
		const { terminal, contextSelect, manualSelect } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		const text = "(https://example.com/a_(b))";
		const range = { start: { x: 1, y: 1 }, end: { x: text.length, y: 1 } };
		const position = { start: { x: 0, y: 0 }, end: { x: text.length, y: 0 } };
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://example.com/a_(b)",
			range,
		);
		contextSelect(text, position);
		expect(manager.getContextCopyText()).toBe("https://example.com/a_(b)");
		manualSelect(text, position);
		contextSelect();
		expect(manager.getContextCopyText()).toBe(text);
	});

	it("does not reuse a link URI for a menu outside the terminal", () => {
		const { terminal, contextSelect } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://www.baidu.com",
			{ start: { x: 1, y: 1 }, end: { x: 5, y: 1 } },
		);
		contextSelect("baidu", { start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
		expect(manager.getContextCopyText()).toBe("https://www.baidu.com");
		contextSelect(undefined, undefined, false);
		expect(manager.getContextCopyText()).toBe("baidu");
	});

	it("drops automatic copy targets on scroll, resize, buffer change, and disposal", () => {
		const { terminal, contextSelect, listeners } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		for (const event of ["scroll", "resize", "buffer", "dispose"]) {
			terminal.options.linkHandler?.hover?.(
				{} as MouseEvent,
				"https://www.baidu.com",
				{ start: { x: 1, y: 1 }, end: { x: 5, y: 1 } },
			);
			contextSelect("baidu", { start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
			expect(manager.getContextCopyText()).toBe("https://www.baidu.com");
			if (event === "dispose") manager.dispose();
			else listeners.get(event)?.();
			expect(manager.getContextCopyText()).toBe("baidu");
		}
	});

	it("keeps an open menu's target when React refreshes the click handlers", () => {
		const { terminal, contextSelect } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://www.baidu.com",
			{ start: { x: 1, y: 1 }, end: { x: 5, y: 1 } },
		);
		contextSelect("baidu", { start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		expect(manager.getContextCopyText()).toBe("https://www.baidu.com");
	});

	it("recognizes the same selection when its exclusive end wraps to the next row", () => {
		const { terminal, contextSelect } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://www.baidu.com",
			{ start: { x: 76, y: 1 }, end: { x: 80, y: 1 } },
		);
		contextSelect("baidu", { start: { x: 75, y: 0 }, end: { x: 0, y: 1 } });
		expect(manager.getContextCopyText()).toBe("https://www.baidu.com");
	});

	it("keeps the open menu snapshot but refreshes the target after TUI output changes", () => {
		const { terminal, contextSelect, listeners } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		manager.setHandlers({ stat: async () => null, onUrlClick: mock() });
		const range = { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } };
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://www.baidu.com",
			range,
		);
		contextSelect("baidu", { start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
		listeners.get("write")?.();
		expect(manager.getContextCopyText()).toBe("https://www.baidu.com");
		contextSelect();
		expect(manager.getContextCopyText()).toBe("baidu");
		terminal.options.linkHandler?.hover?.(
			{} as MouseEvent,
			"https://example.com/new",
			range,
		);
		contextSelect();
		expect(manager.getContextCopyText()).toBe("https://example.com/new");
	});
});
