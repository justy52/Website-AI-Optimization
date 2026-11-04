import { afterEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => vi.fn());
vi.mock("@/server/readiness", () => ({ productionReadiness: probe }));
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); probe.mockReset(); });

describe("protected production readiness", () => {
  it.each([undefined, "", "short"])("does not query dependencies with an unconfigured probe secret", async secret => {
    vi.stubEnv("MONITORING_SECRET", secret);
    expect((await GET(new Request("https://example.test/api/health/ready"))).status).toBe(401);
    expect(probe).not.toHaveBeenCalled();
  });
  it("rejects cron credentials without exposing diagnostics", async () => {
    vi.stubEnv("MONITORING_SECRET", "m".repeat(32));
    const response = await GET(new Request("https://example.test/api/health/ready", { headers: { authorization: `Bearer ${"c".repeat(32)}` } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "unauthorized" });
    expect(probe).not.toHaveBeenCalled();
  });
  it.each([true, false])("reports the dependency and release hold state (%s)", async ready => {
    vi.stubEnv("MONITORING_SECRET", "m".repeat(32));
    probe.mockResolvedValue({ ready, checks: { database: ready }, automationPaused: !ready });
    const response = await GET(new Request("https://example.test/api/health/ready", { headers: { authorization: `Bearer ${"m".repeat(32)}` } }));
    expect(response.status).toBe(ready ? 200 : 503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
