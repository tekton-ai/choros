export interface PermissionOption {
	id: string;
	label: string;
}

export type ExecutablePermissionDecision =
	| { type: "accept" }
	| { type: "decline" }
	| { type: "cancel" }
	| { type: "option"; optionId: string };

const SAFE_PROVIDER_OPTION_IDS = new Set([
	"accept",
	"decline",
	"cancel",
	"confirm",
	"confirm_run",
	"save_paused",
	"enable",
	"pause",
	"deny",
]);

const DECISION_OPTION_IDS: Record<
	Exclude<ExecutablePermissionDecision["type"], "option">,
	readonly string[]
> = {
	accept: ["accept"],
	decline: ["decline", "deny"],
	cancel: ["cancel"],
};

export class InvalidPermissionAnswerError extends Error {
	readonly code = "INVALID_PERMISSION_ANSWER" as const;

	constructor(message: string) {
		super(message);
		this.name = "InvalidPermissionAnswerError";
	}
}

/**
 * Keeps only provider decisions whose current semantics are limited to this one
 * approval. Unknown decisions fail closed until their provider contract is
 * reviewed; session grants and policy amendments are deliberately absent.
 */
export function executablePermissionOptions(
	options: readonly PermissionOption[] | undefined,
): PermissionOption[] | undefined {
	if (options === undefined) return undefined;
	return options.filter((option) => SAFE_PROVIDER_OPTION_IDS.has(option.id));
}

function hasDecisionOption(
	options: readonly PermissionOption[] | undefined,
	type: Exclude<ExecutablePermissionDecision["type"], "option">,
): boolean {
	if (options === undefined) return true;
	const optionIds = DECISION_OPTION_IDS[type];
	return options.some((option) => optionIds.includes(option.id));
}

/** Validates an answer without changing either Host or provider state. */
export function validatePermissionAnswer(
	answer: string,
	options: readonly PermissionOption[] | undefined,
): ExecutablePermissionDecision {
	const normalized = answer.trim();
	const keyword = normalized.toLowerCase();
	const type =
		keyword === "accept" || keyword === "allow"
			? "accept"
			: keyword === "decline" || keyword === "deny"
				? "decline"
				: keyword === "cancel"
					? "cancel"
					: undefined;
	if (type) {
		if (hasDecisionOption(options, type)) return { type };
		throw new InvalidPermissionAnswerError(
			`The ${type} decision is not available for this permission request`,
		);
	}
	const option = SAFE_PROVIDER_OPTION_IDS.has(normalized)
		? options?.find((candidate) => candidate.id === normalized)
		: undefined;
	if (option) return { type: "option", optionId: option.id };
	throw new InvalidPermissionAnswerError(
		"Answer must match an available one-time permission decision",
	);
}
