import { publicProcedure, router } from "..";
import { requestFullDiskAccess } from "./permissions/native-permissions";

export const createPermissionsRouter = () => {
	return router({
		requestFullDiskAccess: publicProcedure.mutation(async () => {
			await requestFullDiskAccess();
		}),
	});
};

export type PermissionsRouter = ReturnType<typeof createPermissionsRouter>;
