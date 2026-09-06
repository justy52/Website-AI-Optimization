import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db/client";
import { authSchema } from "@/db/schema";
import { serverEnv } from "@/lib/env";

export const auth = betterAuth({
  appName: "OPTIQ",
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  trustedOrigins: [serverEnv.BETTER_AUTH_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
