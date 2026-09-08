import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const algorithm = "AES-256-GCM";
const nodeAlgorithm = "aes-256-gcm";
const nonceLength = 12;

export type EncryptedSecretPayload = {
  algorithm: typeof algorithm;
  keyVersion: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
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

export function encryptCredentialSecret(
  plaintext: string,
  options: { keyMaterial: string; keyVersion: string },
): EncryptedSecretPayload {
  if (!plaintext) {
    throw new Error("Credential plaintext is required.");
  }

  const nonce = randomBytes(nonceLength);
  const cipher = createCipheriv(
    nodeAlgorithm,
    keyBytes(options.keyMaterial),
    nonce,
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm,
    keyVersion: options.keyVersion,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredentialSecret(
  encrypted: EncryptedSecretPayload,
  options: { keyMaterial: string },
): string {
  if (encrypted.algorithm !== algorithm) {
    throw new Error("Unsupported credential encryption algorithm.");
  }

  const decipher = createDecipheriv(
    nodeAlgorithm,
    keyBytes(options.keyMaterial),
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
