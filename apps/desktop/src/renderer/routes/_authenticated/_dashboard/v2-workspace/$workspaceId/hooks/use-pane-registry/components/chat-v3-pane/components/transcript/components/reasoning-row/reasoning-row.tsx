import type { SessionSnapshot } from "@choros/chat/core";
import { displayText } from "@choros/chat/core";
import type { Reasoning as ReasoningItem } from "@choros/chat/protocol";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@choros/ui/ai-elements/reasoning";

export function ReasoningRow({
	item,
	snapshot,
}: {
	item: ReasoningItem;
	snapshot: SessionSnapshot;
}) {
	const text = displayText(snapshot, item.id);
	return (
		<Reasoning isStreaming={item.completedAtMs === undefined}>
			<ReasoningTrigger />
			<ReasoningContent>{text}</ReasoningContent>
		</Reasoning>
	);
}
