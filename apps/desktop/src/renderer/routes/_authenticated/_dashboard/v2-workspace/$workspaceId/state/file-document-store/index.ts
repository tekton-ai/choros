export {
	acquireDocument,
	dispatchFsEvent,
	getDocument,
	releaseDocument,
} from "./file-document-store";
export { FileDocumentStoreProvider } from "./file-document-store-provider";
export type {
	ConflictResolution,
	ConflictState,
	ContentState,
	SaveResult,
	SharedFileDocument,
} from "./types";
export { useSharedFileDocument } from "./use-shared-file-document";
