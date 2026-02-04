import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";

// Security: JWT secret validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production environment");
}

const FALLBACK_SECRET = "dev-only-secret-change-in-production";
const SECRET = JWT_SECRET || FALLBACK_SECRET;

// Configurable token expiration (default: 7 days)
// Using number of seconds for type safety
const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds
const JWT_EXPIRES_IN_DISPLAY = process.env.JWT_EXPIRES_IN || "7d";

// Token configuration
const TOKEN_CONFIG = {
  issuer: "afritalent-api",
  audience: "afritalent-app",
};

export interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface TokenResponse {
  token: string;
  expiresIn: string;
}

export function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
    issuer: TOKEN_CONFIG.issuer,
    audience: TOKEN_CONFIG.audience,
  };
  return jwt.sign(payload, SECRET, options);
}

export function verifyToken(token: string): JWTPayload {
  const options: VerifyOptions = {
    issuer: TOKEN_CONFIG.issuer,
    audience: TOKEN_CONFIG.audience,
  };
  return jwt.verify(token, SECRET, options) as JWTPayload;
}

// Get token expiration time for display
export function getTokenExpiresIn(): string {
  return JWT_EXPIRES_IN_DISPLAY;
}

// Utility to decode token without verification (for debugging)
export function decodeToken(token: string): JWTPayload | null {
  const decoded = jwt.decode(token);
  return decoded as JWTPayload | null;
}
