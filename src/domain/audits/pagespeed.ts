/** One public homepage, simulated mobile lab data. Missing data stays unavailable. */
export type MobileLabEvidence = {
  requestedUrl: string;
  fetchedAt: string;
  lighthouseVersion: string | null;
  lcpMs: number | null;
  cls: number | null;
  fieldInpMs?: number | null;
  /** Origin-wide (not page-level) real-user INP, kept separate and labeled as such. */
  originFieldInpMs?: number | null;
  /** Lab Total Blocking Time: a responsiveness proxy, never reported as INP. */
  tbtMs?: number | null;
};

export async function collectMobileLabEvidence(
  pageUrl: string,
  apiKey: string,
  transport: typeof fetch = fetch,
): Promise<MobileLabEvidence | null> {
  const unavailable = (reason: string, status?: number) => {
    // Record a bounded category only: never log URLs, provider bodies or keys.
    console.warn("pagespeed_lab_unavailable", { reason, ...(status === undefined ? {} : { status }) });
    return null;
  };
  try {
    const page = new URL(pageUrl);
    // Only send public homepage URLs, never credentials, query strings or paths.
    if (page.protocol !== "https:" || page.username || page.password || page.pathname !== "/" || page.search || page.hash) return unavailable("unsupported_url");
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", page.origin + "/");
    api.searchParams.set("strategy", "mobile");
    api.searchParams.set("category", "performance");
    const baseFields = "loadingExperience(id,initial_url,origin_fallback,metrics),lighthouseResult(requestedUrl,finalDisplayedUrl,lighthouseVersion,runtimeError,audits)";
    api.searchParams.set("fields", `${baseFields},originLoadingExperience(id,metrics)`);
    // A real mobile Lighthouse run can exceed 45 seconds. Keep it bounded,
    // but allow enough time for Google's lab to finish under normal load.
    const request = () => transport(api, { headers: { "X-Goog-Api-Key": apiKey }, redirect: "error", signal: AbortSignal.timeout(90_000) });
    // Name the cause of a rejected request with a fixed category. The provider's
    // own message is never logged: it can echo the requested URL.
    const rejection = async (failed: Response) => {
      const text = (await failed.text().catch(() => "")).slice(0, 4_000);
      if (/API key not valid|API_KEY_INVALID/i.test(text)) return "api_key_invalid";
      if (/API key expired|API_KEY_EXPIRED/i.test(text)) return "api_key_expired";
      if (/has not been used in project|SERVICE_DISABLED|is disabled/i.test(text)) return "api_not_enabled";
      if (/referer|IP address|API_KEY_(?:HTTP_REFERRER|IP_ADDRESS|SERVICE)_BLOCKED|are blocked/i.test(text)) return "api_key_restricted";
      if (/Invalid field selection|fields/i.test(text)) return "invalid_field_selection";
      return "provider_http";
    };
    let response = await request();
    if (response.status === 400 || response.status === 403) {
      const reason = await rejection(response);
      if (reason !== "invalid_field_selection") return unavailable(reason, response.status);
      // Site-wide field data is optional: retry once without asking for it.
      api.searchParams.set("fields", baseFields);
      response = await request();
    }
    if (!response.ok || !response.body) return unavailable("provider_http", response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, content = "";
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); return unavailable("response_too_large"); }
      content += decoder.decode(part.value, { stream: true });
    }
    content += decoder.decode();
    const result = JSON.parse(content) as { originLoadingExperience?: { id?: string; metrics?: Record<string, { percentile?: unknown }> }; loadingExperience?: { id?: string; initial_url?: string; origin_fallback?: boolean; metrics?: Record<string, { percentile?: unknown }> }; lighthouseResult?: { requestedUrl?: string; finalDisplayedUrl?: string; lighthouseVersion?: string; runtimeError?: unknown; audits?: Record<string, { numericValue?: unknown; scoreDisplayMode?: string }> } };
    const lab = result.lighthouseResult;
    if (!lab || lab.runtimeError || !lab.requestedUrl || new URL(lab.requestedUrl).origin !== page.origin || !lab.finalDisplayedUrl || new URL(lab.finalDisplayedUrl).origin !== page.origin) return unavailable("invalid_or_incomplete_lab");
    const metric = (name: string) => {
      const item = lab.audits?.[name];
      return item?.scoreDisplayMode === "numeric" && typeof item.numericValue === "number" && Number.isFinite(item.numericValue) && item.numericValue >= 0 ? item.numericValue : null;
    };
    const lcpMs = metric("largest-contentful-paint"), cls = metric("cumulative-layout-shift");
    const field = result.loadingExperience;
    const fieldValue = field?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile;
    // Origin fallback is not a page measurement. Only accept explicitly bound
    // data for this exact homepage, with a finite integer percentile in ms.
    const fieldInpMs = field?.origin_fallback !== true && field?.id === page.origin + "/" && field?.initial_url === page.origin + "/" && typeof fieldValue === "number" && Number.isSafeInteger(fieldValue) && fieldValue >= 0 ? fieldValue : null;
    const tbtMs = metric("total-blocking-time");
    const originField = result.originLoadingExperience;
    const originValue = originField?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile;
    let originMatches = false;
    try { originMatches = typeof originField?.id === "string" && new URL(originField.id).origin === page.origin; } catch { originMatches = false; }
    const originFieldInpMs = originMatches && typeof originValue === "number" && Number.isSafeInteger(originValue) && originValue >= 0 ? originValue : null;
    if (lcpMs === null && cls === null && fieldInpMs === null && originFieldInpMs === null && tbtMs === null) return unavailable("metrics_missing");
    return { requestedUrl: page.origin + "/", fetchedAt: new Date().toISOString(), lighthouseVersion: lab.lighthouseVersion ?? null, lcpMs, cls, fieldInpMs, originFieldInpMs, tbtMs };
  } catch (error) {
    return unavailable(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "request_or_parse_error");
  }
}
