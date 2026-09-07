import { localSqlite } from "../local-db";
import { ProfileStore } from "./profile-store";

// One main-process registry and event source shared by all renderer windows.
export const profileStore = new ProfileStore(localSqlite);
