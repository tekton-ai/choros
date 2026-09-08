import type { DesktopE2ERuntime } from "./runtime";
import type { DesktopUi } from "./ui";

export interface DesktopE2EContext {
	readonly runtime: DesktopE2ERuntime;
	readonly primary: DesktopUi;
	readonly windows: readonly DesktopUi[];
	/** Failure is recorded and returned, so a case can continue independent steps. */
	step(name: string, operation: () => Promise<void>): Promise<boolean>;
	newWindow(): Promise<DesktopUi>;
	/** Restarts the same isolated app/data and reconnects its first window. */
	restart(): Promise<DesktopUi>;
}

/** A feature case owns its fixtures and assertions, never the process lifecycle. */
export interface DesktopE2ECase {
	id: string;
	description: string;
	/** Non-secret preference keys to include in evidence; credentials must not be captured. */
	storageKeys?: readonly string[];
	run(context: DesktopE2EContext): Promise<void>;
}

export interface DesktopE2EStepResult {
	name: string;
	status: "passed" | "failed";
	durationMs: number;
	error?: string;
	artifacts: string[];
}

export interface DesktopE2ECaseResult {
	id: string;
	status: "running" | "passed" | "failed";
	artifactDir: string;
	steps: DesktopE2EStepResult[];
}
