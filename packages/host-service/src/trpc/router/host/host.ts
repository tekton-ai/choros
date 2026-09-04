import os from "node:os";
import hostServicePackageJson from "@choros/host-service/package.json" with {
	type: "json",
};
import { getHostId, getHostName } from "@choros/shared/host-info";
import { protectedProcedure, router } from "../../index";

const HOST_SERVICE_VERSION: string = hostServicePackageJson.version;

export const hostRouter = router({
	info: protectedProcedure.query(() => ({
		hostId: getHostId(),
		hostName: getHostName(),
		version: HOST_SERVICE_VERSION,
		platform: os.platform(),
		uptime: process.uptime(),
	})),
});
