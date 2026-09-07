import type { FinalizedProjectSetupResult } from "renderer/react-query/projects";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface NewProjectResult extends FinalizedProjectSetupResult {
	requestId: string;
}

type ModalKind = "new-project" | "empty-project" | "template-gallery";
type ActiveModal = { kind: "none" } | { kind: ModalKind; requestId: string };

interface AddRepositoryModalState {
	active: ActiveModal;
	openNewProject: () => Promise<NewProjectResult | null>;
	openEmptyProject: () => Promise<NewProjectResult | null>;
	openTemplateGallery: () => Promise<NewProjectResult | null>;
	resolveNewProject: (
		requestId: string,
		result: FinalizedProjectSetupResult,
	) => boolean;
	close: (requestId: string) => void;
}

// A completion owns only the promise created with its request ID. Replacing a
// modal cancels that promise without letting its eventual Host result settle
// the next caller's selection.
let pending: {
	requestId: string;
	resolve: (result: NewProjectResult | null) => void;
} | null = null;

export const useAddRepositoryModalStore = create<AddRepositoryModalState>()(
	devtools(
		(set) => {
			const open = (kind: ModalKind) => {
				pending?.resolve(null);
				const requestId = crypto.randomUUID();
				return new Promise<NewProjectResult | null>((resolve) => {
					pending = { requestId, resolve };
					set({ active: { kind, requestId } });
				});
			};
			return {
				active: { kind: "none" },
				openNewProject: () => open("new-project"),
				openEmptyProject: () => open("empty-project"),
				openTemplateGallery: () => open("template-gallery"),
				resolveNewProject: (requestId, result) => {
					if (pending?.requestId !== requestId) return false;
					const { resolve } = pending;
					pending = null;
					set({ active: { kind: "none" } });
					resolve({ ...result, requestId });
					return true;
				},
				close: (requestId) => {
					if (pending?.requestId !== requestId) return;
					const { resolve } = pending;
					pending = null;
					set({ active: { kind: "none" } });
					resolve(null);
				},
			};
		},
		{ name: "add-repository-modal" },
	),
);

export const useAddRepositoryModalActive = () =>
	useAddRepositoryModalStore((state) => state.active);
export const useOpenNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.openNewProject);
export const useOpenEmptyProjectModal = () =>
	useAddRepositoryModalStore((state) => state.openEmptyProject);
export const useOpenTemplateGalleryModal = () =>
	useAddRepositoryModalStore((state) => state.openTemplateGallery);
export const useResolveNewProjectModal = () =>
	useAddRepositoryModalStore((state) => state.resolveNewProject);
export const useCloseAddRepositoryModal = () =>
	useAddRepositoryModalStore((state) => state.close);
