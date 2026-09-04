import { middleware } from "@choros/cli-framework";

export default middleware((opts) => opts.next({ ctx: {} }));
