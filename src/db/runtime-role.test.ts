import { describe, expect, it } from "vitest";
import { assertRuntimeRole } from "./runtime-role";

describe("runtime database identity", () => {
  for (const row of [
    { role_name: "owner", unsafe: false },
    { role_name: "virelantic_runtime", unsafe: true },
  ]) {
    it(`rejects ${JSON.stringify(row)}`, async () => {
      const client = { query: async () => ({ rows: [row] }) };
      await expect(assertRuntimeRole(client as never)).rejects.toThrow("Unsafe database runtime role");
    });
  }
  it("rejects an absent identity", async () => {
    await expect(assertRuntimeRole({ query: async () => ({ rows: [] }) } as never)).rejects.toThrow("Unsafe database runtime role");
  });
});
