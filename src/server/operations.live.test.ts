import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { serverEnv } from "@/lib/env";
import { RATE_LIMITS } from "@/domain/operations/policy";
import { assertOperationalAdmission, checkMaterialStep, enforceActionRateLimit, setAutomationPause, setWorkspaceBudgets, filterUnpausedWorkspaceRefs } from "./operations";
import { cleanupWorkspace } from "./retention";
import { exportWorkspace, redactExport } from "./workspace-export";
import { getOperationsPanel } from "./operations-dashboard";
import { createBusinessFact } from "./agents";
import { createRetentionQaFixture, createVisibilityPromptSet, getVisibilityPanel, observeVisibilityPrompt, recordManualVisibilityObservation, requestVisibilityRun, visibilityRunPromptIds } from "./ai-visibility";
import { createScheduledMonthlyCycle } from "./monthly-cycles";
import { syncUsageLedger } from "./usage-ledger";
const connectionString = process.env.OPTIQ_TEST_RUNNER_URL;
const workspaceId = randomUUID(), otherWorkspace = "00000000-0000-4000-8000-0000000000a1";
const c: WorkspaceContext = {workspaceId,actorType:"USER",role:"OWNER",userId:"rls-user-b"};
describe.skipIf(!connectionString)("Phase 10 live operational controls / non-bypass RLS",()=>{
  let pool:Pool,client:PoolClient,database:Db,clientId:string,websiteId:string;
  const original={key:serverEnv.PERPLEXITY_API_KEY,env:serverEnv.APP_ENV,operators:serverEnv.PLATFORM_OPERATOR_USER_IDS};
  beforeAll(async()=>{
    const url=new URL(connectionString!); if(url.pathname!=="/optiq_phase5_review_final_20260922"||!url.hostname.startsWith("ep-shy-firefly-arkuloja"))throw new Error("Disposable database only");
    pool=new Pool({connectionString});client=await pool.connect();
    expect((await client.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
    const pinned=drizzle({client,schema}); database={...pinned,select:pinned.select.bind(pinned),execute:pinned.execute.bind(pinned),transaction:async(operation:(tx:typeof pinned)=>Promise<unknown>)=>operation(pinned)} as unknown as Db;
  });
  beforeEach(async()=>{
    serverEnv.APP_ENV="qa";serverEnv.PERPLEXITY_API_KEY="synthetic-test-key-no-network";serverEnv.PLATFORM_OPERATOR_USER_IDS="rls-user-b";
    await client.query("begin");await client.query("select set_config('app.workspace_id',$1,true),set_config('app.user_id','rls-user-b',true)",[workspaceId]);
    await client.query("insert into workspaces(id,name,slug) values($1,'Phase10 disposable',$2)",[workspaceId,`phase10-${workspaceId}`]);
    await client.query("insert into workspace_memberships(workspace_id,user_id,role) values($1,'rls-user-b','OWNER')",[workspaceId]);
    clientId=(await client.query("insert into clients(workspace_id,name,service_plan) values($1,'Pilot fixture','GROWTH') returning id",[workspaceId])).rows[0].id;
    websiteId=(await client.query("insert into websites(workspace_id,client_id,display_name,domain,canonical_url) values($1,$2,'Pilot fixture','cedar.example','https://cedar.example') returning id",[workspaceId,clientId])).rows[0].id;
  });
  afterEach(async()=>{await client.query("rollback");serverEnv.APP_ENV=original.env;serverEnv.PERPLEXITY_API_KEY=original.key;serverEnv.PLATFORM_OPERATOR_USER_IDS=original.operators;vi.restoreAllMocks();});
  afterAll(async()=>{client?.release();await pool?.end();});
  async function facts(){for(const [factType,value]of [["business_name","Cedar Plumbing"],["canonical_domain","cedar.example"],["service","plumbing"],["location","Denver"]])await createBusinessFact(c,clientId,{factType,value,sourceReference:"Reviewed test fixture",verificationStatus:"VERIFIED",sensitivity:"PUBLIC"},database);await createVisibilityPromptSet(c,websiteId,database);}
  async function budget(cost="100",active=5){await setWorkspaceBudgets(c,{monthlyCostUsd:cost,activeWorkflowLimit:active,aiCallLimit:100,visibilityCallLimit:100,crawlConcurrency:2},"Disposable test",database);}
  it.each(Object.entries(RATE_LIMITS))("%s limits are actor/workspace/action scoped and reset deterministically",async(action,limit)=>{
    const at=new Date("2026-09-25T10:00:30Z");
    for(let n=0;n<limit;n++)await enforceActionRateLimit(c,action as keyof typeof RATE_LIMITS,database,at);
    await expect(enforceActionRateLimit(c,action as keyof typeof RATE_LIMITS,database,at)).rejects.toMatchObject({code:"RATE_LIMIT"});
    await enforceActionRateLimit(c,action as keyof typeof RATE_LIMITS,database,new Date("2026-09-25T10:01:00Z"));
    await enforceActionRateLimit({...c,userId:"rls-user-a"},action as keyof typeof RATE_LIMITS,database,at);
    expect((await client.query("select count(*)::int n from agent_runs where workspace_id=$1",[workspaceId])).rows[0].n).toBe(0);
  });
  it.each(["PLATFORM","WORKSPACE"] as const)("%s pause blocks scheduled creation and resume restores eligibility",async scope=>{
    await setAutomationPause(c,{scope,category:"all",paused:true,reason:"Exercise pause"},database);
    await expect(createScheduledMonthlyCycle(workspaceId,clientId,{year:2026,month:9},database)).rejects.toMatchObject({code:"PAUSED"});
    await expect(checkMaterialStep(c,"prepare",database)).rejects.toMatchObject({code:"PAUSED"});
    expect((await exportWorkspace(c,workspaceId,database)).counts.clients).toBe(1);
    await setAutomationPause(c,{scope,category:"all",paused:false,reason:"Exercise resume"},database);
    await checkMaterialStep(c,"prepare",database);
  });
  it("workspace schedule filter excludes paused work and resumes eligible refs",async()=>{
    const refs=[{workspace_id:workspaceId}];await setAutomationPause(c,{scope:"WORKSPACE",category:"all",paused:true,reason:"Dispatch test"},database);
    expect(await filterUnpausedWorkspaceRefs(refs,"monitor",database)).toEqual([]);
    expect(await filterUnpausedWorkspaceRefs(refs,"visibility",database)).toEqual([]);
    expect(await filterUnpausedWorkspaceRefs(refs,"monthly_cycle",database)).toEqual([]);
    await setAutomationPause(c,{scope:"WORKSPACE",category:"all",paused:false,reason:"Resume dispatch"},database);
    expect(await filterUnpausedWorkspaceRefs(refs,"monitor",database)).toEqual(refs);
  });
  it("QA retention exercise creates bounded expired/current samples and rejects production",async()=>{
    await facts();await createRetentionQaFixture(c,websiteId,database);
    expect((await cleanupWorkspace(c,false,database)).deletedCount).toBe(1);
    expect((await client.query("select count(*)::int n from ai_visibility_captures where workspace_id=$1",[workspaceId])).rows[0].n).toBe(1);
    expect((await client.query("select count(*)::int n from ai_visibility_observations where workspace_id=$1",[workspaceId])).rows[0].n).toBe(2);
    serverEnv.APP_ENV="production";await expect(createRetentionQaFixture(c,websiteId,database)).rejects.toThrow("QA-only");
  });
  it("budget denial precedes visibility run/call insertion and preserves same window",async()=>{
    await facts();await expect(requestVisibilityRun(c,websiteId,"API",database)).rejects.toMatchObject({code:"BUDGET"});
    for(const table of ["ai_visibility_runs","ai_visibility_calls","ai_visibility_observations"])expect((await client.query(`select count(*)::int n from ${table} where workspace_id=$1`,[workspaceId])).rows[0].n).toBe(0);
    await budget();const run=await requestVisibilityRun(c,websiteId,"API",database);expect(run.status).toBe("QUEUED");
    expect((await requestVisibilityRun(c,websiteId,"API",database)).id).toBe(run.id);
  });
  it("queued visibility fails closed after a pause without a provider call",async()=>{
    await facts();await budget();const run=await requestVisibilityRun(c,websiteId,"API",database);const ids=await visibilityRunPromptIds(c,run.id,database);
    await setAutomationPause(c,{scope:"WORKSPACE",category:"ai",paused:true,reason:"Stop before external step"},database);
    const observe=vi.fn();await observeVisibilityPrompt(c,run.id,ids[0],database,{surface:"Perplexity Agent API",version:"perplexity-agent-v1.0",model:"fixture",observe});expect(observe).not.toHaveBeenCalled();
    expect((await client.query("select status,limitations from ai_visibility_observations where run_id=$1",[run.id])).rows[0]).toMatchObject({status:"UNAVAILABLE",limitations:expect.arrayContaining(["WORKSPACE_AUTOMATION_BLOCKED"])});
  });
  it("PREPARE pause denial consumes no run or entitlement",async()=>{
    await setAutomationPause(c,{scope:"WORKSPACE",category:"ai",paused:true,reason:"Stop PREPARE"},database);
    await expect(withTenantContext(database,c,tx=>assertOperationalAdmission(tx,c,"prepare",{workflow:true,aiCalls:1,costUsd:1}))).rejects.toMatchObject({code:"PAUSED"});
    expect((await client.query("select count(*)::int n from usage_ledger where workspace_id=$1",[workspaceId])).rows[0].n).toBe(0);
  });
  it("export excludes credential tables, redacts nested credential keys and validates counts",async()=>{
    const out=await exportWorkspace(c,workspaceId,database);expect(out.workspace).toMatchObject({id:workspaceId});
    for(const [key,rows]of Object.entries(out.data as Record<string,unknown[]>))expect(out.counts[key as keyof typeof out.counts]).toBe(rows.length);
    expect(JSON.stringify(out)).not.toMatch(/integration_secrets|refresh_token|access_token|ciphertext|auth_rate_limits/);
    expect(redactExport({safe:1,nested:{access_token:"synthetic",ciphertext:"synthetic",inputTokens:3}})).toEqual({safe:1,nested:{inputTokens:3}});
    await expect(exportWorkspace(c,otherWorkspace,database)).rejects.toThrow("current workspace");
    await expect(exportWorkspace({...c,role:"ADMIN"},workspaceId,database)).rejects.toThrow("not allowed");
  });
  it("retention removes only expired captures, keeps normalized and immutable history, retry safe",async()=>{
    await facts();await budget();const run=await requestVisibilityRun(c,websiteId,"API",database);const ids=await visibilityRunPromptIds(c,run.id,database);serverEnv.PERPLEXITY_API_KEY=undefined;
    await observeVisibilityPrompt(c,run.id,ids[0],database);
    const observation=(await client.query("select id from ai_visibility_observations where run_id=$1",[run.id])).rows[0].id;
    await client.query("insert into ai_visibility_captures(workspace_id,observation_id,answer,provider_data,created_at,expires_at) values($1,$2,'Expired synthetic capture','{}',now()-interval '91 days',now()-interval '1 day')",[workspaceId,observation]);
    await recordManualVisibilityObservation(c,websiteId,{promptId:ids[1],surface:"Synthetic retention fixture",answer:"Current synthetic capture",observedAt:"2026-09-01T00:00:00Z",limitations:"Test only"},database);
    const before=(await exportWorkspace(c,workspaceId,database)).counts;
    expect((await cleanupWorkspace(c,true,database)).eligibleCount).toBe(1);
    expect((await cleanupWorkspace(c,false,database)).deletedCount).toBe(1);
    expect((await cleanupWorkspace(c,false,database)).deletedCount).toBe(0);
    expect((await client.query("select count(*)::int n from ai_visibility_captures where workspace_id=$1",[workspaceId])).rows[0].n).toBe(1);
    expect((await exportWorkspace(c,workspaceId,database)).counts).toEqual(before);
    expect((await getVisibilityPanel(c,websiteId,database)).observations).toHaveLength(2);
  });
  it("ledger reconciles deterministic usage as zero and dashboard is readable",async()=>{
    await facts();const panel=await getVisibilityPanel(c,websiteId,database);
    await recordManualVisibilityObservation(c,websiteId,{promptId:panel.prompts[0].id,surface:"Fixture",answer:"Synthetic",observedAt:"2026-09-01T00:00:00Z",limitations:"Test only"},database);
    await withTenantContext(database,c,tx=>syncUsageLedger(tx,c));
    const row=(await client.query("select * from usage_ledger where workspace_id=$1",[workspaceId])).rows[0];expect(row.actual_cost_usd).toBe("0.000000");expect(row.calls).toBe(0);
    expect((await getOperationsPanel(c,database)).readiness.productionExecute).toBe(false);
    await client.query("select set_config('app.workspace_id',$1,true)",[otherWorkspace]);expect((await client.query("select id from usage_ledger where id=$1",[row.id])).rowCount).toBe(0);
  });
  it.each(["workspace_operations","usage_ledger","operation_rate_limits","retention_cleanup_runs"])("%s forces tenant RLS",async table=>{
    expect((await client.query("select relrowsecurity,relforcerowsecurity from pg_class where relname=$1",[table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
    await budget();await client.query("select set_config('app.workspace_id',$1,true)",[otherWorkspace]);expect((await client.query(`select * from ${table} where workspace_id=$1`,[workspaceId])).rowCount).toBe(0);
  });
});
