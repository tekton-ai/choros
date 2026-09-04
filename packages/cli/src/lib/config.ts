import { homedir } from "node:os";
import { join } from "node:path";

export const CHOROS_HOME_DIR =
	process.env.CHOROS_HOME_DIR ?? join(homedir(), ".choros");
