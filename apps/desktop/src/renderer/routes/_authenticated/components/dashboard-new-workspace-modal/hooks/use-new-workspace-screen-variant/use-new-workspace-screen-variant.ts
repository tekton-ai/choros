export function useNewWorkspaceScreenVariant(
	isOpen: boolean,
): "control" | "test" | null {
	return isOpen ? "test" : null;
}
