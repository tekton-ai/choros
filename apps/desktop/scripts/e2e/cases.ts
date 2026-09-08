import { workProfilesCase } from "./cases/work-profiles/work-profiles";
import type { DesktopE2ECase } from "./types";

// Add feature cases here; runtime, input, reporting and cleanup stay unchanged.
export const desktopE2ECases: readonly DesktopE2ECase[] = [workProfilesCase];
