import { homedir } from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { getWorkspaceName as getEnvWorkspaceName } from "shared/env.shared";
import { deriveWorkspaceNameFromWorktreeSegments } from "shared/worktree-id";
import { getWorkspaceNameFromHostDbs } from "./host-db-workspace-name";

const IS_DEV = process.env.NODE_ENV === "development";
const WORKTREE_BASE = path.resolve(homedir(), ".choros/worktrees");

function getWorktreeSegmentsFromCwd(cwd: string): string[] | undefined {
	const cwdRelative = path.relative(WORKTREE_BASE, cwd);
	if (
		!cwdRelative ||
		cwdRelative.startsWith("..") ||
		path.isAbsolute(cwdRelative)
	) {
		return undefined;
	}

	const segments = cwdRelative.split(path.sep).filter(Boolean);
	return segments.length >= 2 ? segments : undefined;
}

function getWorktreePathFromSegments(segments: string[]): string | undefined {
	const appsIndex = segments.lastIndexOf("apps");
	const endIndex =
		appsIndex > 1 && segments[appsIndex + 1] === "desktop"
			? appsIndex
			: segments.length;
	if (endIndex <= 1) return undefined;

	return path.join(WORKTREE_BASE, ...segments.slice(0, endIndex));
}

export function resolveDevWorkspaceName(
	cwd = process.cwd(),
): string | undefined {
	if (!IS_DEV) return undefined;

	const segments = getWorktreeSegmentsFromCwd(cwd);
	if (!segments) return getEnvWorkspaceName();

	const workspaceNameFromPath =
		deriveWorkspaceNameFromWorktreeSegments(segments);
	const worktreePath = getWorktreePathFromSegments(segments);
	// V2 workspaces (and their AI/manual renames) live in host.db.
	const workspaceNameFromDb = worktreePath
		? getWorkspaceNameFromHostDbs(
				worktreePath,
				(dbPath) =>
					new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true }),
			)
		: undefined;

	return workspaceNameFromDb ?? workspaceNameFromPath ?? getEnvWorkspaceName();
}
