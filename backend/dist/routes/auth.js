import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { signToken, getTokenExpiresIn } from "../lib/jwt.js";
import { authenticate } from "../middleware/auth.js";
import { authLimiter, registerLimiter } from "../middleware/security.js";
import { blockToken } from "../lib/redis.js";
const router = Router();
const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: COOKIE_MAX_AGE_MS,
        path: "/",
    });
}
function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
    });
}
// Validation schemas with improved security rules
const registerSchema = z.object({
    email: z.string().email().max(255).toLowerCase(),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must not exceed 128 characters")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
    name: z.string().min(2).max(100).trim(),
    role: z.enum(["CANDIDATE", "EMPLOYER"]),
    companyName: z.string().max(200).trim().optional(),
    location: z.string().max(200).trim().optional(),
});
const loginSchema = z.object({
    email: z.string().email().max(255).toLowerCase(),
    password: z.string().max(128),
});
// POST /api/auth/register - with strict rate limiting
router.post("/register", registerLimiter, async (req, res) => {
    try {
        const data = registerSchema.parse(req.body);
        if (data.role === "EMPLOYER" && (!data.companyName || !data.location)) {
            res.status(400).json({ error: "Employer registration requires companyName and location" });
            return;
        }
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingUser) {
            res.status(400).json({ error: "Email already registered" });
            return;
        }
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const user = await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                role: data.role,
            },
        });
        // If employer, create employer profile
        if (data.role === "EMPLOYER") {
            await prisma.employer.create({
                data: {
                    userId: user.id,
                    companyName: data.companyName,
                    location: data.location || "Remote",
                },
            });
        }
        const token = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });
        setAuthCookie(res, token);
        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            expiresIn: getTokenExpiresIn(),
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/auth/login - with rate limiting
router.post("/login", authLimiter, async (req, res) => {
    try {
        const data = loginSchema.parse(req.body);
        const user = await prisma.user.findUnique({
            where: { email: data.email },
            include: { employer: true },
        });
        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        const validPassword = await bcrypt.compare(data.password, user.password);
        if (!validPassword) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        const token = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });
        setAuthCookie(res, token);
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                employer: user.employer,
            },
            expiresIn: getTokenExpiresIn(),
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/auth/logout - revoke token and clear cookie
router.post("/logout", authenticate, async (req, res) => {
    try {
        const token = req.rawToken;
        const exp = req.user?.exp;
        if (token && exp) {
            const ttlSeconds = exp - Math.floor(Date.now() / 1000);
            if (ttlSeconds > 0) {
                await blockToken(token, ttlSeconds);
            }
        }
        clearAuthCookie(res);
        res.json({ message: "Logged out successfully" });
    }
    catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { employer: true },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            employer: user.employer,
        });
    }
    catch (error) {
        console.error("Me error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
//# sourceMappingURL=auth.js.map