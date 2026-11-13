import { describe, expect, it, vi } from "vitest";

import { cleanAddress, isValidSender, sendEmail } from "./email";

const message = { to: "owner@example.test", subject: "Subject line", text: "Body text" };
const settings = { apiKey: "test-key", from: "Virelantic <notifications@example.test>" };

describe("transactional email", () => {
  it("does nothing and reports false when email is not configured", async () => {
    const transport = vi.fn();
    expect(await sendEmail(message, transport as unknown as typeof fetch, null)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("posts one plain-text message to the provider", async () => {
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendEmail(message, transport as unknown as typeof fetch, settings)).toBe(true);
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toEqual({ from: settings.from, to: [message.to], subject: message.subject, text: message.text });
  });

  it("returns false without throwing or logging the message when sending fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rejected = vi.fn(async () => new Response("{}", { status: 422 }));
      expect(await sendEmail(message, rejected as unknown as typeof fetch, settings)).toBe(false);
      const offline = vi.fn(async () => { throw new TypeError("network down"); });
      expect(await sendEmail(message, offline as unknown as typeof fetch, settings)).toBe(false);
      expect(error).toHaveBeenCalledTimes(2);
      expect(error.mock.calls[0]).toEqual(["email_send_failed", { status: 422, reason: "other", senderFormatValid: true }]);
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/owner@example|Subject line|Body text|test-key/);
    } finally { error.mockRestore(); }
  });

  it("names why the provider refused without logging its message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const refuse = (status: number, text: string) => vi.fn(async () => new Response(JSON.stringify({ message: text }), { status })) as unknown as typeof fetch;
      await sendEmail(message, refuse(403, "The example.test domain is not verified. Please, add and verify your domain."), settings);
      await sendEmail(message, refuse(422, "Invalid `from` field. The email address needs to follow the `email@example.com` format."), { ...settings, from: "Virelantic" });
      await sendEmail(message, refuse(403, "You can only send testing emails to your own email address (owner@example.test)."), settings);
      await sendEmail(message, vi.fn(async () => new Response(JSON.stringify({ statusCode: 403, name: "invalid_api_key", message: "API key is invalid" }), { status: 403 })) as unknown as typeof fetch, settings);
      await sendEmail(message, vi.fn(async () => new Response("error code: 1010", { status: 403 })) as unknown as typeof fetch, settings);
      await sendEmail(message, vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "Something new." }), { status: 403 })) as unknown as typeof fetch, settings);
      expect(error.mock.calls.map(call => call[1])).toEqual([
        { status: 403, reason: "sender_domain_not_verified", senderFormatValid: true },
        { status: 422, reason: "sender_invalid", senderFormatValid: false },
        { status: 403, reason: "test_mode_own_address_only", senderFormatValid: true },
        { status: 403, reason: "api_key_invalid_api_key", senderFormatValid: true },
        { status: 403, reason: "blocked_at_network_edge_1010", senderFormatValid: true },
        { status: 403, reason: "other_validation_error", senderFormatValid: true },
      ]);
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/example\.test|owner@/);
    } finally { error.mockRestore(); }
  });

  it("tidies pasted addresses and recognises a usable sender", () => {
    expect(cleanAddress('  "Virelantic <notifications@example.test>" ')).toBe("Virelantic <notifications@example.test>");
    expect(cleanAddress("`owner@example.test`")).toBe("owner@example.test");
    expect(isValidSender("Virelantic <notifications@example.test>")).toBe(true);
    expect(isValidSender("notifications@example.test")).toBe(true);
    expect(isValidSender("Virelantic")).toBe(false);
    expect(isValidSender("example.test")).toBe(false);
    expect(isValidSender("Virelantic notifications@example.test")).toBe(false);
  });
});
