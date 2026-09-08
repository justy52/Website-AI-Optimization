import { describe, expect, it } from "vitest";

import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "./credential-encryption";

describe("credential encryption", () => {
  it("round-trips OAuth secrets without storing plaintext", () => {
    const keyMaterial = "phase4a-test-key-material-at-least-32-bytes";
    const plaintext = JSON.stringify({
      accessToken: "access-token-canary",
      refreshToken: "refresh-token-canary",
    });
    const encrypted = encryptCredentialSecret(plaintext, {
      keyMaterial,
      keyVersion: "test",
    });

    expect(encrypted.ciphertext).not.toContain("access-token-canary");
    expect(encrypted.ciphertext).not.toContain("refresh-token-canary");
    expect(decryptCredentialSecret(encrypted, { keyMaterial })).toBe(plaintext);
  });

  it("fails closed with the wrong key", () => {
    const encrypted = encryptCredentialSecret("secret", {
      keyMaterial: "phase4a-test-key-material-at-least-32-bytes",
      keyVersion: "test",
    });

    expect(() =>
      decryptCredentialSecret(encrypted, {
        keyMaterial: "different-phase4a-test-key-at-least-32-bytes",
      }),
    ).toThrow();
  });
});
