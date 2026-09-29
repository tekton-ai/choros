import { describe, expect, it } from "bun:test";
import { readPageWindow } from "./read-page-window";

interface Row {
	id: string;
	createdAt: string;
}

function opaqueCursor(row: Row): string {
	return `opaque-token-for-${row.id}`;
}

function createOpaqueCursorApi(initialRows: Row[], limit: number) {
	let rows = initialRows;
	const list = async (cursor?: string) => {
		const start = cursor
			? rows.findIndex((row) => opaqueCursor(row) === cursor) + 1
			: 0;
		const items = rows.slice(start, start + limit);
		const hasMore = start + items.length < rows.length;
		const last = items.at(-1);
		return {
			items,
			nextCursor: hasMore && last ? opaqueCursor(last) : null,
			cursor: rows.length,
		};
	};
	return {
		list,
		insertNewest(row: Row) {
			rows = [row, ...rows];
		},
	};
}

describe("readPageWindow", () => {
	it("re-reads the loaded window before continuing after a new head row invalidates an old opaque cursor", async () => {
		const rows = ["e", "d", "c", "b", "a"].map((id, index) => ({
			id,
			createdAt: `2026-09-29T00:00:0${5 - index}.000Z`,
		}));
		const api = createOpaqueCursorApi(rows, 2);
		const before = await readPageWindow(api.list, 2);
		expect(before.items.map((row) => row.id)).toEqual(["e", "d", "c", "b"]);
		const staleCursor = before.nextCursor;

		api.insertNewest({ id: "f", createdAt: "2026-09-29T00:00:06.000Z" });
		const staleContinuation = await api.list(staleCursor ?? undefined);
		expect(staleContinuation.items.map((row) => row.id)).toEqual(["a"]);

		const refreshed = await readPageWindow(api.list, 2);
		expect(refreshed.items.map((row) => row.id)).toEqual(["f", "e", "d", "c"]);
		const continuation = await api.list(refreshed.nextCursor ?? undefined);
		expect(continuation.items.map((row) => row.id)).toEqual(["b", "a"]);
	});
});
