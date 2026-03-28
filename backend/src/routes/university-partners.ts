import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { Prisma, Role, UniversityPartnerStatus, UniversityRecordStatus, UniversityRecordType } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import logger from "../lib/logger.js";

const router = Router();

interface PartnerRequest extends Request {
  partner?: {
    id: string;
    externalId: string;
    name: string;
  };
}

const createPartnerSchema = z.object({
  externalId: z.string().min(3).max(120),
  name: z.string().min(2).max(200),
  country: z.string().length(2),
  website: z.string().url().optional(),
  apiKey: z.string().min(24).max(200),
});

const internshipSchema = z.object({
  externalRecordId: z.string().min(2).max(120),
  title: z.string().min(2).max(200),
  description: z.string().min(20).max(5000),
  location: z.string().max(120).optional(),
  country: z.string().max(100).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  skills: z.array(z.string().max(80)).max(50).optional(),
  slots: z.number().int().min(1).max(10000).optional(),
});

const graduatePipelineSchema = z.object({
  externalRecordId: z.string().min(2).max(120),
  programName: z.string().min(2).max(200),
  graduationYear: z.number().int().min(2000).max(2100),
  students: z.array(
    z.object({
      externalStudentId: z.string().min(2).max(120),
      fullName: z.string().min(2).max(200),
      emailHash: z.string().max(128).optional(),
      major: z.string().max(120).optional(),
      skills: z.array(z.string().max(80)).max(100).optional(),
    }),
  ).min(1).max(1000),
});

const skillsVerificationSchema = z.object({
  externalRecordId: z.string().min(2).max(120),
  externalStudentId: z.string().min(2).max(120),
  skillName: z.string().min(2).max(120),
  score: z.number().min(0).max(100).optional(),
  level: z.string().max(50).optional(),
  verificationProvider: z.string().max(120).optional(),
  verifiedAt: z.coerce.date().optional(),
});

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function authenticatePartnerKey(req: PartnerRequest, res: Response, next: NextFunction) {
  const key = req.headers["x-afritalent-partner-key"]?.toString();
  if (!key) {
    res.status(401).json({ error: "Partner API key required" });
    return;
  }

  const partner = await prisma.universityPartner.findFirst({
    where: {
      apiKeyHash: sha256(key),
      status: UniversityPartnerStatus.ACTIVE,
    },
    select: { id: true, externalId: true, name: true },
  });

  if (!partner) {
    res.status(401).json({ error: "Invalid partner API key" });
    return;
  }

  req.partner = partner;
  next();
}

async function ingestPartnerRecord(params: {
  partnerId: string;
  type: UniversityRecordType;
  externalRecordId: string;
  payload: Prisma.InputJsonValue;
}) {
  return prisma.universityPartnerRecord.upsert({
    where: {
      partnerId_type_externalRecordId: {
        partnerId: params.partnerId,
        type: params.type,
        externalRecordId: params.externalRecordId,
      },
    },
    create: {
      partnerId: params.partnerId,
      type: params.type,
      externalRecordId: params.externalRecordId,
      payload: params.payload,
      status: UniversityRecordStatus.RECEIVED,
    },
    update: {
      payload: params.payload,
      status: UniversityRecordStatus.VALIDATED,
      processedAt: new Date(),
    },
  });
}

router.use(requireFeatureFlag("PHASE4_UNIVERSITY_API_ENABLED"));

router.post("/admin/partners", authenticate, authorize(Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createPartnerSchema.parse(req.body);
    const partner = await prisma.universityPartner.create({
      data: {
        externalId: data.externalId,
        name: data.name,
        country: data.country.toUpperCase(),
        website: data.website || null,
        apiKeyHash: sha256(data.apiKey),
      },
    });

    res.status(201).json({
      partner: {
        id: partner.id,
        externalId: partner.externalId,
        name: partner.name,
        country: partner.country,
        status: partner.status,
        createdAt: partner.createdAt,
      },
      keyAccepted: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to create university partner");
    res.status(500).json({ error: "Failed to create university partner" });
  }
});

router.get("/admin/partners", authenticate, authorize(Role.ADMIN), async (_req: Request, res: Response) => {
  const partners = await prisma.universityPartner.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      externalId: true,
      name: true,
      country: true,
      website: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ partners });
});

router.use(authenticatePartnerKey);

router.get("/ingest", async (req: PartnerRequest, res: Response) => {
  const typeQuery = req.query.type as UniversityRecordType | undefined;
  const statusQuery = req.query.status as UniversityRecordStatus | undefined;
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const records = await prisma.universityPartnerRecord.findMany({
    where: {
      partnerId: req.partner!.id,
      ...(typeQuery ? { type: typeQuery } : {}),
      ...(statusQuery ? { status: statusQuery } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  res.json({
    partner: req.partner,
    records,
  });
});

router.post("/ingest/internships", async (req: PartnerRequest, res: Response) => {
  try {
    const payload = internshipSchema.parse(req.body);
    const record = await ingestPartnerRecord({
      partnerId: req.partner!.id,
      type: UniversityRecordType.INTERNSHIP,
      externalRecordId: payload.externalRecordId,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    res.status(201).json({ record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to ingest internship record");
    res.status(500).json({ error: "Failed to ingest internship record" });
  }
});

router.post("/ingest/graduates", async (req: PartnerRequest, res: Response) => {
  try {
    const payload = graduatePipelineSchema.parse(req.body);
    const record = await ingestPartnerRecord({
      partnerId: req.partner!.id,
      type: UniversityRecordType.GRADUATE_PIPELINE,
      externalRecordId: payload.externalRecordId,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    res.status(201).json({ record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to ingest graduate pipeline record");
    res.status(500).json({ error: "Failed to ingest graduate pipeline record" });
  }
});

router.post("/ingest/skills-verifications", async (req: PartnerRequest, res: Response) => {
  try {
    const payload = skillsVerificationSchema.parse(req.body);
    const record = await ingestPartnerRecord({
      partnerId: req.partner!.id,
      type: UniversityRecordType.SKILLS_VERIFICATION,
      externalRecordId: payload.externalRecordId,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    res.status(201).json({ record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to ingest skills verification record");
    res.status(500).json({ error: "Failed to ingest skills verification record" });
  }
});

export default router;
