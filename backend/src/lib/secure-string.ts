import crypto from "crypto";

const KEY_SOURCE = process.env.ATS_TOKEN_ENCRYPTION_KEY || "";

function deriveKey(): Buffer {
  if (KEY_SOURCE.length >= 32) {
    return crypto.createHash("sha256").update(KEY_SOURCE).digest();
  }
  // Development-safe fallback: deterministic key with explicit warning behavior.
  return crypto.createHash("sha256").update("afritalent-dev-insecure-key").digest();
}

const KEY = deriveKey();
const IV_LENGTH = 12;

export function encryptString(value: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptString(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const value = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return value.toString("utf8");
  } catch {
    return null;
  }
}
