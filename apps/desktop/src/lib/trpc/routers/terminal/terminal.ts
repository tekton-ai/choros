import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { appState } from "main/lib/app-state";
import {
	isTerminalAttachCanceledError,
	TERMINAL_ATTACH_CANCELED_MESSAGE,
	TERMINAL_SESSION_KILLED_MESSAGE,
	TerminalKilledError,
} from "main/lib/terminal/errors";
import { TerminalHostClientDisposedError } from "main/lib/terminal-host/client";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { resolveTerminalThemeType } from "./theme-type";
import { resolveCwd } from "./utils";

const DEBUG_TERMINAL = process.env.CHOROS_TERMINAL_DEBUG === "1";
const _logger = console;
let createOrAttachCallCounter = 0;

const SAFE_ID = z
	.string()
	.min(1)
	.refine(
		(value) =>
			!value.includes("/") && !value.includes("\\") && !value.includes(".."),
		{ message: "Invalid id" },
	);

/**
 * App quit disposes the terminal-host client while requests are still in
 * flight, so any terminal procedure can be rejected by that teardown —
 * translated once here rather than per procedure.
 */
const terminalProcedure = publicProcedure.use(async ({ next }) => {
	const result = await next();
	if (
		!result.ok &&
		result.error.cause instanceof TerminalHostClientDisposedError
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Terminal host client disposed",
			cause: { kind: "TERMINAL_HOST_CLIENT_DISPOSED" },
		});
	}
	return result;
});

/**
 * Terminal router using daemon-backed terminal runtime
 * Sessions are keyed by paneId.
 *
 * Environment variables set for terminal sessions:
 * - PATH: Prepends ~/.choros/bin so wrapper scripts intercept agent commands
 * - CHOROS_PANE_ID: The pane ID (used by notification hooks, session key)
 * - CHOROS_TAB_ID: The tab ID (parent of pane, used by notification hooks)
 * - CHOROS_WORKSPACE_ID: The workspace ID (used by notification hooks)
 * - CHOROS_WORKSPACE_NAME: The workspace name (used by setup/teardown scripts)
 * - CHOROS_WORKSPACE_PATH: The worktree path (used by setup/teardown scripts)
 * - CHOROS_ROOT_PATH: The main repo path (used by setup/teardown scripts)
 * - CHOROS_PORT: The hooks server port for agent completion notifications
 */
export const createTerminalRouter = () => {
	const registry = getWorkspaceRuntimeRegistry();
	const terminal = registry.getDefault().terminal;
	if (DEBUG_TERMINAL) {
		console.log(
			"[Terminal Router] Using terminal runtime, capabilities:",
			terminal.capabilities,
		);
	}

	return router({
		createOrAttach: terminalProcedure
			.input(
				z.object({
					paneId: SAFE_ID,
					requestId: z.string().min(1).optional(),
					joinPending: z.boolean().optional(),
					tabId: z.string(),
					workspaceId: SAFE_ID,
					cols: z.number().optional(),
					rows: z.number().optional(),
					cwd: z.string().optional(),
					command: z.string().trim().min(1).optional(),
					skipColdRestore: z.boolean().optional(),
					allowKilled: z.boolean().optional(),
					themeType: z.enum(["dark", "light"]).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const callId = ++createOrAttachCallCounter;
				const startedAt = Date.now();
				const {
					paneId,
					requestId,
					joinPending,
					tabId,
					workspaceId,
					cols,
					rows,
					cwd: cwdOverride,
					command,
					skipColdRestore,
					allowKilled,
					themeType,
				} = input;

				const cwd = resolveCwd(cwdOverride, undefined);
				const workspacePath = cwd;

				if (DEBUG_TERMINAL) {
					console.log("[Terminal Router] createOrAttach called:", {
						paneId,
						workspaceId,
						workspacePath,
						cwdOverride,
						resolvedCwd: cwd,
						cols,
						rows,
					});
				}

				const resolvedThemeType = resolveTerminalThemeType({
					requestedThemeType: themeType,
					persistedThemeState: appState.data.themeState,
				});

				try {
					const result = await terminal.createOrAttach({
						paneId,
						requestId,
						joinPending,
						tabId,
						workspaceId,
						workspaceName: undefined,
						workspacePath,
						rootPath: undefined,
						cwd,
						cols,
						rows,
						command,
						skipColdRestore: skipColdRestore || !!command,
						allowKilled,
						themeType: resolvedThemeType,
					});

					if (DEBUG_TERMINAL) {
						console.log("[Terminal Router] createOrAttach result:", {
							callId,
							paneId,
							isNew: result.isNew,
							wasRecovered: result.wasRecovered,
							durationMs: Date.now() - startedAt,
						});
					}

					return {
						paneId,
						isNew: result.isNew,
						scrollback: result.scrollback,
						wasRecovered: result.wasRecovered,
						// Cold restore fields (for reboot recovery)
						isColdRestore: result.isColdRestore,
						previousCwd: result.previousCwd,
						// Include snapshot for daemon mode (renderer can use for rehydration)
						snapshot: result.snapshot,
					};
				} catch (error) {
					const isKilledError =
						error instanceof TerminalKilledError ||
						(error instanceof Error &&
							error.message === TERMINAL_SESSION_KILLED_MESSAGE);
					const isAttachCanceled = isTerminalAttachCanceledError(error);
					if (isKilledError) {
						if (DEBUG_TERMINAL) {
							console.warn(
								"[Terminal Router] createOrAttach blocked (killed):",
								{
									paneId,
									workspaceId,
								},
							);
						}
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: TERMINAL_SESSION_KILLED_MESSAGE,
						});
					}
					if (isAttachCanceled) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: TERMINAL_ATTACH_CANCELED_MESSAGE,
						});
					}
					if (error instanceof TerminalHostClientDisposedError) {
						throw error;
					}
					if (DEBUG_TERMINAL) {
						console.warn("[Terminal Router] createOrAttach failed:", {
							callId,
							paneId,
							durationMs: Date.now() - startedAt,
							error: error instanceof Error ? error.message : String(error),
						});
					}
					console.error("[Terminal Router] createOrAttach ERROR:", error);
					throw error;
				}
			}),

		write: terminalProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
					throwOnError: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const shouldThrow = input.throwOnError ?? false;
				try {
					terminal.write(input);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Write failed";

					// Emit exit instead of error for deleted sessions to prevent toast floods
					if (message.includes("not found or not alive")) {
						terminal.emit(`exit:${input.paneId}`, 0, 15);
						if (shouldThrow) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message,
							});
						}
						return;
					}

					terminal.emit(`error:${input.paneId}`, {
						error: message,
						code: "WRITE_FAILED",
					});
					if (shouldThrow) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message,
						});
					}
				}
			}),

		resize: terminalProcedure
			.input(
				z.object({
					paneId: z.string(),
					cols: z.number(),
					rows: z.number(),
					seq: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminal.resize(input);
			}),

		kill: terminalProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminal.kill(input);
			}),

		stream: terminalProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| {
							type: "exit";
							exitCode: number;
							signal?: number;
							reason?: "killed" | "exited" | "error";
					  }
					| { type: "disconnect"; reason: string }
					| { type: "error"; error: string; code?: string }
				>((emit) => {
					if (DEBUG_TERMINAL) {
						console.log(`[Terminal Stream] Subscribe: ${paneId}`);
					}

					let firstDataReceived = false;

					const onData = (data: string) => {
						if (DEBUG_TERMINAL && !firstDataReceived) {
							firstDataReceived = true;
							console.log(
								`[Terminal Stream] First data for ${paneId}: ${data.length} bytes`,
							);
						}
						emit.next({ type: "data", data });
					};

					const onExit = (
						exitCode: number,
						signal?: number,
						reason?: "killed" | "exited" | "error",
					) => {
						// Don't emit.complete() - paneId is reused across restarts, completion would strand listeners
						emit.next({ type: "exit", exitCode, signal, reason });
					};

					const onDisconnect = (reason: string) => {
						emit.next({ type: "disconnect", reason });
					};

					const onError = (payload: { error: string; code?: string }) => {
						emit.next({
							type: "error",
							error: payload.error,
							code: payload.code,
						});
					};

					terminal.on(`data:${paneId}`, onData);
					terminal.on(`exit:${paneId}`, onExit);
					terminal.on(`disconnect:${paneId}`, onDisconnect);
					terminal.on(`error:${paneId}`, onError);

					return () => {
						if (DEBUG_TERMINAL) {
							console.log(`[Terminal Stream] Unsubscribe: ${paneId}`);
						}
						terminal.off(`data:${paneId}`, onData);
						terminal.off(`exit:${paneId}`, onExit);
						terminal.off(`disconnect:${paneId}`, onDisconnect);
						terminal.off(`error:${paneId}`, onError);
					};
				});
			}),
	});
};
