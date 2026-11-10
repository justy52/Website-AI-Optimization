import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { authEnrollmentOptions, enrollmentPolicy } from "./enrollment";

const origin = "https://protected.example.com";
const password = "synthetic-enrollment-test-password";
function request(path: string, email: string) {
  return new Request(`${origin}/api/auth/${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "Synthetic enrollment", email, password }),
  });
}
type Env = Parameters<typeof enrollmentPolicy>[0];
function instance(env: Env, data = { user: [], account: [], session: [], verification: [] }) {
  return betterAuth({
    baseURL: origin, secret: "synthetic-enrollment-test-secret-at-least-32-characters",
    database: memoryAdapter(data), ...authEnrollmentOptions(env),
    trustedOrigins: [origin],
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    rateLimit: { enabled: false }, logger: { disabled: true },
  });
}

describe("production account enrollment", () => {
  it.each([{}, { AUTH_SIGNUP_ENABLED: "true" }, { AUTH_ENROLLMENT_EMAILS: "owner@example.com" },
    { AUTH_SIGNUP_ENABLED: "true", AUTH_ENROLLMENT_EMAILS: "*@example.com" },
    { AUTH_SIGNUP_ENABLED: "true", AUTH_ENROLLMENT_EMAILS: "owner@example.com,invalid" },
  ])("fails closed for incomplete or invalid configuration %j", async config => {
    const env = { APP_ENV: "production" as const, ...config };
    expect(enrollmentPolicy(env).signupEnabled).toBe(false);
    const r = await instance(env).handler(request("sign-up/email", "owner@example.com"));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });
  it("accepts only deliberately listed exact addresses and leaks no list", async () => {
    const env = { APP_ENV: "production" as const, AUTH_SIGNUP_ENABLED: "true", AUTH_ENROLLMENT_EMAILS: " Owner@Example.com , backup@example.com " };
    const auth = instance(env);
    for (const email of ["outsider@example.com", "owner@sub.example.com", "owner+other@example.com"]) {
      const r = await auth.handler(request("sign-up/email", email));
      expect(r.status).toBe(403);
      expect(await r.text()).not.toContain("backup@example.com");
    }
    expect((await auth.handler(request("sign-up/email", "OWNER@EXAMPLE.COM"))).status).toBe(200);
  });
  it("closing enrollment preserves existing password sign-in and session access", async () => {
    const data = { user: [], account: [], session: [], verification: [] };
    const open = instance({ APP_ENV: "production", AUTH_SIGNUP_ENABLED: "true", AUTH_ENROLLMENT_EMAILS: "owner@example.com" }, data);
    expect((await open.handler(request("sign-up/email", "owner@example.com"))).status).toBe(200);
    const closed = instance({ APP_ENV: "production" }, data);
    const login = await closed.handler(request("sign-in/email", "owner@example.com"));
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const session = await closed.handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }));
    expect((await session.json()).user.email).toBe("owner@example.com");
    expect((await closed.handler(request("sign-up/email", "new@example.com"))).status).toBe(400);
  });
  it.each(["local", "qa"] as const)("preserves %s test enrollment unless explicitly closed", env => {
    expect(enrollmentPolicy({ APP_ENV: env }).permitsEmail("test@example.com")).toBe(true);
    expect(enrollmentPolicy({ APP_ENV: env, AUTH_SIGNUP_ENABLED: "false" }).signupEnabled).toBe(false);
  });
});
