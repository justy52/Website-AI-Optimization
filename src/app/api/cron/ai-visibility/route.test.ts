import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn(), refs: vi.fn(), prepare: vi.fn(), env: { CRON_SECRET: "cron-test", PERPLEXITY_API_KEY: undefined } }));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/lib/env", () => ({ serverEnv: mocks.env }));
vi.mock("@/server/ai-visibility", () => ({ listVisibilityScheduleRefs: mocks.refs, prepareScheduledVisibility: mocks.prepare }));
vi.mock("@/workflows/ai-visibility", () => ({ aiVisibilityWorkflow: vi.fn() }));
import { GET } from "./route";
describe("visibility cron authorization and tenant dispatch", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.env.CRON_SECRET = "cron-test"; mocks.refs.mockResolvedValue([]); });
  it("requires a configured cron secret", async () => { mocks.env.CRON_SECRET = ""; expect((await GET(new Request("https://qa.example/api/cron/ai-visibility"))).status).toBe(503); expect(mocks.refs).not.toHaveBeenCalled(); });
  it("rejects unauthorized requests before bootstrap", async () => { expect((await GET(new Request("https://qa.example/api/cron/ai-visibility"))).status).toBe(401); expect(mocks.refs).not.toHaveBeenCalled(); });
  it("re-establishes tenant context and starts a durable workflow with IDs only", async () => {
    mocks.refs.mockResolvedValue([{ workspace_id: "workspace", website_id: "website" }]); mocks.prepare.mockResolvedValue({ context: { workspaceId: "workspace", actorType: "SYSTEM", role: "OWNER" }, run: { id: "run", completedAt: null } });
    const response = await GET(new Request("https://qa.example/api/cron/ai-visibility", { headers: { authorization: "Bearer cron-test" } }));
    expect(mocks.prepare).toHaveBeenCalledWith("workspace", "website"); expect(mocks.start).toHaveBeenCalledOnce(); expect(await response.json()).toEqual({ queued: 1 });
  });
  it("does not requeue a completed run", async () => {
    mocks.refs.mockResolvedValue([{ workspace_id: "workspace", website_id: "website" }]); mocks.prepare.mockResolvedValue({ context: {}, run: { id: "run", completedAt: new Date() } });
    await GET(new Request("https://qa.example/api/cron/ai-visibility", { headers: { authorization: "Bearer cron-test" } })); expect(mocks.start).not.toHaveBeenCalled();
  });
});
