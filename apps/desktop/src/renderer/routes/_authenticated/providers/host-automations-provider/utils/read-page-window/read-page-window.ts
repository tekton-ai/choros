export interface HostPage<T> {
	items: T[];
	nextCursor: string | null;
	cursor: number;
}

export async function readPageWindow<T>(
	load: (cursor?: string) => Promise<HostPage<T>>,
	pageCount: number,
): Promise<HostPage<T>> {
	const items: T[] = [];
	let nextCursor: string | undefined;
	let snapshotCursor: number | null = null;
	for (let page = 0; page < pageCount; page += 1) {
		const result = await load(nextCursor);
		items.push(...result.items);
		snapshotCursor =
			snapshotCursor === null
				? result.cursor
				: Math.min(snapshotCursor, result.cursor);
		nextCursor = result.nextCursor ?? undefined;
		if (!nextCursor)
			return { items, nextCursor: null, cursor: snapshotCursor ?? 0 };
	}
	return { items, nextCursor: nextCursor ?? null, cursor: snapshotCursor ?? 0 };
}
