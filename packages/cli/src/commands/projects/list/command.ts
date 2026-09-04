import { table } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List projects on a host (default: this machine)",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "repo", "path", "id"],
			["NAME", "REPO", "PATH", "ID"],
		),
	run: async () => {
		const target = await resolveHostTarget();
		const projects = await target.client.project.list.query();

		return projects
			.map((project) => ({
				name: project.name,
				repo: project.repoUrl ?? "-",
				path: project.repoPath,
				id: project.id,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});
