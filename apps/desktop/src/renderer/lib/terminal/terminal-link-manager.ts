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

interface UrlCopyTarget {
	uri: string;
	range: IBufferRange;
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
	private _hoveredUrl: UrlCopyTarget | null = null;
	private _contextUrl: UrlCopyTarget | null = null;
	private _automaticUrl: UrlCopyTarget | null = null;
	private _contextEvent: Event | null = null;
	private _canRetainAutomaticUrl = false;

	/** Context-menu Copy uses a URI only for xterm's right-click link selection. */
	getContextCopyText(): string {
		const link = this._contextUrl;
		if (
			link &&
			this._automaticUrl?.uri === link.uri &&
			this._selectionMatches(link.range) &&
			this._selectionMatches(this._automaticUrl.range)
		)
			return link.uri;
		return this._terminal.getSelection();
	}

	resetContextCopy = (): void => {
		this._hoveredUrl = null;
		this._contextUrl = null;
		this._automaticUrl = null;
		this._contextEvent = null;
		this._canRetainAutomaticUrl = false;
	};

	private _selectionMatches(range: IBufferRange): boolean {
		const selection = this._terminal.getSelectionPosition();
		if (!selection) return false;
		const cols = this._terminal.cols;
		// Link ranges are 1-based/inclusive; selection ranges are 0-based/exclusive.
		return (
			selection.start.y * cols + selection.start.x ===
				(range.start.y - 1) * cols + range.start.x - 1 &&
			selection.end.y * cols + selection.end.x ===
				(range.end.y - 1) * cols + range.end.x
		);
	}

	private _eventInRange(event: MouseEvent, range: IBufferRange): boolean {
		const rect = this._terminal.element
			?.querySelector(".xterm-screen")
			?.getBoundingClientRect();
		if (
			!rect ||
			rect.width <= 0 ||
			rect.height <= 0 ||
			event.clientX < rect.left ||
			event.clientX >= rect.right ||
			event.clientY < rect.top ||
			event.clientY >= rect.bottom
		)
			return false;
		const cols = this._terminal.cols;
		const x = Math.floor(((event.clientX - rect.left) * cols) / rect.width);
		const y =
			Math.floor(
				((event.clientY - rect.top) * this._terminal.rows) / rect.height,
			) + this._terminal.buffer.active.viewportY;
		const cell = y * cols + x;
		return (
			cell >= (range.start.y - 1) * cols + range.start.x - 1 &&
			cell < (range.end.y - 1) * cols + range.end.x
		);
	}

	private _trackContextSelection(): void {
		const doc = this._terminal.element?.ownerDocument ?? globalThis.document;
		if (!doc) return;
		const capture = (event: MouseEvent) => {
			const inside = this._terminal.element?.contains(event.target as Node);
			this._contextEvent = inside ? event : null;
			this._contextUrl = null;
			if (!inside) return;
			// xterm keeps an existing selection on a second right-click inside it.
			// Its temporary textarea may cover the link, so no new hover is required.
			const retained = this._automaticUrl;
			this._contextUrl =
				this._hoveredUrl ??
				(retained &&
				this._canRetainAutomaticUrl &&
				this._selectionMatches(retained.range) &&
				this._eventInRange(event, retained.range)
					? retained
					: null);
			if (
				retained &&
				this._contextUrl &&
				this._selectionMatches(retained.range) &&
				this._selectionMatches(this._contextUrl.range) &&
				this._eventInRange(event, this._contextUrl.range)
			) {
				this._automaticUrl = this._contextUrl;
				this._canRetainAutomaticUrl = true;
			}
		};
		const manualSelection = (event: MouseEvent) => {
			if (
				event.button !== 0 ||
				!this._terminal.element?.contains(event.target as Node)
			)
				return;
			this._automaticUrl = null;
			this._contextUrl = null;
			this._contextEvent = null;
			this._canRetainAutomaticUrl = false;
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
				const link = this._contextUrl;
				// xterm selects the hovered hyperlink synchronously during contextmenu.
				// eventPhase becomes NONE after dispatch, so later manual selections
				// cannot acquire the saved URI merely by matching its display range.
				if (
					this._contextEvent?.eventPhase &&
					link &&
					this._selectionMatches(link.range)
				) {
					this._automaticUrl = link;
					this._canRetainAutomaticUrl = true;
				} else if (
					!this._automaticUrl ||
					!this._selectionMatches(this._automaticUrl.range)
				) {
					this._automaticUrl = null;
					this._contextUrl = null;
					this._canRetainAutomaticUrl = false;
				}
			}),
			this._terminal.onWriteParsed(() => {
				// Keep an already-open menu's snapshot, but require a fresh link on
				// the next right-click after the TUI has changed its output.
				this._hoveredUrl = null;
				this._canRetainAutomaticUrl = false;
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
		const onUrlHover = (
			event: MouseEvent,
			uri: string,
			range: IBufferRange,
		) => {
			this._hoveredUrl = /^https?:\/\//i.test(uri) ? { uri, range } : null;
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
