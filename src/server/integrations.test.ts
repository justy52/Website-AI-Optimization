import { describe, expect, it } from "vitest";

import { createCredentialKeyRing } from "@/security/credential-encryption";

import {
  decryptSearchConsoleTokenPayload,
  encryptRefreshedSearchConsoleTokenPayload,
  encryptSearchConsoleTokenPayload,
} from "./integrations";

describe("Search Console integration token storage", () => {
  it("reads an old-version token and stores the refreshed token under the current version", () => {
    const keyV1 = "phase4a-search-console-key-v1-at-least-32-bytes";
    const keyV2 = "phase4a-search-console-key-v2-at-least-32-bytes";
    const initialRing = createCredentialKeyRing({
      currentVersion: "v1",
      currentKeyMaterial: keyV1,
    });
    const rotationRing = createCredentialKeyRing({
      currentVersion: "v2",
      currentKeyMaterial: keyV2,
      previousKeys: { v1: keyV1 },
    });
    const oldEncrypted = encryptSearchConsoleTokenPayload(
      {
        accessToken: "old-access-token",
        refreshToken: "stable-refresh-token",
        expiresAt: new Date("2026-09-08T10:00:00.000Z"),
        scope: ["https://www.googleapis.com/auth/webmasters.readonly"],
        tokenType: "Bearer",
      },
      initialRing,
    );

    expect(oldEncrypted.keyVersion).toBe("v1");
    expect(
      decryptSearchConsoleTokenPayload(oldEncrypted, rotationRing),
    ).toMatchObject({
      accessToken: "old-access-token",
      refreshToken: "stable-refresh-token",
    });

    const { payload, encrypted } = encryptRefreshedSearchConsoleTokenPayload({
      refreshed: {
        accessToken: "new-access-token",
        refreshToken: "stable-refresh-token",
        expiresAt: new Date("2026-09-08T11:00:00.000Z"),
        scope: [],
        tokenType: "Bearer",
      },
      fallbackScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      keyRing: rotationRing,
    });

    expect(payload).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "stable-refresh-token",
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    expect(encrypted.keyVersion).toBe("v2");
    expect(decryptSearchConsoleTokenPayload(encrypted, rotationRing)).toEqual(
      payload,
    );
    expect(() =>
      decryptSearchConsoleTokenPayload(encrypted, initialRing),
    ).toThrow("Credential encryption key version is unavailable.");
  });
});
