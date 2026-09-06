import { sql, type SQL } from "drizzle-orm";

import {
  assertWorkspaceContext,
  type WorkspaceContext,
} from "@/domain/tenancy/context";

export type TenantQueryExecutor = {
  execute(query: SQL): Promise<unknown>;
};

export type TenantTransactionCapable = {
  transaction<T>(
    operation: (tx: TenantQueryExecutor) => Promise<T>,
  ): Promise<T>;
};

export async function setTenantSessionContext(
  executor: TenantQueryExecutor,
  context: WorkspaceContext,
): Promise<void> {
  assertWorkspaceContext(context);

  await executor.execute(sql`
    select
      set_config('app.workspace_id', ${context.workspaceId}, true),
      set_config('app.actor_type', ${context.actorType}, true),
      set_config('app.workspace_role', ${context.role}, true),
      set_config('app.user_id', ${context.userId ?? ""}, true),
      set_config('app.agent_run_id', ${context.agentRunId ?? ""}, true),
      set_config('app.correlation_id', ${context.correlationId ?? ""}, true)
  `);
}

export async function withTenantContext<T>(
  database: TenantTransactionCapable,
  context: WorkspaceContext,
  operation: (tx: TenantQueryExecutor) => Promise<T>,
): Promise<T> {
  assertWorkspaceContext(context);

  return database.transaction(async (tx) => {
    await setTenantSessionContext(tx, context);
    return operation(tx);
  });
}
