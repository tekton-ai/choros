import { Avatar } from "@choros/ui/atoms/avatar";
import { Button } from "@choros/ui/button";
import { Trans, useLingui } from "@lingui/react/macro";
import { useSignOut } from "renderer/hooks/use-sign-out";
import { authClient } from "renderer/lib/auth-client";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ProfileSkeleton } from "./components/profile-skeleton";
import { SettingRow } from "./components/setting-row";

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const { t } = useLingui();
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;
	const signOut = useSignOut();
	const showProfile = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_PROFILE,
		visibleItems,
	);
	const showSignOut = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		visibleItems,
	);

	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans id="settings.account.title">Account</Trans>
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans id="settings.account.subtitle">Your Choros sign-in</Trans>
				</p>
			</div>

			<div className="space-y-3">
				{showProfile &&
					(isPending && !user ? (
						<ProfileSkeleton />
					) : user ? (
						<>
							<SettingRow
								label={t({
									id: "settings.account.avatarLabel",
									message: "Avatar",
								})}
							>
								<Avatar size="xl" fullName={user.name} image={user.image} />
							</SettingRow>
							<SettingRow
								label={t({
									id: "settings.account.emailLabel",
									message: "Email",
								})}
							>
								<span className="select-text text-sm text-muted-foreground">
									{user.email}
								</span>
							</SettingRow>
							<SettingRow
								label={t({
									id: "settings.account.providerLabel",
									message: "Sign-in provider",
								})}
							>
								<span className="text-sm text-muted-foreground">
									<Trans id="settings.account.providerValue">
										GitHub or Google
									</Trans>
								</span>
							</SettingRow>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							<Trans id="settings.account.loadError">
								Unable to load user info
							</Trans>
						</p>
					))}

				{showSignOut && (
					<div className={showProfile ? "pt-5" : undefined}>
						<SettingRow
							label={t({
								id: "settings.account.signOutLabel",
								message: "Sign out of this device",
							})}
							hint={t({
								id: "settings.account.signOutLocalDataHint",
								message:
									"Your local projects, workspaces, chats, credentials, and settings stay on this device.",
							})}
						>
							<Button variant="outline" onClick={() => void signOut()}>
								<Trans id="settings.account.signOutButton">Sign out</Trans>
							</Button>
						</SettingRow>
					</div>
				)}
			</div>
		</div>
	);
}
