import type { ToolContent } from "@choros/chat/protocol";
import { DiffContent } from "./components/diff-content";
import { TerminalContent } from "./components/terminal-content";
import { TextContent } from "./components/text-content";

export function ToolContentList({
	itemId,
	items,
}: {
	itemId: string;
	items: readonly ToolContent[];
}) {
	return (
		<>
			{items.map((content, index) => {
				const key = `${itemId}:${index}`;
				switch (content.type) {
					case "diff":
						return <DiffContent content={content} key={key} />;
					case "terminal":
						return <TerminalContent content={content} key={key} />;
					case "text":
						return <TextContent key={key} text={content.text} />;
					default:
						return null;
				}
			})}
		</>
	);
}
