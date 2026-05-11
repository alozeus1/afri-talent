import { describe, expect, it } from "vitest";
import { generateSync } from "otplib";
import {
  buildProvisioningUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from "../lib/totp.js";

describe("TOTP helpers (§2.10)", () => {
  it("generateTotpSecret returns a base32-encoded string of usable length", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+=*$/); // RFC 4648 base32 alphabet
    expect(s.length).toBeGreaterThanOrEqual(20);
  });

  it("verifyTotpCode accepts a code generated for the same secret", () => {
    const secret = generateTotpSecret();
    const code = generateSync({ strategy: "totp", secret });
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("verifyTotpCode rejects a code generated for a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeB = generateSync({ strategy: "totp", secret: secretB });
    expect(verifyTotpCode(secretA, codeB)).toBe(false);
  });

  it("verifyTotpCode handles empty/garbage input without throwing", () => {
    expect(verifyTotpCode("", "")).toBe(false);
    expect(verifyTotpCode(generateTotpSecret(), "000000")).toBe(false);
    expect(verifyTotpCode("not-a-secret", "abcdef")).toBe(false);
  });

  it("buildProvisioningUri emits an otpauth://totp URI with issuer + label", () => {
    const secret = generateTotpSecret();
    const uri = buildProvisioningUri({
      email: "admin@afritalent.com",
      secret,
      issuer: "AfriTalent",
    });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("AfriTalent");
    expect(uri).toContain("admin");
    expect(uri).toContain("secret=");
  });

  it("encryptTotpSecret/decryptTotpSecret round-trip", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toBe(secret);
    // Same plaintext should produce different ciphertext on each call (random IV)
    expect(encryptTotpSecret(secret)).not.toBe(encrypted);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("decryptTotpSecret refuses tampered ciphertext", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    // Flip a byte deep in the ciphertext — AES-GCM tag verification fails.
    const corrupted = Buffer.from(encrypted, "base64");
    corrupted[corrupted.length - 1] ^= 0x01;
    expect(() => decryptTotpSecret(corrupted.toString("base64"))).toThrow();
  });
});
