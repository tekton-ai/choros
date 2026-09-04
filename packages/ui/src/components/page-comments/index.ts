export type {
	CommentAnchor,
	FrameRect,
} from "@choros/shared/page-comments-runtime";
export {
	CommentModeButton,
	CommentModeToggle,
} from "./components/comment-mode-toggle";
export { CommentsSidebar } from "./components/comments-sidebar";
export { PageCommentsView } from "./components/page-comments-view";
export {
	DeletePageDialog,
	PageHeader,
	type PageHeaderActions,
	type PageHeaderOwner,
	type PageHeaderPage,
	type PageHeaderVersion,
	PageSharePopover,
	PageTitleMenu,
	type PageVisibility,
} from "./components/page-header";
export { useFramePointerDown } from "./hooks/use-frame-pointer-down";
export {
	type CommentDraft,
	CommentProvider,
	type CommentStore,
	type CommentThread,
	type PageComment,
	type PageCommentUser,
	useComments,
} from "./providers/comment-provider";
export {
	AGENT_DISPLAY_NAME,
	type CommentAuthor,
	commentAuthor,
} from "./utils/comment-author";
