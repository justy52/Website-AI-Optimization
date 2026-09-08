import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const algorithm = "AES-256-GCM";
const nodeAlgorithm = "aes-256-gcm";
const nonceLength = 12;
const minimumKeyMaterialLength = 32;

export type EncryptedSecretPayload = {
  algorithm: typeof algorithm;
  keyVersion: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
};

export type CredentialKeyRing = {
  currentVersion: string;
  keys: Readonly<Record<string, string>>;
};

export type CredentialKeyRingEnv = {
  CREDENTIAL_ENCRYPTION_KEY: string;
  CREDENTIAL_KEY_VERSION: string;
  CREDENTIAL_ENCRYPTION_KEY_RING?: string | null;
};

function keyBytes(keyMaterial: string): Buffer {
  const trimmed = keyMaterial.trim();

  try {
    const decoded = Buffer.from(trimmed, "base64");

    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall back to deterministic hashing below for non-base64 local keys.
  }

  return createHash("sha256").update(trimmed).digest();
}

function assertUsableKeyMaterial(keyMaterial: string, label: string) {
  if (keyMaterial.trim().length < minimumKeyMaterialLength) {
    throw new Error(`${label} must be at least 32 characters long.`);
  }
}

function parsePreviousKeyRing(serialized: string | null | undefined) {
  if (!serialized) return {};

  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY_RING must be valid JSON.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY_RING must be a JSON object keyed by version.",
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const keyRing: Record<string, string> = {};

  for (const [version, keyMaterial] of entries) {
    const normalizedVersion = version.trim();

    if (!normalizedVersion) {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY_RING contains an empty key version.",
      );
    }

    if (typeof keyMaterial !== "string") {
      throw new Error(
        `CREDENTIAL_ENCRYPTION_KEY_RING value for version ${normalizedVersion} must be a string.`,
      );
    }

    assertUsableKeyMaterial(
      keyMaterial,
      `CREDENTIAL_ENCRYPTION_KEY_RING[${normalizedVersion}]`,
    );
    keyRing[normalizedVersion] = keyMaterial;
  }

  return keyRing;
}

export function createCredentialKeyRing(input: {
  currentVersion: string;
  currentKeyMaterial: string;
  previousKeys?: Record<string, string>;
}): CredentialKeyRing {
  const currentVersion = input.currentVersion.trim();
  const currentKeyMaterial = input.currentKeyMaterial.trim();
  const keys: Record<string, string> = {};

  if (!currentVersion) {
    throw new Error("CREDENTIAL_KEY_VERSION is required.");
  }

  assertUsableKeyMaterial(currentKeyMaterial, "CREDENTIAL_ENCRYPTION_KEY");

  for (const [version, keyMaterial] of Object.entries(
    input.previousKeys ?? {},
  )) {
    const normalizedVersion = version.trim();

    if (!normalizedVersion) {
      throw new Error("Credential key ring contains an empty key version.");
    }

    assertUsableKeyMaterial(
      keyMaterial,
      `Credential key ring[${normalizedVersion}]`,
    );
    keys[normalizedVersion] = keyMaterial;
  }

  if (
    keys[currentVersion] !== undefined &&
    keys[currentVersion] !== currentKeyMaterial
  ) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY_RING current version must match CREDENTIAL_ENCRYPTION_KEY.",
    );
  }

  keys[currentVersion] = currentKeyMaterial;

  return {
    currentVersion,
    keys,
  };
}

export function credentialKeyRingFromEnv(
  env: CredentialKeyRingEnv,
): CredentialKeyRing {
  return createCredentialKeyRing({
    currentVersion: env.CREDENTIAL_KEY_VERSION,
    currentKeyMaterial: env.CREDENTIAL_ENCRYPTION_KEY,
    previousKeys: parsePreviousKeyRing(env.CREDENTIAL_ENCRYPTION_KEY_RING),
  });
}

export function encryptCredentialSecret(
  plaintext: string,
  keyRing: CredentialKeyRing,
): EncryptedSecretPayload {
  if (!plaintext) {
    throw new Error("Credential plaintext is required.");
  }

  const keyMaterial = keyRing.keys[keyRing.currentVersion];

  if (!keyMaterial) {
    throw new Error("Current credential key version is not configured.");
  }

  const nonce = randomBytes(nonceLength);
  const cipher = createCipheriv(
    nodeAlgorithm,
    keyBytes(keyMaterial),
    nonce,
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm,
    keyVersion: keyRing.currentVersion,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredentialSecret(
  encrypted: EncryptedSecretPayload,
  keyRing: CredentialKeyRing,
): string {
  if (encrypted.algorithm !== algorithm) {
    throw new Error("Unsupported credential encryption algorithm.");
  }

  const keyMaterial = keyRing.keys[encrypted.keyVersion];

  if (!keyMaterial) {
    throw new Error("Credential encryption key version is unavailable.");
  }

  const decipher = createDecipheriv(
    nodeAlgorithm,
    keyBytes(keyMaterial),
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
