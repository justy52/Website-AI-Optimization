import { describe, expect, it } from "vitest";

import {
  createCredentialKeyRing,
  credentialKeyRingFromEnv,
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "./credential-encryption";

describe("credential encryption", () => {
  it("round-trips OAuth secrets without storing plaintext", () => {
    const keyMaterial = "phase4a-test-key-material-v1-at-least-32-bytes";
    const keyRing = createCredentialKeyRing({
      currentVersion: "v1",
      currentKeyMaterial: keyMaterial,
    });
    const plaintext = JSON.stringify({
      accessToken: "access-token-canary",
      refreshToken: "refresh-token-canary",
    });
    const encrypted = encryptCredentialSecret(plaintext, keyRing);

    expect(encrypted.keyVersion).toBe("v1");
    expect(encrypted.ciphertext).not.toContain("access-token-canary");
    expect(encrypted.ciphertext).not.toContain("refresh-token-canary");
    expect(decryptCredentialSecret(encrypted, keyRing)).toBe(plaintext);
  });

  it("fails closed with the wrong key", () => {
    const encrypted = encryptCredentialSecret("secret", createCredentialKeyRing({
      currentVersion: "v1",
      currentKeyMaterial: "phase4a-test-key-material-v1-at-least-32-bytes",
    }));

    expect(() =>
      decryptCredentialSecret(encrypted, createCredentialKeyRing({
        currentVersion: "v1",
        currentKeyMaterial: "different-phase4a-test-key-at-least-32-bytes",
      })),
    ).toThrow();
  });

  it("keeps old and new credential versions readable during rotation", () => {
    const keyV1 = "phase4a-test-key-material-v1-at-least-32-bytes";
    const keyV2 = "phase4a-test-key-material-v2-at-least-32-bytes";
    const initialRing = createCredentialKeyRing({
      currentVersion: "v1",
      currentKeyMaterial: keyV1,
    });
    const rotationRing = createCredentialKeyRing({
      currentVersion: "v2",
      currentKeyMaterial: keyV2,
      previousKeys: { v1: keyV1 },
    });
    const oldCiphertext = encryptCredentialSecret("old-secret", initialRing);
    const newCiphertext = encryptCredentialSecret("new-secret", rotationRing);

    expect(newCiphertext.keyVersion).toBe("v2");
    expect(decryptCredentialSecret(oldCiphertext, rotationRing)).toBe(
      "old-secret",
    );
    expect(decryptCredentialSecret(newCiphertext, rotationRing)).toBe(
      "new-secret",
    );
  });

  it("fails closed when an old stored key version is removed", () => {
    const oldRing = createCredentialKeyRing({
      currentVersion: "v1",
      currentKeyMaterial: "phase4a-test-key-material-v1-at-least-32-bytes",
    });
    const newOnlyRing = createCredentialKeyRing({
      currentVersion: "v2",
      currentKeyMaterial: "phase4a-test-key-material-v2-at-least-32-bytes",
    });
    const encrypted = encryptCredentialSecret("old-secret", oldRing);

    expect(() => decryptCredentialSecret(encrypted, newOnlyRing)).toThrow(
      "Credential encryption key version is unavailable.",
    );
  });

  it("uses the stored key version without falling back to unrelated versions", () => {
    const keyV1 = "phase4a-test-key-material-v1-at-least-32-bytes";
    const keyV2 = "phase4a-test-key-material-v2-at-least-32-bytes";
    const ring = createCredentialKeyRing({
      currentVersion: "v2",
      currentKeyMaterial: keyV2,
      previousKeys: { v1: keyV1 },
    });
    const encrypted = encryptCredentialSecret("stored-under-v1", {
      currentVersion: "v1",
      keys: { v1: keyV1 },
    });
    const tamperedVersion = { ...encrypted, keyVersion: "v2" };

    expect(() =>
      decryptCredentialSecret(tamperedVersion, ring),
    ).toThrow();
  });

  it("parses an environment-managed previous-key ring", () => {
    const keyRing = credentialKeyRingFromEnv({
      CREDENTIAL_KEY_VERSION: "v2",
      CREDENTIAL_ENCRYPTION_KEY:
        "phase4a-test-key-material-v2-at-least-32-bytes",
      CREDENTIAL_ENCRYPTION_KEY_RING: JSON.stringify({
        v1: "phase4a-test-key-material-v1-at-least-32-bytes",
      }),
    });

    expect(keyRing.currentVersion).toBe("v2");
    expect(Object.keys(keyRing.keys).sort()).toEqual(["v1", "v2"]);
  });

  it("rejects ambiguous current-version key material in the key ring", () => {
    expect(() =>
      credentialKeyRingFromEnv({
        CREDENTIAL_KEY_VERSION: "v2",
        CREDENTIAL_ENCRYPTION_KEY:
          "phase4a-test-key-material-v2-at-least-32-bytes",
        CREDENTIAL_ENCRYPTION_KEY_RING: JSON.stringify({
          v2: "different-phase4a-test-key-at-least-32-bytes",
        }),
      }),
    ).toThrow("current version must match");
  });
});
