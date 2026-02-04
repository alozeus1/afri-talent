import { Role } from "@prisma/client";
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
export declare function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string;
export declare function verifyToken(token: string): JWTPayload;
export declare function getTokenExpiresIn(): string;
export declare function decodeToken(token: string): JWTPayload | null;
//# sourceMappingURL=jwt.d.ts.map