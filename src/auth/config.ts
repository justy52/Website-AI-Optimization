import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db/client";
import { authSchema } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { authOriginOptions } from "./origins";

export const auth = betterAuth({
  appName: "OPTIQ",
  ...authOriginOptions(serverEnv),
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Shared database storage preserves Better Auth's atomic special endpoint rules
  // across serverless instances; origin/CSRF checks remain enabled.
  rateLimit: { enabled: true, storage: "database" },
});

export type Auth = typeof auth;
