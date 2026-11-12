import { describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email";

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
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/owner@example|Subject line|Body text|test-key/);
    } finally { error.mockRestore(); }
  });
});
