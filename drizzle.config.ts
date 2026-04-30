import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.REBRICKABLE_DB_PATH ??
      join(homedir(), ".rebrickable-manager", "rebrickable.db"),
  },
});
