import { UnknownDefinitionVersionError } from "@/domain/definitions";

export const PRIORITY_DEFINITION_VERSION = "op-priority-v1.0";

export type PriorityBand = "Immediate" | "High" | "Normal" | "Backlog" | "Low";

export type PriorityInputs = {
  impact: number;
  confidence: number;
  urgency: number;
  strategicFit: number;
  planFit: number;
  staleness: number;
  effort: 1 | 2 | 3 | 4 | 5;
  hasUnresolvedHardDependency?: boolean;
  awaitingClientInput?: boolean;
  isConfirmedDuplicate?: boolean;
  isCriticalFinding?: boolean;
};

export type PriorityResult = {
  definitionVersion: typeof PRIORITY_DEFINITION_VERSION;
  baseScore: number;
  modifierTotal: number;
  score: number;
  band: PriorityBand;
  reasons: string[];
};

const weightedFactors = {
  impact: 0.3,
  confidence: 0.2,
  urgency: 0.15,
  strategicFit: 0.15,
  planFit: 0.1,
  staleness: 0.1,
} as const;

const effortModifiers: Record<PriorityInputs["effort"], number> = {
  1: 10,
  2: 5,
  3: 0,
  4: -10,
  5: -20,
};

export const priorityDefinitionsByVersion = {
  [PRIORITY_DEFINITION_VERSION]: {
    version: PRIORITY_DEFINITION_VERSION,
    weightedFactors,
    effortModifiers,
    modifiers: {
      unresolvedHardDependency: -25,
      awaitingClientInput: -15,
      criticalFindingMinimum: 95,
    },
    bands: [
      { min: 90, max: 100, band: "Immediate" },
      { min: 75, max: 89, band: "High" },
      { min: 55, max: 74, band: "Normal" },
      { min: 35, max: 54, band: "Backlog" },
      { min: 0, max: 34, band: "Low" },
    ],
  },
} as const;

export function getPriorityDefinition(
  version = PRIORITY_DEFINITION_VERSION,
): (typeof priorityDefinitionsByVersion)[typeof PRIORITY_DEFINITION_VERSION] {
  const definition =
    priorityDefinitionsByVersion[
      version as keyof typeof priorityDefinitionsByVersion
    ];

  if (!definition) {
    throw new UnknownDefinitionVersionError("opportunity priority", version);
  }

  return definition;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertScale(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
}

export function priorityBand(score: number): PriorityBand {
  if (score >= 90) return "Immediate";
  if (score >= 75) return "High";
  if (score >= 55) return "Normal";
  if (score >= 35) return "Backlog";
  return "Low";
}

export function calculateOpportunityPriority(
  inputs: PriorityInputs,
): PriorityResult {
  assertScale("impact", inputs.impact, 0, 5);
  assertScale("confidence", inputs.confidence, 0, 5);
  assertScale("urgency", inputs.urgency, 0, 5);
  assertScale("strategicFit", inputs.strategicFit, 0, 5);
  assertScale("planFit", inputs.planFit, 0, 5);
  assertScale("staleness", inputs.staleness, 0, 5);
  assertScale("effort", inputs.effort, 1, 5);

  const reasons: string[] = [];

  if (inputs.isConfirmedDuplicate) {
    return {
      definitionVersion: PRIORITY_DEFINITION_VERSION,
      baseScore: 0,
      modifierTotal: 0,
      score: 0,
      band: "Low",
      reasons: ["Confirmed duplicate or superseded opportunity."],
    };
  }

  const base =
    inputs.impact * 20 * weightedFactors.impact +
    inputs.confidence * 20 * weightedFactors.confidence +
    inputs.urgency * 20 * weightedFactors.urgency +
    inputs.strategicFit * 20 * weightedFactors.strategicFit +
    inputs.planFit * 20 * weightedFactors.planFit +
    inputs.staleness * 20 * weightedFactors.staleness;

  const roundedBase = Math.round(base);
  reasons.push(`Base score ${roundedBase} from weighted V1 factors.`);

  let modifierTotal = effortModifiers[inputs.effort];
  let score = base + modifierTotal;
  reasons.push(`Effort ${inputs.effort} modifier ${effortModifiers[inputs.effort]}.`);

  if (inputs.hasUnresolvedHardDependency) {
    const modifier = getPriorityDefinition().modifiers.unresolvedHardDependency;
    score += modifier;
    modifierTotal += modifier;
    reasons.push("Unresolved hard dependency modifier -25.");
  }

  if (inputs.awaitingClientInput) {
    const modifier = getPriorityDefinition().modifiers.awaitingClientInput;
    score += modifier;
    modifierTotal += modifier;
    reasons.push("Awaiting required client input modifier -15.");
  }

  if (
    inputs.isCriticalFinding &&
    score < getPriorityDefinition().modifiers.criticalFindingMinimum
  ) {
    score = getPriorityDefinition().modifiers.criticalFindingMinimum;
    reasons.push("Critical finding priority floor applied at 95.");
  }

  const finalScore = clamp(Math.round(score));

  return {
    definitionVersion: PRIORITY_DEFINITION_VERSION,
    baseScore: roundedBase,
    modifierTotal: Math.round(modifierTotal),
    score: finalScore,
    band: priorityBand(finalScore),
    reasons,
  };
}
