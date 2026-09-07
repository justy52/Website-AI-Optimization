import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/domain/tenancy/context";

import {
  EXISTING_PAGE_OPTIMIZATION_AGENT_KEY,
  getEnabledAgentDefinition,
} from "./catalog";
import {
  assertToolAllowedForAgent,
  getAllowedToolDefinitions,
  getAgentToolDefinition,
} from "./tool-registry";

describe("agent tool registry", () => {
  it("exposes only registered server-side tools to the enabled PREPARE agent", () => {
    const agent = getEnabledAgentDefinition(EXISTING_PAGE_OPTIMIZATION_AGENT_KEY);
    const tools = getAllowedToolDefinitions(agent);

    expect(tools.map((tool) => tool.key)).toEqual(agent.allowedToolKeys);
    expect(tools.some((tool) => tool.key.includes("execute"))).toBe(false);
    expect(tools.some((tool) => tool.key === "create.draft_artifact.v1")).toBe(
      true,
    );
    expect(tools.some((tool) => tool.key === "create.approval_request.v1")).toBe(
      true,
    );
  });

  it("rejects unregistered tool names even when a prompt asks for them", () => {
    const agent = getEnabledAgentDefinition(EXISTING_PAGE_OPTIMIZATION_AGENT_KEY);

    expect(() => getAgentToolDefinition("shell.run.v1")).toThrow(
      AuthorizationError,
    );
    expect(() => assertToolAllowedForAgent(agent, "email.send.v1")).toThrow(
      AuthorizationError,
    );
    expect(() =>
      assertToolAllowedForAgent(agent, "client_site.execute_publish.v1"),
    ).toThrow(AuthorizationError);
  });
});
