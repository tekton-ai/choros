import { I18nProvider } from "@choros/i18n/react";
import { Alerter } from "@choros/ui/atoms/alert";
import type { ReactNode } from "react";
import { ThemedToaster } from "renderer/components/themed-toaster";
import { UsageReporter } from "renderer/components/usage-reporter";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AuthProvider } from "renderer/providers/auth-provider";
import { ElectronTRPCProvider } from "renderer/providers/electron-trpc-provider";

function LanguageAwareI18nProvider({ children }: { children: ReactNode }) {
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	return <I18nProvider locale={language ?? undefined}>{children}</I18nProvider>;
}

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ElectronTRPCProvider>
			<LanguageAwareI18nProvider>
				<AuthProvider>
					<UsageReporter />
					{children}
					<ThemedToaster />
					<Alerter />
				</AuthProvider>
			</LanguageAwareI18nProvider>
		</ElectronTRPCProvider>
	);
}
