import crypto from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

// §2.10 — admin TOTP MFA.
//
// otplib (v13 functional API) provides RFC 6238 TOTP generation and
// verification. Secrets are encrypted at rest with AES-256-GCM using
// `TOTP_ENCRYPTION_KEY` (or `JWT_SECRET` as fallback during interim
// deploys). KMS-managed key envelope migration is a follow-up — the
// encrypt/decrypt API stays the same shape so swapping the key source
// is a one-line change.

const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12;  // AES-GCM standard nonce size
const TAG_LENGTH = 16; // AES-GCM tag

// 30-second TOTP step with one period of skew tolerance on each side.
// epochTolerance=30 (number form) = symmetric ±30s.
const VERIFY_EPOCH_TOLERANCE = 30;

function getEncryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      "TOTP encryption: TOTP_ENCRYPTION_KEY or JWT_SECRET must be set.",
    );
  }
  // Derive a 32-byte key via SHA-256 so any-length env value works safely.
  return crypto.createHash("sha256").update(raw).digest();
}

export function generateTotpSecret(): string {
  // 20 random bytes base32-encoded gives an RFC 6238-compliant secret.
  return generateSecret({ length: 20 });
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  try {
    const result = verifySync({
      strategy: "totp",
      token: code,
      secret,
      epochTolerance: VERIFY_EPOCH_TOLERANCE,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

export function buildProvisioningUri(params: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  return generateURI({
    strategy: "totp",
    issuer: params.issuer || "AfriTalent",
    label: params.email,
    secret: params.secret,
  });
}

export function encryptTotpSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv || tag || ciphertext, base64-encoded.
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptTotpSecret(encoded: string): string {
  const key = getEncryptionKey();
  const blob = Buffer.from(encoded, "base64");
  if (blob.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("encrypted TOTP secret is too short");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export const TOTP_KEY_LENGTH_BYTES = KEY_LENGTH;
