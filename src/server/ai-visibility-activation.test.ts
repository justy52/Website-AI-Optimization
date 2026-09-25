import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { serverEnv } from "@/lib/env";
import { VisibilityValidationError } from "@/domain/ai-visibility/model";
import { listVisibilityScheduleRefs, prepareScheduledVisibility, requestVisibilityRun } from "./ai-visibility";

const context = { workspaceId: "00000000-0000-4000-8000-000000000001", userId: "test-user", actorType: "USER", role: "OWNER" } as const;
const originalKey = serverEnv.PERPLEXITY_API_KEY;
afterEach(() => { serverEnv.PERPLEXITY_API_KEY = originalKey; vi.restoreAllMocks(); });

describe("provider activation before cadence reservation", () => {
  it("rejects an absent credential with normal validation before touching the database", async () => {
    serverEnv.PERPLEXITY_API_KEY = undefined;
    const transaction = vi.fn();
    const database = { transaction } as unknown as Db;
    await expect(requestVisibilityRun(context, context.workspaceId, "API", database)).rejects.toBeInstanceOf(VisibilityValidationError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("unconfigured scheduling returns no work, including already enumerated sites", async () => {
    serverEnv.PERPLEXITY_API_KEY = undefined;
    await expect(listVisibilityScheduleRefs()).resolves.toEqual([]);
    await expect(prepareScheduledVisibility(context.workspaceId, context.workspaceId)).resolves.toBeNull();
  });
});
