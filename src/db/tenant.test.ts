import { describe, expect, it, vi } from "vitest";

import type { WorkspaceContext } from "@/domain/tenancy/context";

import {
  setAuthenticatedUserBootstrapContext,
  setTenantSessionContext,
  withAuthenticatedUserBootstrapContext,
  withTenantContext,
  type TenantQueryExecutor,
  type TenantTransactionCapable,
} from "./tenant";

const context: WorkspaceContext = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorType: "USER",
  role: "OWNER",
  userId: "user-1",
  correlationId: "request-1",
};

describe("tenant database context", () => {
  it("sets only authenticated user context for membership bootstrap", async () => {
    const executor: TenantQueryExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await setAuthenticatedUserBootstrapContext(executor, "user-1");

    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects membership bootstrap without an authenticated user", async () => {
    const executor: TenantQueryExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      setAuthenticatedUserBootstrapContext(executor, ""),
    ).rejects.toThrow("An authenticated user id is required");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("runs membership bootstrap work after authenticated user context is set", async () => {
    const order: string[] = [];
    const tx: TenantQueryExecutor = {
      execute: vi.fn(async () => {
        order.push("user-context");
      }),
    };
    const database: TenantTransactionCapable = {
      transaction: async <T>(
        operation: (tx: TenantQueryExecutor) => Promise<T>,
      ) => {
        order.push("transaction");
        return operation(tx);
      },
    };

    const result = await withAuthenticatedUserBootstrapContext(
      database,
      "user-1",
      async () => {
        order.push("operation");
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(order).toEqual(["transaction", "user-context", "operation"]);
  });

  it("sets transaction-scoped tenant variables before database work", async () => {
    const executor: TenantQueryExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await setTenantSessionContext(executor, context);

    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it("runs operations only after tenant context has been established", async () => {
    const order: string[] = [];
    const tx: TenantQueryExecutor = {
      execute: vi.fn(async () => {
        order.push("tenant-context");
      }),
    };

    let transactionCalls = 0;
    const database: TenantTransactionCapable = {
      transaction: async <T>(
        operation: (tx: TenantQueryExecutor) => Promise<T>,
      ) => {
        transactionCalls += 1;
        order.push("transaction");
        return operation(tx);
      },
    };

    const result = await withTenantContext(database, context, async () => {
      order.push("operation");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(transactionCalls).toBe(1);
    expect(order).toEqual(["transaction", "tenant-context", "operation"]);
  });

  it("rejects database access without server-derived workspace context", async () => {
    const executor: TenantQueryExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      setTenantSessionContext(executor, null as unknown as WorkspaceContext),
    ).rejects.toThrow("A server-derived workspace context is required.");
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
