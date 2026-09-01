import { auth } from "@choros/auth/server";
import { i18n } from "@choros/i18n";
import { COMPANY } from "@choros/shared/constants";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@choros/ui/breadcrumb";
import { Separator } from "@choros/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@choros/ui/sidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";

import { AppSidebar } from "./components/AppSidebar";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect(env.NEXT_PUBLIC_WEB_URL);
	}

	if (!session.user.email?.endsWith(COMPANY.EMAIL_DOMAIN)) {
		redirect(env.NEXT_PUBLIC_WEB_URL);
	}

	return (
		<SidebarProvider>
			<AppSidebar
				user={{
					name: session.user.name,
					email: session.user.email,
					image: session.user.image,
				}}
			/>
			<SidebarInset>
				<header className="bg-background sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem className="hidden md:block">
								<BreadcrumbLink href="/">Choros</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator className="hidden md:block" />
							<BreadcrumbItem>
								<BreadcrumbPage>
									{i18n._({ id: "admin.breadcrumb.home", message: "Home" })}
								</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
