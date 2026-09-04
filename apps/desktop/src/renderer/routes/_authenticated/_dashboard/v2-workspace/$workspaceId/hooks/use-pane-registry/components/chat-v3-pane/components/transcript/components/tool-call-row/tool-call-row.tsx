import type { ToolCall, ToolCallStatus } from "@choros/chat/protocol";
import type { ToolDisplayState } from "@choros/ui/ai-elements/tool";
import { Tool, ToolContent, ToolHeader } from "@choros/ui/ai-elements/tool";
import { Badge } from "@choros/ui/badge";
import { ToolContentList } from "../tool-content-list";

const STATE_BY_STATUS: Record<ToolCallStatus, ToolDisplayState> = {
	running: "input-available",
	completed: "output-available",
	failed: "output-error",
	declined: "output-denied",
	canceled: "output-denied",
};

function durationLabel(item: ToolCall): string | null {
	if (item.completedAtMs === undefined) return null;
	return `${((item.completedAtMs - item.startedAtMs) / 1000).toFixed(1)}s`;
}

export function ToolCallRow({ item }: { item: ToolCall }) {
	const duration = durationLabel(item);
	return (
		<Tool defaultOpen={item.status === "running"}>
			<ToolHeader
				state={STATE_BY_STATUS[item.status]}
				title={item.title}
				type={item.toolName}
			/>
			<ToolContent>
				<div className="flex flex-col gap-2 p-2">
					<div className="flex items-center gap-2">
						<Badge
							variant={
								item.status === "failed" || item.status === "declined"
									? "destructive"
									: "secondary"
							}
						>
							{item.status}
						</Badge>
						{duration && (
							<span className="text-xs text-muted-foreground">{duration}</span>
						)}
						<span className="truncate font-mono text-xs text-muted-foreground">
							{item.toolName}
						</span>
					</div>
					<ToolContentList itemId={item.id} items={item.content} />
				</div>
			</ToolContent>
		</Tool>
	);
}
