import { Button } from "@choros/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@choros/ui/dialog";
import { Input } from "@choros/ui/input";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, useState } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import {
	normalizeProfileName,
	type ProfileDefinition,
	profileNameSchema,
} from "shared/profiles";

export function ProfileNameDialog({
	open,
	onOpenChange,
	profile,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profile?: ProfileDefinition;
	onSaved?: (profileId: string) => void;
}) {
	const { t } = useLingui();
	const { available, isReady, profiles, createProfile, renameProfile } =
		useProfiles();
	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputId = useId();
	const request = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a different Profile identity invalidates the pending rename even when its display name is unchanged
	useEffect(() => {
		request.current += 1;
		if (open) {
			setName(profile?.name ?? "");
			setError(null);
			setPending(false);
		}
	}, [open, profile?.id, profile?.name]);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (pending || !available || !isReady) return;
						const parsed = profileNameSchema.safeParse(name);
						if (!parsed.success) {
							setError(
								t({
									id: "profiles.name.invalid",
									message: "Enter a name with 1–80 characters.",
								}),
							);
							return;
						}
						if (
							profiles.some(
								(item) =>
									item.id !== profile?.id &&
									normalizeProfileName(item.name) ===
										normalizeProfileName(parsed.data),
							)
						) {
							setError(
								t({
									id: "profiles.name.duplicate",
									message: "A Profile with this name already exists.",
								}),
							);
							return;
						}
						setPending(true);
						setError(null);
						const token = ++request.current;
						const savedId = profile
							? (await renameProfile(profile.id, parsed.data))
								? profile.id
								: null
							: (await createProfile(parsed.data))?.id;
						if (request.current !== token) return;
						setPending(false);
						if (savedId) {
							onSaved?.(savedId);
							onOpenChange(false);
						}
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{profile ? (
								<Trans id="profiles.name.renameTitle">Rename Profile</Trans>
							) : (
								<Trans id="profiles.name.createTitle">New Profile</Trans>
							)}
						</DialogTitle>
						<DialogDescription>
							<Trans id="profiles.name.description">
								Profiles organize local work. They do not isolate accounts,
								permissions, or running processes.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-4">
						<label className="text-sm" htmlFor={inputId}>
							<Trans id="profiles.name.label">Name</Trans>
						</label>
						<Input
							id={inputId}
							autoFocus
							value={name}
							onChange={(event) => setName(event.target.value)}
							aria-invalid={!!error}
							aria-describedby={error ? `${inputId}-error` : undefined}
							disabled={pending || !available}
						/>
						{error && (
							<p
								id={`${inputId}-error`}
								role="alert"
								className="text-sm text-destructive"
							>
								{error}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							<Trans id="profiles.name.cancel">Cancel</Trans>
						</Button>
						<Button type="submit" disabled={pending || !available || !isReady}>
							{profile ? (
								<Trans id="profiles.name.save">Save</Trans>
							) : (
								<Trans id="profiles.name.create">Create</Trans>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
