"use client";

import { useComments } from "../../providers/comment-provider";
import { CommentModeButton } from "./components/comment-mode-button";

export function CommentModeToggle() {
	const { enabled, toggleEnabled, threads } = useComments();

	return (
		<CommentModeButton
			enabled={enabled}
			openCount={threads.filter((thread) => !thread.resolved).length}
			onToggle={toggleEnabled}
		/>
	);
}
