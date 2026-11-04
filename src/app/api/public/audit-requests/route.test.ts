import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn(), config: vi.fn() }));
vi.mock("@/server/public-intake", () => ({ persistInquiry: mocks.persist }));
vi.mock("@/server/intake-config", () => ({ getIntakeConfig: mocks.config }));
import { POST } from "./route";
import { issueIntakeNonce } from "@/security/intake-nonce";

const secret = "a".repeat(40);
function payload() { return { contactName: "Alex", companyName: "Service Business", email: "alex@business.com", website: "https://business.com", goal: "calls", acknowledgement: true, nonce: issueIntakeNonce(secret, Date.now() - 3000), companyFax: "", formVersion: "audit-inquiry-v1", privacyVersion: "2026-11-04" }; }
function request(body: unknown = payload(), headers = {}) { return new Request("https://virelantic.test/api/public/audit-requests", { method: "POST", headers: { origin: "https://virelantic.test", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.config.mockReturnValue({ PUBLIC_INTAKE_SECRET: secret, PUBLIC_INTAKE_ORIGIN: "https://virelantic.test" }); mocks.persist.mockResolvedValue("saved"); });
describe("POST public audit requests", () => {
  it("acknowledges only a durable save, using a non-identifying response", async () => {
    const response = await POST(request()); expect(response.status).toBe(201); expect(await response.json()).toEqual({ received: true });
    expect(mocks.persist).toHaveBeenCalledOnce();
  });
  it("allows an idempotent retry", async () => { mocks.persist.mockResolvedValue("duplicate"); expect((await POST(request())).status).toBe(200); });
  it("never reports success for database failure", async () => { mocks.persist.mockRejectedValue(new Error("private DB exception")); const response = await POST(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private DB"); });
  it("returns rate limits and conflicts explicitly", async () => {
    mocks.persist.mockResolvedValue("limited"); const limited = await POST(request()); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("900");
    mocks.persist.mockResolvedValue("conflict"); expect((await POST(request())).status).toBe(409);
  });
  it("rejects invalid origin, content type, body, nonce and routing before persistence", async () => {
    expect((await POST(request(payload(), { origin: "https://attacker.test" }))).status).toBe(403);
    expect((await POST(request(payload(), { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request("x".repeat(8193)))).status).toBe(413);
    expect((await POST(request({ ...payload(), workspaceId: "attacker" }))).status).toBe(422);
    expect((await POST(request({ ...payload(), nonce: "f".repeat(60) }))).status).toBe(422);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("fails closed when disabled or incomplete", async () => { mocks.config.mockReturnValue(null); expect((await POST(request())).status).toBe(503); expect(mocks.persist).not.toHaveBeenCalled(); });
});
