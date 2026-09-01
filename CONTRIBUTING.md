# Contributing to Choros

Thanks for taking an interest. This is a personal fork of [Superset](https://github.com/superset-sh/superset) — issues and PRs on `tekton-ai/choros` land at the author's discretion. For upstream Superset itself, contribute over there.

## Small changes

Bug fixes, docs, or a small improvement to the fork itself: open a PR directly. No issue needed.

## Larger changes

Open an issue on `github.com/tekton-ai/choros/issues` first so we can agree on the approach before you build it.

## Local development

Development is expected to run from a **Superset workspace** (the parent Superset app manages the workspace as a git worktree; the fork develops inside that). Add your clone to the installed Superset app, create a workspace for your change, then:

```bash
./.superset/setup.local.sh
bun run dev
```
