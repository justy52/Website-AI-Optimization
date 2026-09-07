import { AuthorizationError } from "@/domain/tenancy/context";

export const agentPermissionLevels = ["OBSERVE", "PREPARE", "EXECUTE"] as const;

export type AgentPermissionLevel = (typeof agentPermissionLevels)[number];

export const EXTERNAL_EXECUTE_ENABLED = false;

const permissionRank: Record<AgentPermissionLevel, number> = {
  OBSERVE: 1,
  PREPARE: 2,
  EXECUTE: 3,
};

export function assertKnownPermissionLevel(
  level: string,
): asserts level is AgentPermissionLevel {
  if (!agentPermissionLevels.includes(level as AgentPermissionLevel)) {
    throw new AuthorizationError(`Unknown agent permission level: ${level}`);
  }
}

export function canUsePermission(
  granted: AgentPermissionLevel,
  required: AgentPermissionLevel,
): boolean {
  if (required === "EXECUTE" && !EXTERNAL_EXECUTE_ENABLED) {
    return false;
  }

  return permissionRank[granted] >= permissionRank[required];
}

export function assertAgentPermission(
  granted: AgentPermissionLevel,
  required: AgentPermissionLevel,
): void {
  if (!canUsePermission(granted, required)) {
    throw new AuthorizationError(
      `Agent permission ${granted} cannot use ${required} capability.`,
    );
  }
}

export function assertNoExternalExecuteTool(toolKey: string): void {
  if (toolKey.toLowerCase().includes("execute")) {
    throw new AuthorizationError("External EXECUTE tools are disabled in Phase 3.");
  }
}
