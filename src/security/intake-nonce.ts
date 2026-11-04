import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function intakeHash(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

export function issueIntakeNonce(secret: string, time = Date.now()) {
  const payload = `${time}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${intakeHash(secret, "nonce", payload)}`;
}

export function verifyIntakeNonce(secret: string, nonce: string, time = Date.now()) {
  const parts = nonce.split(".");
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const age = time - Number(parts[0]);
  if (age < 2000 || age > 30 * 60 * 1000) return false;
  return timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(intakeHash(secret, "nonce", `${parts[0]}.${parts[1]}`), "hex"));
}
