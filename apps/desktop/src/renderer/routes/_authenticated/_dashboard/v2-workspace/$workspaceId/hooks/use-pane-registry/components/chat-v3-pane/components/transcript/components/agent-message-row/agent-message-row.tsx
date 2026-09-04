import type { SessionSnapshot } from "@choros/chat/core";
import { displayText } from "@choros/chat/core";
import type { AgentMessage } from "@choros/chat/protocol";
import { MarkdownView } from "../../../markdown-view";

export function AgentMessageRow({
	item,
	snapshot,
}: {
	item: AgentMessage;
	snapshot: SessionSnapshot;
}) {
	return <MarkdownView text={displayText(snapshot, item.id)} />;
}
