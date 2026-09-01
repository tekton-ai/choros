import type { RouterOutputs } from "@choros/trpc";

export type LeaderboardPreview = Pick<
	RouterOutputs["leaderboard"]["previewRank"],
	"rank" | "total"
> & {
	tokens: number;
	providers: string[];
};
