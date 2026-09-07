import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { useWorkspaceCreateNavigation } from "renderer/stores/workspace-creates/use-workspace-create-navigation";
import type { BaseBranchSource } from "../../../../../dashboard-new-workspace-draft-context";
import {
	type BranchFilter,
	useBranchContext,
} from "../../../hooks/use-branch-context";
import type {
	CompareBaseBranchPicker,
	OpenWorkspaceTarget,
} from "../../components/compare-base-branch-picker";

type PickerProps = React.ComponentProps<typeof CompareBaseBranchPicker>;

export interface UseBranchPickerControllerArgs {
	projectId: string | null;
	hostId: string | null;
	baseBranch: string | null;
	/** When set, used as the workspace name for picker actions; falls back to the branch name. */
	typedWorkspaceName: string;
	onBaseBranchChange: (
		branch: string | null,
		source: BaseBranchSource | null,
	) => void;
	closeModal: () => void;
}

/** Returns a `pickerProps` object ready to spread into `<CompareBaseBranchPicker />`. */
export function useBranchPickerController(args: UseBranchPickerControllerArgs) {
	const {
		projectId,
		hostId,
		baseBranch,
		typedWorkspaceName,
		onBaseBranchChange,
		closeModal,
	} = args;

	const { t } = useLingui();
	const beginNavigation = useWorkspaceCreateNavigation();
	const { machineId } = useLocalHostService();
	const { submit } = useWorkspaceCreates();

	// `null` hostId means "local active machine"; pin to the device's machineId
	// so workspace lookups (keyed by hostId) hit the right host.
	const resolvedHostId = hostId ?? machineId;

	const [branchSearch, setBranchSearch] = useState("");
	const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");

	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useBranchContext(projectId, hostId, branchSearch, branchFilter);

	const effectiveCompareBaseBranch = baseBranch || defaultBranch || null;

	// Picker actions bypass the modal's submit pipeline (and its `resolveNames`
	// pass), so we mirror its branch-name fallback here.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => typedWorkspaceName.trim() || branchName,
		[typedWorkspaceName],
	);

	// Server's `workspaces.create` resolves all three cases (open tracked,
	// adopt foreign worktree, fresh create). Navigate to the optimistic id;
	// a failed create surfaces on the workspace route's error state.
	const onOpenWorkspace = useCallback(
		(target: OpenWorkspaceTarget) => {
			const navigation = beginNavigation();
			if (!projectId) {
				toast.error(
					t({
						id: "dashboard.newWorkspaceModal.branchPicker.selectProjectFirst",
						message: "Select a project first",
					}),
				);
				return;
			}
			if (!resolvedHostId) {
				toast.error(
					t({
						id: "dashboard.newWorkspaceModal.branchPicker.noActiveHost",
						message: "No active host",
					}),
				);
				return;
			}
			const branchName = target.branchName;
			const snapshotId = crypto.randomUUID();
			const workspaceName = resolveActionWorkspaceName(branchName);
			const handle = submit({
				hostId: resolvedHostId,
				profileContext: navigation.profileContext,
				snapshot: {
					id: snapshotId,
					projectId,
					name: workspaceName,
					branch: branchName,
					...(target.worktreePath ? { worktreePath: target.worktreePath } : {}),
				},
			});
			void navigation.follow(handle, closeModal).catch((error) => {
				console.error(
					"[useBranchPickerController] failed to open workspace",
					error,
				);
			});
		},
		[
			projectId,
			resolvedHostId,
			resolveActionWorkspaceName,
			submit,
			closeModal,
			beginNavigation,
			t,
		],
	);

	const onSelectCompareBaseBranch = useCallback(
		(branch: string, source: BaseBranchSource) => {
			onBaseBranchChange(branch, source);
		},
		[onBaseBranchChange],
	);

	const onLoadMore = useCallback(() => {
		void fetchNextPage();
	}, [fetchNextPage]);

	const pickerProps: PickerProps = {
		effectiveCompareBaseBranch,
		defaultBranch,
		isBranchesLoading,
		isBranchesError,
		branches,
		branchSearch,
		onBranchSearchChange: setBranchSearch,
		branchFilter,
		onBranchFilterChange: setBranchFilter,
		isFetchingNextPage,
		hasNextPage: hasNextPage ?? false,
		onLoadMore,
		onSelectCompareBaseBranch,
		onOpenWorkspace,
	};

	return { pickerProps };
}
