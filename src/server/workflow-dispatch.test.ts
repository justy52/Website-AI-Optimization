import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ claim: vi.fn(), settle: vi.fn(), refs: vi.fn(), start: vi.fn() }));
vi.mock("./dispatch-state", () => ({ claimQueuedDispatch: state.claim, settleQueuedDispatch: state.settle, listQueuedDispatchRefs: state.refs }));
vi.mock("workflow/api", () => ({ start: state.start }));
import { dispatchQueuedBatch, dispatchQueuedRun } from "./workflow-dispatch";
const context = { workspaceId: "workspace", actorType: "USER" as const, role: "OWNER" as const, userId: "actor" };
const claim = { context, kind: "prepare" as const, id: "original", token: "lease", workflowTargetId: "original", attempts: 1 };
describe("durable dispatch orchestration", () => {
  beforeEach(() => { vi.clearAllMocks(); state.claim.mockResolvedValue(claim); state.settle.mockResolvedValue(undefined); });
  it("keeps a failed/ambiguous start pending on the original run", async () => {
    const launch = vi.fn().mockRejectedValue(new Error("Untrusted provider error with credentials"));
    expect(await dispatchQueuedRun(context,"prepare","original",undefined,launch)).toEqual({ status: "PENDING" });
    expect(launch).toHaveBeenCalledWith(claim);
    expect(state.settle).toHaveBeenCalledWith(claim,null,expect.anything(),expect.any(Date));
  });
  it("a lost receipt does not turn a committed queue request into a creation failure", async () => {
    vi.spyOn(console,"error").mockImplementation(() => {});
    state.settle.mockRejectedValueOnce(new Error("database down"));
    expect(await dispatchQueuedRun(context,"prepare","original",undefined,async () => ({ runId:"accepted" }))).toEqual({ status:"STARTED" });
    vi.restoreAllMocks();
  });
  it("a losing lease never launches a duplicate", async () => {
    state.claim.mockResolvedValue(null); const launch=vi.fn();
    expect(await dispatchQueuedRun(context,"prepare","original",undefined,launch)).toEqual({status:"SKIPPED"});
    expect(launch).not.toHaveBeenCalled(); expect(state.settle).not.toHaveBeenCalled();
  });
  it("a paused or failed tenant cannot abort the rest of the batch",async()=>{
    vi.spyOn(console,"error").mockImplementation(() => {});
    state.refs.mockResolvedValue([{workspace_id:"paused",kind:"prepare",run_id:"a"},{workspace_id:"active",kind:"prepare",run_id:"b"}]);
    state.claim.mockRejectedValueOnce(new Error("paused")).mockResolvedValueOnce({...claim,id:"b"});
    state.start.mockResolvedValue({runId:"accepted"});
    expect(await dispatchQueuedBatch()).toEqual({due:2,started:1,pending:1,skipped:0});
    vi.restoreAllMocks();
  });
});
