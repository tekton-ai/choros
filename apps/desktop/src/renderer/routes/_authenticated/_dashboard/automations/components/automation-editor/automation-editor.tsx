import type {
	Automation,
	AutomationDefinition,
	AutomationPreview,
	AutomationSchedule,
} from "@choros/shared/automation-contracts";
import { Button } from "@choros/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@choros/ui/card";
import { Input } from "@choros/ui/input";
import { Label } from "@choros/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@choros/ui/select";
import { Textarea } from "@choros/ui/textarea";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useAutomations } from "renderer/hooks/host-service/use-automations";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";

type ConfirmAction = "save" | "enable" | "run";

function defaultDefinition(
	projectId: string | undefined,
	workspaceId: string | undefined,
): AutomationDefinition {
	return {
		name: "",
		instructions: "",
		target: projectId
			? { kind: "newWorktree", projectId, baseRef: "HEAD" }
			: {
					kind: "existingWorkspace",
					workspaceId: workspaceId ?? "",
					setupPolicy: "prepared",
				},
		executor: {
			harness: "claude-code",
			accountRef: "default",
			sessionMode: "fresh",
		},
		schedule: { kind: "immediate" },
		stop: {},
		missedRunWindowSeconds: 3600,
		setupTimeoutSeconds: 600,
	};
}

function scheduleForKind(
	kind: AutomationSchedule["kind"],
	previous: AutomationSchedule,
): AutomationSchedule {
	const startsAt =
		"startsAt" in previous
			? previous.startsAt
			: "at" in previous
				? previous.at
				: new Date(Date.now() + 60 * 60 * 1000).toISOString();
	const timeZone =
		"timeZone" in previous
			? previous.timeZone
			: Intl.DateTimeFormat().resolvedOptions().timeZone;
	switch (kind) {
		case "immediate":
			return { kind };
		case "once":
			return { kind, at: startsAt, timeZone };
		case "calendar":
			return {
				kind,
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				startsAt,
				timeZone,
			};
		case "fixedInterval":
			return { kind, startsAt, intervalSeconds: 3600, timeZone };
		case "afterCompletion":
			return { kind, startsAt, intervalSeconds: 3600, timeZone };
	}
}

export function AutomationEditor({
	automation,
	onClose,
}: {
	automation?: Automation;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { projects } = useHostProjects();
	const { workspaces } = useHostWorkspaces();
	const automations = useAutomations();
	const [definition, setDefinition] = useState<AutomationDefinition>(() =>
		automation?.definition
			? structuredClone(automation.definition)
			: defaultDefinition(projects[0]?.projectKey, workspaces[0]?.id),
	);
	const [preview, setPreview] = useState<AutomationPreview | null>(null);
	const [action, setAction] = useState<ConfirmAction>("save");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const expiresAt = preview?.expiresAt ?? "";

	const updateSchedule = (patch: Partial<AutomationSchedule>) => {
		setDefinition((current) => ({
			...current,
			schedule: { ...current.schedule, ...patch } as AutomationSchedule,
		}));
	};

	const handlePreview = async (nextAction: ConfirmAction) => {
		setBusy(true);
		setError(null);
		try {
			const result = await automations.preview(definition, {
				automationId: automation?.id,
				expectedVersion: automation?.version,
				intent: automation ? "save" : nextAction,
			});
			setAction(nextAction);
			setPreview(result);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	const handleConfirm = async () => {
		if (!preview) return;
		setBusy(true);
		setError(null);
		try {
			if (automation) {
				await automations.update(automation, preview.confirmationToken);
			} else {
				const created = await automations.create(
					preview.confirmationToken,
					action === "run",
				);
				if (action === "enable") {
					const enablePreview = await automations.preview(
						created.automation.definition,
						{
							automationId: created.automation.id,
							expectedVersion: created.automation.version,
							intent: "enable",
						},
					);
					await automations.setScheduleState(
						created.automation,
						"enabled",
						enablePreview.confirmationToken,
					);
				}
				if (created.run) {
					onClose();
					await navigate({
						to: "/automations/runs/$runId",
						params: { runId: created.run.id },
					});
					return;
				}
			}
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="h-fit border-border/70">
			<CardHeader>
				<CardTitle>
					{automation ? (
						<Trans id="automations.editor.editTitle">Edit automation</Trans>
					) : (
						<Trans id="automations.editor.createTitle">New automation</Trans>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="automation-name">
							<Trans id="automations.editor.name">Name</Trans>
						</Label>
						<Input
							id="automation-name"
							value={definition.name}
							onChange={(event) =>
								setDefinition({ ...definition, name: event.target.value })
							}
						/>
					</div>
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="automation-instructions">
							<Trans id="automations.editor.instructions">Instructions</Trans>
						</Label>
						<Textarea
							id="automation-instructions"
							rows={6}
							value={definition.instructions}
							onChange={(event) =>
								setDefinition({
									...definition,
									instructions: event.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>
							<Trans id="automations.editor.targetKind">Target type</Trans>
						</Label>
						<Select
							value={definition.target.kind}
							onValueChange={(value) => {
								const kind = value as "newWorktree" | "existingWorkspace";
								setDefinition({
									...definition,
									target:
										kind === "newWorktree"
											? {
													kind,
													projectId: projects[0]?.projectKey ?? "",
													baseRef: "HEAD",
												}
											: {
													kind,
													workspaceId: workspaces[0]?.id ?? "",
													setupPolicy: "prepared",
												},
								});
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="newWorktree">
									<Trans id="automations.editor.newWorktree">
										New worktree
									</Trans>
								</SelectItem>
								<SelectItem value="existingWorkspace">
									<Trans id="automations.editor.existingWorkspace">
										Existing workspace
									</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{definition.target.kind === "newWorktree" ? (
						<>
							<div className="space-y-2">
								<Label>
									<Trans id="automations.editor.project">Project</Trans>
								</Label>
								<Select
									value={definition.target.projectId}
									onValueChange={(projectId) =>
										setDefinition((previous) =>
											previous.target.kind !== "newWorktree"
												? previous
												: {
														...previous,
														target: { ...previous.target, projectId },
													},
										)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{projects.map((project) => (
											<SelectItem
												key={project.projectKey}
												value={project.projectKey}
											>
												{project.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2 md:col-span-2">
								<Label htmlFor="automation-base-ref">
									<Trans id="automations.editor.baseRef">Base ref</Trans>
								</Label>
								<Input
									id="automation-base-ref"
									value={definition.target.baseRef}
									onChange={(event) => {
										const baseRef = event.target.value;
										setDefinition((previous) =>
											previous.target.kind !== "newWorktree"
												? previous
												: {
														...previous,
														target: { ...previous.target, baseRef },
													},
										);
									}}
								/>
							</div>
						</>
					) : (
						<>
							<div className="space-y-2">
								<Label>
									<Trans id="automations.editor.workspace">Workspace</Trans>
								</Label>
								<Select
									value={definition.target.workspaceId}
									onValueChange={(workspaceId) =>
										setDefinition((previous) =>
											previous.target.kind !== "existingWorkspace"
												? previous
												: {
														...previous,
														target: { ...previous.target, workspaceId },
													},
										)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{workspaces.map((workspace) => (
											<SelectItem key={workspace.id} value={workspace.id}>
												{workspace.name || workspace.branch}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>
									<Trans id="automations.editor.setupPolicy">
										Setup policy
									</Trans>
								</Label>
								<Select
									value={definition.target.setupPolicy}
									onValueChange={(value) => {
										const setupPolicy = value as "everyRun" | "prepared";
										setDefinition((previous) =>
											previous.target.kind !== "existingWorkspace"
												? previous
												: {
														...previous,
														target: { ...previous.target, setupPolicy },
													},
										);
									}}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="prepared">
											<Trans id="automations.editor.setupPrepared">
												Use prepared environment
											</Trans>
										</SelectItem>
										<SelectItem value="everyRun">
											<Trans id="automations.editor.setupEveryRun">
												Run setup every time
											</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</>
					)}
					<div className="space-y-2">
						<Label>
							<Trans id="automations.editor.harness">Agent</Trans>
						</Label>
						<Select
							value={definition.executor.harness}
							onValueChange={(value) =>
								setDefinition({
									...definition,
									executor: {
										...definition.executor,
										harness: value as "claude-code" | "codex",
									},
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(
									automations.capabilities?.harnesses ?? [
										"claude-code",
										"codex",
									]
								).map((harness) => (
									<SelectItem key={harness} value={harness}>
										{harness}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="automation-account">
							<Trans id="automations.editor.account">Account reference</Trans>
						</Label>
						<Input
							id="automation-account"
							value={definition.executor.accountRef}
							onChange={(event) =>
								setDefinition({
									...definition,
									executor: {
										...definition.executor,
										accountRef: event.target.value,
									},
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>
							<Trans id="automations.editor.sessionMode">Session mode</Trans>
						</Label>
						<Select
							value={definition.executor.sessionMode}
							onValueChange={(value) => {
								const sessionMode = value as "fresh" | "reuse";
								setDefinition({
									...definition,
									executor: {
										...definition.executor,
										sessionMode,
										sessionId:
											sessionMode === "fresh"
												? undefined
												: definition.executor.sessionId,
									},
								});
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="fresh">
									<Trans id="automations.editor.freshSession">Fresh</Trans>
								</SelectItem>
								<SelectItem value="reuse">
									<Trans id="automations.editor.reuseSession">
										Reuse managed session
									</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{definition.executor.sessionMode === "reuse" && (
						<div className="space-y-2">
							<Label htmlFor="automation-session">
								<Trans id="automations.editor.sessionId">Session ID</Trans>
							</Label>
							<Input
								id="automation-session"
								value={definition.executor.sessionId ?? ""}
								onChange={(event) =>
									setDefinition({
										...definition,
										executor: {
											...definition.executor,
											sessionId: event.target.value,
										},
									})
								}
							/>
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="automation-model">
							<Trans id="automations.editor.model">Model (optional)</Trans>
						</Label>
						<Input
							id="automation-model"
							value={definition.executor.model ?? ""}
							onChange={(event) =>
								setDefinition({
									...definition,
									executor: {
										...definition.executor,
										model: event.target.value || undefined,
									},
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="automation-effort">
							<Trans id="automations.editor.effort">Effort (optional)</Trans>
						</Label>
						<Input
							id="automation-effort"
							value={definition.executor.effort ?? ""}
							onChange={(event) =>
								setDefinition({
									...definition,
									executor: {
										...definition.executor,
										effort: event.target.value || undefined,
									},
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>
							<Trans id="automations.editor.scheduleKind">Schedule</Trans>
						</Label>
						<Select
							value={definition.schedule.kind}
							onValueChange={(value) => {
								const kind = value as AutomationSchedule["kind"];
								setDefinition({
									...definition,
									schedule: scheduleForKind(kind, definition.schedule),
								});
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="immediate">
									<Trans id="automations.editor.scheduleImmediate">
										Immediately once
									</Trans>
								</SelectItem>
								<SelectItem value="once">
									<Trans id="automations.editor.scheduleOnce">
										At a specific time
									</Trans>
								</SelectItem>
								<SelectItem value="calendar">
									<Trans id="automations.editor.scheduleCalendar">
										Calendar recurrence
									</Trans>
								</SelectItem>
								<SelectItem value="fixedInterval">
									<Trans id="automations.editor.scheduleFixed">
										Fixed interval
									</Trans>
								</SelectItem>
								<SelectItem value="afterCompletion">
									<Trans id="automations.editor.scheduleAfterCompletion">
										After completion
									</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{definition.schedule.kind !== "immediate" && (
						<div className="space-y-2">
							<Label htmlFor="automation-timezone">
								<Trans id="automations.editor.timeZone">IANA time zone</Trans>
							</Label>
							<Input
								id="automation-timezone"
								value={definition.schedule.timeZone}
								onChange={(event) =>
									updateSchedule({ timeZone: event.target.value })
								}
							/>
						</div>
					)}
					{definition.schedule.kind === "once" && (
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="automation-at">
								<Trans id="automations.editor.at">Instant (ISO 8601)</Trans>
							</Label>
							<Input
								id="automation-at"
								value={definition.schedule.at}
								onChange={(event) => updateSchedule({ at: event.target.value })}
							/>
						</div>
					)}
					{"startsAt" in definition.schedule && (
						<div className="space-y-2">
							<Label htmlFor="automation-start">
								<Trans id="automations.editor.startsAt">
									Starts at (ISO 8601)
								</Trans>
							</Label>
							<Input
								id="automation-start"
								value={definition.schedule.startsAt}
								onChange={(event) =>
									updateSchedule({ startsAt: event.target.value })
								}
							/>
						</div>
					)}
					{definition.schedule.kind === "calendar" && (
						<div className="space-y-2">
							<Label htmlFor="automation-rrule">
								<Trans id="automations.editor.rrule">RRULE</Trans>
							</Label>
							<Input
								id="automation-rrule"
								value={definition.schedule.rrule}
								onChange={(event) =>
									updateSchedule({ rrule: event.target.value })
								}
							/>
						</div>
					)}
					{(definition.schedule.kind === "fixedInterval" ||
						definition.schedule.kind === "afterCompletion") && (
						<div className="space-y-2">
							<Label htmlFor="automation-interval">
								<Trans id="automations.editor.interval">Interval seconds</Trans>
							</Label>
							<Input
								id="automation-interval"
								type="number"
								min={definition.schedule.kind === "afterCompletion" ? 0 : 60}
								value={definition.schedule.intervalSeconds}
								onChange={(event) =>
									updateSchedule({
										intervalSeconds: Number(event.target.value),
									})
								}
							/>
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="automation-max-rounds">
							<Trans id="automations.editor.maxRounds">
								Maximum scheduled rounds
							</Trans>
						</Label>
						<Input
							id="automation-max-rounds"
							type="number"
							min={1}
							max={10000}
							value={definition.stop.maxRounds ?? ""}
							onChange={(event) =>
								setDefinition({
									...definition,
									stop: {
										...definition.stop,
										maxRounds: event.target.value
											? Number(event.target.value)
											: undefined,
									},
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="automation-ends-before">
							<Trans id="automations.editor.endsBefore">
								Stop before (ISO 8601)
							</Trans>
						</Label>
						<Input
							id="automation-ends-before"
							value={definition.stop.endsBefore ?? ""}
							onChange={(event) =>
								setDefinition({
									...definition,
									stop: {
										...definition.stop,
										endsBefore: event.target.value || undefined,
									},
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="automation-missed-window">
							<Trans id="automations.editor.missedWindow">
								Missed-run window (seconds)
							</Trans>
						</Label>
						<Input
							id="automation-missed-window"
							type="number"
							min={0}
							max={86400}
							value={definition.missedRunWindowSeconds}
							onChange={(event) =>
								setDefinition({
									...definition,
									missedRunWindowSeconds: Number(event.target.value),
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="automation-setup-timeout">
							<Trans id="automations.editor.setupTimeout">
								Setup timeout (seconds)
							</Trans>
						</Label>
						<Input
							id="automation-setup-timeout"
							type="number"
							min={1}
							max={86400}
							value={definition.setupTimeoutSeconds}
							onChange={(event) =>
								setDefinition({
									...definition,
									setupTimeoutSeconds: Number(event.target.value),
								})
							}
						/>
					</div>
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="automation-precheck">
							<Trans id="automations.editor.precheck">
								Precheck command (optional)
							</Trans>
						</Label>
						<Input
							id="automation-precheck"
							value={definition.precheck?.command ?? ""}
							onChange={(event) =>
								setDefinition({
									...definition,
									precheck: event.target.value
										? {
												command: event.target.value,
												timeoutSeconds:
													definition.precheck?.timeoutSeconds ?? 30,
											}
										: undefined,
								})
							}
						/>
					</div>
					{definition.precheck && (
						<div className="space-y-2">
							<Label htmlFor="automation-precheck-timeout">
								<Trans id="automations.editor.precheckTimeout">
									Precheck timeout (seconds)
								</Trans>
							</Label>
							<Input
								id="automation-precheck-timeout"
								type="number"
								min={1}
								max={300}
								value={definition.precheck.timeoutSeconds}
								onChange={(event) => {
									const timeoutSeconds = Number(event.target.value);
									setDefinition((previous) =>
										previous.precheck
											? {
													...previous,
													precheck: { ...previous.precheck, timeoutSeconds },
												}
											: previous,
									);
								}}
							/>
						</div>
					)}
				</div>

				{error && (
					<div
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{error}
					</div>
				)}

				{preview ? (
					<div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
						<div className="font-medium">
							<Trans id="automations.editor.confirmTitle">
								Confirm this work agreement
							</Trans>
						</div>
						<p className="whitespace-pre-wrap text-sm text-muted-foreground">
							{preview.summary}
						</p>
						{preview.nextOccurrences.length > 0 && (
							<ul className="list-disc space-y-1 pl-5 text-sm">
								{preview.nextOccurrences.map((occurrence) => (
									<li key={occurrence.key}>
										{occurrence.kind === "dst_gap" ? (
											<Trans id="automations.editor.dstGap">
												Skipped daylight-saving gap
											</Trans>
										) : (
											occurrence.at
										)}
										{occurrence.localTime ? ` — ${occurrence.localTime}` : ""}
									</li>
								))}
							</ul>
						)}
						<p className="text-xs text-muted-foreground">
							{t({
								id: "automations.editor.previewExpiry",
								message: `Preview expires at ${expiresAt}`,
							})}
						</p>
						<div className="flex gap-2">
							<Button disabled={busy} onClick={handleConfirm}>
								<Trans id="automations.editor.confirm">Confirm</Trans>
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => setPreview(null)}
							>
								<Trans id="automations.editor.back">Back</Trans>
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						<Button disabled={busy} onClick={() => void handlePreview("save")}>
							<Trans id="automations.editor.previewSave">
								Preview save as paused
							</Trans>
						</Button>
						{!automation && (
							<Button
								variant="secondary"
								disabled={busy || definition.schedule.kind === "immediate"}
								onClick={() => void handlePreview("enable")}
							>
								<Trans id="automations.editor.previewEnable">
									Preview save and enable
								</Trans>
							</Button>
						)}
						{!automation && (
							<Button
								variant="secondary"
								disabled={busy}
								onClick={() => void handlePreview("run")}
							>
								<Trans id="automations.editor.previewRun">
									Preview and run now
								</Trans>
							</Button>
						)}
						<Button variant="ghost" disabled={busy} onClick={onClose}>
							<Trans id="automations.editor.cancel">Cancel</Trans>
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
