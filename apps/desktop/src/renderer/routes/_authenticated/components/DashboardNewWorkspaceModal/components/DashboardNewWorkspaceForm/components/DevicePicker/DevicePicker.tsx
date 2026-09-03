import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { cn } from "@choros/ui/utils";
import { Trans, useLingui } from "@lingui/react/macro";

import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineComputerDesktop,
	HiOutlineServer,
} from "react-icons/hi2";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { FormPickerTrigger } from "../../PromptGroup/components/FormPickerTrigger";
import { useWorkspaceHostOptions } from "./hooks/useWorkspaceHostOptions";

function OnlineDot({ online }: { online: boolean }) {
	const { t } = useLingui();
	return (
		<span
			role="img"
			aria-label={
				online
					? t({
							id: "dashboard.newWorkspaceModal.devicePicker.online",
							message: "online",
						})
					: t({
							id: "dashboard.newWorkspaceModal.devicePicker.offline",
							message: "offline",
						})
			}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}

interface DevicePickerProps {
	hostId: string | null;
	onSelectHostId: (hostId: string | null) => void;
	className?: string;
	/**
	 * Also show relay connectivity for the local device. Cloud-dispatched work
	 * (automations) goes through the relay, so "local" is not inherently online.
	 */
	showLocalOnlineState?: boolean;
	/**
	 * Disables opening via the Radix trigger itself. A button disabled only
	 * through an enclosing <fieldset> still receives pointerdown in Chrome —
	 * the event that opens a DropdownMenu.
	 */
	disabled?: boolean;
}

function getSelectedIcon(hostId: string | null, machineId: string | null) {
	if (hostId === null || hostId === machineId) {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}
	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostId,
	onSelectHostId,
	className,
	showLocalOnlineState = false,
	disabled,
}: DevicePickerProps) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { currentDeviceName, localHostIsOnline, otherHosts } =
		useWorkspaceHostOptions();

	const isLocal = hostId === null || hostId === machineId;
	const selectedLabel = isLocal
		? (currentDeviceName ??
			t({
				id: "dashboard.newWorkspaceModal.devicePicker.localDeviceSelected",
				message: "Local Device",
			}))
		: (otherHosts.find((host) => host.id === hostId)?.name ??
			t({
				id: "dashboard.newWorkspaceModal.devicePicker.unknownHost",
				message: "Unknown Host",
			}));
	const localOnline = showLocalOnlineState ? localHostIsOnline : null;
	const selectedOnline = isLocal
		? localOnline
		: (otherHosts.find((host) => host.id === hostId)?.isOnline ?? false);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<FormPickerTrigger
					className={cn("max-w-[140px]", className)}
					aria-label={t({
						id: "dashboard.newWorkspaceModal.devicePicker.triggerAria",
						message: `Device: ${selectedLabel}`,
					})}
					title={selectedLabel}
				>
					{getSelectedIcon(hostId, machineId)}
					<span className="truncate">{selectedLabel}</span>
					{selectedOnline !== null && <OnlineDot online={selectedOnline} />}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem onSelect={() => onSelectHostId(machineId)}>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">
						<Trans id="dashboard.newWorkspaceModal.devicePicker.localDevice">
							Local Device
						</Trans>
					</span>
					{localOnline !== null && <OnlineDot online={localOnline} />}
					{isLocal && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{otherHosts.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<HiOutlineServer className="size-4" />
								<Trans id="dashboard.newWorkspaceModal.devicePicker.otherHosts">
									Other Hosts
								</Trans>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-72">
								{otherHosts.map((host) => {
									const isSelected = hostId === host.id;

									return (
										<DropdownMenuItem
											key={host.id}
											onSelect={() => onSelectHostId(host.id)}
										>
											<HiOutlineServer className="size-4" />
											<span className="min-w-0 truncate">{host.name}</span>
											<OnlineDot online={host.isOnline} />
											{isSelected && (
												<HiCheck className="ml-auto size-4 shrink-0" />
											)}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
