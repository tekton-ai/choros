import type { ReactNode } from "react";

/**
 * Cloud workspaces / sandboxes were removed; this provider is now a null
 * stub that keeps consumers of `useSandboxAccess` (workspace fan-out,
 * sidebar, optimistic actions) compiling without threading conditional
 * branches through every call site. Every read yields an empty target list.
 */
export interface SandboxAccessTarget {
	workspaceId: string;
	organizationId: string;
	url: string;
}

interface SandboxAccessValue {
	targets: SandboxAccessTarget[];
	isReady: boolean;
}

const EMPTY: SandboxAccessValue = { targets: [], isReady: true };

export function SandboxAccessProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

export function useSandboxAccess(): SandboxAccessValue {
	return EMPTY;
}
