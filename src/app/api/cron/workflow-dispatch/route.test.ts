import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({batch:vi.fn(),env:{CRON_SECRET:"cron-test"}}));
vi.mock("@/lib/env",()=>({serverEnv:mocks.env}));
vi.mock("@/server/workflow-dispatch",()=>({dispatchQueuedBatch:mocks.batch}));
import { GET } from "./route";
describe("dispatch recovery cron",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.env.CRON_SECRET="cron-test";});
  it("requires configuration and authorization before accessing queued tenants",async()=>{
    mocks.env.CRON_SECRET="";expect((await GET(new Request("https://app.example/api/cron/workflow-dispatch"))).status).toBe(503);
    mocks.env.CRON_SECRET="cron-test";expect((await GET(new Request("https://app.example/api/cron/workflow-dispatch"))).status).toBe(401);
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("dispatches one bounded batch and reports pending starts",async()=>{
    mocks.batch.mockResolvedValue({due:2,started:1,pending:1,skipped:0});
    const response=await GET(new Request("https://app.example/api/cron/workflow-dispatch",{headers:{authorization:"Bearer cron-test"}}));
    expect(await response.json()).toEqual({due:2,started:1,pending:1,skipped:0});
    expect(mocks.batch).toHaveBeenCalledOnce();
  });
});
