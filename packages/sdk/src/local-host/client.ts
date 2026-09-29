import type { AutomationClient } from "@choros/shared/automation-contracts";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { TRPCDefaultErrorShape, TRPCBuiltRouter, TRPCMutationProcedure, TRPCQueryProcedure } from "@trpc/server";
import SuperJSON from "superjson";

export type {
	Automation,
	AutomationCapabilities,
	AutomationClient,
	AutomationDefinition,
	AutomationDefinitionInput,
	AutomationOccurrence,
	AutomationPage,
	AutomationPreview,
	AutomationRun,
	AutomationRunStatus,
	AutomationSchedule,
	AutomationState,
	ExecutionInput,
	ExecutionReport,
	WorkEvent,
} from "@choros/shared/automation-contracts";

export interface LocalHostAuth {
	/** Bearer token issued by the local Host manifest or another trusted provider. */
	token: string;
	/** Stable machine identity sent when the Host requires machine-bound access. */
	clientMachineId?: string;
}

export type LocalHostAuthProvider = () =>
	| LocalHostAuth
	| Promise<LocalHostAuth>;

export interface LocalHostClientOptions {
	/** Local Host HTTP endpoint, with or without the trailing `/trpc`. */
	endpoint: string;
	/** Called for every batch so token rotation does not require rebuilding the client. */
	auth: LocalHostAuthProvider;
}

type QueryMethod = "capabilities" | "preview" | "get" | "list" | "getRun" | "listRuns" | "readEvents";
type ExecutionMethod = "requestCancel" | "answerInput";
type MutationMethod = Exclude<keyof AutomationClient, QueryMethod | ExecutionMethod>;
type MethodDefinition<Key extends keyof AutomationClient> = {
	input: Parameters<AutomationClient[Key]>[0];
	output: Awaited<ReturnType<AutomationClient[Key]>>;
	meta: object;
};

// Only the public Automation contract crosses the SDK boundary. The server
// router's context contains databases, processes and private provider types.
type AutomationRouter = TRPCBuiltRouter<{
	ctx: object;
	meta: object;
	errorShape: TRPCDefaultErrorShape;
	transformer: true;
}, {
	automations: {
		[Key in QueryMethod]: TRPCQueryProcedure<MethodDefinition<Key>>;
	} & {
		[Key in MutationMethod]: TRPCMutationProcedure<MethodDefinition<Key>>;
	};
	executions: {
		[Key in ExecutionMethod]: TRPCMutationProcedure<MethodDefinition<Key>>;
	};
}>;

type RequestOptions = { context?: Record<string, unknown>; signal?: AbortSignal };
type RequestMethod<Key extends keyof AutomationClient> =
	undefined extends MethodDefinition<Key>["input"]
		? (input?: MethodDefinition<Key>["input"], options?: RequestOptions) => Promise<MethodDefinition<Key>["output"]>
		: (input: MethodDefinition<Key>["input"], options?: RequestOptions) => Promise<MethodDefinition<Key>["output"]>;

export type LocalHostClient = {
	automations: {
		[Key in QueryMethod]: { query: RequestMethod<Key> };
	} & {
		[Key in MutationMethod]: { mutate: RequestMethod<Key> };
	};
	executions: {
		[Key in ExecutionMethod]: { mutate: RequestMethod<Key> };
	};
};

/**
 * Creates a typed client for one explicitly selected local Choros Host.
 *
 * This transport never exchanges a cloud API key, selects an organization, or
 * routes through the relay. The caller owns endpoint discovery and credentials.
 */
export function createLocalHostClient(
	options: LocalHostClientOptions,
): LocalHostClient {
	const endpoint = options.endpoint.replace(/\/+$/, "");
	const url = endpoint.endsWith("/trpc") ? endpoint : `${endpoint}/trpc`;

	return createTRPCClient<AutomationRouter>({
		links: [
			httpBatchLink({
				url,
				transformer: SuperJSON,
				methodOverride: "POST",
				headers: async () => {
					const auth = await options.auth();
					return {
						Authorization: `Bearer ${auth.token}`,
						...(auth.clientMachineId
							? { "x-choros-client-machine-id": auth.clientMachineId }
							: {}),
					};
				},
			}),
		],
	});
}
