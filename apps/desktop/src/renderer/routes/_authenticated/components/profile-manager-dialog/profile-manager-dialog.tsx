import { formatNumber } from "@choros/i18n/format";
import { Button } from "@choros/ui/button";
import { Checkbox } from "@choros/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@choros/ui/dialog";
import { Input } from "@choros/ui/input";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuPlus, LuSearch } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import {
	type ProfileDefinition,
	type ProfileMemberRef,
	profileMemberKey,
} from "shared/profiles";
import { ProfileDeleteDialog } from "./components/profile-delete-dialog";
import { ProfileDestinationSelect } from "./components/profile-destination-select";
import { ProfileManagerMemberRow } from "./components/profile-manager-member-row";
import { ProfileManagerProfileRow } from "./components/profile-manager-profile-row";
import { ProfileNameDialog } from "./components/profile-name-dialog";
import { getProfileManagerMembers } from "./utils/profile-manager-members";

const ALL_PROFILES = "";

/** Stable authenticated-level mount: moving the source row cannot close this dialog. */
export function ProfileManagerDialog() {
	const { t } = useLingui();
	const {
		available,
		isReady,
		profiles,
		memberships,
		activeProfileId,
		defaultProfileId,
		managerOpen,
		setManagerOpen,
		getProjectProfileId,
		getWorkspaceProfileId,
		moveMembers,
		reorderProfiles,
		deleteProfile,
		recoveryMembers,
		clearRecoveryMembers,
	} = useProfiles();
	const { projects, isReady: projectsReady } = useHostProjects();
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { activeHostUrl } = useLocalHostService();
	const [filterId, setFilterId] = useState(ALL_PROFILES);
	const [search, setSearch] = useState("");
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [destination, setDestination] = useState("");
	const [nameDialog, setNameDialog] = useState<
		ProfileDefinition | "create" | null
	>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const request = useRef(0);
	const openRef = useRef(false);
	const opening = managerOpen && !openRef.current;
	const disabled = pending || !available || !isReady;
	const members = useMemo(
		() =>
			getProfileManagerMembers({
				projects,
				workspaces,
				memberships,
				recoveryMembers,
				getProjectProfileId,
				getWorkspaceProfileId,
			}),
		[
			projects,
			workspaces,
			memberships,
			recoveryMembers,
			getProjectProfileId,
			getWorkspaceProfileId,
		],
	);
	const counts = useMemo(() => {
		const result = new Map<string, { projects: number; sessions: number }>();
		for (const item of members) {
			const count = result.get(item.profileId) ?? { projects: 0, sessions: 0 };
			if (item.member.kind === "project") count.projects += 1;
			else count.sessions += 1;
			result.set(item.profileId, count);
		}
		return result;
	}, [members]);
	useEffect(() => {
		if (managerOpen && !openRef.current) {
			request.current += 1;
			setPending(false);
			setSearch("");
			setDestination("");
			setFilterId(recoveryMembers.length ? ALL_PROFILES : activeProfileId);
			setChecked(new Set(recoveryMembers.map(profileMemberKey)));
		}
		if (!managerOpen && openRef.current) {
			request.current += 1;
			setNameDialog(null);
			setDeletingId(null);
			clearRecoveryMembers();
		}
		openRef.current = managerOpen;
	}, [managerOpen, activeProfileId, recoveryMembers, clearRecoveryMembers]);
	useEffect(() => {
		if (filterId && !profiles.some((profile) => profile.id === filterId))
			setFilterId(ALL_PROFILES);
		if (destination && !profiles.some((profile) => profile.id === destination))
			setDestination("");
	}, [filterId, destination, profiles]);
	const filteredMembers = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		return members.filter(
			(item) =>
				(!filterId || item.profileId === filterId) &&
				(!query ||
					`${item.name ?? ""} ${item.detail}`
						.toLocaleLowerCase()
						.includes(query)),
		);
	}, [members, filterId, search]);
	const selectedMembers = filteredMembers.filter((item) =>
		checked.has(item.key),
	);
	const allChecked =
		filteredMembers.length > 0 &&
		selectedMembers.length === filteredMembers.length;
	useEffect(() => {
		// Opening initializes the filter and recovery selection in the effect
		// above. Do not prune it against the previous opening's visible rows.
		if (opening) return;
		const visible = new Set(filteredMembers.map((item) => item.key));
		setChecked((current) => {
			const next = new Set([...current].filter((key) => visible.has(key)));
			return next.size === current.size ? current : next;
		});
	}, [filteredMembers, opening]);
	const move = async (refs: ProfileMemberRef[], profileId: string) => {
		if (disabled || refs.length === 0) return;
		const token = ++request.current;
		setPending(true);
		const success = await moveMembers(refs, profileId);
		if (token !== request.current) return;
		setPending(false);
		if (success) {
			setChecked(new Set());
			clearRecoveryMembers();
		}
	};
	const reorder = async (profileId: string, direction: -1 | 1) => {
		if (disabled) return;
		const ids = profiles.map((profile) => profile.id);
		const index = ids.indexOf(profileId);
		const adjacent = ids[index + direction];
		if (index < 0 || !adjacent) return;
		ids[index + direction] = profileId;
		ids[index] = adjacent;
		const token = ++request.current;
		setPending(true);
		await reorderProfiles(ids);
		if (token === request.current) setPending(false);
	};
	const deleting =
		profiles.find((profile) => profile.id === deletingId) ?? null;
	const deletingCounts = counts.get(deletingId ?? "");
	const defaultName =
		profiles.find((profile) => profile.id === defaultProfileId)?.name ??
		"Default";
	const hostUnavailable =
		!activeHostUrl ||
		!projectsReady ||
		!workspacesReady ||
		projects.some((project) => !project.hostReachable) ||
		workspaces.some((workspace) => !workspace.hostReachable);
	const selectedCount = selectedMembers.length;
	return (
		<>
			<Dialog open={managerOpen} onOpenChange={setManagerOpen}>
				<DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>
							<Trans id="profiles.manager.title">Manage Profiles</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans id="profiles.manager.description">
								Organize projects and independent sessions. Project workspaces
								inherit their project's Profile. Moving work does not stop it.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{!available && (
						<p role="alert" className="text-sm text-destructive">
							<Trans id="profiles.manager.registryUnavailable">
								Profiles are unavailable. Existing work remains accessible in
								Default; changes are disabled until local storage recovers.
							</Trans>
						</p>
					)}
					<div className="min-h-0 overflow-y-auto space-y-4">
						<section
							aria-label={t({
								id: "profiles.manager.profilesLabel",
								message: "Profiles",
							})}
						>
							<div className="mb-2 flex items-center justify-between gap-2">
								<Button
									size="sm"
									variant={filterId === ALL_PROFILES ? "secondary" : "ghost"}
									aria-pressed={filterId === ALL_PROFILES}
									onClick={() => setFilterId(ALL_PROFILES)}
								>
									<Trans id="profiles.manager.allProfiles">All Profiles</Trans>
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={disabled}
									onClick={() => setNameDialog("create")}
								>
									<LuPlus className="size-4" />
									<Trans id="profiles.manager.new">New Profile</Trans>
								</Button>
							</div>
							<div className="max-h-52 overflow-y-auto space-y-1">
								{profiles.map((profile, index) => (
									<ProfileManagerProfileRow
										key={profile.id}
										profile={profile}
										selected={filterId === profile.id}
										projects={counts.get(profile.id)?.projects ?? 0}
										sessions={counts.get(profile.id)?.sessions ?? 0}
										disabled={disabled}
										first={index === 0}
										last={index === profiles.length - 1}
										onSelect={() => setFilterId(profile.id)}
										onRename={() => setNameDialog(profile)}
										onDelete={() => setDeletingId(profile.id)}
										onReorder={(direction) => {
											void reorder(profile.id, direction);
										}}
									/>
								))}
							</div>
						</section>
						<section
							className="space-y-3 border-t pt-4"
							aria-label={t({
								id: "profiles.manager.membersLabel",
								message: "Profile members",
							})}
						>
							<div className="relative">
								<LuSearch
									aria-hidden="true"
									className="absolute left-3 top-2.5 size-4 text-muted-foreground"
								/>
								<Input
									className="pl-9"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									aria-label={t({
										id: "profiles.manager.search",
										message:
											"Search projects and sessions by name, path, or ID",
									})}
									placeholder={t({
										id: "profiles.manager.search",
										message:
											"Search projects and sessions by name, path, or ID",
									})}
								/>
							</div>
							{hostUnavailable && (
								<output className="text-xs text-muted-foreground">
									<Trans id="profiles.manager.hostUnavailable">
										Host data is loading or unavailable. Known and saved members
										are shown; missing data does not mean a Profile is empty.
									</Trans>
								</output>
							)}
							<div className="flex items-center gap-3 px-1">
								<Checkbox
									checked={
										allChecked
											? true
											: selectedCount > 0
												? "indeterminate"
												: false
									}
									disabled={disabled || filteredMembers.length === 0}
									aria-label={t({
										id: "profiles.manager.selectAll",
										message: "Select all displayed members",
									})}
									onCheckedChange={(value) =>
										setChecked(
											value === true
												? new Set(filteredMembers.map((item) => item.key))
												: new Set(),
										)
									}
								/>
								<output className="flex-1 text-xs text-muted-foreground">
									<Trans id="profiles.manager.selectedCount">
										{formatNumber(selectedCount)} selected
									</Trans>
								</output>
								<ProfileDestinationSelect
									value={destination}
									onChange={setDestination}
									disabled={disabled || selectedCount === 0}
								/>
								<Button
									size="sm"
									disabled={disabled || !destination || selectedCount === 0}
									onClick={() => {
										void move(
											selectedMembers.map((item) => item.member),
											destination,
										);
									}}
								>
									<Trans id="profiles.manager.moveSelected">
										Move selected
									</Trans>
								</Button>
							</div>
							<div className="max-h-72 overflow-y-auto">
								{filteredMembers.map((item) => (
									<ProfileManagerMemberRow
										key={item.key}
										item={item}
										checked={checked.has(item.key)}
										disabled={disabled}
										onCheck={(value) =>
											setChecked((current) => {
												const next = new Set(current);
												if (value) next.add(item.key);
												else next.delete(item.key);
												return next;
											})
										}
										onMove={(profileId) => {
											if (item.profileId !== profileId)
												void move([item.member], profileId);
										}}
									/>
								))}
								{filteredMembers.length === 0 && (
									<p className="py-6 text-center text-sm text-muted-foreground">
										<Trans id="profiles.manager.noMembers">
											No matching known members.
										</Trans>
									</p>
								)}
							</div>
						</section>
					</div>
				</DialogContent>
			</Dialog>
			<ProfileNameDialog
				open={managerOpen && nameDialog !== null}
				profile={nameDialog && nameDialog !== "create" ? nameDialog : undefined}
				onOpenChange={(open) => {
					if (!open) setNameDialog(null);
				}}
			/>
			<ProfileDeleteDialog
				profile={managerOpen ? deleting : null}
				defaultName={defaultName}
				projects={deletingCounts?.projects ?? 0}
				sessions={deletingCounts?.sessions ?? 0}
				pending={pending}
				onClose={() => setDeletingId(null)}
				onConfirm={async (moveToDefault) => {
					if (!deleting || disabled) return;
					const token = ++request.current;
					setPending(true);
					const success = await deleteProfile(deleting.id, moveToDefault);
					if (token !== request.current) return;
					setPending(false);
					if (success) setDeletingId(null);
				}}
			/>
		</>
	);
}
