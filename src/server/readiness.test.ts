import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ serverEnv: {
  APP_ENV: "production", PLATFORM_OPERATOR_USER_IDS: "operator-id", AUTOMATION_EMERGENCY_STOP: false,
} }));
import { serverEnv } from "@/lib/env";
import { productionReadiness } from "./readiness";

const healthy = { runtime_safe: true, tenant_policies: true, control_exists: true, paused_all: false };
function database(row = healthy) {
  return { transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({ execute: vi.fn().mockResolvedValue({ rows: [row] }) }) } as unknown as Parameters<typeof productionReadiness>[0];
}
afterEach(() => {
  vi.unstubAllEnvs();
  serverEnv.PLATFORM_OPERATOR_USER_IDS = "operator-id";
  serverEnv.AUTOMATION_EMERGENCY_STOP = false;
});

describe("production dependency readiness", () => {
  it("requires a production deployment and healthy controls", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await productionReadiness(database())).ready).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await productionReadiness(database())).ready).toBe(true);
  });
  it.each(["runtime_safe", "tenant_policies", "control_exists"])("holds release when %s fails", async key => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await productionReadiness(database({ ...healthy, [key]: false }))).ready).toBe(false);
  });
  it("honors both emergency stop and database pause", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await productionReadiness(database({ ...healthy, paused_all: true }))).ready).toBe(false);
    serverEnv.AUTOMATION_EMERGENCY_STOP = true;
    expect((await productionReadiness(database())).ready).toBe(false);
  });
  it("requires an operator", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    serverEnv.PLATFORM_OPERATOR_USER_IDS = " ";
    expect((await productionReadiness(database())).ready).toBe(false);
  });
  it("fails closed without exposing database errors", async () => {
    const broken = { transaction: async () => { throw new Error("postgresql://private-user:private-password@private-host/customer-db"); } } as unknown as Parameters<typeof productionReadiness>[0];
    const result = await productionReadiness(broken);
    expect(result.ready).toBe(false);
    expect(result.checks.database).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private-|postgresql/);
  });
});
