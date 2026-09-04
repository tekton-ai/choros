import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { ChorosLogo } from "renderer/routes/sign-in/components/choros-logo/choros-logo";
import { electronTrpc } from "../../lib/electron-trpc";

const HYDRATION_TIMEOUT_MS = 15_000;

async function refreshVerifiedSession(
	refetch: () => Promise<unknown>,
): Promise<boolean> {
	const response = await authClient.getSession();
	if (response.error) throw response.error;
	if (!response.data) return false;
	await refetch();
	return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});
	const clearStoredToken = electronTrpc.auth.signOut.useMutation();

	const hydrateStoredToken = useEffectEvent(async () => {
		if (storedToken?.token) {
			setAuthToken(storedToken.token);
			const active = await Promise.race([
				refreshVerifiedSession(refetchSession),
				new Promise<null>((resolve) =>
					window.setTimeout(() => resolve(null), HYDRATION_TIMEOUT_MS),
				),
			]).catch((error) => {
				console.warn(
					"[AuthProvider] session refresh failed; keeping cached offline identity",
					error,
				);
				return null;
			});
			if (active === false) {
				setAuthToken(null);
				await clearStoredToken.mutateAsync().catch((error) => {
					console.warn("[AuthProvider] failed to clear revoked token", error);
				});
			}
		}
		setIsHydrated(true);
	});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;
		void hydrateStoredToken();
	}, [isHydrated, isSuccess]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token) {
				setAuthToken(data.token);
				const active = await refreshVerifiedSession(refetchSession).catch(
					(error) => {
						console.warn("[AuthProvider] session refresh failed", error);
						return null;
					},
				);
				if (active === false) {
					setAuthToken(null);
					await clearStoredToken.mutateAsync().catch(() => undefined);
				}
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				await refetchSession().catch(() => undefined);
			}
		},
	});

	if (!isHydrated) {
		return (
			<div className="relative flex h-screen w-screen items-center justify-center bg-background">
				<div className="drag absolute inset-x-0 top-0 h-12" />
				<ChorosLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
