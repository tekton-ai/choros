import { Button } from "@choros/ui/button";
import { cn } from "@choros/ui/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { Monitor, RefreshCw, WifiOff } from "lucide-react";

interface WorkspaceHostUnreachableStateProps {
	hostName: string;
	/** Why this connection in particular is down. */
	detail: string;
	/** The socket is still dialling on its own backoff. */
	isReconnecting: boolean;
	onRetry: () => void;
	retryLabel?: string;
	retryBusyLabel?: string;
}

export function WorkspaceHostUnreachableState({
	hostName,
	detail,
	isReconnecting,
	onRetry,
	retryLabel,
	retryBusyLabel,
}: WorkspaceHostUnreachableStateProps) {
	const { t } = useLingui();
	const resolvedRetryLabel =
		retryLabel ??
		t({ id: "workspace.states.hostUnreachableRetry", message: "Retry" });
	const resolvedRetryBusyLabel =
		retryBusyLabel ??
		t({
			id: "workspace.states.hostUnreachableRetrying",
			message: "Retrying…",
		});
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-6">
				<div className="relative">
					<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
						<Monitor
							className="size-[18px] text-muted-foreground"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</div>
					<span
						aria-hidden="true"
						className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-muted-foreground/80 text-background ring-2 ring-background"
					>
						<WifiOff className="size-2.5" strokeWidth={3} />
					</span>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans id="workspace.states.hostUnreachableTitle">
							Host unreachable
						</Trans>
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						<Trans id="workspace.states.hostUnreachableBody">
							This workspace lives on a device Choros can't reach right now.
							Terminals, files, and agents stay put — they come back as soon as
							the connection does.
						</Trans>
					</p>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground/80">
						{detail}
					</p>
				</div>

				<div className="flex w-full flex-col gap-0 overflow-hidden rounded-md border border-border/60 bg-muted/30">
					<div className="flex items-center gap-2.5 px-3 py-2">
						<span
							aria-hidden="true"
							className={cn(
								"size-1.5 shrink-0 rounded-full",
								isReconnecting
									? "animate-pulse bg-yellow-500"
									: "bg-muted-foreground/40",
							)}
						/>
						<span
							className="select-text cursor-text min-w-0 truncate text-[13px] font-medium text-foreground"
							title={hostName}
						>
							{hostName}
						</span>
						<span className="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
							{isReconnecting
								? t({
										id: "workspace.states.hostUnreachableReconnecting",
										message: "Reconnecting",
									})
								: t({
										id: "workspace.states.hostUnreachableDisconnected",
										message: "Disconnected",
									})}
						</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="secondary"
						className="h-7 gap-1.5 px-2.5 text-[13px] font-medium"
						onClick={onRetry}
					>
						<RefreshCw
							className={cn("size-3.5", isReconnecting && "animate-spin")}
							strokeWidth={2}
							aria-hidden="true"
						/>
						{isReconnecting ? resolvedRetryBusyLabel : resolvedRetryLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
