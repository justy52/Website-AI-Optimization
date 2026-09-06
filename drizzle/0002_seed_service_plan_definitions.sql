INSERT INTO "service_plan_definitions" (
  "version",
  "plan",
  "display_name",
  "monthly_price_cents",
  "entitlements"
) VALUES
(
  'service-plans-v1.0',
  'NONE',
  'None',
  NULL,
  '{"monitoring":{"websiteHealth":"none","searchConsole":"none","rankKeywordObservation":"none","competitorDeepReview":"none","aiReadinessRecheck":"none","observedAiVisibility":"none"},"limits":{"trackedPriorityKeywords":0,"configuredCompetitors":0,"observedAiVisibilityPrompts":0,"observedAiVisibilitySurfaces":0,"majorContentAssets":0,"existingPageOptimizations":0,"manualImplementationMinutes":0},"quarterlyStrategy":"not_included"}'::jsonb
),
(
  'service-plans-v1.0',
  'AUDIT_ONLY',
  'Audit Only',
  NULL,
  '{"monitoring":{"websiteHealth":"none","searchConsole":"none","rankKeywordObservation":"none","competitorDeepReview":"none","aiReadinessRecheck":"none","observedAiVisibility":"none"},"limits":{"trackedPriorityKeywords":0,"configuredCompetitors":0,"observedAiVisibilityPrompts":0,"observedAiVisibilitySurfaces":0,"majorContentAssets":0,"existingPageOptimizations":0,"manualImplementationMinutes":0},"quarterlyStrategy":"not_included"}'::jsonb
),
(
  'service-plans-v1.0',
  'LAUNCH',
  'Optimization Launch',
  NULL,
  '{"monitoring":{"websiteHealth":"none","searchConsole":"none","rankKeywordObservation":"none","competitorDeepReview":"none","aiReadinessRecheck":"none","observedAiVisibility":"none"},"limits":{"trackedPriorityKeywords":null,"configuredCompetitors":null,"observedAiVisibilityPrompts":null,"observedAiVisibilitySurfaces":null,"majorContentAssets":null,"existingPageOptimizations":null,"manualImplementationMinutes":null},"quarterlyStrategy":"not_included"}'::jsonb
),
(
  'service-plans-v1.0',
  'ESSENTIALS',
  'Essentials',
  75000,
  '{"monitoring":{"websiteHealth":"weekly","searchConsole":"weekly","rankKeywordObservation":"weekly","competitorDeepReview":"monthly","aiReadinessRecheck":"monthly","observedAiVisibility":"monthly"},"limits":{"trackedPriorityKeywords":25,"configuredCompetitors":3,"observedAiVisibilityPrompts":10,"observedAiVisibilitySurfaces":1,"majorContentAssets":0,"existingPageOptimizations":1,"manualImplementationMinutes":120},"quarterlyStrategy":"not_included"}'::jsonb
),
(
  'service-plans-v1.0',
  'GROWTH',
  'Growth',
  125000,
  '{"monitoring":{"websiteHealth":"weekly","searchConsole":"weekly","rankKeywordObservation":"weekly","competitorDeepReview":"monthly","aiReadinessRecheck":"monthly","observedAiVisibility":"monthly"},"limits":{"trackedPriorityKeywords":75,"configuredCompetitors":5,"observedAiVisibilityPrompts":20,"observedAiVisibilitySurfaces":2,"majorContentAssets":1,"existingPageOptimizations":1,"manualImplementationMinutes":240},"quarterlyStrategy":"internal_optional"}'::jsonb
),
(
  'service-plans-v1.0',
  'PRO',
  'Pro',
  200000,
  '{"monitoring":{"websiteHealth":"weekly","searchConsole":"weekly","rankKeywordObservation":"weekly","competitorDeepReview":"monthly","aiReadinessRecheck":"monthly","observedAiVisibility":"twice_monthly"},"limits":{"trackedPriorityKeywords":150,"configuredCompetitors":8,"observedAiVisibilityPrompts":30,"observedAiVisibilitySurfaces":3,"majorContentAssets":2,"existingPageOptimizations":2,"manualImplementationMinutes":420},"quarterlyStrategy":"included"}'::jsonb
),
(
  'service-plans-v1.0',
  'CUSTOM',
  'Custom',
  NULL,
  '{"monitoring":{"websiteHealth":"weekly","searchConsole":"weekly","rankKeywordObservation":"weekly","competitorDeepReview":"monthly","aiReadinessRecheck":"monthly","observedAiVisibility":"monthly"},"limits":{"trackedPriorityKeywords":null,"configuredCompetitors":null,"observedAiVisibilityPrompts":null,"observedAiVisibilitySurfaces":null,"majorContentAssets":null,"existingPageOptimizations":null,"manualImplementationMinutes":null},"quarterlyStrategy":"internal_optional"}'::jsonb
)
ON CONFLICT ("version", "plan") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "monthly_price_cents" = EXCLUDED."monthly_price_cents",
  "entitlements" = EXCLUDED."entitlements",
  "active" = true;
