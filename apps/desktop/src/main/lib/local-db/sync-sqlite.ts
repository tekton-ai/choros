/** Synchronous capabilities shared by better-sqlite3 and bun:sqlite. */
export interface SyncSqlite {
	exec(sql: string): unknown;
	prepare(sql: string): {
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
		run(...params: unknown[]): unknown;
	};
	transaction<T>(callback: () => T): () => T;
}
