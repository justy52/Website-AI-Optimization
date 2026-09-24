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
});

export type Auth = typeof auth;
