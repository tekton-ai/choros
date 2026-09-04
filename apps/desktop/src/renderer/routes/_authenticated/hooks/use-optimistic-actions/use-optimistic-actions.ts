import { toast } from "@choros/ui/sonner";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import {
	type TrackableWorkspaceTransactionState,
	useWorkspaceTransactionsStore,
	type WorkspaceTransactionType,
} from "renderer/stores/workspace-creates";

export type PersistableTransaction = {
	id: string;
	state: TrackableWorkspaceTransactionState;
	createdAt: Date;
	mutations: Array<{ type: WorkspaceTransactionType }>;
	isPersisted: { promise: Promise<unknown> };
};

interface V2WorkspacePatch {
	name?: string;
	branch?: string;
	tags?: string[];
}

function makeTransaction(
	type: WorkspaceTransactionType,
	promise: Promise<unknown>,
): PersistableTransaction {
	return {
		id: crypto.randomUUID(),
		state: "persisting",
		createdAt: new Date(),
		mutations: [{ type }],
		isPersisted: { promise },
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	return "The local change was rolled back.";
}

function useOptimisticMutationRunner() {
	return useCallback(
		(
			failureTitle: string,
			mutation: () => PersistableTransaction,
		): PersistableTransaction | null => {
			try {
				const transaction = mutation();
				void transaction.isPersisted.promise.catch((error) => {
					console.error(`[optimistic.v2Workspaces] ${failureTitle}:`, error);
					toast.error(failureTitle, { description: errorMessage(error) });
				});
				return transaction;
			} catch (error) {
				console.error(`[optimistic.v2Workspaces] ${failureTitle}:`, error);
				toast.error(failureTitle, { description: errorMessage(error) });
				return null;
			}
		},
		[],
	);
}

export function useOptimisticActions() {
	const { workspaces, cache } = useHostWorkspaces();
	const runMutation = useOptimisticMutationRunner();
	const trackTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);

	return useMemo(() => {
		const updateWorkspace = (workspaceId: string, patch: V2WorkspacePatch) => {
			const transaction = runMutation("Failed to update workspace", () => {
				const workspace = workspaces.find((item) => item.id === workspaceId);
				if (!workspace) throw new Error("Workspace not found");
				const hostUrl = cache.resolveHostUrl(workspace.hostId);
				if (!hostUrl) throw new Error("The local host service is unavailable.");

				cache.upsertWorkspace({
					...workspace,
					...patch,
					worktreePath: workspace.worktreePath ?? "",
					worktreeExists: workspace.worktreeExists ?? true,
					updatedAt: new Date(),
				});
				const promise = getHostServiceClientByUrl(hostUrl)
					.workspace.update.mutate({ id: workspaceId, ...patch })
					.catch((error: unknown) => {
						cache.invalidateHost(workspace.hostId);
						throw error;
					});
				return makeTransaction("update", promise);
			});
			if (transaction) trackTransaction(workspaceId, transaction);
			return transaction;
		};

		return {
			v2Workspaces: {
				updateWorkspace,
				renameWorkspace: (workspaceId: string, name: string) =>
					updateWorkspace(workspaceId, { name }),
			},
		};
	}, [cache, runMutation, trackTransaction, workspaces]);
}
