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

// Owner credentials belong only in the migration job, never DATABASE_URL.
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (process.argv.includes("migrate")) {
  if (!migrationUrl) throw new Error("MIGRATION_DATABASE_URL is required for migrations.");
  if (new URL(migrationUrl).hostname.includes("-pooler.")) {
    throw new Error("Migrations require a direct, non-pooled owner connection.");
  }
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl ?? localDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
