import bcrypt from "bcrypt";

// §2.10 — bcrypt cost factor. New hashes are written at this cost. Existing
// hashes below it are transparently rehashed on successful login.
export const PASSWORD_HASH_COST = 12;

const BCRYPT_COST_PATTERN = /^\$2[abxy]\$(\d{2})\$/;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, PASSWORD_HASH_COST);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plainText, hash);
}

export function extractBcryptCost(hash: string): number | null {
  const match = BCRYPT_COST_PATTERN.exec(hash);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function isHashBelowCurrentCost(hash: string): boolean {
  const cost = extractBcryptCost(hash);
  if (cost === null) return false; // unrecognised hash — leave it alone
  return cost < PASSWORD_HASH_COST;
}
