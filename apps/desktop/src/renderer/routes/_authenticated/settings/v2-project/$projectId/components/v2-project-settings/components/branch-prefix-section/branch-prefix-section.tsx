import { errorMessage } from "@choros/i18n/errors";
import type { BranchPrefixMode } from "@choros/shared/workspace-launch";
import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { BranchPrefixControl } from "renderer/routes/_authenticated/settings/components/branch-prefix-control";

interface BranchPrefixSectionProps {
	projectId: string;
	hostUrl: string;
	/** Current override; `null` means the project inherits the host default. */
	mode: BranchPrefixMode | null;
	customPrefix: string | null;
	onChanged: () => void;
}

export function BranchPrefixSection({
	projectId,
	hostUrl,
	mode,
	customPrefix,
	onChanged,
}: BranchPrefixSectionProps) {
	const { t } = useLingui();
	const setMutation = useMutation({
		mutationFn: (vars: {
			mode: BranchPrefixMode | null;
			customPrefix: string | null;
		}) =>
			getHostServiceClientByUrl(hostUrl).project.setBranchPrefix.mutate({
				projectId,
				...vars,
			}),
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						id: "settings.project.branchPrefixFailedToast",
						message: "Failed to update branch prefix",
					}),
				),
			),
	});

	return (
		<BranchPrefixControl
			mode={mode}
			customPrefix={customPrefix}
			showDefault
			disabled={setMutation.isPending}
			onChange={(next) => setMutation.mutate(next)}
		/>
	);
}
