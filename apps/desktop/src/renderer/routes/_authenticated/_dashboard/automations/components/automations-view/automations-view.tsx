import { formatDateTime } from "@choros/i18n/format";
import type {
	Automation,
	AutomationPreview,
	AutomationRun,
} from "@choros/shared/automation-contracts";
import { describeAutomationSchedule } from "@choros/shared/automation-schedule";
import { Button } from "@choros/ui/button";
import { Input } from "@choros/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@choros/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@choros/ui/tabs";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	LuArchive,
	LuCirclePlay,
	LuPause,
	LuPencil,
	LuPlus,
	LuRotateCcw,
} from "react-icons/lu";
import { useAutomations } from "renderer/hooks/host-service/use-automations";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { AutomationEditor } from "../automation-editor";
import { AutomationStatus } from "../automation-status";

type ViewTab = "schedules" | "history" | "attention";

function isPending(run: AutomationRun): boolean {
	return ["waiting", "needs_result", "unknown"].includes(run.status);
}

function formatInstant(value: string, timeZone?: string): string {
	return formatDateTime(new Date(value), {
		dateStyle: "medium",
		timeStyle: "short",
		...(timeZone ? { timeZone } : {}),
	});
}

export function AutomationsView() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const profiles = useProfiles();
	const data = useAutomations();
	const [tab, setTab] = useState<ViewTab>("schedules");
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [editing, setEditing] = useState<Automation | "new" | null>(null);
	const [enablePreview, setEnablePreview] = useState<{
		automation: Automation;
		preview: AutomationPreview;
	} | null>(null);
	const [archiveCandidate, setArchiveCandidate] = useState<Automation | null>(
		null,
	);
	const [actionError, setActionError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const ownership = useMemo(
		() =>
			new Map(
				data.automations.map((automation) => [
					automation.id,
					data.ownershipFor(automation),
				]),
			),
		[data],
	);
	const visibleAutomations = useMemo(
		() =>
			data.automations.filter((automation) => {
				const owner = ownership.get(automation.id);
				return (
					!profiles.enabled || owner?.profileId === profiles.activeProfileId
				);
			}),
		[data.automations, ownership, profiles.activeProfileId, profiles.enabled],
	);
	const filteredAutomations = visibleAutomations.filter(
		(automation) =>
			automation.definition.name
				.toLocaleLowerCase()
				.includes(query.toLocaleLowerCase()) &&
			(statusFilter === "all" ||
				automation.state === statusFilter ||
				automation.lastRun?.status === statusFilter) &&
			(statusFilter !== "all" ||
				!["immediate", "once"].includes(automation.definition.schedule.kind) ||
				automation.nextRunAt !== null ||
				!["succeeded", "failed", "skipped", "cancelled"].includes(
					automation.lastRun?.status ?? "",
				)),
	);
	const filteredRuns = data.runs.filter((run) => {
		const automation = data.automations.find(
			(row) => row.id === run.automationId,
		);
		if (!automation) return false;
		const owner = ownership.get(automation.id);
		const inProfile =
			!profiles.enabled || owner?.profileId === profiles.activeProfileId;
		const matches = run.definition.name
			.toLocaleLowerCase()
			.includes(query.toLocaleLowerCase());
		return (
			inProfile &&
			matches &&
			(statusFilter === "all" || run.status === statusFilter)
		);
	});
	const pendingRuns = data.runs.filter(isPending);
	const invalidTargets = data.automations.filter(
		(automation) => !ownership.get(automation.id)?.targetAvailable,
	);

	const runAction = async (id: string, operation: () => Promise<unknown>) => {
		setBusyId(id);
		setActionError(null);
		try {
			await operation();
		} catch (cause) {
			setActionError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusyId(null);
		}
	};

	const beginEnable = async (automation: Automation) => {
		await runAction(automation.id, async () => {
			const preview = await data.preview(automation.definition, {
				automationId: automation.id,
				expectedVersion: automation.version,
				intent: "enable",
			});
			setEnablePreview({ automation, preview });
		});
	};

	const openRun = (runId: string) => {
		void navigate({ to: "/automations/runs/$runId", params: { runId } });
	};

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-6 py-4">
				<div className="min-w-0 flex-1">
					<h1 className="text-xl font-semibold">
						<Trans id="automations.title">Automations</Trans>
					</h1>
					<p className="text-sm text-muted-foreground">
						<Trans id="automations.subtitle">
							Schedule work, review durable results, and respond to pending
							runs.
						</Trans>
					</p>
				</div>
				<Button onClick={() => setEditing("new")}>
					<LuPlus className="size-4" />
					<Trans id="automations.new">New</Trans>
				</Button>
			</header>
			<div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-6 py-3">
				<Tabs value={tab} onValueChange={(value) => setTab(value as ViewTab)}>
					<TabsList>
						<TabsTrigger value="schedules">
							<Trans id="automations.tab.schedules">Schedules</Trans>
						</TabsTrigger>
						<TabsTrigger value="history">
							<Trans id="automations.tab.history">Run history</Trans>
						</TabsTrigger>
						<TabsTrigger value="attention">
							<Trans id="automations.tab.attention">Attention</Trans>
							{pendingRuns.length + invalidTargets.length > 0
								? ` (${pendingRuns.length + invalidTargets.length})`
								: ""}
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger
						className="w-44"
						aria-label={t({
							id: "automations.filter.statusAria",
							message: "Filter by status",
						})}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							<Trans id="automations.filter.all">All statuses</Trans>
						</SelectItem>
						<SelectItem value="enabled">
							<Trans id="automations.status.enabled">Enabled</Trans>
						</SelectItem>
						<SelectItem value="paused">
							<Trans id="automations.status.paused">Paused</Trans>
						</SelectItem>
						<SelectItem value="finished">
							<Trans id="automations.status.finished">Finished</Trans>
						</SelectItem>
						<SelectItem value="archived">
							<Trans id="automations.status.archived">Archived</Trans>
						</SelectItem>
						<SelectItem value="preparing">
							<Trans id="automations.status.preparing">Preparing</Trans>
						</SelectItem>
						<SelectItem value="running">
							<Trans id="automations.status.running">Running</Trans>
						</SelectItem>
						<SelectItem value="waiting">
							<Trans id="automations.status.waiting">Waiting</Trans>
						</SelectItem>
						<SelectItem value="succeeded">
							<Trans id="automations.status.succeeded">Succeeded</Trans>
						</SelectItem>
						<SelectItem value="failed">
							<Trans id="automations.status.failed">Failed</Trans>
						</SelectItem>
						<SelectItem value="skipped">
							<Trans id="automations.status.skipped">Skipped</Trans>
						</SelectItem>
						<SelectItem value="cancelled">
							<Trans id="automations.status.cancelled">Cancelled</Trans>
						</SelectItem>
						<SelectItem value="unknown">
							<Trans id="automations.status.unknown">Unknown</Trans>
						</SelectItem>
						<SelectItem value="needs_result">
							<Trans id="automations.status.needsResult">Needs result</Trans>
						</SelectItem>
					</SelectContent>
				</Select>
				<Input
					className="ml-auto max-w-xs"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t({
						id: "automations.search",
						message: "Search automations",
					})}
					aria-label={t({
						id: "automations.searchAria",
						message: "Search automations",
					})}
				/>
			</div>

			{(data.error || actionError) && (
				<div
					role="alert"
					className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{actionError ?? data.error}
					<Button
						variant="ghost"
						size="sm"
						className="ml-2"
						onClick={() => void data.refresh()}
					>
						<Trans id="automations.retryLoad">Retry</Trans>
					</Button>
				</div>
			)}
			{enablePreview && (
				<div className="mx-6 mt-4 rounded-md border border-border bg-muted/30 p-4">
					<h2 className="font-medium">
						<Trans id="automations.enableConfirmTitle">
							Confirm enabling this schedule
						</Trans>
					</h2>
					<p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
						{enablePreview.preview.summary}
					</p>
					<div className="mt-3 flex gap-2">
						<Button
							disabled={busyId === enablePreview.automation.id}
							onClick={() =>
								void runAction(enablePreview.automation.id, async () => {
									await data.setScheduleState(
										enablePreview.automation,
										"enabled",
										enablePreview.preview.confirmationToken,
									);
									setEnablePreview(null);
								})
							}
						>
							<Trans id="automations.enableConfirm">Enable schedule</Trans>
						</Button>
						<Button variant="outline" onClick={() => setEnablePreview(null)}>
							<Trans id="automations.dismiss">Back</Trans>
						</Button>
					</div>
				</div>
			)}
			{archiveCandidate && (
				<div className="mx-6 mt-4 rounded-md border border-border bg-muted/30 p-4">
					<h2 className="font-medium">
						<Trans id="automations.archiveConfirmTitle">
							Archive this automation?
						</Trans>
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans id="automations.archiveConfirmBody">
							Future runs will stop. Existing history, files, and an active run
							are retained.
						</Trans>
					</p>
					<div className="mt-3 flex gap-2">
						<Button
							variant="destructive"
							disabled={busyId === archiveCandidate.id}
							onClick={() =>
								void runAction(archiveCandidate.id, async () => {
									await data.archive(archiveCandidate);
									setArchiveCandidate(null);
								})
							}
						>
							<Trans id="automations.archiveConfirm">Archive</Trans>
						</Button>
						<Button variant="outline" onClick={() => setArchiveCandidate(null)}>
							<Trans id="automations.dismiss">Back</Trans>
						</Button>
					</div>
				</div>
			)}

			<main className="min-h-0 flex-1 overflow-auto p-6">
				<div
					className={
						editing
							? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]"
							: ""
					}
				>
					<div className="space-y-3">
						{data.isLoading ? (
							<div className="py-16 text-center text-sm text-muted-foreground">
								<Trans id="automations.loading">Loading automations…</Trans>
							</div>
						) : null}
						{tab === "schedules" &&
							filteredAutomations.map((automation) => {
								const timeZone =
									"timeZone" in automation.definition.schedule
										? automation.definition.schedule.timeZone
										: undefined;
								const nextRun = automation.nextRunAt
									? formatInstant(automation.nextRunAt, timeZone)
									: "";
								const usedRounds = automation.usedRounds;
								return (
									<article
										key={automation.id}
										className="rounded-lg border border-border bg-card p-4"
									>
										<div className="flex flex-wrap items-start gap-3">
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<h2 className="truncate font-medium">
														{automation.definition.name}
													</h2>
													<AutomationStatus status={automation.state} />
													{!ownership.get(automation.id)?.targetAvailable && (
														<span className="text-xs font-medium text-destructive">
															<Trans id="automations.targetUnavailable">
																Target unavailable
															</Trans>
														</span>
													)}
												</div>
												<p className="mt-1 text-sm text-muted-foreground">
													{describeAutomationSchedule(automation.definition)}
												</p>
												<p className="mt-1 text-xs text-muted-foreground">
													{automation.nextRunAt ? (
														t({
															id: "automations.nextRun",
															message: `Next: ${nextRun}`,
														})
													) : (
														<Trans id="automations.noNextRun">
															No next run
														</Trans>
													)}{" "}
													·{" "}
													{t({
														id: "automations.usedRounds",
														message: `${usedRounds} scheduled rounds used`,
													})}
												</p>
											</div>
											<div className="flex flex-wrap gap-1">
												<Button
													size="sm"
													variant="ghost"
													disabled={busyId === automation.id}
													onClick={() =>
														void runAction(automation.id, () =>
															data.runNow(automation),
														)
													}
												>
													<LuCirclePlay className="size-4" />
													<Trans id="automations.runNow">Run now</Trans>
												</Button>
												{automation.state === "enabled" ? (
													<Button
														size="sm"
														variant="ghost"
														disabled={busyId === automation.id}
														onClick={() =>
															void runAction(automation.id, () =>
																data.setScheduleState(automation, "paused"),
															)
														}
													>
														<LuPause className="size-4" />
														<Trans id="automations.pause">Pause</Trans>
													</Button>
												) : (
													automation.state !== "archived" && (
														<Button
															size="sm"
															variant="ghost"
															disabled={
																busyId === automation.id ||
																automation.definition.schedule.kind ===
																	"immediate"
															}
															onClick={() => void beginEnable(automation)}
														>
															<Trans id="automations.enable">Enable</Trans>
														</Button>
													)
												)}
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setEditing(automation)}
												>
													<LuPencil className="size-4" />
													<Trans id="automations.edit">Edit</Trans>
												</Button>
												{automation.state !== "archived" && (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => setArchiveCandidate(automation)}
													>
														<LuArchive className="size-4" />
														<Trans id="automations.archive">Archive</Trans>
													</Button>
												)}
											</div>
										</div>
										{automation.lastRun && (
											<button
												type="button"
												className="mt-3 flex w-full items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted"
												onClick={() => openRun(automation.lastRun!.id)}
											>
												<AutomationStatus status={automation.lastRun.status} />
												<span className="truncate">
													{automation.lastRun.report?.summary ??
														automation.lastRun.reason ??
														automation.lastRun.stage ??
														t({
															id: "automations.runNoSummary",
															message: "Open run details",
														})}
												</span>
											</button>
										)}
									</article>
								);
							})}
						{tab === "history" &&
							filteredRuns.map((run) => (
								<div
									key={run.id}
									className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40"
								>
									<button
										type="button"
										className="flex min-w-0 flex-1 items-center gap-3 text-left"
										onClick={() => openRun(run.id)}
									>
										<AutomationStatus status={run.status} />
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium">
												{run.definition.name}
											</div>
											<div className="truncate text-sm text-muted-foreground">
												{run.report?.summary ??
													run.reason ??
													run.stage ??
													t({
														id: "automations.runNoSummary",
														message: "Open run details",
													})}
											</div>
										</div>
										<div className="shrink-0 text-xs text-muted-foreground">
											{formatInstant(run.createdAt)}
										</div>
									</button>
									{[
										"failed",
										"cancelled",
										"skipped",
										"unknown",
										"needs_result",
									].includes(run.status) && (
										<Button
											size="sm"
											variant="outline"
											disabled={busyId === run.id}
											onClick={(event) => {
												event.stopPropagation();
												void runAction(run.id, () => data.retryRun(run));
											}}
										>
											<LuRotateCcw className="size-4" />
											<Trans id="automations.retryRun">Retry</Trans>
										</Button>
									)}
								</div>
							))}
						{tab === "attention" && (
							<>
								<section className="space-y-3">
									<h2 className="text-sm font-semibold">
										<Trans id="automations.pendingRuns">
											Pending runs across all Work Profiles
										</Trans>
									</h2>
									{pendingRuns.map((run) => {
										const automation = data.automations.find(
											(row) => row.id === run.automationId,
										);
										const profileId = automation
											? ownership.get(automation.id)?.profileId
											: null;
										const profileName = profiles.profiles.find(
											(profile) => profile.id === profileId,
										)?.name;
										return (
											<button
												type="button"
												key={run.id}
												className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40"
												onClick={() => {
													if (
														profileId &&
														profileId !== profiles.activeProfileId
													)
														profiles.selectProfile(profileId);
													openRun(run.id);
												}}
											>
												<AutomationStatus status={run.status} />
												<div className="min-w-0 flex-1">
													<div className="truncate font-medium">
														{run.definition.name}
													</div>
													<div className="truncate text-sm text-muted-foreground">
														{run.inputs.find(
															(input) => input.status === "pending",
														)?.question ??
															run.reason ??
															t({
																id: "automations.attentionReview",
																message: "Review this run",
															})}
													</div>
												</div>
												{profileName && (
													<span className="text-xs text-muted-foreground">
														{profileName}
													</span>
												)}
											</button>
										);
									})}
									{pendingRuns.length === 0 && (
										<p className="text-sm text-muted-foreground">
											<Trans id="automations.noPendingRuns">
												No runs need a response.
											</Trans>
										</p>
									)}
								</section>
								<section className="mt-6 space-y-3">
									<h2 className="text-sm font-semibold">
										<Trans id="automations.invalidTargets">
											Unavailable targets
										</Trans>
									</h2>
									{invalidTargets.map((automation) => (
										<article
											key={automation.id}
											className="rounded-lg border border-destructive/30 bg-card p-4"
										>
											<div className="flex items-center justify-between gap-3">
												<div>
													<div className="font-medium">
														{automation.definition.name}
													</div>
													<div className="text-sm text-destructive">
														<Trans id="automations.invalidTargetBody">
															The saved project or workspace no longer resolves.
															Future dispatch is blocked.
														</Trans>
													</div>
												</div>
												<Button
													size="sm"
													variant="outline"
													onClick={() => setEditing(automation)}
												>
													<Trans id="automations.repairTarget">
														Edit target
													</Trans>
												</Button>
											</div>
										</article>
									))}
									{invalidTargets.length === 0 && (
										<p className="text-sm text-muted-foreground">
											<Trans id="automations.noInvalidTargets">
												No unavailable targets.
											</Trans>
										</p>
									)}
								</section>
							</>
						)}
						{!data.isLoading &&
							tab === "schedules" &&
							filteredAutomations.length === 0 && (
								<div className="py-16 text-center text-sm text-muted-foreground">
									<Trans id="automations.emptySchedules">
										No automations in this Work Profile.
									</Trans>
								</div>
							)}
						{!data.isLoading &&
							tab === "history" &&
							filteredRuns.length === 0 && (
								<div className="py-16 text-center text-sm text-muted-foreground">
									<Trans id="automations.emptyHistory">
										No run history in this Work Profile.
									</Trans>
								</div>
							)}
					</div>
					{editing && (
						<AutomationEditor
							key={
								editing === "new" ? "new" : `${editing.id}:${editing.version}`
							}
							automation={editing === "new" ? undefined : editing}
							onClose={() => setEditing(null)}
						/>
					)}
				</div>
			</main>
		</div>
	);
}
