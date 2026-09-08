/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type {
	IBufferRange,
	ILinkHandler,
	Terminal as XTerm,
} from "@xterm/xterm";
import { UrlLinkProvider } from "../../screens/main/components/workspace-view/content-view/tabs-content/terminal/link-providers";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
	WordLinkDetector,
} from "./links";

export type LinkHoverInfo =
	| { kind: "file"; isDirectory: boolean; resolvedPath?: string }
	| { kind: "url" };

/**
 * Link handler callbacks for the v2 terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (event: MouseEvent, url: string) => void;
	/** Called when the mouse enters a detected link (file path or URL). */
	onLinkHover?: (event: MouseEvent, info: LinkHoverInfo) => void;
	/** Called when the mouse leaves a previously hovered link. */
	onLinkLeave?: () => void;
	/**
	 * Stat callback to validate file paths exist. Called via the host service
	 * which handles all path resolution (relative, tilde, etc.) server-side.
	 */
	stat?: StatCallback;
}

interface LinkProviderDisposable {
	dispose(): void;
}

interface CopySelection {
	uri: string;
	range: IBufferRange;
	reusable: boolean;
}

interface CopyContext {
	event: Event;
	uri: string | null;
	copy: CopySelection | null;
}

/**
 * Manages all link providers for a single terminal instance.
 *
 * Providers are registered in priority order (xterm uses first match):
 * 1. LocalLinkDetector (file paths with validation) + styled-text fallback
 * 2. UrlLinkProvider (hard-wrapped URL detection)
 * 3. WordLinkDetector (bare filenames like "AGENTS.md")
 */
export class TerminalLinkManager {
	private _disposables: LinkProviderDisposable[] = [];
	private _resolver: TerminalLinkResolver | null = null;
	private _handlers: TerminalLinkHandlers | null = null;
	private _oscLinkHandler: ILinkHandler | null = null;
	private _hoveredUrl: string | null = null;
	private _copySelection: CopySelection | null = null;
	private _copyContext: CopyContext | null = null;

	/** Context-menu Copy uses a URI only for xterm's right-click link selection. */
	getContextCopyText(): string {
		const copy = this._copyContext?.copy;
		return copy &&
			this._sameSelection(copy.range, this._terminal.getSelectionPosition())
			? copy.uri
			: this._terminal.getSelection();
	}

	resetContextCopy = (): void => {
		this._hoveredUrl = null;
		this._copySelection = null;
		this._copyContext = null;
	};

	private _sameSelection(
		a: IBufferRange | undefined,
		b: IBufferRange | undefined,
	): boolean {
		return (
			!!a &&
			!!b &&
			a.start.x === b.start.x &&
			a.start.y === b.start.y &&
			a.end.x === b.end.x &&
			a.end.y === b.end.y
		);
	}

	private _eventInSelection(event: MouseEvent, range: IBufferRange): boolean {
		const rect = this._terminal.element
			?.querySelector(".xterm-screen")
			?.getBoundingClientRect();
		if (!rect?.width || !rect.height) return false;
		const x = ((event.clientX - rect.left) * this._terminal.cols) / rect.width;
		const y = ((event.clientY - rect.top) * this._terminal.rows) / rect.height;
		const row = Math.floor(y) + this._terminal.buffer.active.viewportY;
		return (
			x >= 0 &&
			x < this._terminal.cols &&
			y >= 0 &&
			y < this._terminal.rows &&
			(row > range.start.y || (row === range.start.y && x >= range.start.x)) &&
			(row < range.end.y || (row === range.end.y && x < range.end.x))
		);
	}

	private _trackContextSelection(): void {
		const doc = this._terminal.element?.ownerDocument ?? globalThis.document;
		if (!doc) return;
		const capture = (event: MouseEvent) => {
			this._copyContext = null;
			if (!this._terminal.element?.contains(event.target as Node)) return;
			const copy = this._copySelection;
			if (!copy && !this._hoveredUrl) return;
			const context: CopyContext = { event, uri: this._hoveredUrl, copy: null };
			this._copyContext = context;
			if (
				!copy ||
				!this._sameSelection(
					copy.range,
					this._terminal.getSelectionPosition(),
				) ||
				!this._eventInSelection(event, copy.range)
			)
				return;
			const uri = context.uri ?? (copy.reusable ? copy.uri : null);
			if (uri) {
				copy.uri = uri;
				copy.reusable = true;
				context.copy = copy;
			}
		};
		const manualSelection = (event: MouseEvent) => {
			if (
				event.button !== 0 ||
				!this._terminal.element?.contains(event.target as Node)
			)
				return;
			this._copySelection = null;
			this._copyContext = null;
		};
		doc.addEventListener("contextmenu", capture, true);
		doc.addEventListener("mousedown", manualSelection, true);
		this._disposables.push(
			{
				dispose: () => {
					doc.removeEventListener("contextmenu", capture, true);
					doc.removeEventListener("mousedown", manualSelection, true);
				},
			},
			this._terminal.onSelectionChange(() => {
				const range = this._terminal.getSelectionPosition();
				const context = this._copyContext;
				// xterm creates its link selection synchronously inside contextmenu.
				// Store that native selection, not the provider's differently based range.
				if (range && context?.event.eventPhase && context.uri) {
					this._copySelection = context.copy = {
						uri: context.uri,
						range,
						reusable: true,
					};
				} else if (!this._sameSelection(this._copySelection?.range, range)) {
					this._copySelection = null;
					if (context) context.copy = null;
				}
			}),
			this._terminal.onWriteParsed(() => {
				this._hoveredUrl = null;
				// The open menu keeps its snapshot; the next one needs a fresh target.
				if (this._copySelection) this._copySelection.reusable = false;
			}),
			this._terminal.onScroll(this.resetContextCopy),
			this._terminal.onResize(this.resetContextCopy),
			this._terminal.buffer.onBufferChange(this.resetContextCopy),
		);
	}

	constructor(private readonly _terminal: XTerm) {}

	/**
	 * Set link handlers and register providers. Safe to call multiple times —
	 * old providers are disposed before new ones are registered. The resolver
	 * is reused to preserve the stat cache.
	 */
	setHandlers(handlers: TerminalLinkHandlers): void {
		this._handlers = handlers;
		this._register();
	}

	/**
	 * Re-register providers (e.g. after terminal is created).
	 * No-op if handlers haven't been set yet.
	 */
	ensureRegistered(): void {
		if (this._handlers) {
			this._register();
		}
	}

	dispose(): void {
		this.resetContextCopy();
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();
		this._resolver?.clearCache();
		this._resolver = null;
		this._handlers = null;
	}

	private _clearOscLinkHandler(): void {
		if (this._terminal.options.linkHandler === this._oscLinkHandler) {
			this._terminal.options.linkHandler = null;
		}
		this._oscLinkHandler = null;
	}

	private _register(): void {
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();
		this._trackContextSelection();

		// Reuse resolver to preserve stat cache across re-registrations.
		if (!this._resolver) {
			this._resolver = new TerminalLinkResolver(handlers.stat);
		}

		const onLinkHover = (event: MouseEvent, info: LinkHoverInfo) => {
			this._hoveredUrl = null;
			handlers.onLinkHover?.(event, info);
		};
		const onLinkLeave = () => {
			this._hoveredUrl = null;
			handlers.onLinkLeave?.();
		};
		const onUrlHover = (event: MouseEvent, uri: string) => {
			this._hoveredUrl = /^https?:\/\//i.test(uri) ? uri : null;
			handlers.onLinkHover?.(event, { kind: "url" });
		};

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			handlers.onFileLinkClick,
			(event, link) =>
				onLinkHover(event, {
					kind: "file",
					isDirectory: link.isDirectory,
					resolvedPath: link.resolvedPath,
				}),
			onLinkLeave,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));

		// 2. URL link provider (handles hard-wrapped URLs)
		if (handlers.onUrlClick) {
			const onUrlClick = handlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(
				this._terminal,
				(event, uri) => {
					onUrlClick(event, uri);
				},
				onUrlHover,
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(urlProvider));

			// xterm always registers its own OSC 8 hyperlink provider first. Without
			// this, OSC 8 links use xterm's default confirm() + window.open() path,
			// which is blocked in Electron and also bypasses our link preferences.
			this._oscLinkHandler = {
				allowNonHttpProtocols: false,
				activate: (event, uri) => {
					onUrlClick(event, uri);
				},
				hover: onUrlHover,
				leave: onLinkLeave,
			};
			this._terminal.options.linkHandler = this._oscLinkHandler;
		}

		// 3. CHOROS ADDITION: Word link detector (lowest priority).
		// Adapted from VSCode's TerminalWordLinkDetector. VSCode opens a
		// workspace search on click; ours opens the file directly if it
		// exists (validated via stat). Catches bare filenames like
		// "AGENTS.md" that have no path separator or line suffix.
		// To disable: remove or comment out this block.
		if (handlers.onFileLinkClick) {
			const onFileClick = handlers.onFileLinkClick;
			const wordDetector = new WordLinkDetector(
				this._terminal,
				this._resolver,
				(event, resolvedPath) => {
					onFileClick(event, {
						text: resolvedPath,
						startIndex: 0,
						endIndex: 0,
						resolvedPath,
						isDirectory: false,
						row: undefined,
						col: undefined,
						rowEnd: undefined,
						colEnd: undefined,
					});
				},
				(event) => onLinkHover(event, { kind: "file", isDirectory: false }),
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(wordDetector));
		}
	}
}
