import { describe, expect, it } from "vitest";

import { authSchema } from "@/db/schema";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "@/app/api/auth/[...all]/route";

describe("Better Auth foundation", () => {
  it("wires the Better Auth catch-all route handlers", () => {
    for (const handler of [DELETE, GET, PATCH, POST, PUT]) {
      expect(typeof handler).toBe("function");
    }
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
