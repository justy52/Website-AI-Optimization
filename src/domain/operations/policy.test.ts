import { describe, expect, it } from "vitest";
import { assertBudget, DEFAULT_BUDGETS, pauseApplies, RATE_LIMITS, rateWindow, safeUsageCost, UNPAUSED } from "./policy";
const empty = {committedCostUsd:0,aiCalls:0,visibilityCalls:0,active:0,crawls:0,unknownUnreservedCosts:0};
describe("operational policy",()=>{
  it("allows free work with conservative defaults",()=>expect(()=>assertBudget(DEFAULT_BUDGETS,empty,{workflow:true})).not.toThrow());
  it("blocks paid work under the default zero ceiling",()=>expect(()=>assertBudget(DEFAULT_BUDGETS,empty,{costUsd:0.01})).toThrow("ceiling"));
  it.each([10,11])("blocks new cost at/over ceiling %s",cost=>expect(()=>assertBudget({...DEFAULT_BUDGETS,monthlyCostUsd:"10"},{...empty,committedCostUsd:cost},{costUsd:0.01})).toThrow());
  it("allows bounded cost up to the ceiling",()=>expect(()=>assertBudget({...DEFAULT_BUDGETS,monthlyCostUsd:"10"},{...empty,committedCostUsd:9},{costUsd:1})).not.toThrow());
  it("unreported paid cost blocks more paid work",()=>expect(()=>assertBudget({...DEFAULT_BUDGETS,monthlyCostUsd:"10"},{...empty,unknownUnreservedCosts:1},{costUsd:1})).toThrow("unreported"));
  it.each([{aiCalls:101},{visibilityCalls:101},{workflow:true},{crawl:true}])("enforces independent ceilings %j",next=>expect(()=>assertBudget({...DEFAULT_BUDGETS,activeWorkflowLimit:0,crawlConcurrency:0},empty,next)).toThrow());
  it.each(["audit","monitor","prepare","verification","visibility","qa_execute","monthly_cycle"] as const)("pause all blocks %s and resume restores eligibility",action=>{expect(pauseApplies({...UNPAUSED,pausedAll:true},action)).toBe(true);expect(pauseApplies(UNPAUSED,action)).toBe(false);});
  it.each(["export","cleanup","recovery"] as const)("pause keeps %s available",action=>expect(pauseApplies({...UNPAUSED,pausedAll:true},action)).toBe(false));
  it("independent categories do not pause unrelated work",()=>{expect(pauseApplies({...UNPAUSED,pausedAi:true},"prepare")).toBe(true);expect(pauseApplies({...UNPAUSED,pausedAi:true},"monitor")).toBe(false);expect(pauseApplies({...UNPAUSED,pausedExecution:true},"qa_execute")).toBe(true);});
  it.each(Object.entries(RATE_LIMITS))("%s uses a bounded fixed one-minute limit of %s",(_action,limit)=>{expect(limit).toBeGreaterThan(0);expect(limit).toBeLessThanOrEqual(12);expect(rateWindow(new Date("2026-09-25T10:00:59.999Z")).toISOString()).toBe("2026-09-25T10:00:00.000Z");expect(rateWindow(new Date("2026-09-25T10:01:00Z")).toISOString()).toBe("2026-09-25T10:01:00.000Z");});
  it("does not invent unknown cost",()=>{expect(safeUsageCost("perplexity",0)).toBeNull();expect(safeUsageCost("perplexity",undefined)).toBeNull();expect(safeUsageCost("deterministic",undefined)).toBe("0");expect(safeUsageCost("perplexity",3)).toBe("0.030000");});
});
