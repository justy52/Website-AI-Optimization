import { createHash } from "node:crypto";
import { z } from "zod";
import type { ImplementationPackage } from "@/domain/verification/verification";

export const QA_ORIGIN = "https://optiq-qa.vercel.app";
export const QA_ACTION = "qa.metadata.apply";
export const QA_ACTION_VERSION = "qa.metadata.apply-v1.0";
export const QA_TOOL = "execute.qa_metadata.v1";
export const QA_AGENT = "qa-metadata-execution";
export const QA_AGENT_VERSION = "qa-metadata-execution-v1.0";
export const QA_WORKSPACE_FLAG = "qa.execute";
export const QA_ACTION_FLAG = QA_ACTION;
export class ExecutionValidationError extends Error {}
const plainText = (max: number) => z.string().max(max).refine(v => !/[<>\u0000-\u001f]/.test(v), "Only bounded plain metadata text is supported.");
export const metadataSchema = z.object({ title: plainText(160).min(1), description: plainText(320) }).strict();
export const snapshotSchema = metadataSchema.extend({ revision: z.number().int().positive(), hash: z.string().length(64) }).strict();
export type Metadata = z.infer<typeof metadataSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const executionHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function fixtureSnapshot(value: Metadata & { revision: number }): Snapshot {
  const fields = { ...metadataSchema.parse({ title: value.title, description: value.description }), revision: value.revision };
  return { ...fields, hash: executionHash(fields) };
}
export const fixtureUrl = (workspaceId: string, fixtureId: string) => `${QA_ORIGIN}/qa/execute-fixture/${workspaceId}/${fixtureId}`;
export const actionSchema = z.object({
  version: z.literal(QA_ACTION_VERSION), actionKey: z.literal(QA_ACTION), toolKey: z.literal(QA_TOOL),
  approvalRequestId: z.string().uuid(), workspaceId: z.string().uuid(), fixtureId: z.string().uuid(),
  packageId: z.string().uuid(), packageHash: z.string(), artifactId: z.string().uuid(), artifactVersion: z.number().int().positive(),
  target: z.string().url(), before: snapshotSchema, after: metadataSchema, risk: z.literal("LOW"),
  rollback: z.literal("RESTORE_EXACT_SNAPSHOT_ON_FAILED_OR_OWNER_ADMIN_REQUEST"), verificationRequired: z.literal(true),
}).strict();
export type QaAction = z.infer<typeof actionSchema>;
export function parseAction(value: unknown): QaAction {
  const result = actionSchema.safeParse(value);
  if (!result.success) throw new ExecutionValidationError("Unsupported or malformed QA execution action.");
  if (result.data.target !== fixtureUrl(result.data.workspaceId, result.data.fixtureId)) throw new ExecutionValidationError("Target is outside the exact OPTIQ QA fixture scope.");
  if (fixtureSnapshot(result.data.before).hash !== result.data.before.hash) throw new ExecutionValidationError("Pre-change snapshot hash mismatch.");
  return result.data;
}
export function proposedMetadata(pkg: ImplementationPackage, before: Snapshot): Metadata {
  if (pkg.requiresHumanReview || !pkg.checks.length || pkg.checks.some(c => !["title", "meta_description"].includes(c.kind))) throw new ExecutionValidationError("QA execution supports fully specified title/description packages only.");
  const after: Metadata = { title: before.title, description: before.description };
  for (const check of pkg.checks) after[check.kind === "title" ? "title" : "description"] = check.expected;
  const validated = metadataSchema.safeParse(after);
  if (!validated.success) throw new ExecutionValidationError("Approved metadata must be bounded plain text.");
  if (after.title === before.title && after.description === before.description) throw new ExecutionValidationError("The approved metadata is already present; no new change is needed.");
  return validated.data;
}
export type QaRuntime = { APP_ENV: string; QA_EXECUTE_ENABLED?: boolean; BETTER_AUTH_URL: string };
export function assertQaEnvironment(env: QaRuntime) {
  if (env.APP_ENV !== "qa" || ![QA_ORIGIN, `${QA_ORIGIN}/`].includes(env.BETTER_AUTH_URL)) throw new ExecutionValidationError("QA sandbox execution is unavailable in this environment.");
}
export function assertQaExecutionGates(input: { env: QaRuntime; workspaceEnabled: boolean; actionEnabled: boolean; role: string; agentKey: string; agentVersion: string; agentEnabled: boolean; toolKey: string; permission: string; approvalStatus: string; action: unknown; hash: string }) {
  assertQaEnvironment(input.env);
  if (!input.env.QA_EXECUTE_ENABLED) throw new ExecutionValidationError("Platform QA execution is disabled.");
  if (!input.workspaceEnabled) throw new ExecutionValidationError("Workspace execution is paused.");
  if (!input.actionEnabled) throw new ExecutionValidationError("QA metadata action is disabled for this workspace.");
  if (!["OWNER", "ADMIN"].includes(input.role)) throw new ExecutionValidationError("OWNER/ADMIN execution authority is required.");
  if (input.agentKey !== QA_AGENT || input.agentVersion !== QA_AGENT_VERSION || !input.agentEnabled || input.permission !== "EXECUTE" || input.toolKey !== QA_TOOL) throw new ExecutionValidationError("Agent/action/tool is not on the QA execution allowlist.");
  const action = parseAction(input.action);
  if (input.approvalStatus !== "APPROVED" || executionHash(action) !== input.hash) throw new ExecutionValidationError("Exact immutable execution approval is required.");
  return action;
}
export function assertPrecondition(actual: Snapshot, expected: Snapshot) {
  if (actual.hash !== expected.hash || actual.revision !== expected.revision) throw new ExecutionValidationError("QA fixture changed after approval; no write performed. Request a new approval.");
}
export function renderQaFixture(fixture: Metadata & { faultMode: string; lastOperation: string }) {
  const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const title = fixture.faultMode === "TITLE_MISMATCH" && fixture.lastOperation === "APPLY" ? "QA simulated delivery mismatch" : fixture.title;
  return `<!doctype html><html lang="en"><head><title>${escape(title)}</title><meta name="description" content="${escape(fixture.description)}"></head><body><p>OPTIQ QA SANDBOX EXECUTION fixture. Harmless test metadata only. No customer website is connected.</p></body></html>`;
}
