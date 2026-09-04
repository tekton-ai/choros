import { existsSync } from "node:fs";
import { join } from "node:path";
import { i18n } from "@choros/i18n";
import {
	app,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	Tray,
} from "electron";
import { focusMainWindow, quitApp } from "main/index";
import { checkForUpdatesInteractive } from "main/lib/auto-updater";
import {
	getHostServiceCoordinator,
	type HostServiceStatus,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { menuEmitter } from "main/lib/menu-events";
import { confirmAndQuitCompletely } from "main/lib/quit-completely";

/** Must have "Template" suffix for macOS dark/light mode support */
const TRAY_ICON_FILENAME = "iconTemplate.png";

function getTrayIconPath(): string | null {
	if (app.isPackaged) {
		const prodPath = join(
			process.resourcesPath,
			"app.asar.unpacked/resources/tray",
			TRAY_ICON_FILENAME,
		);
		if (existsSync(prodPath)) return prodPath;
		return null;
	}

	const previewPath = join(__dirname, "../resources/tray", TRAY_ICON_FILENAME);
	if (existsSync(previewPath)) {
		return previewPath;
	}

	const devPath = join(
		app.getAppPath(),
		"src/resources/tray",
		TRAY_ICON_FILENAME,
	);
	if (existsSync(devPath)) {
		return devPath;
	}

	console.warn("[Tray] Icon not found at:", previewPath, "or", devPath);
	return null;
}

let tray: Tray | null = null;

function createTrayIcon(): Electron.NativeImage | null {
	const iconPath = getTrayIconPath();
	if (!iconPath) {
		console.warn("[Tray] Icon not found");
		return null;
	}

	try {
		let image = nativeImage.createFromPath(iconPath);
		const size = image.getSize();

		if (image.isEmpty() || size.width === 0 || size.height === 0) {
			console.warn("[Tray] Icon loaded with zero size from:", iconPath);
			return null;
		}

		// 16x16 is standard menu bar size, auto-scales for Retina
		if (size.width > 22 || size.height > 22) {
			image = image.resize({ width: 16, height: 16 });
		}
		image.setTemplateImage(true);
		return image;
	} catch (error) {
		console.warn("[Tray] Failed to load icon:", error);
		return null;
	}
}

function openSettings(): void {
	focusMainWindow();
	menuEmitter.emit("open-settings");
}

interface HostInfo {
	hostName: string;
	version: string;
}

async function fetchHostInfo(): Promise<HostInfo | null> {
	const connection = getHostServiceCoordinator().getConnection();
	if (!connection) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2_000);
	try {
		const response = await fetch(
			`http://127.0.0.1:${connection.port}/trpc/host.info`,
			{
				headers: { Authorization: `Bearer ${connection.secret}` },
				signal: controller.signal,
			},
		);
		if (!response.ok) return null;
		const data = await response.json();
		const info = data?.result?.data?.json;
		if (!info?.hostName) return null;
		return { hostName: info.hostName, version: info.version ?? "" };
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function statusLabel(status: HostServiceStatus): string {
	switch (status) {
		case "starting":
			return i18n._({
				id: "tray.hostService.status.starting",
				message: "starting",
			});
		case "running":
			return i18n._({
				id: "tray.hostService.status.running",
				message: "running",
			});
		case "stopped":
			return i18n._({
				id: "tray.hostService.status.stopped",
				message: "stopped",
			});
	}
}

function buildHostServiceSubmenu(
	status: HostServiceStatus,
	info: HostInfo | null,
): MenuItemConstructorOptions[] {
	const coordinator = getHostServiceCoordinator();
	const versionSuffix = info?.version ? ` (v${info.version})` : "";
	return [
		{
			label:
				info?.hostName ??
				i18n._({ id: "tray.hostService.local", message: "This device" }),
			enabled: false,
		},
		{ label: `  ${statusLabel(status)}${versionSuffix}`, enabled: false },
		{
			label: `  ${i18n._({ id: "tray.hostService.restart", message: "Restart" })}`,
			enabled: status !== "starting",
			click: () => {
				void coordinator
					.restart()
					.catch((error) =>
						console.error("[Tray] Failed to restart host-service:", error),
					)
					.finally(() => void updateTrayMenu());
			},
		},
		{
			label: `  ${i18n._({ id: "tray.hostService.stop", message: "Stop" })}`,
			enabled: status === "running",
			click: () => {
				coordinator.stop();
				void updateTrayMenu();
			},
		},
	];
}

async function updateTrayMenu(): Promise<void> {
	if (!tray) return;
	const coordinator = getHostServiceCoordinator();
	const status = coordinator.getProcessStatus();
	const info = status === "running" ? await fetchHostInfo() : null;
	if (!tray) return;
	const hostServiceLabel = i18n._({
		id: "tray.hostService",
		message: "Host Service",
	});
	const hostServiceSubmenu = buildHostServiceSubmenu(status, info);

	const menu = Menu.buildFromTemplate([
		{
			label: hostServiceLabel,
			submenu: hostServiceSubmenu,
		},
		{ type: "separator" },
		{
			label: i18n._({ id: "tray.openApp", message: "Open Choros" }),
			click: focusMainWindow,
		},
		{
			label: i18n._({ id: "tray.settings", message: "Settings" }),
			click: openSettings,
		},
		{
			label: i18n._({
				id: "tray.checkForUpdates",
				message: "Check for Updates",
			}),
			click: () => {
				checkForUpdatesInteractive();
			},
		},
		{ type: "separator" },
		{
			label: i18n._({ id: "tray.closeApp", message: "Close Choros" }),
			click: () => quitApp(),
		},
		{ type: "separator" },
		{
			label: i18n._({
				id: "tray.quitCompletely",
				message: "Quit Choros Completely",
			}),
			click: () => {
				void confirmAndQuitCompletely();
			},
		},
	]);

	tray.setContextMenu(menu);
}

/** Rebuild the tray menu in place (e.g. after the display language changes). */
export function refreshTrayMenu(): void {
	if (!tray) return;
	void updateTrayMenu();
}

/** Call once after app.whenReady() */
export function initTray(): void {
	if (tray) {
		console.warn("[Tray] Already initialized");
		return;
	}

	if (process.platform !== "darwin") {
		return;
	}

	try {
		const icon = createTrayIcon();
		if (!icon) {
			console.warn("[Tray] Skipping initialization - no icon available");
			return;
		}

		tray = new Tray(icon);
		tray.setToolTip("Choros");

		void updateTrayMenu();

		const manager = getHostServiceCoordinator();
		manager.on("status-changed", (_event: HostServiceStatusEvent) => {
			void updateTrayMenu();
		});

		tray.on("mouse-enter", () => {
			void updateTrayMenu();
		});

		console.log("[Tray] Initialized successfully");
	} catch (error) {
		console.error("[Tray] Failed to initialize:", error);
	}
}

/** Call on app quit */
export function disposeTray(): void {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
