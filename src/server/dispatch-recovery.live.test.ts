import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { createDeterministicPrepareProvider, type PrepareModelProvider } from "@/domain/agents/page-optimization";
import { type VisibilityProvider } from "@/domain/ai-visibility/provider";
import { serverEnv } from "@/lib/env";
import { createBusinessFact, executePrepareDraftAgentRun, requestPrepareDraftForOpportunity } from "./agents";
import { requestManualMonitoringRun, executeMonitoringRun } from "./monitoring";
import { createVisibilityPromptSet, requestVisibilityRun, observeVisibilityPrompt, visibilityRunPromptIds } from "./ai-visibility";
import { recoverInternalRun } from "./recovery";
import { setAutomationPause } from "./operations";
import { claimQueuedDispatch, settleQueuedDispatch, listQueuedDispatchRefs } from "./dispatch-state";
import { dispatchQueuedRun } from "./workflow-dispatch";

const connectionString=process.env.DISPATCH_TEST_RUNNER_URL;
describe.skipIf(!connectionString)("isolated PostgreSQL dispatch crash/race recovery",{timeout:30_000},()=>{
  let pool:Pool, database:Db, c:WorkspaceContext, clientId:string, websiteId:string, opportunityId:string;
  const proofUserId=randomUUID();
  const original={env:serverEnv.APP_ENV,provider:serverEnv.AGENT_PROVIDER,model:serverEnv.AI_GATEWAY_MODEL,key:serverEnv.PERPLEXITY_API_KEY};
  beforeAll(async()=>{
    const url=new URL(connectionString!);
    const isolated=(url.hostname==="ep-ancient-block-arf2ydag.c-4.us-west-2.aws.neon.tech"&&url.pathname==="/optiq_phase5_review_final_20260922") || (url.hostname==="ep-odd-violet-arabm5ch.c-4.us-west-2.aws.neon.tech"&&url.pathname==="/virelantic_preview");
    if(!isolated) throw new Error("Dedicated dispatch proof branch required");
    pool=new Pool({connectionString,max:8}); database=drizzle({client:pool,schema});
    expect((await pool.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[proofUserId,`${proofUserId}@example.test`]);
  });
  beforeEach(async()=>{
    serverEnv.APP_ENV="qa";serverEnv.AGENT_PROVIDER="deterministic";serverEnv.PERPLEXITY_API_KEY="synthetic-no-network";
    c={workspaceId:randomUUID(),actorType:"USER",role:"OWNER",userId:proofUserId};
    await withTenantContext(database,c,async tx=>{
      await tx.insert(schema.workspaces).values({id:c.workspaceId,name:"Dispatch proof only",slug:`dispatch-${c.workspaceId}`});
      await tx.insert(schema.workspaceMemberships).values({workspaceId:c.workspaceId,userId:c.userId!,role:"OWNER"});
      await tx.insert(schema.workspaceOperations).values({workspaceId:c.workspaceId,monthlyCostUsd:"100",activeWorkflowLimit:20,crawlConcurrency:5});
      const [client]=await tx.insert(schema.clients).values({workspaceId:c.workspaceId,name:"Cedar Plumbing",servicePlan:"GROWTH"}).returning();clientId=client.id;
      const [site]=await tx.insert(schema.websites).values({workspaceId:c.workspaceId,clientId,displayName:"Proof site",domain:"cedar.example",canonicalUrl:"https://cedar.example"}).returning();websiteId=site.id;
      const [audit]=await tx.insert(schema.audits).values({workspaceId:c.workspaceId,websiteId,title:"Synthetic audit"}).returning();
      const [run]=await tx.insert(schema.auditRuns).values({workspaceId:c.workspaceId,auditId:audit.id,websiteId,status:"SUCCEEDED",completedAt:new Date()}).returning();
      const [evidence]=await tx.insert(schema.auditEvidence).values({workspaceId:c.workspaceId,auditRunId:run.id,evidenceType:"HTML",sourceLabel:"Synthetic title evidence",excerpt:"<html><title></title><h1>Cedar</h1></html>",sourceUrl:"https://cedar.example"}).returning();
      const [check]=await tx.insert(schema.auditCheckResults).values({workspaceId:c.workspaceId,auditId:audit.id,auditRunId:run.id,checkKey:"seo.title",checkVersion:"test",category:"seo",status:"FAIL",severity:"MEDIUM",evidenceConfidence:"HIGH",maxPenaltyWeight:10,reason:"Missing title",evidenceRefs:[evidence.id]}).returning();
      const [opportunity]=await tx.insert(schema.opportunities).values({workspaceId:c.workspaceId,clientId,websiteId,sourceAuditId:audit.id,sourceAuditRunId:run.id,sourceCheckResultId:check.id,sourceCheckKey:check.checkKey,sourceCheckVersion:check.checkVersion,sourceResultStatus:"FAIL",sourceSeverity:"MEDIUM",sourceEvidenceRefs:[evidence.id],evidenceConfidence:"HIGH",category:"seo",normalizedRemediationFamily:"on_page_metadata",title:"Improve title",summary:"Missing title",recommendedAction:"Prepare title",status:"READY",impact:3,confidence:5,urgency:3,strategicFit:3,planFit:5,effort:1,basePriority:50,finalPriority:50,priorityBand:"Normal",planScope:"INCLUDED"}).returning();opportunityId=opportunity.id;
    });
  });
  afterEach(()=>{serverEnv.APP_ENV=original.env;serverEnv.AGENT_PROVIDER=original.provider;serverEnv.AI_GATEWAY_MODEL=original.model;serverEnv.PERPLEXITY_API_KEY=original.key;vi.restoreAllMocks();});
  afterAll(async()=>{await pool?.end();});
  async function runRow(id:string){return withTenantContext(database,c,async tx=>(await tx.select().from(schema.agentRuns).where(eq(schema.agentRuns.id,id)))[0]);}
  async function paidRun(){serverEnv.AGENT_PROVIDER="ai_gateway";serverEnv.AI_GATEWAY_MODEL="synthetic-paid";return requestPrepareDraftForOpportunity(c,opportunityId,database);}
  async function counts(id:string){return withTenantContext(database,c,async tx=>(await tx.execute(sql`select
    (select count(*)::int from agent_runs where workspace_id=${c.workspaceId}) runs,
    (select count(*)::int from usage_ledger where workspace_id=${c.workspaceId} and agent_run_id=${id}) reservations,
    (select count(*)::int from draft_artifacts where workspace_id=${c.workspaceId} and prepared_by_agent_run_id=${id}) artifacts`)).rows[0]);}
  it("queue commit without any dispatch remains discoverable and recovers the same paid reservation",async()=>{
    const run=await paidRun();
    expect((await listQueuedDispatchRefs(100,database)).some(r=>r.run_id===run.agentRunId&&r.workspace_id===c.workspaceId&&r.kind==="prepare")).toBe(true);
    expect(await recoverInternalRun(c,{kind:"prepare",id:run.agentRunId,mode:"retry",reason:"Dispatch died after commit"},database)).toEqual({kind:"prepare",id:run.agentRunId,shouldStartWorkflow:true});
    expect(await counts(run.agentRunId)).toMatchObject({runs:1,reservations:1,artifacts:0});
  });
  it("failed start retries the same ID after backoff and does not mint another reservation",async()=>{
    const run=await paidRun(),at=new Date(); const launch=vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({runId:"accepted"});
    expect(await dispatchQueuedRun(c,"prepare",run.agentRunId,database,launch,at)).toEqual({status:"PENDING"});
    expect((await runRow(run.agentRunId)).dispatchErrorCode).toBe("WORKFLOW_START_UNCONFIRMED");
    expect(await dispatchQueuedRun(c,"prepare",run.agentRunId,database,launch,new Date(at.getTime()+59_000))).toEqual({status:"SKIPPED"});
    expect(await dispatchQueuedRun(c,"prepare",run.agentRunId,database,launch,new Date(at.getTime()+61_000))).toEqual({status:"STARTED"});
    expect(launch.mock.calls.map(call=>call[0].workflowTargetId)).toEqual([run.agentRunId,run.agentRunId]);
    expect(await counts(run.agentRunId)).toMatchObject({runs:1,reservations:1});
  });
  it("concurrent dispatchers acquire one lease; a stale receipt cannot overwrite a newer lease",async()=>{
    const run=await paidRun(),at=new Date();
    const claims=await Promise.all([claimQueuedDispatch(c,"prepare",run.agentRunId,database,at),claimQueuedDispatch(c,"prepare",run.agentRunId,database,at)]);
    const first=claims.find(Boolean)!;expect(claims.filter(Boolean)).toHaveLength(1);
    // Process crash after start but before receipt persistence: let lease expire.
    const second=await claimQueuedDispatch(c,"prepare",run.agentRunId,database,new Date(at.getTime()+121_000));expect(second).not.toBeNull();
    await settleQueuedDispatch(second!,"new-owner",database,new Date(at.getTime()+121_000));
    await settleQueuedDispatch(first,"late-old-owner",database,new Date(at.getTime()+122_000));
    expect((await runRow(run.agentRunId)).workflowRunId).toBe("new-owner");
  });
  it("a recorded workflow receipt with no worker start remains eligible for redispatch",async()=>{
    const run=await paidRun(),at=new Date(),launch=vi.fn(async()=>({runId:"accepted"}));
    await dispatchQueuedRun(c,"prepare",run.agentRunId,database,launch,at);
    expect(await dispatchQueuedRun(c,"prepare",run.agentRunId,database,launch,new Date(at.getTime()+61_000))).toEqual({status:"STARTED"});
    expect(launch).toHaveBeenCalledTimes(2);expect(await counts(run.agentRunId)).toMatchObject({runs:1,reservations:1});
  });
  it("concurrent paid workers make one provider call and produce one artifact even after delayed redelivery",async()=>{
    const run=await paidRun(); let release!:()=>void,entered!:()=>void;
    const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const generate=vi.fn(async(input:Parameters<PrepareModelProvider["generate"]>[0])=>{entered();await gate;const result=await createDeterministicPrepareProvider().generate(input);return {...result,usage:{...result.usage,gatewayCostUsd:0.01}};});
    const provider={provider:"vercel-ai-gateway",model:"synthetic-paid",generate};
    const first=executePrepareDraftAgentRun(c,run.agentRunId,database,provider); await ready;
    try { expect((await executePrepareDraftAgentRun(c,run.agentRunId,database,provider)).artifact).toBeNull(); }
    finally {release();}
    const finished=await first;expect(finished.artifact).not.toBeNull();
    const duplicate=await executePrepareDraftAgentRun(c,run.agentRunId,database,provider);
    expect(duplicate.artifact!.id).toBe(finished.artifact!.id);expect(generate).toHaveBeenCalledTimes(1);
    expect(await counts(run.agentRunId)).toMatchObject({runs:1,reservations:1,artifacts:1});
  });
  it("a provider exception after durable spend commitment is never called again",async()=>{
    const run=await paidRun(),generate=vi.fn(async()=>{throw new Error("simulated provider response lost");});
    const provider={provider:"vercel-ai-gateway",model:"synthetic-paid",generate};
    await executePrepareDraftAgentRun(c,run.agentRunId,database,provider);
    expect((await runRow(run.agentRunId)).status).toBe("FAILED");
    await executePrepareDraftAgentRun(c,run.agentRunId,database,provider);expect(generate).toHaveBeenCalledTimes(1);
    await expect(recoverInternalRun(c,{kind:"prepare",id:run.agentRunId,mode:"retry",reason:"Unknown paid outcome"},database)).rejects.toMatchObject({code:"MANUAL_REVIEW"});
    expect(await claimQueuedDispatch(c,"prepare",run.agentRunId,database)).toBeNull();
  });
  it("crash after execution claim remains manual review, never a requeued paid call",async()=>{
    const run=await paidRun();await withTenantContext(database,c,tx=>tx.update(schema.agentRuns).set({status:"RUNNING",startedAt:new Date()}).where(eq(schema.agentRuns.id,run.agentRunId)));
    const generate=vi.fn();await executePrepareDraftAgentRun(c,run.agentRunId,database,{provider:"vercel-ai-gateway",model:"synthetic-paid",generate});
    expect(generate).not.toHaveBeenCalled();expect(await claimQueuedDispatch(c,"prepare",run.agentRunId,database)).toBeNull();
    expect(await recoverInternalRun(c,{kind:"prepare",id:run.agentRunId,mode:"review",reason:"Inspect crashed worker"},database)).toEqual({kind:"review"});
  });
  it("late dispatch starts the PREPARE time budget on its first execution claim",async()=>{
    const run=await requestPrepareDraftForOpportunity(c,opportunityId,database);
    await withTenantContext(database,c,tx=>tx.update(schema.agentRuns).set({deadlineAt:new Date(Date.now()-60_000)}).where(eq(schema.agentRuns.id,run.agentRunId)));
    const result=await executePrepareDraftAgentRun(c,run.agentRunId,database);
    expect(result.artifact).not.toBeNull();expect((await runRow(run.agentRunId)).deadlineAt!.getTime()).toBeGreaterThan(Date.now());
  });
  it("pause and tenant RLS block redispatch; resume preserves the original run",async()=>{
    const run=await paidRun();await setAutomationPause(c,{scope:"WORKSPACE",category:"ai",paused:true,reason:"Incident"},database);
    await expect(claimQueuedDispatch(c,"prepare",run.agentRunId,database)).rejects.toMatchObject({code:"PAUSED"});
    expect((await listQueuedDispatchRefs(100,database)).some(r=>r.run_id===run.agentRunId)).toBe(false);
    const other={...c,workspaceId:randomUUID()};
    await withTenantContext(database,other,async tx=>{
      await tx.insert(schema.workspaces).values({id:other.workspaceId,name:"Other isolated tenant",slug:`other-${other.workspaceId}`});
      await tx.insert(schema.workspaceMemberships).values({workspaceId:other.workspaceId,userId:proofUserId,role:"OWNER"});
    });
    expect(await claimQueuedDispatch(other,"prepare",run.agentRunId,database)).toBeNull();
    await expect(recoverInternalRun(other,{kind:"prepare",id:run.agentRunId,mode:"retry",reason:"Cross tenant"},database)).rejects.toThrow("not found");
    await setAutomationPause(c,{scope:"WORKSPACE",category:"ai",paused:false,reason:"Resume"},database);
    expect(await claimQueuedDispatch(c,"prepare",run.agentRunId,database)).toMatchObject({id:run.agentRunId,context:c});
  });
  it("duplicate monitoring deliveries cannot restart a claimed or failed monitor",async()=>{
    const run=await requestManualMonitoringRun(c,websiteId,"website_health",database);
    await setAutomationPause(c,{scope:"WORKSPACE",category:"monitoring",paused:true,reason:"No public HTTP in proof"},database);
    const results=await Promise.all([executeMonitoringRun(c,run.monitoringRunId,database),executeMonitoringRun(c,run.monitoringRunId,database)]);
    expect(results.filter(r=>r.status==="ALREADY_CLAIMED")).toHaveLength(1);
    expect((await executeMonitoringRun(c,run.monitoringRunId,database)).status).toBe("ALREADY_CLAIMED");
    expect(await withTenantContext(database,c,async tx=>(await tx.select().from(schema.auditRuns)).length)).toBe(1); // setup audit only
  });
  it("dispatch restores the original actor, and never elevates an unavailable actor to SYSTEM",async()=>{
    const run=await paidRun();
    await withTenantContext(database,c,tx=>tx.update(schema.workspaceMemberships).set({status:"SUSPENDED"}).where(eq(schema.workspaceMemberships.workspaceId,c.workspaceId)));
    expect(await claimQueuedDispatch({...c,actorType:"SYSTEM",role:"ADMIN"},"prepare",run.agentRunId,database)).toBeNull();
    expect((await runRow(run.agentRunId)).dispatchErrorCode).toBe("ACTOR_UNAVAILABLE");
    expect((await runRow(run.agentRunId)).status).toBe("QUEUED");
  });
  it("verification and QA execution dispatch retain their distinct workflow target IDs",async()=>{
    const executionId=randomUUID();
    const refs=await withTenantContext(database,c,async tx=>{
      const base={workspaceId:c.workspaceId,triggerType:"USER" as const,agentVersion:"test",status:"QUEUED" as const,timeoutSeconds:60,provider:"deterministic",model:"test",promptTemplateVersion:"test",outputSchemaVersion:"test",createdByUserId:c.userId};
      return tx.insert(schema.agentRuns).values([
        {...base,agentKey:"verification",permissionLevel:"OBSERVE",inputSummary:{implementationRecordId:randomUUID()},idempotencyKey:randomUUID()},
        {...base,agentKey:"qa-metadata-execution",permissionLevel:"EXECUTE",inputSummary:{executionRecordId:executionId},idempotencyKey:randomUUID()},
      ]).returning();
    });
    expect(await claimQueuedDispatch(c,"prepare",refs[0].id,database)).toBeNull();
    expect(await claimQueuedDispatch(c,"verification",refs[0].id,database)).toMatchObject({workflowTargetId:refs[0].id,context:c});
    expect(await claimQueuedDispatch(c,"qa_execute",refs[1].id,database)).toMatchObject({workflowTargetId:executionId,context:c});
  });
  it("queued recovery rejects spend evidence and provider drift cannot turn deterministic work into a paid call",async()=>{
    const run=await requestPrepareDraftForOpportunity(c,opportunityId,database);
    const generate=vi.fn();
    await executePrepareDraftAgentRun(c,run.agentRunId,database,{provider:"vercel-ai-gateway",model:"changed",generate});
    expect(generate).not.toHaveBeenCalled();expect((await runRow(run.agentRunId)).errorSummary).toContain("configuration changed");
    // A malformed queued row with a committed reservation must also fail closed.
    const other=await withTenantContext(database,c,async tx=>{
      const [r]=await tx.insert(schema.agentRuns).values({workspaceId:c.workspaceId,triggerType:"USER",agentKey:"existing-page-optimization",agentVersion:"test",permissionLevel:"PREPARE",status:"QUEUED",timeoutSeconds:60,provider:"vercel-ai-gateway",model:"test",promptTemplateVersion:"test",outputSchemaVersion:"test",idempotencyKey:randomUUID(),createdByUserId:c.userId}).returning();
      await tx.insert(schema.usageLedger).values({workspaceId:c.workspaceId,agentRunId:r.id,sourceKey:`agent:${r.id}`,provider:r.provider,category:"PREPARE",outcome:"QUEUED",occurredAt:new Date(),measurementWindow:new Date().toISOString().slice(0,7),sourceVersion:"test",metadata:{attemptCommitted:true}});
      return r;
    });
    await expect(recoverInternalRun(c,{kind:"prepare",id:other.id,mode:"retry",reason:"Unsafe queued marker"},database)).rejects.toMatchObject({code:"MANUAL_REVIEW"});
    expect(await claimQueuedDispatch(c,"prepare",other.id,database)).toBeNull();
    expect((await listQueuedDispatchRefs(100,database)).some(r=>r.run_id===other.id)).toBe(false);
  });
  it("visibility recovers an indeterminate reservation without another paid call",async()=>{
    for(const [factType,value] of [["business_name","Cedar Plumbing"],["canonical_domain","cedar.example"],["service","plumbing"],["location","Denver"]])await createBusinessFact(c,clientId,{factType,value,sourceReference:"Synthetic human-reviewed fixture",verificationStatus:"VERIFIED",sensitivity:"PUBLIC"},database);
    await createVisibilityPromptSet(c,websiteId,database);const run=await requestVisibilityRun(c,websiteId,"API",database);
    const ids=await visibilityRunPromptIds(c,run.id,database);
    const observe=vi.fn(async()=>{throw new Error("response lost after provider request");});
    const provider:VisibilityProvider={surface:"Perplexity Agent API",version:"perplexity-agent-v1.0",model:"synthetic",observe};
    await expect(observeVisibilityPrompt(c,run.id,ids[0],database,provider)).rejects.toThrow("response lost");
    await observeVisibilityPrompt(c,run.id,ids[0],database,provider);expect(observe).toHaveBeenCalledTimes(1);
    const now=Date.now();vi.spyOn(Date,"now").mockReturnValue(now+121_000);
    await observeVisibilityPrompt(c,run.id,ids[0],database,provider);expect(observe).toHaveBeenCalledTimes(1);
    const observations=await withTenantContext(database,c,tx=>tx.select().from(schema.aiVisibilityObservations).where(eq(schema.aiVisibilityObservations.runId,run.id)));
    expect(observations).toHaveLength(1);expect(observations[0].limitations).toContain("INDETERMINATE_PROVIDER_ATTEMPT_NOT_RETRIED");
  });
  it("bootstrap has restricted execute, fixed search path and ID-only output",async()=>{
    const fn=(await pool.query("select prosecdef,proconfig,pg_get_function_result(oid) result,proacl::text acl from pg_proc where proname='list_queued_dispatch_refs'")).rows[0];
    expect(fn.prosecdef).toBe(true);expect(fn.proconfig).toContain("search_path=pg_catalog, public");
    expect(fn.result).toBe("TABLE(workspace_id uuid, run_id uuid, kind text)");expect(fn.acl).not.toMatch(/[{,]=X/);
    expect(await listQueuedDispatchRefs(0,database)).toEqual([]);expect((await listQueuedDispatchRefs(1,database)).length).toBeLessThanOrEqual(1);
  });
});
