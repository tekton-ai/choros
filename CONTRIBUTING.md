# Contributing to Choros

Bug fixes, docs, or small improvements: [open a PR directly](https://github.com/tekton-ai/choros/compare).

Larger changes: [open an issue in this repository](https://github.com/tekton-ai/choros/issues/new/choose) first so we can agree on the problem and approach before implementation. Search [existing issues](https://github.com/tekton-ai/choros/issues) and [PRs](https://github.com/tekton-ai/choros/pulls) to avoid duplicating work.

## Preparing a change

- Create a branch or isolated worktree from the latest `main`. Fork the repository if you do not have write access, and target `tekton-ai/choros:main` when opening your PR.
- Keep each PR to one logical change. Leave unrelated refactors, formatting, and dependency updates out.
- Follow the repository conventions in [`AGENTS.md`](./AGENTS.md), including the existing SDLC process for substantial changes, and the [`Code of Conduct`](./CODE_OF_CONDUCT.md).
- AI-assisted contributions are welcome. A human contributor remains responsible for understanding, reviewing, and verifying every generated change, and for explaining it in the PR.

## Local development
See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for prerequisites and the per-worktree setup. From your workspace terminal:


```bash
./.choros/setup.local.sh
bun run dev
```

Use the Bun version pinned in `.bun-version`. The current PR checks are defined in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

| Required check | Commands |
|---|---|
| Sherif | `bunx sherif` |
| Version Sync | `bun run typecheck:release`, `bun run test:release`, `bun run check:versions` |
| Lint | `bun run lint`, `bun run --cwd packages/i18n check` |
| Test | `bun run test`, `bun run --cwd packages/host-service test:integration:terminal` |
| Typecheck | `bun run typecheck` |

The terminal integration tests require Node.js 22 and native dependencies; see the CI workflow for setup. Run the checks relevant to your change locally and report any you could not run. All five required checks must pass before merging into `main`; passing CI does not replace verifying the changed behavior.

## Verifying and opening a PR

- For a bug fix, reproduce the failure before the change, then repeat the same steps after it and record both results. Add a focused regression test when practical.
- For desktop or CLI behavior, launch the real app or command and exercise the affected interaction. Describe what you clicked or ran and what you observed; a successful build alone is not proof.
- For visual changes, include screenshots or a short recording, with before/after evidence for a visual bug fix. Redact tokens, credentials, personal information, and private repository content from screenshots, recordings, and logs.
- Fill in **What & why** and **How I tested it**, linking the issue if there is one. Be explicit about any unverified paths or environment limitations.
- Use a conventional-commit title such as `fix(desktop): restore terminal focus`. On fork PRs, enable **Allow edits from maintainers** when available.
