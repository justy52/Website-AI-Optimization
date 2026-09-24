import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ serverEnv: { APP_ENV: "qa" } }));
import { serverEnv } from "@/lib/env";
import { GET } from "./route";
afterEach(() => { vi.useRealTimers(); serverEnv.APP_ENV = "qa"; });
describe("read-only QA verification fixture", () => {
  it("is absent from customer production", () => { serverEnv.APP_ENV = "production"; expect(GET(new Request("https://example.com/api/qa/verification-fixture")).status).toBe(404); });
  it("serves fixed scheduled before, mismatched and corrected public HTML", async () => {
    vi.useFakeTimers();
    const start = Date.now(); const request = new Request(`https://example.com/api/qa/verification-fixture?readyAt=${start + 1000}&correctAt=${start + 2000}`);
    expect(await GET(request).text()).toContain("<title>Home</title>");
    vi.setSystemTime(start + 1500); expect(await GET(request).text()).toContain("Intentionally mismatched");
    vi.setSystemTime(start + 2500); expect(await GET(request).text()).toContain("OPTIQ QA Fixture helps customers");
    expect(GET(request).headers.get("cache-control")).toBe("no-store");
  });
  it("rejects missing or unbounded parameters without reflecting input", () => {
    for (const query of ["", "readyAt=bad&correctAt=Infinity", "readyAt=1&correctAt=99999999999999"]) expect(GET(new Request(`https://example.com/api/qa/verification-fixture?${query}`)).status).toBe(404);
  });
});
