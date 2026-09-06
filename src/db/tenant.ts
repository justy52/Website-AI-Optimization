import { sql, type SQL } from "drizzle-orm";

import {
  assertWorkspaceContext,
  type WorkspaceContext,
} from "@/domain/tenancy/context";

export type TenantQueryExecutor = {
  execute(query: SQL): Promise<unknown>;
};

export type TenantTransactionCapable<
  TExecutor extends TenantQueryExecutor = TenantQueryExecutor,
> = {
  transaction<T>(
    operation: (tx: TExecutor) => Promise<T>,
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

export async function setAuthenticatedUserBootstrapContext(
  executor: TenantQueryExecutor,
  userId: string,
): Promise<void> {
  if (!userId) {
    throw new Error("An authenticated user id is required for membership bootstrap.");
  }

  await executor.execute(sql`
    select set_config('app.user_id', ${userId}, true)
  `);
}

export async function withAuthenticatedUserBootstrapContext<
  T,
  TExecutor extends TenantQueryExecutor,
>(
  database: TenantTransactionCapable<TExecutor>,
  userId: string,
  operation: (tx: TExecutor) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await setAuthenticatedUserBootstrapContext(tx, userId);
    return operation(tx);
  });
}

export async function withTenantContext<
  T,
  TExecutor extends TenantQueryExecutor,
>(
  database: TenantTransactionCapable<TExecutor>,
  context: WorkspaceContext,
  operation: (tx: TExecutor) => Promise<T>,
): Promise<T> {
  assertWorkspaceContext(context);

  return database.transaction(async (tx) => {
    await setTenantSessionContext(tx, context);
    return operation(tx);
  });
}
