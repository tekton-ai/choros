import { createContext, type ReactNode, useContext, useEffect } from "react";
import { getCollections, preloadCollections } from "./collections";

const LOCAL_PROFILE_KEY = "local";
type CollectionsContextType = ReturnType<typeof getCollections>;
const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const collections = getCollections(LOCAL_PROFILE_KEY);
	useEffect(() => {
		void preloadCollections(LOCAL_PROFILE_KEY).catch((error) => {
			console.error(
				"[collections-provider] Failed to preload local state:",
				error,
			);
		});
	}, []);
	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): CollectionsContextType {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
