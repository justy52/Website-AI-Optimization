import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  workspaceFeatureFlags,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import {
  withAuthenticatedUserBootstrapContext,
  withTenantContext,
} from "@/db/tenant";
import type { WorkspaceContext, WorkspaceRole } from "@/domain/tenancy/context";
import type { WorkspaceMembershipRecord } from "@/domain/tenancy/membership";
import { serverEnv } from "@/lib/env";

export type ActiveWorkspaceMembership = WorkspaceMembershipRecord & {
  workspaceName: string;
  workspaceSlug: string;
};

function slugifyWorkspaceName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${base || "workspace"}-${randomUUID().slice(0, 8)}`;
}

export async function listActiveWorkspaceMembershipsForUser(
  userId: string,
  database = db,
): Promise<ActiveWorkspaceMembership[]> {
  return withAuthenticatedUserBootstrapContext(database, userId, async (tx) => {
    const rows = await tx
      .select({
        workspaceId: workspaceMemberships.workspaceId,
        userId: workspaceMemberships.userId,
        role: workspaceMemberships.role,
        status: workspaceMemberships.status,
        workspaceName: workspaces.name,
        workspaceSlug: workspaces.slug,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, "ACTIVE"),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletionPendingAt),
        ),
      )
      .orderBy(asc(workspaces.name), asc(workspaceMemberships.workspaceId));

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: row.role as WorkspaceRole,
      status: row.status,
      workspaceName: row.workspaceName,
      workspaceSlug: row.workspaceSlug,
    }));
  });
}

export async function createWorkspaceForAuthenticatedUser(
  input: {
    userId: string;
    name: string;
    correlationId?: string;
  },
  database = db,
) {
  const workspaceId = randomUUID();
  const workspaceName = input.name.trim();

  if (!workspaceName) {
    throw new Error("Workspace name is required.");
  }

  const context: WorkspaceContext = {
    workspaceId,
    actorType: "USER",
    role: "OWNER",
    userId: input.userId,
    correlationId: input.correlationId,
  };

  return withTenantContext(database, context, async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: workspaceName,
        slug: slugifyWorkspaceName(workspaceName),
      })
      .returning({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
      });

    await tx.insert(workspaceMemberships).values({
      workspaceId,
      userId: input.userId,
      role: "OWNER",
      status: "ACTIVE",
    });

    await tx.insert(workspaceFeatureFlags).values({
      workspaceId,
      key: "external_execute_enabled",
      environment: serverEnv.APP_ENV,
      enabled: false,
      metadata: {
        phase: "phase-1",
        reason: "EXECUTE remains deny-by-default until a later phase.",
      },
    });

    await tx.insert(activityEvents).values({
      workspaceId,
      actorType: "USER",
      actorUserId: input.userId,
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspaceId,
      summary: { name: workspaceName },
      correlationId: input.correlationId,
    });

    return workspace;
  });
}
