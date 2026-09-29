import { formatDateTime } from "@choros/i18n/format";
import type {
	Automation,
	AutomationRun,
} from "@choros/shared/automation-contracts";
import { Button } from "@choros/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@choros/ui/card";
import { Textarea } from "@choros/ui/textarea";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	LuArrowLeft,
	LuCircleStop,
	LuExternalLink,
	LuRotateCcw,
} from "react-icons/lu";
import { useAutomations } from "renderer/hooks/host-service/use-automations";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { AutomationEditor } from "../../../../components/automation-editor";
import { AutomationStatus } from "../../../../components/automation-status";
import { DetailRow } from "./components/detail-row";

function isActive(run: AutomationRun): boolean {
	return ["preparing", "running", "waiting", "stopping", "unknown"].includes(
		run.status,
	);
}

export function AutomationRunView({ runId }: { runId: string }) {
	const { t } = useLingui();
	const data = useAutomations();
	const profiles = useProfiles();
	const cachedRun = data.runs.find((candidate) => candidate.id === runId);
	const [run, setRun] = useState<AutomationRun | null>(cachedRun ?? null);
	const [loading, setLoading] = useState(!cachedRun);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [editing, setEditing] = useState(false);
	const cachedAutomation = data.automations.find(
		(candidate) => candidate.id === run?.automationId,
	);
	const [automation, setAutomation] = useState<Automation | null>(
		cachedAutomation ?? null,
	);
	const readyProfileId =
		profiles.available && profiles.isReady ? profiles.activeProfileId : null;
	const entry = useRef({
		runId,
		profileId: readyProfileId,
		ownerId: null as string | null,
		pending: null as string | null,
		resolved: false,
	});
	if (entry.current.runId !== runId)
		entry.current = {
			runId,
			profileId: readyProfileId,
			ownerId: null,
			pending: null,
			resolved: false,
		};
	if (entry.current.profileId === null && readyProfileId !== null)
		entry.current.profileId = readyProfileId;
	const ownership = run?.id === runId ? data.ownershipFor(run) : null;
	const ownerId = ownership?.profileId ?? null;
	useEffect(() => {
		if (
			!profiles.available ||
			!profiles.isReady ||
			!ownerId ||
			run?.id !== runId
		)
			return;
		const current = entry.current;
		if (current.pending) {
			if (profiles.activeProfileId === current.pending) {
				current.pending = null;
				current.resolved = true;
			} else if (profiles.activeProfileId !== current.profileId) {
				void profiles.openTarget("/automations");
			}
			return;
		}
		if (!current.resolved) {
			current.ownerId = ownerId;
			if (
				profiles.activeProfileId !== current.profileId &&
				profiles.activeProfileId !== ownerId
			) {
				void profiles.openTarget("/automations");
			} else if (profiles.activeProfileId !== ownerId) {
				current.pending = ownerId;
				profiles.selectProfile(ownerId);
			} else current.resolved = true;
		} else if (
			current.ownerId !== ownerId ||
			profiles.activeProfileId !== ownerId
		) {
			void profiles.openTarget("/automations");
		}
	}, [
		ownerId,
		profiles.activeProfileId,
		profiles.available,
		profiles.isReady,
		profiles.openTarget,
		profiles.selectProfile,
		run?.id,
		runId,
	]);

	useEffect(() => {
		if (cachedRun) {
			setRun(cachedRun);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		data
			.getRun(runId)
			.then(
				(result) => {
					if (!cancelled) {
						setRun(result);
						setError(null);
					}
				},
				(cause) => {
					if (!cancelled)
						setError(cause instanceof Error ? cause.message : String(cause));
				},
			)
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [cachedRun, data.getRun, runId]);

	useEffect(() => {
		if (!run || run.id !== runId) {
			setAutomation(null);
			return;
		}
		if (cachedAutomation) {
			setAutomation(cachedAutomation);
			return;
		}
		let cancelled = false;
		setAutomation(null);
		data.getAutomation(run.automationId).then(
			(result) => {
				if (!cancelled) setAutomation(result);
			},
			() => undefined,
		);
		return () => {
			cancelled = true;
		};
	}, [cachedAutomation, data.getAutomation, run, runId]);

	const act = async (operation: () => Promise<AutomationRun>) => {
		setBusy(true);
		setError(null);
		try {
			setRun(await operation());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	if (
		(loading && !run) ||
		(run && run.id !== runId) ||
		(profiles.available && ownerId && profiles.activeProfileId !== ownerId)
	)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				<Trans id="automations.run.loading">Loading run…</Trans>
			</div>
		);
	if (!run)
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3">
				<p role="alert" className="text-sm text-destructive">
					{error ??
						t({ id: "automations.run.notFound", message: "Run not found." })}
				</p>
				<Button asChild variant="outline">
					<Link to="/automations">
						<Trans id="automations.run.back">Back to automations</Trans>
					</Link>
				</Button>
			</div>
		);

	const workspaceId = run.workspaceId;
	const pendingInputs = run.inputs.filter(
		(input) => input.status === "pending",
	);
	const timeZone =
		"timeZone" in run.definition.schedule
			? run.definition.schedule.timeZone
			: undefined;
	const date = (value: string | null) =>
		value
			? formatDateTime(new Date(value), {
					dateStyle: "medium",
					timeStyle: "long",
					...(timeZone ? { timeZone } : {}),
				})
			: t({ id: "automations.run.notAvailable", message: "Not available" });
	const formatExitCode = (exitCode: number) =>
		t({ id: "automations.run.exitCode", message: `Exit ${exitCode}` });
	const formatByteLength = (byteLength: number) =>
		t({ id: "automations.run.byteLength", message: `${byteLength} bytes` });

	return (
		<div className="h-full overflow-auto bg-background">
			<header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
				<Button asChild variant="ghost" size="sm">
					<Link to="/automations">
						<LuArrowLeft className="size-4" />
						<Trans id="automations.run.backShort">Automations</Trans>
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-lg font-semibold">
							{run.definition.name}
						</h1>
						<AutomationStatus status={run.status} />
					</div>
					<p className="text-xs text-muted-foreground">{run.id}</p>
				</div>
				{automation && (
					<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
						<Trans id="automations.edit">Edit</Trans>
					</Button>
				)}
				{workspaceId && (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							void profiles.openWorkspace(
								workspaceId,
								run.chatSessionId
									? { source: { type: "chat", id: run.chatSessionId } }
									: undefined,
							)
						}
					>
						<LuExternalLink className="size-4" />
						{run.chatSessionId ? (
							<Trans id="automations.run.openSession">Open session</Trans>
						) : (
							<Trans id="automations.run.openWorkspace">Open workspace</Trans>
						)}
					</Button>
				)}
				{isActive(run) ? (
					<Button
						variant="destructive"
						size="sm"
						disabled={busy || run.status === "stopping"}
						onClick={() => void act(() => data.requestCancel(run))}
					>
						<LuCircleStop className="size-4" />
						<Trans id="automations.run.cancel">Request cancel</Trans>
					</Button>
				) : (
					<Button
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={() => void act(() => data.retryRun(run))}
					>
						<LuRotateCcw className="size-4" />
						<Trans id="automations.run.retry">Retry from this snapshot</Trans>
					</Button>
				)}
			</header>
			<main className="mx-auto grid max-w-6xl gap-5 p-6 lg:grid-cols-2">
				{editing && automation && (
					<div className="lg:col-span-2">
						<AutomationEditor
							automation={automation}
							onClose={() => setEditing(false)}
						/>
					</div>
				)}
				{error && (
					<div
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive lg:col-span-2"
					>
						{error}
					</div>
				)}
				{run.status === "unknown" && (
					<div
						role="alert"
						className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm lg:col-span-2"
					>
						<div className="font-medium">
							<Trans id="automations.run.unknownTitle">
								Execution state is unknown
							</Trans>
						</div>
						<p className="mt-1 text-muted-foreground">
							<Trans id="automations.run.unknownBody">
								The Host cannot prove that the managed process stopped. This
								target remains occupied; review evidence or request cancellation
								instead of starting conflicting work.
							</Trans>
						</p>
					</div>
				)}
				{run.status === "needs_result" && (
					<div
						role="alert"
						className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm lg:col-span-2"
					>
						<div className="font-medium">
							<Trans id="automations.run.needsResultTitle">
								The agent turn ended without a valid result report
							</Trans>
						</div>
						<p className="mt-1 text-muted-foreground">
							<Trans id="automations.run.needsResultBody">
								Available output remains visible below, but the Host did not
								invent a successful result.
							</Trans>
						</p>
					</div>
				)}

				<Card>
					<CardHeader>
						<CardTitle>
							<Trans id="automations.run.agreement">
								Work agreement snapshot
							</Trans>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<dl>
							<DetailRow
								label={
									<Trans id="automations.run.source">Trigger source</Trans>
								}
								value={run.source}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.definitionRevision">
										Definition revision
									</Trans>
								}
								value={run.definitionRevision}
							/>
							<DetailRow
								label={<Trans id="automations.run.plannedAt">Planned at</Trans>}
								value={date(run.plannedAt)}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.createdAt">Accepted at</Trans>
								}
								value={date(run.createdAt)}
							/>
							<DetailRow
								label={<Trans id="automations.run.startedAt">Started at</Trans>}
								value={date(run.startedAt)}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.finishedAt">Finished at</Trans>
								}
								value={date(run.finishedAt)}
							/>
							<DetailRow
								label={<Trans id="automations.run.stage">Current stage</Trans>}
								value={
									run.stage ??
									t({
										id: "automations.run.notAvailable",
										message: "Not available",
									})
								}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.instructions">Instructions</Trans>
								}
								value={
									<span className="whitespace-pre-wrap">
										{run.definition.instructions}
									</span>
								}
							/>
							<DetailRow
								label={<Trans id="automations.run.executor">Executor</Trans>}
								value={`${run.definition.executor.harness} · ${run.definition.executor.accountRef} · ${run.definition.executor.sessionMode}`}
							/>
							<DetailRow
								label={<Trans id="automations.run.target">Target</Trans>}
								value={
									run.definition.target.kind === "newWorktree"
										? `${run.definition.target.projectId} @ ${run.definition.target.baseRef}`
										: run.definition.target.workspaceId
								}
							/>
							{run.reason && (
								<DetailRow
									label={<Trans id="automations.run.reason">Reason</Trans>}
									value={run.reason}
								/>
							)}
							{run.retryOf && (
								<DetailRow
									label={<Trans id="automations.run.retryOf">Retry of</Trans>}
									value={run.retryOf}
								/>
							)}
						</dl>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>
							<Trans id="automations.run.identities">
								Execution identities
							</Trans>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<dl>
							<DetailRow
								label={
									<Trans id="automations.run.executionId">Execution ID</Trans>
								}
								value={
									run.executionId ??
									t({
										id: "automations.run.notAvailable",
										message: "Not available",
									})
								}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.workspaceId">Workspace ID</Trans>
								}
								value={
									run.workspaceId ??
									t({
										id: "automations.run.notAvailable",
										message: "Not available",
									})
								}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.chatSessionId">
										Chat session ID
									</Trans>
								}
								value={
									run.chatSessionId ??
									t({
										id: "automations.run.notAvailable",
										message: "Not available",
									})
								}
							/>
							<DetailRow
								label={
									<Trans id="automations.run.providerSessionId">
										Provider session ID
									</Trans>
								}
								value={
									run.providerSessionId ??
									t({
										id: "automations.run.notAvailable",
										message: "Not available",
									})
								}
							/>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>
							<Trans id="automations.run.progress">
								Preparation and execution evidence
							</Trans>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{run.preparation?.length ? (
							run.preparation.map((stage, index) => (
								<section
									key={`${stage.stage}:${index}`}
									className="rounded-md border border-border p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<h3 className="font-medium">{stage.stage}</h3>
										<span className="text-xs text-muted-foreground">
											{stage.exitCode == null
												? t({
														id: "automations.run.noExitCode",
														message: "No exit code",
													})
												: formatExitCode(stage.exitCode)}
										</span>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{stage.quiescent ? (
											<Trans id="automations.run.quiescent">
												Host observed the operation as quiescent
											</Trans>
										) : (
											<Trans id="automations.run.notQuiescent">
												Quiescence was not confirmed
											</Trans>
										)}
									</div>
									{stage.output && (
										<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
											{stage.output}
										</pre>
									)}
									{stage.truncated && (
										<p className="mt-1 text-xs text-amber-600">
											<Trans id="automations.run.outputTruncated">
												Output was truncated
											</Trans>
										</p>
									)}
								</section>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								<Trans id="automations.run.noPreparationEvidence">
									No preparation evidence was recorded.
								</Trans>
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>
							<Trans id="automations.run.result">Result</Trans>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{run.report ? (
							<div className="space-y-5">
								<section>
									<h3 className="text-sm font-medium">
										<Trans id="automations.run.summary">
											Agent-reported summary
										</Trans>
									</h3>
									<p className="mt-1 whitespace-pre-wrap text-sm">
										{run.report.summary}
									</p>
								</section>
								<section>
									<h3 className="text-sm font-medium">
										<Trans id="automations.run.verification">
											Verification reported by the agent
										</Trans>
									</h3>
									<dl className="mt-1">
										<DetailRow
											label={
												<Trans id="automations.run.verificationStatus">
													Status
												</Trans>
											}
											value={run.report.verification.status}
										/>
										{run.report.verification.command && (
											<DetailRow
												label={
													<Trans id="automations.run.verificationMethod">
														Method
													</Trans>
												}
												value={<code>{run.report.verification.command}</code>}
											/>
										)}
										{run.report.verification.evidenceRef && (
											<DetailRow
												label={
													<Trans id="automations.run.verificationEvidence">
														Evidence
													</Trans>
												}
												value={run.report.verification.evidenceRef}
											/>
										)}
										{run.report.verification.reason && (
											<DetailRow
												label={
													<Trans id="automations.run.verificationReason">
														Reason
													</Trans>
												}
												value={run.report.verification.reason}
											/>
										)}
									</dl>
								</section>
								<section>
									<h3 className="text-sm font-medium">
										<Trans id="automations.run.artifacts">Artifacts</Trans>
									</h3>
									{run.report.artifacts.length ? (
										<ul className="mt-2 space-y-2">
											{run.report.artifacts.map((artifact, index) => (
												<li
													key={`${artifact.path}:${index}`}
													className="rounded-md border border-border p-3 text-sm"
												>
													<div className="font-mono text-xs">
														{artifact.path}
													</div>
													<div className="mt-1 text-xs text-muted-foreground">
														{artifact.type}
														{artifact.byteLength != null
															? ` · ${formatByteLength(artifact.byteLength)}`
															: ""}
														{artifact.checksum ? ` · ${artifact.checksum}` : ""}
														{artifact.mutable
															? ` · ${t({ id: "automations.run.mutable", message: "mutable" })}`
															: ""}
														{artifact.missing
															? ` · ${t({ id: "automations.run.missing", message: "missing" })}`
															: ""}
													</div>
												</li>
											))}
										</ul>
									) : (
										<p className="mt-1 text-sm text-muted-foreground">
											<Trans id="automations.run.noArtifacts">
												No artifacts were reported.
											</Trans>
										</p>
									)}
								</section>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								<Trans id="automations.run.noResult">
									No valid result report is available.
								</Trans>
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>
							<Trans id="automations.run.inputs">
								Questions and permissions
							</Trans>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{run.inputs.length === 0 && (
							<p className="text-sm text-muted-foreground">
								<Trans id="automations.run.noInputs">No input requests.</Trans>
							</p>
						)}
						{run.inputs.map((input) => (
							<section
								key={input.id}
								className="rounded-md border border-border p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div>
										<div className="text-xs uppercase tracking-wide text-muted-foreground">
											{input.kind}
										</div>
										<p className="mt-1 whitespace-pre-wrap text-sm font-medium">
											{input.question}
										</p>
									</div>
									<span className="text-xs text-muted-foreground">
										{input.status}
									</span>
								</div>
								{input.answer && (
									<p className="mt-3 rounded bg-muted p-2 text-sm">
										<Trans id="automations.run.recordedAnswer">
											Recorded answer:
										</Trans>{" "}
										{input.answer}
									</p>
								)}
								{input.status === "unconfirmed" && (
									<p className="mt-3 text-sm text-amber-600">
										<Trans id="automations.run.unconfirmedInput">
											The original provider request could not be recovered. The
											saved answer was not applied to a new request.
										</Trans>
									</p>
								)}
								{input.status === "pending" && (
									<div className="mt-3 space-y-2">
										{input.options?.length ? (
											<div className="flex flex-wrap gap-2">
												{input.options.map((option) => (
													<Button
														key={option.id}
														variant="outline"
														size="sm"
														disabled={busy}
														onClick={() =>
															void act(() =>
																data.answerInput(
																	run,
																	input.id,
																	input.version,
																	option.id,
																),
															)
														}
													>
														{option.label}
													</Button>
												))}
											</div>
										) : null}
										<Textarea
											value={answers[input.id] ?? ""}
											onChange={(event) =>
												setAnswers((current) => ({
													...current,
													[input.id]: event.target.value,
												}))
											}
											placeholder={t({
												id: "automations.run.answerPlaceholder",
												message: "Type an answer",
											})}
											aria-label={t({
												id: "automations.run.answerAria",
												message: "Answer this input request",
											})}
										/>
										<Button
											size="sm"
											disabled={busy || !(answers[input.id] ?? "").trim()}
											onClick={() =>
												void act(() =>
													data.answerInput(
														run,
														input.id,
														input.version,
														answers[input.id].trim(),
													),
												)
											}
										>
											<Trans id="automations.run.submitAnswer">
												Submit answer
											</Trans>
										</Button>
									</div>
								)}
							</section>
						))}
					</CardContent>
				</Card>

				{pendingInputs.length > 0 && (
					<div className="sr-only" aria-live="polite">
						<Trans id="automations.run.pendingAnnouncement">
							This run has pending input requests.
						</Trans>
					</div>
				)}
			</main>
		</div>
	);
}
