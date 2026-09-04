# Choros

Choros (χορός, "coordinated chorus") — an agent-first coding platform. One
workspace for Claude Code, Codex, and any coding agent, run in parallel across
isolated git worktrees.

## What's in this repo

A Turborepo monorepo. The customer-facing surfaces are the Electron desktop
app, its narrow authentication Worker, and the static product site.

```
                     ┌─────────────────────────┐
                     │  apps/desktop (Electron)│
                     │  main + renderer (React)│
                     └────┬───────────────┬────┘
                          │ spawns        │ spawns
                          ▼               ▼
                ┌───────────────┐   ┌──────────────┐
                │ host-service  │◄──┤ pty-daemon   │
                │ Hono HTTP/WS  │   │ Unix socket  │
                └───────┬───────┘   └──────┬───────┘
                        │                  │ spawns
                        │            ┌─────▼──────┐
                        └───────────►│ Agent CLIs │
                                     │ claude /   │
                                     │ codex / …  │
                                     └────────────┘
```

Full picture — process topology, IPC channels, on-disk layout — in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Apps

| Path | What it is |
|---|---|
| `apps/desktop` | The Electron desktop app (main + renderer). |
| `apps/auth` | Cloudflare Worker for GitHub/Google OAuth, desktop sessions, and minimal usage events. |
| `apps/site` | Static product pages and documentation published through GitHub Pages. |

### Packages

| Path | Role |
|---|---|
| `packages/host-service` | Hono HTTP+WS daemon: workspace / project / task / session CRUD, terminal lifecycle, git ops, chat streaming, agent hook handler. |
| `packages/host-client` | TypeScript SDK for talking to a running host-service (used by renderer and CLI). |
| `packages/pty-daemon` | Long-running PTY supervisor so terminals survive desktop restarts. |
| `packages/agent-setup` | Installs lifecycle hooks into agent CLI configs (`~/.claude/settings.json`, `~/.codex/…`, etc.). |
| `packages/chat-runtime` | LLM streaming and tool-calling loop. |
| `packages/chat` | React chat surfaces and orchestration. |
| `packages/provider-auth` | Anthropic / OpenAI / GitHub key management. |
| `packages/cli`, `packages/cli-framework` | `choros` CLI binary and its command framework. |
| `packages/sdk` | Programmatic SDK (thin wrapper over `host-client`). |
| `packages/ui` | Shared React primitives (shadcn/ui + custom). |
| `packages/panes` | Split-view pane layout engine. |
| `packages/i18n` | Lingui-based translations. |
| `packages/db`, `packages/local-db` | Drizzle schemas for the narrow auth service and local desktop settings. |
| `packages/auth` | Better Auth server and client configuration. |
| `packages/shared` | Constants and types used everywhere. |
| `packages/workspace-client`, `packages/workspace-fs` | Workspace RPC client and filesystem watcher. |
| `packages/port-scanner` | Detects dev-server ports for the browser pane. |
| `packages/macos-process-metrics` | Native macOS CPU/mem readouts. |

Full package-by-package breakdown and a "where do I change X?" table:
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Building

Set up a workspace (isolated git worktree) via the installed Choros desktop
app, then in its terminal:

```bash
./.choros/setup.local.sh    # once per worktree — local dependencies, migrations, dev seed
bun run dev                 # main dev loop (desktop + host-service)
```

The full dev flow — prerequisites, `setup.local.sh` internals, dev sign-in,
building a release, troubleshooting — is in
[`DEVELOPMENT.md`](./DEVELOPMENT.md).

### Common commands

```bash
bun dev            # start dev servers
bun test           # run tests
bun run lint:fix   # biome fix + format
bun run typecheck  # type-check all packages
bun run build      # build the desktop app
```

## Working with agents in this repo

The single source of truth for agents is [`AGENTS.md`](./AGENTS.md). Per-agent
entrypoints (`CLAUDE.md`, `CODEX.md`, `.claude/`, `.codex/`, `.agents/`) link
back to it. Adding a new agent, wiring commands / skills, and the multi-login
model: [`docs/agent-tooling.md`](./docs/agent-tooling.md).

## SDLC

Substantial changes flow through the
[AI-Native SDLC](https://claude.com/blog/the-ai-native-sdlc-playbook) — intent,
spec, plan committed under `docs/sdlc/<feature-slug>/` before code lands.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the PR process and
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

Elastic-2.0. See [`LICENSE.md`](./LICENSE.md).
