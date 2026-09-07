import { describe, expect, it } from "vitest";

import { maliciousWebsiteContentFixtures } from "@/domain/audits/prompt-injection-fixtures";

import {
  assertPrepareOutputPolicy,
  buildExistingPageOptimizationPrompt,
  createDeterministicPageOptimizationOutput,
  existingPageOptimizationOutputSchema,
  filterModelVisibleBusinessFacts,
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
    expect(output.proposals[0]?.factualBasis).toContainEqual(
      expect.objectContaining({ kind: "VERIFIED_FACT", ref: "fact-area" }),
    );
  });

  it("filters model-visible BusinessFacts to PUBLIC VERIFIED records only", () => {
    const facts = [
      {
        id: "fact-public",
        factType: "service",
        value: "Website optimization",
        verificationStatus: "VERIFIED",
        sensitivity: "PUBLIC",
        sourceReference: "Approved onboarding answer",
      },
      {
        id: "fact-confidential",
        factType: "pricing",
        value: "CONFIDENTIAL_CANARY_PHASE3_PRICE_123",
        verificationStatus: "VERIFIED",
        sensitivity: "CONFIDENTIAL",
        sourceReference: "Internal note",
      },
      {
        id: "fact-unverified",
        factType: "service_area",
        value: "UNVERIFIED_CANARY_PHASE3_AREA_456",
        verificationStatus: "NEEDS_REVIEW",
        sensitivity: "PUBLIC",
        sourceReference: "Unreviewed intake",
      },
    ];

    expect(filterModelVisibleBusinessFacts(facts)).toEqual([facts[0]]);
  });

  it("excludes confidential and unverified facts from model prompts and drafts", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-public",
          factType: "service",
          value: "Website optimization",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved onboarding answer",
        },
        {
          id: "fact-confidential",
          factType: "pricing",
          value: "CONFIDENTIAL_CANARY_PHASE3_PRICE_123",
          verificationStatus: "VERIFIED",
          sensitivity: "CONFIDENTIAL",
          sourceReference: "Internal note",
        },
        {
          id: "fact-unverified",
          factType: "service_area",
          value: "UNVERIFIED_CANARY_PHASE3_AREA_456",
          verificationStatus: "NEEDS_REVIEW",
          sensitivity: "PUBLIC",
          sourceReference: "Unreviewed intake",
        },
      ],
    });
    const prompt = buildExistingPageOptimizationPrompt(input);
    const output = createDeterministicPageOptimizationOutput(input);

    expect(prompt).toContain("Website optimization");
    expect(prompt).not.toContain("CONFIDENTIAL_CANARY_PHASE3_PRICE_123");
    expect(prompt).not.toContain("UNVERIFIED_CANARY_PHASE3_AREA_456");
    expect(JSON.stringify(output)).not.toContain(
      "CONFIDENTIAL_CANARY_PHASE3_PRICE_123",
    );
    expect(JSON.stringify(output)).not.toContain(
      "UNVERIFIED_CANARY_PHASE3_AREA_456",
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

  it("creates a valid CTA draft without unsupported protected claims", () => {
    const input = maliciousFixtureInput({
      opportunity: {
        ...maliciousFixtureInput().opportunity,
        title: "conv.primary_cta FAIL",
        sourceCheckKey: "conv.primary_cta",
      },
    });
    const output = createDeterministicPageOptimizationOutput(input);

    expect(() => assertPrepareOutputPolicy(output, input)).not.toThrow();
    expect(output.proposals[0]?.field).toBe("cta");
    expect(output.proposals[0]?.requiresHumanInput).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(/\bguarantee/i);
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
      "Unsupported pricing / discount claim requires a PUBLIC VERIFIED BusinessFact reference.",
    );
  });

  it("rejects invented VERIFIED_FACT references", () => {
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
      ],
    });
    const output = createDeterministicPageOptimizationOutput(input);

    output.proposals[0]!.factualBasis = [
      {
        kind: "VERIFIED_FACT",
        ref: "fake-fact",
        note: "Invented model reference.",
      },
    ];

    expect(() => assertPrepareOutputPolicy(output, input)).toThrow(
      "VERIFIED_FACT reference is not model-visible: fake-fact.",
    );
  });

  it("rejects proposal evidence refs and source-derived refs that were not supplied", () => {
    const input = maliciousFixtureInput();
    const output = createDeterministicPageOptimizationOutput(input);

    output.proposals[0]!.evidenceRefs = ["unknown-evidence"];
    output.proposals[0]!.factualBasis = [
      {
        kind: "SOURCE_DERIVED_DRAFT_CLAIM",
        ref: "unknown-evidence",
        note: "Missing source reference.",
      },
    ];

    expect(() => assertPrepareOutputPolicy(output, input)).toThrow(
      "Unknown proposal evidenceRef: unknown-evidence.",
    );
  });

  it("covers Doc 25 protected claim categories with deterministic support checks", () => {
    const input = maliciousFixtureInput();
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue:
            "We provide emergency roofing in Denver for $99 with certified, licensed, insured crews, a warranty, a guarantee, award-winning results, 27% ROI lift, 500 customers, 20 years in business, ADA compliance, and five-star reviews.",
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
      /service \/ service availability.*service area \/ location.*pricing \/ discount.*credential.*license.*insurance.*warranty.*guarantee.*award.*statistics.*customer count.*history.*legal \/ compliance.*testimonial \/ review/s,
    );
  });

  it("allows protected claims only when proposal cites matching PUBLIC VERIFIED facts", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-price",
          factType: "pricing",
          value: "$99",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved pricing sheet",
        },
      ],
    });
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue: "Pricing starts at $99.",
          rationale: "Supported pricing claim.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "VERIFIED_FACT",
              ref: "fact-price",
              note: "Approved pricing statement.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };

    expect(() => assertPrepareOutputPolicy(output, input)).not.toThrow();
  });

  it("enforces prohibited ClaimPolicy categories after factual support exists", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-price",
          factType: "pricing",
          value: "$99",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved pricing sheet",
        },
      ],
      claimPolicies: [
        {
          id: "policy-pricing",
          ruleType: "PROHIBITED",
          claimCategory: "pricing",
          rule: "Do not include pricing in prepared metadata.",
        },
      ],
    });
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue: "Pricing starts at $99.",
          rationale: "Supported but policy-prohibited pricing claim.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "VERIFIED_FACT",
              ref: "fact-price",
              note: "Approved pricing statement.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };

    expect(() => assertPrepareOutputPolicy(output, input)).toThrow(
      "Prohibited pricing / discount claim rejected by ClaimPolicy.",
    );
  });

  it("requires configured disclaimers before an artifact can proceed", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-statistic",
          factType: "statistic",
          value: "27% ROI lift",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved case study",
        },
      ],
      claimPolicies: [
        {
          id: "policy-statistic",
          ruleType: "REQUIRED_DISCLAIMER",
          claimCategory: "statistics",
          rule: "Statistics require a disclaimer.",
          requiredDisclaimer: "Results vary by site and market.",
        },
      ],
    });
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue: "Improve ROI by 27%.",
          rationale: "Supported statistic without disclaimer.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "VERIFIED_FACT",
              ref: "fact-statistic",
              note: "Approved case study statistic.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };

    expect(() => assertPrepareOutputPolicy(output, input)).toThrow(
      "Required disclaimer missing for statistics ClaimPolicy.",
    );

    output.proposals[0]!.proposedValue =
      "Improve ROI by 27%. Results vary by site and market.";

    expect(() => assertPrepareOutputPolicy(output, input)).not.toThrow();
  });

  it("marks stricter-review and unknown ClaimPolicies for human review", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-compliance",
          factType: "compliance_claim",
          value: "ADA compliance",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved legal note",
        },
      ],
      claimPolicies: [
        {
          id: "policy-compliance",
          ruleType: "STRICTER_REVIEW",
          claimCategory: "legal/compliance",
          rule: "Legal claims need owner review.",
        },
        {
          id: "policy-unknown",
          ruleType: "ALLOWED",
          claimCategory: "bespoke-risk-category",
          rule: "Unknown categories should not proceed permissively.",
        },
      ],
    });
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      riskLevel: "LOW",
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue: "ADA compliance guidance.",
          rationale: "Supported compliance claim.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "VERIFIED_FACT",
              ref: "fact-compliance",
              note: "Approved compliance fact.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };
    const reviewed = assertPrepareOutputPolicy(output, input);

    expect(reviewed.riskLevel).toBe("HIGH");
    expect(reviewed.proposals[0]?.requiresHumanInput).toBe(true);
    expect(reviewed.unsupportedClaimWarnings).toContain(
      "ClaimPolicy marks legal / compliance claim for stricter human review.",
    );
    expect(reviewed.unsupportedClaimWarnings).toContain(
      "Unrecognized ClaimPolicy category requires stricter human review.",
    );
  });

  it("records REQUIRES_APPROVAL ClaimPolicy contribution without bypassing approval", () => {
    const input = maliciousFixtureInput({
      businessFacts: [
        {
          id: "fact-license",
          factType: "license",
          value: "Licensed contractor",
          verificationStatus: "VERIFIED",
          sensitivity: "PUBLIC",
          sourceReference: "Approved license record",
        },
      ],
      claimPolicies: [
        {
          id: "policy-license",
          ruleType: "REQUIRES_APPROVAL",
          claimCategory: "license",
          rule: "License language must be approved.",
        },
      ],
    });
    const output: ExistingPageOptimizationOutput = {
      ...createDeterministicPageOptimizationOutput(input),
      proposals: [
        {
          field: "meta_description",
          currentValue: null,
          proposedValue: "Licensed contractor services.",
          rationale: "Supported license claim.",
          evidenceRefs: ["homepage-html"],
          factualBasis: [
            {
              kind: "VERIFIED_FACT",
              ref: "fact-license",
              note: "Approved license record.",
            },
          ],
          requiresHumanInput: false,
        },
      ],
    };
    const reviewed = assertPrepareOutputPolicy(output, input);

    expect(reviewed.unsupportedClaimWarnings).toContain(
      "ClaimPolicy requires human approval for license claim.",
    );
    expect(reviewed.externalExecutionRequested).toBe(false);
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
