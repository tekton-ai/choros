<!--
PR titles become the squash-merge commit subject, so use conventional commit format:
  feat(desktop): add copy-logs button to failed CI checks
  fix(cli): report a missing workspace clearly
-->

## What & why

<!-- What changed and the problem it solves. Keep this PR to one logical change and target main. Link the issue if there is one (e.g. "fixes #123"); larger changes should have an issue discussing the approach first. -->

## How I tested it

<!--
List the commands or real app interactions you used and their observed results.
For bug fixes, describe the reproduction before the change and the result after
repeating the same steps. Include any focused regression test.
For visual changes, attach screenshots or a short recording (before/after for
visual bug fixes). Redact credentials, tokens, personal information, and private
repository content from all evidence. State anything you could not verify.
-->

## Checklist

- [ ] PR title follows conventional commits (`type(scope): subject`)
- [ ] I reviewed and verified the changes, including any AI-generated code
- [ ] I recorded relevant local checks and limitations above; required CI checks are Sherif, Version Sync, Lint, Test, and Typecheck
- [ ] "Allow edits from maintainers" is checked on fork PRs, when available
