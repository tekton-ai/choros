import { createCommand } from "@choros/cli-framework";

export type CliContext = Record<never, never>;
export const command = createCommand<CliContext>();
