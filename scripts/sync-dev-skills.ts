#!/usr/bin/env bun
/**
 * Sync this worktree's `plugins/choros` into a dev-only Claude Code plugin at
 * ~/.claude/skills/choros-dev so you can test in-development skills without
 * colliding with the installed prod `choros@choros` plugin (which owns the
 * name "choros" and takes precedence). Skills load as `/choros-dev:<skill>`.
 *
 * Re-run whenever a skill changes; then `/reload-plugins` in your Claude Code
 * session (a new skill folder is a plugin structural change, not a hot-reload).
 *
 * Usage:  bun run dev:skills   (or: bun scripts/sync-dev-skills.ts)
 */
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function repoRoot(): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf-8",
		}).trim();
	} catch {
		return process.cwd();
	}
}

const root = repoRoot();
const src = join(root, "plugins", "choros");
if (!existsSync(src)) {
	console.error(`[sync-dev-skills] no plugin at ${src}`);
	process.exit(1);
}

const dest = join(homedir(), ".claude", "skills", "choros-dev");
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

// Rename the plugin so it doesn't collide with the installed `choros` plugin.
const manifestPath = join(dest, ".claude-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
	name: string;
	description?: string;
};
manifest.name = "choros-dev";
manifest.description = `[DEV] ${manifest.description ?? ""}`.trim();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

// Strip any managed sentinel so the desktop app's skill reaper leaves this copy
// alone (it only manages the "choros" dir).
rmSync(join(dest, ".choros-managed"), { force: true });

const skills = readdirSync(join(dest, "skills")).sort();
console.log(
	`[sync-dev-skills] synced ${skills.length} skills to ${dest}\n` +
		`  ${skills.map((s) => `/choros-dev:${s}`).join("  ")}\n` +
		"Run /reload-plugins in your Claude Code session to pick up changes.",
);
