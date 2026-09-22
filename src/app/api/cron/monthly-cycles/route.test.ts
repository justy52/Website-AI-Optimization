import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "qa-cron-test-only" as string | undefined },
  list: vi.fn(), start: vi.fn(), workflow: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ serverEnv: mocks.env }));
vi.mock("@/server/monthly-cycles", () => ({ listDueMonthlyCycleClientRefs: mocks.list }));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/workflows/monthly-cycle", () => ({ monthlyCycleCreationWorkflow: mocks.workflow }));
import { GET } from "./route";

describe("monthly cycle cron authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.env.CRON_SECRET = "qa-cron-test-only"; });
  it("does no bootstrap work without configured CRON_SECRET", async () => {
    mocks.env.CRON_SECRET = undefined;
    expect((await GET(new Request("https://qa.test/api/cron/monthly-cycles"))).status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects unauthorized callers before cross-tenant bootstrap", async () => {
    expect((await GET(new Request("https://qa.test/api/cron/monthly-cycles"))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("queues only tenant/client/period references and returns counts", async () => {
    mocks.list.mockResolvedValue([{ workspace_id: "workspace", client_id: "client", cycle_year: 2026, cycle_month: 9 }]);
    mocks.start.mockResolvedValue({ runId: "run" });
    const response = await GET(new Request("https://qa.test/api/cron/monthly-cycles", { headers: { authorization: "Bearer qa-cron-test-only" } }));
    expect(await response.json()).toEqual({ due: 1, queued: 1 });
    expect(mocks.start).toHaveBeenCalledWith(mocks.workflow, [{ workspaceId: "workspace", clientId: "client", year: 2026, month: 9 }]);
  });
});
