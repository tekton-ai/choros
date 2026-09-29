import type {
	AutomationRunStatus,
	AutomationState,
} from "@choros/shared/automation-contracts";
import { Badge } from "@choros/ui/badge";
import { useLingui } from "@lingui/react/macro";

type Status = AutomationState | AutomationRunStatus;

export function AutomationStatus({ status }: { status: Status }) {
	const { t } = useLingui();
	const labels: Record<Status, string> = {
		paused: t({ id: "automations.status.paused", message: "Paused" }),
		enabled: t({ id: "automations.status.enabled", message: "Enabled" }),
		finished: t({ id: "automations.status.finished", message: "Finished" }),
		archived: t({ id: "automations.status.archived", message: "Archived" }),
		preparing: t({ id: "automations.status.preparing", message: "Preparing" }),
		running: t({ id: "automations.status.running", message: "Running" }),
		waiting: t({ id: "automations.status.waiting", message: "Waiting" }),
		stopping: t({ id: "automations.status.stopping", message: "Stopping" }),
		succeeded: t({ id: "automations.status.succeeded", message: "Succeeded" }),
		failed: t({ id: "automations.status.failed", message: "Failed" }),
		skipped: t({ id: "automations.status.skipped", message: "Skipped" }),
		cancelled: t({ id: "automations.status.cancelled", message: "Cancelled" }),
		unknown: t({ id: "automations.status.unknown", message: "Unknown" }),
		needs_result: t({
			id: "automations.status.needsResult",
			message: "Needs result",
		}),
	};
	const variant =
		status === "failed" || status === "unknown"
			? "destructive"
			: status === "succeeded" || status === "enabled"
				? "default"
				: "secondary";
	return <Badge variant={variant}>{labels[status]}</Badge>;
}
