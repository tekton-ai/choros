import type { ContributorRegistry } from "../types";
import { attachmentContributor } from "./attachment";
import { githubIssueContributor } from "./github-issue";
import { githubPrContributor } from "./github-pr";
import { internalTaskContributor } from "./internal-task";
import { userPromptContributor } from "./user-prompt";

export const defaultContributorRegistry: ContributorRegistry = {
	"user-prompt": userPromptContributor,
	attachment: attachmentContributor,
	"github-issue": githubIssueContributor,
	"github-pr": githubPrContributor,
	"internal-task": internalTaskContributor,
};

export {
	attachmentContributor,
	githubIssueContributor,
	githubPrContributor,
	internalTaskContributor,
	userPromptContributor,
};
