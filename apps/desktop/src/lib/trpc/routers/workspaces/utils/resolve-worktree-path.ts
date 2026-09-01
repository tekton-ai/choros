import { homedir } from "node:os";
import { join } from "node:path";
import { type SelectProject, settings } from "@choros/local-db";
import { localDb } from "main/lib/local-db";
import { CHOROS_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";

/** Resolves base dir: project override > global setting > default (~/.choros/worktrees) */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir">,
	branch: string,
): string {
	if (project.worktreeBaseDir) {
		return join(project.worktreeBaseDir, project.name, branch);
	}

	const row = localDb.select().from(settings).get();
	const baseDir =
		row?.worktreeBaseDir ??
		join(homedir(), CHOROS_DIR_NAME, WORKTREES_DIR_NAME);

	return join(baseDir, project.name, branch);
}
