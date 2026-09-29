import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { boolean, CLIError, number, string } from "@choros/cli-framework";
import {
	type AutomationDefinitionInput,
	automationDefinitionSchema,
} from "@choros/shared/automation-contracts";

export const requestIdOption = () =>
	string().desc("Idempotency key. Omit to generate a new UUID");

export const expectedVersionOption = () =>
	number().int().required().desc("Current automation or input version");

export const confirmationTokenOption = () =>
	string()
		.required()
		.desc("Confirmation token returned by `automations preview`");

export const paginationOptions = {
	limit: number().int().desc("Number of records to return (1-100; default 50)"),
	cursor: string().desc("Opaque cursor returned by the previous page"),
};

export const definitionOptions = {
	definition: string().desc(
		"Path to a canonical Automation definition JSON file",
	),
	name: string().desc("Automation name"),
	prompt: string().desc("Standalone agent instructions"),
	promptFile: string().desc(
		"Read standalone agent instructions from this file",
	),
	project: string().desc("Project UUID for a new-worktree target"),
	baseRef: string().desc("Base ref for a new-worktree target"),
	workspace: string().desc("Workspace UUID for an existing-workspace target"),
	setupPolicy: string()
		.enum("prepared", "everyRun")
		.desc("Existing-workspace setup policy (default: prepared)"),
	harness: string().enum("claude-code", "codex").desc("Native agent harness"),
	accountRef: string().desc(
		"Provider account reference (default: resolve and pin current configured account)",
	),
	sessionMode: string()
		.enum("fresh", "reuse")
		.desc("Start a fresh managed session or reuse one (default: fresh)"),
	sessionId: string().desc("Managed session identity required by reuse mode"),
	model: string().desc("Pinned provider model, if supported"),
	effort: string().desc("Pinned reasoning effort, if supported"),
	schedule: string()
		.enum("immediate", "once", "calendar", "fixed-interval", "after-completion")
		.desc("Canonical schedule preset"),
	at: string().desc("ISO instant for a once schedule"),
	startsAt: string().desc("ISO anchor instant for a repeating schedule"),
	timezone: string().desc("IANA time zone"),
	rrule: string().desc("Supported RRULE subset for a calendar schedule"),
	intervalSeconds: number()
		.int()
		.desc("Interval in seconds for interval schedules"),
	maxRounds: number().int().desc("Maximum scheduled rounds"),
	endsBefore: string().desc("Exclusive ISO end instant"),
	missedRunWindowSeconds: number()
		.int()
		.desc("Missed-run coalescing window (0-86400; default 3600)"),
	setupTimeoutSeconds: number()
		.int()
		.desc("Setup timeout in seconds (default 600)"),
	precheck: string().desc("Shell precheck command"),
	precheckTimeoutSeconds: number()
		.int()
		.desc("Precheck timeout in seconds (default 30)"),
};

type DefinitionOptions = {
	definition?: string;
	name?: string;
	prompt?: string;
	promptFile?: string;
	project?: string;
	baseRef?: string;
	workspace?: string;
	setupPolicy?: "prepared" | "everyRun";
	harness?: "claude-code" | "codex";
	accountRef?: string;
	sessionMode?: "fresh" | "reuse";
	sessionId?: string;
	model?: string;
	effort?: string;
	schedule?:
		| "immediate"
		| "once"
		| "calendar"
		| "fixed-interval"
		| "after-completion";
	at?: string;
	startsAt?: string;
	timezone?: string;
	rrule?: string;
	intervalSeconds?: number;
	maxRounds?: number;
	endsBefore?: string;
	missedRunWindowSeconds?: number;
	setupTimeoutSeconds?: number;
	precheck?: string;
	precheckTimeoutSeconds?: number;
};

function readTextFile(path: string, purpose: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		throw new CLIError(
			`Could not read ${purpose} file: ${path}`,
			error instanceof Error ? error.message : String(error),
		);
	}
}

function parseDefinitionFile(path: string): unknown {
	const source = readTextFile(path, "definition");
	try {
		return JSON.parse(source);
	} catch (error) {
		throw new CLIError(
			`Automation definition is not valid JSON: ${path}`,
			error instanceof Error ? error.message : String(error),
		);
	}
}

function requireOption<T>(value: T | undefined, flag: string): T {
	if (value === undefined || value === "") {
		throw new CLIError(`${flag} is required for this definition`);
	}
	return value;
}

function buildSchedule(
	options: DefinitionOptions,
): AutomationDefinitionInput["schedule"] {
	switch (requireOption(options.schedule, "--schedule")) {
		case "immediate":
			return { kind: "immediate" };
		case "once":
			return {
				kind: "once",
				at: requireOption(options.at, "--at"),
				timeZone: requireOption(options.timezone, "--timezone"),
			};
		case "calendar":
			return {
				kind: "calendar",
				rrule: requireOption(options.rrule, "--rrule"),
				startsAt: requireOption(options.startsAt, "--starts-at"),
				timeZone: requireOption(options.timezone, "--timezone"),
			};
		case "fixed-interval":
			return {
				kind: "fixedInterval",
				startsAt: requireOption(options.startsAt, "--starts-at"),
				intervalSeconds: requireOption(
					options.intervalSeconds,
					"--interval-seconds",
				),
				timeZone: requireOption(options.timezone, "--timezone"),
			};
		case "after-completion":
			return {
				kind: "afterCompletion",
				startsAt: requireOption(options.startsAt, "--starts-at"),
				intervalSeconds: requireOption(
					options.intervalSeconds,
					"--interval-seconds",
				),
				timeZone: requireOption(options.timezone, "--timezone"),
			};
	}
}

function buildInlineDefinition(
	options: DefinitionOptions,
): AutomationDefinitionInput {
	if (options.project && options.workspace) {
		throw new CLIError("Choose exactly one target: --project or --workspace");
	}
	if (!options.project && !options.workspace) {
		throw new CLIError("A target is required: --project or --workspace");
	}
	if (options.prompt && options.promptFile) {
		throw new CLIError("Choose exactly one of --prompt and --prompt-file");
	}

	const instructions = options.promptFile
		? readTextFile(options.promptFile, "prompt")
		: requireOption(options.prompt, "--prompt or --prompt-file");
	const target: AutomationDefinitionInput["target"] = options.project
		? {
				kind: "newWorktree",
				projectId: options.project,
				baseRef: requireOption(options.baseRef, "--base-ref"),
			}
		: {
				kind: "existingWorkspace",
				workspaceId: requireOption(options.workspace, "--workspace"),
				setupPolicy: options.setupPolicy ?? "prepared",
			};

	return {
		name: requireOption(options.name, "--name"),
		instructions,
		target,
		executor: {
			harness: requireOption(options.harness, "--harness"),
			accountRef: options.accountRef ?? "default",
			sessionMode: options.sessionMode ?? "fresh",
			sessionId: options.sessionId,
			model: options.model,
			effort: options.effort,
		},
		schedule: buildSchedule(options),
		stop: {
			maxRounds: options.maxRounds,
			endsBefore: options.endsBefore,
		},
		missedRunWindowSeconds: options.missedRunWindowSeconds ?? 3600,
		setupTimeoutSeconds: options.setupTimeoutSeconds ?? 600,
		precheck: options.precheck
			? {
					command: options.precheck,
					timeoutSeconds: options.precheckTimeoutSeconds ?? 30,
				}
			: undefined,
	};
}

const inlineDefinitionKeys: Array<keyof DefinitionOptions> = [
	"name",
	"prompt",
	"promptFile",
	"project",
	"baseRef",
	"workspace",
	"setupPolicy",
	"harness",
	"accountRef",
	"sessionMode",
	"sessionId",
	"model",
	"effort",
	"schedule",
	"at",
	"startsAt",
	"timezone",
	"rrule",
	"intervalSeconds",
	"maxRounds",
	"endsBefore",
	"missedRunWindowSeconds",
	"setupTimeoutSeconds",
	"precheck",
	"precheckTimeoutSeconds",
];

export function parseAutomationDefinition(
	options: DefinitionOptions,
): ReturnType<typeof automationDefinitionSchema.parse> {
	if (
		options.definition &&
		inlineDefinitionKeys.some((key) => options[key] !== undefined)
	) {
		throw new CLIError(
			"Definition flags cannot be combined with --definition",
			"Put the complete canonical definition in the JSON file",
		);
	}
	const candidate = options.definition
		? parseDefinitionFile(options.definition)
		: buildInlineDefinition(options);
	const result = automationDefinitionSchema.safeParse(candidate);
	if (!result.success) {
		throw new CLIError(
			"Invalid Automation definition",
			result.error.issues
				.map(
					(issue) =>
						`${issue.path.join(".") || "definition"}: ${issue.message}`,
				)
				.join("\n"),
		);
	}
	return result.data;
}

export function resolveRequestId(value: string | undefined): string {
	return value ?? randomUUID();
}

export function readAnswer(
	answer: string | undefined,
	answerFile: string | undefined,
): string {
	if (answer && answerFile) {
		throw new CLIError("Choose exactly one of --answer and --answer-file");
	}
	if (answerFile) return readTextFile(answerFile, "answer");
	return requireOption(answer, "--answer or --answer-file");
}

export const runImmediatelyOption = () =>
	boolean().desc(
		"Accept one immediate run while creating the paused automation",
	);
