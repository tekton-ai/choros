import { observable } from "@trpc/server/observable";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { publicProcedure, router } from "../..";

export const createHostServiceCoordinatorRouter = () =>
	router({
		getConnection: publicProcedure.query(() =>
			getHostServiceCoordinator().getConnection(),
		),
		getConnections: publicProcedure.query(() =>
			getHostServiceCoordinator().getConnections(),
		),
		getProcessStatus: publicProcedure.query(() => ({
			status: getHostServiceCoordinator().getProcessStatus(),
		})),
		restart: publicProcedure.mutation(() =>
			getHostServiceCoordinator().restart(),
		),
		onStatusChange: publicProcedure.subscription(() =>
			observable<HostServiceStatusEvent>((emit) => {
				const coordinator = getHostServiceCoordinator();
				const handler = (event: HostServiceStatusEvent) => emit.next(event);
				coordinator.on("status-changed", handler);
				return () => coordinator.off("status-changed", handler);
			}),
		),
	});
