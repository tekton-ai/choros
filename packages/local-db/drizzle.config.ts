import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/migration-schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
});
