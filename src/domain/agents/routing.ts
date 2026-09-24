export type PrepareRoute = {
  agentKey: string;
  artifactType: "EXISTING_PAGE_OPTIMIZATION_PROPOSAL" | "CONTENT_BRIEF" | "INTERNAL_LINK_PROPOSAL" | "SCHEMA_PROPOSAL";
  label: string;
};
const page: PrepareRoute = { agentKey: "existing-page-optimization", artifactType: "EXISTING_PAGE_OPTIMIZATION_PROPOSAL", label: "Prepare Page Optimization" };
const content: PrepareRoute = { agentKey: "content-opportunity", artifactType: "CONTENT_BRIEF", label: "Prepare Content Brief" };
const links: PrepareRoute = { agentKey: "internal-linking", artifactType: "INTERNAL_LINK_PROPOSAL", label: "Prepare Internal Links" };
const schema: PrepareRoute = { agentKey: "schema", artifactType: "SCHEMA_PROPOSAL", label: "Prepare Schema" };
const families: Record<string, PrepareRoute> = {
  on_page_metadata: page, on_page_structure: page, conversion_path: page, offer_clarity: page,
  content_targeting: content, ai_readiness_content: content, local_content: content, expertise_content: content,
  internal_linking: links, structured_data: schema,
};
const checks: Record<string, PrepareRoute> = {
  "seo.title": page, "seo.meta_description": page, "seo.h1": page, "seo.headings": page, "seo.heading_structure": page,
  "conv.cta": page, "conv.primary_cta": page, "conv.lead_form": page, "conv.mobile_contact": page, "conv.friction": page, "conv.offer_clarity": page,
  "seo.internal_links": links, "ai.structured_data": schema, "local.structured_business_data": schema,
  "seo.content_targeting": content, "ai.service_clarity": content, "ai.location_clarity": content,
  "ai.answerability": content, "ai.citability": content, "auth.expertise_content": content,
  "local.location_clarity": content, "local.local_pages": content,
};
export function routePrepareOpportunity(input: { normalizedRemediationFamily?: string; sourceCheckKey?: string }): PrepareRoute | null {
  return families[input.normalizedRemediationFamily ?? ""] ?? checks[input.sourceCheckKey ?? ""] ?? null;
}
