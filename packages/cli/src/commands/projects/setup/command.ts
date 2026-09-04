import { boolean, CLIError, positional, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import {
	type HostServiceClient,
	resolveHostTarget,
} from "../../../lib/host-target";

async function findProject(client: HostServiceClient, projectId: string) {
	const projects = await client.project.list.query();
	return projects.find((project) => project.id === projectId) ?? null;
}

export default command({
	description:
		"Adopt an existing project on a host (clone its repo or import a folder)",
	args: [positional("id").desc("Project UUID to adopt")],
	options: {
		project: string().desc("Project UUID to adopt"),
		path: string().desc(
			"Existing local repo path on the target host (alias for --import)",
		),
		parentDir: string().desc(
			"Parent directory to clone the project's repo into (clone mode)",
		),
		import: string().desc(
			"Existing local repo path on the target host (import mode)",
		),
		allowRelocate: boolean().desc(
			"Permit re-importing at a different path if the project is already set up here",
		),
		repoUrl: string().desc(
			"Repo clone URL, when the target host doesn't know the project yet",
		),
		name: string().desc(
			"Project name, when the target host doesn't know it yet",
		),
	},
	run: async ({ args, options }) => {
		if (options.project !== undefined && args.id !== undefined) {
			throw new CLIError(
				"Project ID specified twice",
				"Use either --project <projectId> or the positional project ID.",
			);
		}
		const projectId = (options.project ?? args.id) as string | undefined;
		if (!projectId) {
			throw new CLIError(
				"Project ID required",
				"Pass --project <projectId> or provide the project ID.",
			);
		}
		if (options.path && options.import) {
			throw new CLIError(
				"Pass either --path or --import, not both",
				"--path is an alias for --import.",
			);
		}
		const importPath = options.path ?? options.import;
		if (Boolean(options.parentDir) === Boolean(importPath)) {
			throw new CLIError(
				"Specify exactly one of --parent-dir or --path",
				"Use --parent-dir <path> to clone, or --path <path> to register an existing folder.",
			);
		}
		if (options.allowRelocate && !importPath) {
			throw new CLIError(
				"--allow-relocate only applies to --path",
				"Drop --allow-relocate, or switch to --path <path>.",
			);
		}

		const target = await resolveHostTarget();

		const mode = options.parentDir
			? {
					kind: "clone" as const,
					parentDir: options.parentDir,
				}
			: {
					kind: "import" as const,
					repoPath: importPath as string,
					allowRelocate: options.allowRelocate ?? false,
				};

		let origin: { repoCloneUrl: string | null; name?: string } | undefined;
		if (options.repoUrl || options.name) {
			origin = {
				repoCloneUrl: options.repoUrl ?? null,
				name: options.name ?? undefined,
			};
		} else if (!(await findProject(target.client, projectId))) {
			throw new CLIError(
				`This device doesn't have project ${projectId}`,
				"Pass --repo-url <url> (and --name <name>) so Choros can set it up.",
			);
		}

		const result = await target.client.project.setup.mutate({
			projectId,
			origin,
			mode,
		});

		return {
			data: result,
			message: `Set up project ${projectId} on host ${target.hostId}`,
		};
	},
});
