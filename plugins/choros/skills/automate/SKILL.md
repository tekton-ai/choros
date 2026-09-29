---
name: automate
description: Turn a one-time or recurring chore into a local Choros Automation. Drafts standalone instructions, previews the exact target and schedule, then saves it paused and enables it only after separate confirmation. Use for "do this once", "run this at a specific time", "every morning do X", "automate this", or "run this on a schedule".
argument-hint: describe the work and when it should run
allowed-tools: Read Write Bash(choros:*)
---

# Choros Automate

Turn a natural-language request into one local Host Automation. Automations can
run immediately once, once at a specified instant, on a calendar cadence, at a
fixed elapsed interval, or after the prior scheduled run finishes.

## 1. Make the work standalone

Determine the outcome, inputs, target, supported native harness
(`claude-code` or `codex`), completion evidence, and schedule. Use
`accountRef: "default"` unless the user supplied an already-pinned matching
reference; preview resolves `default` to the current configured provider
directory and saves that exact reference. Write instructions that an agent with
no conversation context can follow.
Distinguish fixed instructions from files the run should read fresh.
Never copy secrets or an entire chat into the prompt.

Resolve real local identifiers before previewing:

```bash
choros projects list --json
choros workspaces list --json
choros automations capabilities --json
```

A project target creates a new worktree from an explicit base ref. A workspace
target binds that exact existing workspace and must say whether setup runs every
time or the environment is already prepared. Automations are local to the
selected running Host; do not promise remote scheduling or migration.

## 2. Build and preview the canonical definition

Prefer a canonical JSON definition file for repeatability. When building the
definition with inline flags instead, use a prompt file for long instructions.
The canonical fields are `name`, `instructions`, `target`, `executor`,
`schedule`, `stop`, `missedRunWindowSeconds`, `setupTimeoutSeconds`, and
optional `precheck`.

Examples of canonical schedules:

```json
{"kind":"immediate"}
{"kind":"once","at":"2026-10-01T01:00:00Z","timeZone":"Asia/Shanghai"}
{"kind":"calendar","rrule":"FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0","startsAt":"2026-10-05T01:00:00Z","timeZone":"Asia/Shanghai"}
{"kind":"fixedInterval","startsAt":"2026-10-01T01:00:00Z","intervalSeconds":3600,"timeZone":"Asia/Shanghai"}
{"kind":"afterCompletion","startsAt":"2026-10-01T01:00:00Z","intervalSeconds":600,"timeZone":"Asia/Shanghai"}
```

Preview never saves or runs anything:

```bash
choros automations preview --definition /path/to/automation.json --intent save --json
```

For inline input, use the same command with `--name`, exactly one of
`--prompt`/`--prompt-file`, exactly one of `--project`/`--workspace`, executor
flags, and `--schedule immediate|once|calendar|fixed-interval|after-completion`.
Schedule-specific flags map directly to the canonical schema: `--at`,
`--starts-at`, `--timezone`, `--rrule`, and `--interval-seconds`.

Show the user the returned summary, target, executor/account, time zone, next
occurrences, round/end limits, setup/precheck, permissions, and result location.
Resolve ambiguities rather than guessing. A preview token expires and is bound
to this exact definition and purpose.

## 3. Save only after confirmation

After the user explicitly confirms the save preview, use its token. Creation is
paused by default and does not authorize future runs:

```bash
choros automations create \
  --confirmation-token <save-token> \
  --request-id <stable-uuid> \
  --json
```

An explicitly requested immediate one-time job uses a preview with
`--intent run`; after confirming that preview, add `--run-immediately` to the
create command. Do not add it for a specified future time or recurring task.

If a definition changes, call `automations preview` again. Apply a confirmed
update with:

```bash
choros automations update <automation-id> \
  --expected-version <version> \
  --confirmation-token <save-token> \
  --request-id <stable-uuid>
```

Substantive updates pause future runs.

## 4. Enable separately

If the user wants a future or repeated schedule active, preview the saved current
definition again with the enable purpose and current version:

```bash
choros automations preview \
  --definition /path/to/automation.json \
  --id <automation-id> \
  --expected-version <version> \
  --intent enable \
  --json
```

Show the enable preview and obtain explicit confirmation. Only then run:

```bash
choros automations enable <automation-id> \
  --expected-version <version> \
  --confirmation-token <enable-token> \
  --request-id <stable-uuid>
```

Saving is not enabling. Never invent, reuse for another purpose, or persist a
confirmation token. If it expires or the version changes, preview again.

## 5. Optional trial and management

A trial is optional, not a prerequisite for enabling. Offer it; run it only if
the user asks:

```bash
choros automations run <automation-id> --request-id <stable-uuid>
choros automations runs <automation-id> --json
choros automations show <run-id> --run --json
```

Useful management commands are `list`, `show`, `runs`, `pause`, `resume`,
`retry`, `cancel`, `answer`, `archive`, and `events`. `run` is an extra run and
does not enable or move the schedule. `retry` uses the historical run snapshot.
`cancel` addresses a run; `pause` affects only future scheduled runs. Report
accepted/running/waiting as those actual states—never as completed work.
