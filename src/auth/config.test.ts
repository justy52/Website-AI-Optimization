import { describe, expect, it } from "vitest";

import { authSchema } from "@/db/schema";

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("Better Auth foundation", () => {
  it("wires GET and POST route handlers for the catch-all auth route", () => {
    expect(typeof GET).toBe("function");
    expect(typeof POST).toBe("function");
  });

  it("keeps the Better Auth schema tables explicit", () => {
    expect(Object.keys(authSchema).sort()).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });
});
