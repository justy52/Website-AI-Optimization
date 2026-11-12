import { describe, expect, it } from "vitest";

import { isSignedNotice, noticeUrl } from "./notice";

describe("signed page notices", () => {
  it("accepts only a message this server signed", () => {
    const url = new URL(noticeUrl("/leads", "Company name is required."), "https://example.test");
    const message = url.searchParams.get("problem")!;
    const signature = url.searchParams.get("sig")!;
    expect(url.pathname).toBe("/leads");
    expect(isSignedNotice(message, signature)).toBe(true);
    expect(isSignedNotice("Send your password to attacker@example.test", signature)).toBe(false);
    expect(isSignedNotice(message, "")).toBe(false);
    expect(isSignedNotice(message, `${signature}x`)).toBe(false);
  });

  it("keeps an existing query string and bounds the message length", () => {
    const url = new URL(noticeUrl("/work-plan?clientId=abc", "x".repeat(1000)), "https://example.test");
    expect(url.searchParams.get("clientId")).toBe("abc");
    expect(url.searchParams.get("problem")).toHaveLength(300);
    expect(isSignedNotice(url.searchParams.get("problem")!, url.searchParams.get("sig")!)).toBe(true);
  });
});
