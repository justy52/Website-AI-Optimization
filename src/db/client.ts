import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

export function createDb(connectionString = serverEnv.DATABASE_URL) {
  const client = new Pool({ connectionString });

  return drizzle({
    client,
    schema,
  });
}

const globalForDb = globalThis as typeof globalThis & {
  __optiqDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__optiqDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__optiqDb = db;
}

export type Db = typeof db;
