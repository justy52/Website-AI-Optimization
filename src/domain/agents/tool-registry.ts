import { z } from "zod";

import { AuthorizationError } from "@/domain/tenancy/context";

import type { AgentDefinition } from "./catalog";
import {
  assertAgentPermission,
  assertNoExternalExecuteTool,
  type AgentPermissionLevel,
} from "./permissions";

export type AgentToolDefinition = {
  key: string;
  version: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  requiredPermission: AgentPermissionLevel;
  resourceScope: string;
  timeoutMs: number;
  costBehavior: "free" | "bounded_model" | "bounded_storage";
  readsUntrustedExternalContent: boolean;
};

const idInput = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
});

const summaryOutput = z.object({
  ok: z.boolean(),
  summary: z.record(z.string(), z.unknown()),
});

export const agentToolRegistry: AgentToolDefinition[] = [
  {
    key: "read.opportunity.v1",
    version: "1.0",
    description: "Read a single workspace-scoped Opportunity.",
    inputSchema: idInput,
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "workspace/opportunity",
    timeoutMs: 2_000,
    costBehavior: "free",
    readsUntrustedExternalContent: false,
  },
  {
    key: "read.audit_results.v1",
    version: "1.0",
    description: "Read finalized or completed audit result summaries.",
    inputSchema: idInput,
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "workspace/audit",
    timeoutMs: 2_000,
    costBehavior: "free",
    readsUntrustedExternalContent: false,
  },
  {
    key: "read.captured_evidence.v1",
    version: "1.0",
    description: "Read bounded captured audit evidence as untrusted data.",
    inputSchema: idInput,
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "workspace/audit-evidence",
    timeoutMs: 2_000,
    costBehavior: "free",
    readsUntrustedExternalContent: true,
  },
  {
    key: "read.client_site_context.v1",
    version: "1.0",
    description: "Read client and website context for the active workspace.",
    inputSchema: idInput,
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "workspace/client/website",
    timeoutMs: 2_000,
    costBehavior: "free",
    readsUntrustedExternalContent: false,
  },
  {
    key: "read.service_plan_definition.v1",
    version: "1.0",
    description: "Read deterministic service-plan definitions.",
    inputSchema: z.object({ plan: z.string(), version: z.string() }),
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "global/versioned-definition",
    timeoutMs: 1_000,
    costBehavior: "free",
    readsUntrustedExternalContent: false,
  },
  {
    key: "read.business_facts.v1",
    version: "1.0",
    description: "Read approved business facts for a client/site scope.",
    inputSchema: idInput,
    outputSchema: summaryOutput,
    requiredPermission: "OBSERVE",
    resourceScope: "workspace/business-facts",
    timeoutMs: 2_000,
    costBehavior: "free",
    readsUntrustedExternalContent: false,
  },
  {
    key: "create.draft_artifact.v1",
    version: "1.0",
    description: "Create an internal PREPARE draft artifact only.",
    inputSchema: z.object({
      workspaceId: z.string().uuid(),
      opportunityId: z.string().uuid(),
      artifactType: z.string(),
    }),
    outputSchema: summaryOutput,
    requiredPermission: "PREPARE",
    resourceScope: "workspace/draft-artifact",
    timeoutMs: 3_000,
    costBehavior: "bounded_storage",
    readsUntrustedExternalContent: false,
  },
  {
    key: "create.approval_request.v1",
    version: "1.0",
    description: "Create a pending human review request for an artifact version.",
    inputSchema: z.object({
      workspaceId: z.string().uuid(),
      artifactId: z.string().uuid(),
      artifactVersion: z.number().int().positive(),
    }),
    outputSchema: summaryOutput,
    requiredPermission: "PREPARE",
    resourceScope: "workspace/approval-request",
    timeoutMs: 3_000,
    costBehavior: "bounded_storage",
    readsUntrustedExternalContent: false,
  },
];

const registryByKey = new Map(
  agentToolRegistry.map((tool) => [tool.key, tool] as const),
);

export function getAgentToolDefinition(key: string): AgentToolDefinition {
  const tool = registryByKey.get(key);

  if (!tool) {
    throw new AuthorizationError(`Tool ${key} is not registered.`);
  }

  return tool;
}

export function getAllowedToolDefinitions(
  agent: Pick<AgentDefinition, "allowedToolKeys" | "defaultPermissionLevel">,
): AgentToolDefinition[] {
  return agent.allowedToolKeys.map((toolKey) => {
    assertNoExternalExecuteTool(toolKey);
    const tool = getAgentToolDefinition(toolKey);
    assertAgentPermission(agent.defaultPermissionLevel, tool.requiredPermission);
    return tool;
  });
}

export function assertToolAllowedForAgent(
  agent: Pick<AgentDefinition, "key" | "allowedToolKeys" | "defaultPermissionLevel">,
  toolKey: string,
): AgentToolDefinition {
  assertNoExternalExecuteTool(toolKey);

  if (!agent.allowedToolKeys.includes(toolKey)) {
    throw new AuthorizationError(
      `Agent ${agent.key} is not allowed to use tool ${toolKey}.`,
    );
  }

  const tool = getAgentToolDefinition(toolKey);
  assertAgentPermission(agent.defaultPermissionLevel, tool.requiredPermission);
  return tool;
}
