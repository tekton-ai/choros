# Choros

A personal fork of [Superset](https://github.com/superset-sh/superset) — the agent-first coding platform — rebranded to Choros (χορός, "coordinated chorus").

**This fork:** `tekton-ai/choros` on GitHub, `com.choros.desktop` bundle id, `choros` CLI binary, `@choros/*` npm scope.  
**Upstream:** everything on `superset-sh` — release infrastructure, docs.superset.sh, marketing site, App Store presence, vendor consoles — remains with the Superset team. The fork consumes upstream's public MCP endpoint (`api.superset.sh`) via `opencode.json` / `.mastracode/mcp.json` where useful.

## Building locally

The fork develops inside a Superset workspace (the parent tool exports `SUPERSET_HOME_DIR` and manages `.superset/setup.local.sh` — that protocol is preserved).

```bash
./.superset/setup.local.sh
bun run dev
```

## SDLC

The rebrand from Superset to Choros followed the [AI-Native SDLC](https://claude.com/blog/the-ai-native-sdlc-playbook). Audit trail: `docs/sdlc/rebrand/{intent,spec,plan}.md`.

## License

Elastic-2.0. See [LICENSE.md](./LICENSE.md).
