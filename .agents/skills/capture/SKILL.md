---
name: capture
description: "Capture conversation outcomes in GitHub: draft, create, or update bug reports, feature requests, and brainstorming discussions with consistent labels and useful context. Use when asked to 'capture this', 'file a bug', 'record a feature request', 'save this discussion', '记个 bug', '记录需求', '把脑暴整理下来', or group related issues under a feature. Do not publish merely because someone mentions a bug, brainstorms, or asks how tracking works."
compatibility: "Any agent that can read Markdown and run Git and an authenticated GitHub CLI (gh). No provider-specific tools, slash-command runtime, or MCP server required."
---

# Capture

Turn the user's current context into a useful, traceable GitHub record. Keep the
workflow small: understand, choose a destination, check for duplicates, write,
then verify. Do not fix the reported problem as part of recording it.

## Portable entrypoint

Read this file directly when the agent does not auto-discover skills. Resolve
supporting files relative to this skill directory, not the shell's working
directory. Use the agent's ordinary file and command tools; no special tool
names or provider APIs are required.

Examples of requests:

- "记录这个 Profile 的 bug。"
- "把刚才的需求整理成 feature request。"
- "把这轮脑暴放到 Discussion，只介绍对标产品和为什么需要 workflow。"
- "把这几个已有 bug 关联到这个功能的总 Issue。"
- "先整理成草稿，不要发布。"

## 1. Establish intent and destination

1. Extract the requested scope, language, facts, and publication intent from the
   conversation. Preserve the user's requested sections and level of detail.
2. Treat an explicit request to file/create a GitHub record as publication
   authorization for that scope. A request for a draft, advice, or a private
   record is not authorization to publish publicly. When "save this" has no
   established destination, ask whether to draft or publish. Do not require a
   second confirmation when destination, visibility, and authorization are clear.
3. Use an explicit repository or issue/discussion URL first. Otherwise inspect
   the current Git remote and resolve its GitHub repository. Do not switch to an
   upstream repository merely because the checkout is a fork. Ask only when
   multiple plausible destinations remain.
4. Read current repository metadata, visibility, enabled features, and the
   authenticated account. Check actual access rather than assuming a particular
   account or organization. Never hardcode a repository, login, or object ID.
5. If privacy is requested and the destination is public, stop before **all**
   mutations, including label creation. Discussions inherit repository
   visibility; a label, category, or title cannot make one private. Ask for a
   private destination or explicit permission to publish the scoped content.
6. Do not create repositories, change visibility/access, enable Discussions, or
   switch the user's global CLI account as an incidental setup step. Explain any
   missing prerequisite. Use an already-authorized account with per-process
   credentials when needed; never print tokens or include them in drafts.

Draft-only requests need no GitHub authentication when the supplied context is
sufficient. Do not mutate GitHub to prepare a draft. Exclude secrets, personal
information not needed for the report, and unrelated private conversation.

## 2. Classify and find existing work

| Intent | Destination | Exact type label |
| --- | --- | --- |
| Existing behavior is wrong | Issue | `bug` |
| New capability or intentional behavior change | Issue | `feature-request` |
| Open-ended direction, alternatives, or brainstorming | Discussion | `brainstorming` |

For a completed result, prefer the issue/discussion it belongs to instead of
inventing a fourth type. If there is no obvious record or fit, ask where to keep
it. A feature request is a proposal, not an accepted implementation commitment.

- Search both open and closed issues, or relevant discussions, using the feature
  and behavior, not only an exact title. Read likely matches before deciding.
- If an exact existing record already captures the request, return its URL. Add
  genuinely new information there when authorized; preserve other contributors'
  content. Ask before reopening a closed issue or replacing a materially
  different report. Do not create another issue just because the old one closed.
- Prefer an existing non-Q&A Ideas category for brainstorming. Otherwise choose
  a suitable existing open-ended category; do not create category taxonomy by
  default. Classification belongs in labels, not title prefixes.
- For a feature with several independent bugs, use one issue per actionable bug.
  Link them as sub-issues of a tracking issue when requested. Reuse an existing
  parent; do not invent bugs or create a Project to track a small group.

## 3. Compose the record

For issues, read [ticket-format](../ticket-format/SKILL.md) and reuse its canonical
structure. Do not duplicate or replace that format with a second issue standard.

- Keep `Context`'s outcome-focused summary concise: name the affected surface,
  symptom and known impact/frequency so a triager understands it without reading
  the rest. Add relevant details as bullets or numbered reproduction steps under
  `Context`, not a second top-level report template. For feature requests, include
  the user scenario, current limitation, desired behavior and observable success
  conditions; do not impose bug-only fields.
- Treat user-reported observations as reported facts; distinguish them from
  independently verified evidence. Never invent repro steps, causes, versions,
  screenshots, verification results, owners, or dates. Ask a focused question
  only if a missing fact prevents a meaningful report; otherwise state what is
  unknown without blocking capture on an investigation.
- Include real source links and authorized attachments when available. Omit
  `References` when none exist. Never publish raw transcripts as evidence.
- Leave `Implementation notes` empty when there is no grounded code context.
  Recording an issue does not authorize code changes or a speculative fix plan.

### Bug context and evidence

Capture useful facts, not a mandatory questionnaire. Reuse what the user already
said and gather safe, relevant local metadata where available:

- **Reproduction:** affected app/surface, starting state, minimal numbered steps,
  example input and exact actual versus expected output. Distinguish the terminal
  host from the TUI or agent running inside it.
- **Frequency and impact:** always/intermittent, affected workflows or users and
  whether the work is blocked. Record a known workaround and what it restores;
  never invent severity or claim a workaround is a fix.
- **Regression:** when it started and last known working version, if known. Do not
  infer a regression merely because the report is new.
- **Environment:** affected product/build, OS/architecture and relevant host,
  terminal, agent or TUI versions. A CLI version (for example `choros --version`)
  identifies that CLI, not necessarily the desktop build or TUI version. `uname
  -sm` reports kernel/architecture, not the macOS marketing version. Label the
  source of collected metadata; the current machine is not necessarily the
  reported machine. Skip unavailable commands; never install tools or start a
  diagnostic investigation just to capture a bug.

Only ask a focused follow-up when a missing fact prevents a meaningful report or
an ambiguous detail would misroute it. Otherwise record the useful known facts,
mark important gaps as unknown, and omit irrelevant empty fields. Target a short,
scannable report (roughly 150 words); exceed that when reproduction needs it.

For visual bugs, offer a screenshot when capture is available; never assume
permission to capture or attach one. Offer diagnostics only when a supported
collection path exists and the evidence would help. Explain that screenshots,
logs and terminal output may expose paths, project names, code or credentials.
Get explicit consent before collecting or attaching this sensitive evidence,
scope collection to the reported failure, and review/redact it before publication.
Do not copy Superset's `--diagnostics` flag into a Choros or GitHub command unless
that command's installed help actually supports it. Declining evidence must not
block the text report. Do not add account/org identity to a public report unless
it is necessary and explicitly authorized.

Keep evidence provenance clear: user-reported observation, locally collected
metadata, or independently reproduced behavior. Running a version command is
not reproduction, and the user's report is not a claim that the agent tested it.

### Discussions

For discussions, summarize rather than paste the chat transcript. Follow the
requested outline; otherwise capture the background, current thinking,
alternatives, open questions, and useful references. Separate facts from
suggestions and decisions. Mark brainstorming as exploration, not an approved
specification or delivery promise.

### Titles

Prefer titles of the form `<Surface>: <symptom or desired outcome>`, under 72
characters and without a trailing period. Name the symptom, not an unverified
cause. Do not add `[Bug]`, `Feature request:`, or `Brainstorming:` type prefixes.
Preserve meaningful words in a title; remove only explicit type prefixes when
retitling is requested. Do not create extra documents or publish private source
material just to give a record a reference.

## 4. Publish only the requested changes

Read [GitHub operations](references/github.md) for CLI/API details before writes.

- Reuse the exact type label. If absent, create it as part of an authorized
  publication. Do not silently substitute `enhancement` for `feature-request` or
  overwrite an existing label's color/description.
- Add labels without removing unrelated labels. Do not add assignees, deadlines,
  milestones, or extra area labels unless requested or established by the repo.
- Pass titles/bodies through arguments or JSON variables, never interpolated
  shell code or GraphQL query text. Preserve newlines, quotes, and Markdown.
- For updates, read the latest record first and make the smallest requested
  change. If publication may have succeeded but the response was lost, look up
  the record before retrying; blind retries can create duplicates.
- If creating a record succeeds but labeling or parent linking fails, keep and
  report the created record, repair the missing step, and do not recreate it.

## 5. Verify and report

Re-read the saved record. Check the title, body or requested update, exact label,
discussion category, and parent relationship when applicable. Report the URL and
what was created, reused, or changed. Do not claim success from a subprocess
launch or draft alone. State any unresolved operation explicitly.

For draft-only work, return the proposed destination, title, labels, and body;
clearly say that nothing was published. Keep the final response short.
