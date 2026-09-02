import type { Item, KnownItem } from "@choros/chat/protocol";
import { isKnownItem } from "@choros/chat/protocol";

export type RowKind = KnownItem["kind"] | "unknown";

export function rowKindForItem(item: Item): RowKind {
	return isKnownItem(item) ? item.kind : "unknown";
}
