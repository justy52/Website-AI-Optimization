import { describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({generate:vi.fn<()=>Promise<never>>()}));
vi.mock("ai",async importOriginal=>{
  const actual=await importOriginal<typeof import("ai")>();
  const {MockLanguageModelV4}=await import("ai/test");
  return {...actual,gateway:Object.assign(
    ()=>new MockLanguageModelV4({modelId:"synthetic-paid",doGenerate:()=>state.generate()}),
    {getAvailableModels:async()=>({models:[{id:"synthetic-paid",modelType:"language",pricing:{input:"0.00000075",output:"0.0000045"}}]})}
  )};
});
import { APICallError } from "ai";
import { createAiGatewayPrepareProvider, maliciousFixtureInput } from "./page-optimization";
import { createBudgetSnapshot } from "./budget";
import { prepareDraftBudget } from "./catalog";
describe("paid PREPARE SDK request safety",()=>{
  it("does not retry a retryable provider response after the authorized request",async()=>{
    state.generate.mockRejectedValue(new APICallError({message:"Synthetic response lost",url:"https://synthetic.invalid",requestBodyValues:{},statusCode:503,isRetryable:true}));
    const provider=createAiGatewayPrepareProvider({model:"synthetic-paid",maxOutputTokens:100,timeoutMs:10_000,budget:createBudgetSnapshot(prepareDraftBudget)});
    await expect(provider.generate(maliciousFixtureInput())).rejects.toThrow("Synthetic response lost");
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
});
