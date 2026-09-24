import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { authOriginOptions } from "./origins";

const env = {
  APP_ENV: "qa" as const,
  BETTER_AUTH_URL: "https://optiq-qa.vercel.app",
  VERCEL: "1",
  VERCEL_URL: "optiq-current-team.vercel.app",
  VERCEL_BRANCH_URL: "optiq-branch-team.vercel.app",
};

describe("exact deployment auth origins", () => {
  it("uses exact HTTPS hosts with a canonical fallback and no wildcard", () => {
    const options = authOriginOptions(env);
    expect(options.baseURL).toEqual({
      allowedHosts: ["optiq-qa.vercel.app", env.VERCEL_URL, env.VERCEL_BRANCH_URL],
      protocol: "https", fallback: env.BETTER_AUTH_URL,
    });
    expect(JSON.stringify(options)).not.toContain("*");
    expect(options).not.toHaveProperty("advanced");
  });
  it.each(["", "evil.com", "https://optiq.vercel.app", "user@optiq.vercel.app", "optiq.vercel.app/path", "optiq.vercel.app:443", "*.vercel.app", "optiq.vercel.app?x", "optiq.vercel.app\n", "-optiq.vercel.app", "optiq..vercel.app"])("ignores invalid system hostname %j", (host) => {
    expect(authOriginOptions({ ...env, VERCEL_URL: host, VERCEL_BRANCH_URL: host }).trustedOrigins).toEqual([env.BETTER_AUTH_URL]);
  });
  it.each(["http://optiq-qa.vercel.app", "https://user@optiq-qa.vercel.app", "https://optiq-qa.vercel.app/path", "https://optiq-qa.vercel.app?x"])("rejects invalid deployed canonical origin %s", (url) => {
    expect(() => authOriginOptions({ ...env, BETTER_AUTH_URL: url })).toThrow();
  });
  it("preserves local development and ignores deployment hosts outside Vercel", () => {
    expect(authOriginOptions({ ...env, APP_ENV: "local", BETTER_AUTH_URL: "http://localhost:3000" })).toEqual({ baseURL: "http://localhost:3000", trustedOrigins: ["http://localhost:3000"] });
    expect(authOriginOptions({ ...env, VERCEL: undefined }).trustedOrigins).toEqual([env.BETTER_AUTH_URL]);
  });

  function instance(local = false) {
    return betterAuth({
      ...authOriginOptions(local ? { ...env, APP_ENV: "local", BETTER_AUTH_URL: "http://localhost:3000" } : env),
      secret: "auth-origin-test-fixture-only-not-a-real-secret",
      database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
      emailAndPassword: { enabled: true },
      // Better Auth skips origin checks under NODE_ENV=test unless explicit.
      advanced: { disableOriginCheck: false, disableCSRFCheck: false },
      logger: { disabled: true },
    });
  }
  function signup(url: string, origin = url) {
    return new Request(`${url}/api/auth/sign-up/email`, {
      method: "POST", headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ name: "Auth Test", email: "auth-test@example.com", password: "auth-test-password-only" }),
    });
  }
  it.each([env.BETTER_AUTH_URL, `https://${env.VERCEL_URL}`, `https://${env.VERCEL_BRANCH_URL}`, "http://localhost:3000"])("actual signup/login and session work on %s", async (origin) => {
    const auth = instance(origin.includes("localhost"));
    const created = await auth.handler(signup(origin));
    expect(created.status).toBe(200);
    const cookie = created.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    if (!origin.includes("localhost")) expect(cookie).toContain("Secure");
    const session = await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie: cookie.split(";")[0] } }));
    expect((await session.json()).user.email).toBe("auth-test@example.com");
    const login = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST", headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email: "auth-test@example.com", password: "auth-test-password-only" }),
    }));
    expect(login.status).toBe(200);
  });
  it.each(["https://attacker.vercel.app", "https://unrelated-project.vercel.app", "https://attacker.example", "http://optiq-current-team.vercel.app", "http://optiq-qa.vercel.app"])("actual signup rejects origin %s", async (origin) => {
    const result = await instance().handler(signup(`https://${env.VERCEL_URL}`, origin));
    expect(result.status).toBe(403);
    expect((await result.json()).code).toBe("INVALID_ORIGIN");
  });
  it("does not trust forwarded host input", async () => {
    const request = signup(`https://${env.VERCEL_URL}`, "https://attacker.vercel.app");
    request.headers.set("x-forwarded-host", "attacker.vercel.app");
    expect((await instance().handler(request)).status).toBe(403);
  });
});
