import type { SessionClient } from "@choros/chat/client";
import type { UserContent } from "@choros/chat/protocol";
import { useApprovals, useChatSession, useTimeline } from "@choros/chat/react";
import { Loader } from "@choros/ui/ai-elements/loader";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Composer } from "../composer";
import { SessionHeader } from "../session-header";
import { Transcript } from "../transcript";

export function SessionView({
	client,
	headerLeft,
	pendingFirstPrompt,
	onFirstPromptSent,
	sessionId,
}: {
	client: SessionClient;
	sessionId: string;
	headerLeft?: ReactNode;
	pendingFirstPrompt: UserContent[] | null;
	onFirstPromptSent: () => void;
}) {
	const session = useChatSession({ client });
	const timeline = useTimeline(session.snapshot);
	const approvals = useApprovals(session.snapshot);

	const firstPromptSentRef = useRef(false);
	useEffect(() => {
		if (!pendingFirstPrompt || firstPromptSentRef.current) return;
		if (session.status !== "ready") return;
		firstPromptSentRef.current = true;
		session.sendPrompt(pendingFirstPrompt);
		onFirstPromptSent();
	}, [pendingFirstPrompt, session, onFirstPromptSent]);

	const runningTurnId = useMemo(() => {
		for (const turn of session.snapshot.turns.values()) {
			if (turn.status === "running") return turn.id;
		}
		return null;
	}, [session.snapshot.turns]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<SessionHeader
				connection={session.connection}
				left={headerLeft}
				session={session.snapshot.session}
			/>
			{session.status === "loading" ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader />
				</div>
			) : (
				<Transcript
					approvals={approvals}
					groups={timeline}
					hasOlder={session.hasOlder}
					onDiscardPrompt={session.discardPrompt}
					onLoadOlder={() => void session.loadOlder()}
					onRespond={(approvalId, decision) =>
						void session.respondToApproval(approvalId, decision)
					}
					onRetryPrompt={session.retryPrompt}
					outbox={session.outbox}
					snapshot={session.snapshot}
				/>
			)}
			<Composer
				disabled={session.status !== "ready"}
				draftKey={`chat-v3-draft:${sessionId}`}
				onCancelTurn={
					runningTurnId ? () => void session.cancelTurn(runningTurnId) : null
				}
				onSend={(content) => session.sendPrompt(content)}
				outbox={session.outbox}
			/>
		</div>
	);
}
