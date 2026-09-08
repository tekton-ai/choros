import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Root } from "react-dom/client";

// Radix captures DOM availability at import time. Restore globals afterward
// so this test can run alongside the repo's non-DOM suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Dialog, DialogContent, DialogDescription, DialogTitle } = await import(
	"@choros/ui/dialog"
);
const { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } =
	await import("@choros/ui/context-menu");

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let previousPointerEvents = "";

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	container = undefined;
	document.body.style.pointerEvents = previousPointerEvents;
});

afterAll(async () => {
	actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function ProjectRemoval() {
	const [visible, setVisible] = useState(true);
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			{visible && (
				<ContextMenu>
					<ContextMenuTrigger>Project</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onSelect={() => setConfirming(true)}>
							Remove from Sidebar
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			)}
			<Dialog modal open={confirming} onOpenChange={setConfirming}>
				<DialogContent showCloseButton={false}>
					<DialogTitle>Remove project from sidebar?</DialogTitle>
					<DialogDescription>
						The project will not be deleted.
					</DialogDescription>
					<button
						type="button"
						onClick={() => {
							setVisible(false);
							setConfirming(false);
						}}
					>
						Remove
					</button>
				</DialogContent>
			</Dialog>
		</>
	);
}

test("a context-menu confirmation keeps its modal lock, then restores page interaction after removing the trigger", async () => {
	previousPointerEvents = document.body.style.pointerEvents;
	// A real prior value catches both a stale `none` and unconditional clearing.
	document.body.style.pointerEvents = "auto";
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => root?.render(<ProjectRemoval />));

	const trigger = document.querySelector('[data-slot="context-menu-trigger"]');
	if (!trigger) throw new Error("Project trigger missing");
	await act(async () => {
		trigger.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
		);
	});

	const menuItem = document.querySelector<HTMLElement>('[role="menuitem"]');
	if (!menuItem) throw new Error("Remove menu item missing");
	await act(async () => menuItem.click());
	const pointerEventsWhileConfirming = document.body.style.pointerEvents;
	const dialog = document.querySelector('[role="dialog"]');
	if (!dialog) throw new Error("Confirmation dialog missing");
	const confirm = dialog.querySelector<HTMLButtonElement>("button");
	if (!confirm) throw new Error("Confirmation action missing");
	await act(async () => confirm.click());

	expect(
		document.querySelector('[data-slot="context-menu-trigger"]'),
	).toBeNull();
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.body.style.pointerEvents).toBe("auto");
	expect(pointerEventsWhileConfirming).toBe("none");
});
