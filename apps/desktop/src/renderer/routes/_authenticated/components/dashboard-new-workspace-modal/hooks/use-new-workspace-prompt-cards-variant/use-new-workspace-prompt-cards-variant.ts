export type PromptCardsVariant = "control" | "cards2" | "cards4";

export function useNewWorkspacePromptCardsVariant(
	isOpen: boolean,
): PromptCardsVariant | null {
	return isOpen ? "control" : null;
}
