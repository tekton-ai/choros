import type { FileView } from "./types";
import { binaryWarningView } from "./views/binary-warning-view";
import { codeView } from "./views/code-view";
import { imageView } from "./views/image-view";
import { markdownPreviewView } from "./views/markdown-preview-view";
import { pdfView } from "./views/pdf-view";
import { videoView } from "./views/video-view";

// Order is preserved as a stable tiebreaker for equal-priority views.
// Exclusive views short-circuit resolution when matched.
export const ALL_VIEWS: FileView[] = [
	imageView,
	videoView,
	pdfView,
	binaryWarningView,
	markdownPreviewView,
	codeView,
];
