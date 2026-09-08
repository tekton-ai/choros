/**
 * Native Desktop E2E composition root. No business assertions belong here.
 *
 * bun run --cwd apps/desktop test:e2e --list
 * bun run --cwd apps/desktop test:e2e work-profiles
 * bun run --cwd apps/desktop test:e2e                 # all registered cases
 *
 * Add a DesktopE2ECase under e2e/cases/<feature>/ and register it in e2e/cases.ts.
 * Every case receives a fresh app/data environment, tracked windows, step
 * reporting, screenshots and cleanup. Cases supply fixtures and assertions.
 */
import { desktopE2ECases } from "./e2e/cases";
import { runDesktopE2E } from "./e2e/runner";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--list") {
	for (const entry of desktopE2ECases)
		console.log(`${entry.id}\t${entry.description}`);
	process.exit(0);
}
if (args.length === 1 && args[0] === "--help") {
	console.log(
		"Usage: bun run test:e2e [case ...]\n       bun run test:e2e --list\nWithout case names, all registered cases run in separate app/data environments.",
	);
	process.exit(0);
}

const selected = args.length
	? args.map((id) => desktopE2ECases.find((entry) => entry.id === id))
	: [...desktopE2ECases];
const unknown = args.filter(
	(id) => !desktopE2ECases.some((entry) => entry.id === id),
);
if (unknown.length) {
	console.error(
		`Unknown E2E case(s): ${unknown.join(", ")}. Use --list to see registered cases.`,
	);
	process.exit(2);
}

try {
	process.exit(
		await runDesktopE2E(selected.filter((entry) => entry !== undefined)),
	);
} catch (error) {
	console.error(error);
	process.exit(1);
}
