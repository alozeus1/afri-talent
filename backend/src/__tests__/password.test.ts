import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import {
  PASSWORD_HASH_COST,
  extractBcryptCost,
  hashPassword,
  isHashBelowCurrentCost,
  comparePassword,
} from "../lib/password.js";

describe("password helpers (§2.10)", () => {
  it("PASSWORD_HASH_COST is 12 per the launch master prompt", () => {
    expect(PASSWORD_HASH_COST).toBe(12);
  });

  it("hashPassword writes a cost-12 bcrypt hash", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    expect(extractBcryptCost(hash)).toBe(12);
    expect(await comparePassword("hunter2-correct-horse", hash)).toBe(true);
    expect(await comparePassword("wrong", hash)).toBe(false);
  });

  it("extractBcryptCost parses 2b/2a/2x/2y prefixes", () => {
    expect(extractBcryptCost("$2b$10$abcdef")).toBe(10);
    expect(extractBcryptCost("$2a$08$abcdef")).toBe(8);
    expect(extractBcryptCost("$2y$12$abcdef")).toBe(12);
    expect(extractBcryptCost("$2x$04$abcdef")).toBe(4);
    expect(extractBcryptCost("not-a-bcrypt-hash")).toBeNull();
  });

  it("isHashBelowCurrentCost is true for cost-10 hashes (legacy)", async () => {
    // Generate a real cost-10 hash directly via bcrypt to exercise the
    // upgrade detection path without hand-crafting prefixes.
    const legacy = await bcrypt.hash("legacy-password", 10);
    expect(extractBcryptCost(legacy)).toBe(10);
    expect(isHashBelowCurrentCost(legacy)).toBe(true);
  });

  it("isHashBelowCurrentCost is false for cost-12 hashes", async () => {
    const current = await hashPassword("current-password");
    expect(isHashBelowCurrentCost(current)).toBe(false);
  });

  it("isHashBelowCurrentCost is false for unrecognised hash formats", () => {
    expect(isHashBelowCurrentCost("not-a-bcrypt-hash")).toBe(false);
    expect(isHashBelowCurrentCost("")).toBe(false);
  });
});
