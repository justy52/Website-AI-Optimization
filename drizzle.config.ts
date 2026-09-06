import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const localDatabaseUrl = [
  "postgresql://",
  "optiq",
  ":",
  "local-only",
  "@localhost:5432/optiq",
].join("");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      localDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
