import { COMPANY } from "@choros/shared/constants";
import { parseGitHubRemote } from "@choros/shared/github-remote";

export function getGitHubRepoSlug(): string {
	const parsed = parseGitHubRemote(COMPANY.GITHUB_URL);
	if (!parsed) {
		throw new Error("Invalid GitHub URL format");
	}
	return `${parsed.owner}/${parsed.name}`;
}

export function formatStarCount(count: number): string {
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	}
	return count.toString();
}
