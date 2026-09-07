import { describe, expect, it } from "vitest";

import { maliciousWebsiteContentFixtures } from "@/domain/audits/prompt-injection-fixtures";

import {
  assertPrepareOutputPolicy,
  buildExistingPageOptimizationPrompt,
  createDeterministicPageOptimizationOutput,
  existingPageOptimizationOutputSchema,
  maliciousFixtureInput,
  renderDraftPreview,
  type ExistingPageOptimizationOutput,
} from "./page-optimization";

describe("existing page optimization PREPARE agent", () => {
  it("creates a valid metadata draft from verified facts", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-service",
          factType: "service",
          value: "Website optimization",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved onboarding answer",
        },
        {
          id: "fact-area",
          factType: "service_area",
          value: "Denver",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved onboarding answer",
        },
      ],
    });
    const output = createDeterministicPageOptimizationOutput(input);

    expect(existingPageOptimizationOutputSchema.parse(output)).toEqual(output);
    expect(output.permissionLevel).toBe("PREPARE");
    expect(output.externalExecutionRequested).toBe(false);
    expect(output.proposals[0]?.proposedValue).toContain(
      "Website optimization in Denver",
    );
    expect(output.proposals[0]?.factualBasis).toContainEqual(
      expect.objectContaining({ kind: "VERIFIED_FACT", ref: "fact-service" }),
    );
  });

  it("marks missing business facts as TBD instead of fabricating claims", () => {
    const output = createDeterministicPageOptimizationOutput(
      maliciousFixtureInput(),
    );

    expect(output.proposals[0]?.proposedValue).toContain("TBD");
    expect(output.proposals[0]?.requiresHumanInput).toBe(true);
    expect(output.proposals[0]?.factualBasis).toContainEqual(
      expect.objectContaining({ kind: "UNKNOWN_TBD" }),
    );
    expect(output.unsupportedClaimWarnings[0]).toContain(
      "No verified BusinessFacts",
    );
  });

  it("treats prompt-injection evidence as inert data", () => {
    const input = maliciousFixtureInput();
    const output = createDeterministicPageOptimizationOutput(input);
    const rendered = renderDraftPreview(output);
    const prompt = buildExistingPageOptimizationPrompt(input);

    for (const fixture of maliciousWebsiteContentFixtures) {
      expect(prompt).toContain(fixture);
      expect(rendered).not.toContain(fixture);
    }

    expect(output.permissionLevel).toBe("PREPARE");
    expect(output.externalExecutionRequested).toBe(false);
    expect(JSON.stringify(output)).not.toMatch(/api key|publish|email/i);
  });

  it("rejects unsupported factual claims without verified BusinessFacts", () => {
    const input = maliciousFixtureInput();
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue:
            "Award-winning service for $99 with a guaranteed outcome.",
          rationale: "Unsafe unsupported claim fixture.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "SOURCE_DERIVED_DRAFT_CLAIM",
              ref: "homepage-html",
              note: "Unverified external page copy.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };

    expect(() => assertPrepareOutputPolicy(output, input)).toThrow(
      "Unsupported pricing claim requires a verified BusinessFact.",
    );
  });

  it("preserves low evidence confidence in generated drafts", () => {
    const output = createDeterministicPageOptimizationOutput(
      maliciousFixtureInput({
        opportunity: {
          ...maliciousFixtureInput().opportunity,
          evidenceConfidence: "LOW",
        },
      }),
    );

    expect(output.confidence).toBe("LOW");
  });

  it("returns no-change output for already-good or low-severity findings", () => {
    const output = createDeterministicPageOptimizationOutput(
      maliciousFixtureInput({
        opportunity: {
          ...maliciousFixtureInput().opportunity,
          sourceResultStatus: "PASS",
          sourceSeverity: "LOW",
        },
      }),
    );

    expect(output.proposals[0]?.field).toBe("no_change");
    expect(output.riskLevel).toBe("LOW");
  });
});
