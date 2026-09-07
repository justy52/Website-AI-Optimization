import { describe, expect, it } from "vitest";

import { activityEvents, opportunities } from "@/db/schema";
import type { WorkspaceContext } from "@/domain/tenancy/context";

import { generateOpportunitiesForAuditRun } from "./opportunities";

describe("generateOpportunitiesForAuditRun", () => {
  it("refreshes an existing open Opportunity for CRITICAL dedupe without creating a duplicate", async () => {
    const workspaceId = "00000000-0000-4000-8000-000000000001";
    const sourceAuditId = "00000000-0000-4000-8000-000000000010";
    const sourceAuditRunId = "00000000-0000-4000-8000-000000000011";
    const sourceFindingId = "00000000-0000-4000-8000-000000000012";
    const sourceCheckResultId = "00000000-0000-4000-8000-000000000013";
    const existingOpportunityId = "00000000-0000-4000-8000-000000000020";
    const context: WorkspaceContext = {
      workspaceId,
      actorType: "USER",
      role: "ANALYST",
      userId: "user-a",
      correlationId: "test-correlation",
    };
    const selectResults = [
      [
        {
          id: "client-a",
          servicePlan: "GROWTH",
          servicePlanVersion: "service-plans-v1.0",
        },
      ],
      [
        {
          id: sourceCheckResultId,
          auditId: sourceAuditId,
          auditRunId: sourceAuditRunId,
          checkKey: "perf.https",
          checkVersion: "perf.https@dv-score-v1.0",
          category: "websitePerformance",
          status: "FAIL",
          severity: "CRITICAL",
          evidenceConfidence: "HIGH",
          maxPenaltyWeight: 20,
          reason: "HTTP URL is not using HTTPS.",
          evidenceRefs: ["homepage-response"],
          findingId: sourceFindingId,
          findingTitle: "Fix HTTPS issue",
          findingSummary: "The site is available over insecure transport.",
        },
      ],
      [
        {
          id: existingOpportunityId,
          sourceSeverity: "MEDIUM",
          finalPriority: 64,
          strategicFit: 2,
          planFit: 0,
          staleness: 0,
          effort: 5,
          dependencyState: "HARD_DEPENDENCY",
          clientInputState: "NOT_REQUIRED",
          approvalBlockedState: "NOT_BLOCKED",
          status: "BLOCKED",
        },
      ],
    ];
    let selectCall = 0;
    let updatePayload: Record<string, unknown> | undefined;
    let insertedOpportunity = false;
    const activitySummaries: Record<string, unknown>[] = [];
    const tx = {
      select() {
        const result = selectResults[selectCall++];

        return {
          from() {
            return {
              where() {
                return {
                  limit: async () => result,
                };
              },
              leftJoin() {
                return {
                  where: async () => result,
                };
              },
            };
          },
        };
      },
      update() {
        return {
          set(values: Record<string, unknown>) {
            updatePayload = values;

            return {
              where: async () => undefined,
            };
          },
        };
      },
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            if (table === opportunities) {
              insertedOpportunity = true;
            }

            if (table === activityEvents) {
              activitySummaries.push(values.summary as Record<string, unknown>);
            }

            return {
              returning: async () => [{ id: "new-opportunity" }],
            };
          },
        };
      },
    } as unknown as Parameters<typeof generateOpportunitiesForAuditRun>[0];

    const result = await generateOpportunitiesForAuditRun(tx, context, {
      clientId: "client-a",
      websiteId: "website-a",
      auditId: sourceAuditId,
      auditRunId: sourceAuditRunId,
    });

    expect(result).toEqual({ created: 0, deduped: 1, immediate: 0 });
    expect(insertedOpportunity).toBe(false);
    expect(updatePayload).toMatchObject({
      sourceAuditId,
      sourceAuditRunId,
      sourceFindingId,
      sourceCheckResultId,
      sourceSeverity: "CRITICAL",
      evidenceConfidence: "HIGH",
      impact: 5,
      confidence: 5,
      urgency: 5,
      finalPriority: expect.any(Number),
      priorityBand: "Immediate",
      immediateAttention: true,
    });
    expect(updatePayload?.status).toBeUndefined();
    expect(updatePayload?.dependencyState).toBeUndefined();
    expect(updatePayload?.finalPriority).toBeGreaterThanOrEqual(95);
    expect(updatePayload?.priorityReasons).toContain(
      "Critical finding priority floor applied at 95.",
    );
    expect(activitySummaries).toContainEqual(
      expect.objectContaining({
        reason: "deduplicated_new_audit_evidence",
        sourceAuditId,
        sourceCheckKey: "perf.https",
        priorPriority: 64,
        newPriority: updatePayload?.finalPriority,
        priorSeverity: "MEDIUM",
        newSeverity: "CRITICAL",
        criticalEscalation: true,
      }),
    );
  });
});
