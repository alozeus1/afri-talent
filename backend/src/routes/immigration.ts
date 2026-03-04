// ─────────────────────────────────────────────────────────────────────────────
// Immigration Process Tracker API Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// ──────────────── Visa Templates ────────────────

interface VisaTemplate {
  visaType: string;
  country: string;
  steps: { name: string; description: string }[];
}

const VISA_TEMPLATES: VisaTemplate[] = [
  {
    visaType: "UK Skilled Worker",
    country: "United Kingdom",
    steps: [
      { name: "Get Certificate of Sponsorship", description: "Obtain a CoS from your UK employer." },
      { name: "Gather Documents", description: "Collect passport, proof of English, financial evidence, and TB test results." },
      { name: "Submit Application", description: "Apply online via the UK Visas and Immigration portal." },
      { name: "Biometrics Appointment", description: "Attend your biometrics appointment at a visa application centre." },
      { name: "Wait for Decision", description: "Processing typically takes 3-8 weeks." },
      { name: "Receive BRP", description: "Collect your Biometric Residence Permit upon arrival in the UK." },
    ],
  },
  {
    visaType: "Canada Express Entry",
    country: "Canada",
    steps: [
      { name: "Check Eligibility", description: "Verify you meet CRS score thresholds for Federal Skilled Worker, CEC, or FST." },
      { name: "Get ECA", description: "Obtain an Educational Credential Assessment for foreign degrees." },
      { name: "Language Test", description: "Take IELTS or CELPIP for English, or TEF for French." },
      { name: "Create Express Entry Profile", description: "Submit your profile to the Express Entry pool." },
      { name: "Receive ITA", description: "Wait for an Invitation to Apply based on CRS draws." },
      { name: "Submit PR Application", description: "Submit full application with documents within 60 days." },
      { name: "Medical & Background Checks", description: "Complete medical exams and police clearances." },
      { name: "Receive COPR", description: "Receive Confirmation of Permanent Residence." },
    ],
  },
  {
    visaType: "Germany Blue Card",
    country: "Germany",
    steps: [
      { name: "Secure Job Offer", description: "Get a job offer meeting the Blue Card salary threshold." },
      { name: "Degree Recognition", description: "Have your university degree recognised in Germany via anabin database." },
      { name: "Gather Documents", description: "Collect passport, employment contract, degree certificates, health insurance proof." },
      { name: "Apply at Embassy", description: "Submit visa application at the German embassy or consulate." },
      { name: "Attend Interview", description: "Attend visa interview at the embassy." },
      { name: "Receive Visa", description: "Collect your national visa (usually takes 4-12 weeks)." },
      { name: "Register in Germany", description: "Register at the local Ausländerbehörde and Einwohnermeldeamt." },
    ],
  },
  {
    visaType: "USA H-1B",
    country: "United States",
    steps: [
      { name: "Employer Files LCA", description: "Employer submits Labor Condition Application to the DOL." },
      { name: "H-1B Registration", description: "Employer registers for the H-1B lottery during the registration period." },
      { name: "Lottery Selection", description: "Wait for lottery results (March-April)." },
      { name: "File Petition", description: "Employer files Form I-129 with USCIS if selected." },
      { name: "USCIS Processing", description: "Wait for petition approval (3-6 months, or 15 days with premium processing)." },
      { name: "Visa Stamping", description: "Attend visa interview at the US embassy/consulate." },
      { name: "Enter the US", description: "Travel to the US with your H-1B visa." },
    ],
  },
  {
    visaType: "Australia Skilled Worker",
    country: "Australia",
    steps: [
      { name: "Skills Assessment", description: "Get your occupation assessed by the relevant assessing authority." },
      { name: "English Language Test", description: "Take IELTS, PTE, or TOEFL to meet language requirements." },
      { name: "Submit EOI", description: "Submit an Expression of Interest via SkillSelect." },
      { name: "Receive Invitation", description: "Wait for an invitation to apply (based on points score)." },
      { name: "Lodge Visa Application", description: "Submit the full visa application with all supporting documents." },
      { name: "Medical & Police Checks", description: "Complete health examinations and police clearances." },
      { name: "Visa Grant", description: "Receive visa grant notification." },
    ],
  },
  {
    visaType: "Netherlands Highly Skilled Migrant",
    country: "Netherlands",
    steps: [
      { name: "Employer Sponsorship", description: "Your employer must be a recognised sponsor with the IND." },
      { name: "Employer Files Application", description: "Employer submits the residence permit application to the IND." },
      { name: "IND Processing", description: "Wait for the IND decision (typically 2-4 weeks)." },
      { name: "MVV Entry Visa", description: "Collect your MVV from the Dutch embassy if required." },
      { name: "Travel to Netherlands", description: "Enter the Netherlands with your MVV." },
      { name: "Collect Residence Permit", description: "Pick up your residence permit and register at the municipality." },
    ],
  },
];

function getTemplateSteps(visaType: string): { name: string; description: string }[] {
  const template = VISA_TEMPLATES.find(
    (t) => t.visaType.toLowerCase() === visaType.toLowerCase()
  );
  return template ? template.steps : [];
}

// Validation schemas
const CreateProcessSchema = z.object({
  visaType: z.string().min(1).max(100).trim(),
  targetCountry: z.string().min(1).max(100).trim(),
  notes: z.string().max(5000).trim().optional(),
  startDate: z.coerce.date().optional(),
  expectedEndDate: z.coerce.date().optional(),
});

const UpdateProcessSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "DENIED", "EXPIRED"]).optional(),
  notes: z.string().max(5000).trim().optional(),
  expectedEndDate: z.coerce.date().optional(),
});

const CreateStepSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  dueDate: z.coerce.date().optional(),
  documents: z.array(z.string().max(255)).max(20).default([]),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const UpdateStepSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "DENIED", "EXPIRED"]).optional(),
  completedAt: z.coerce.date().nullable().optional(),
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  documents: z.array(z.string().max(255)).max(20).optional(),
});

// GET /api/immigration/templates — public list of visa templates
router.get("/templates", async (_req: Request, res: Response) => {
  const templates = VISA_TEMPLATES.map((t) => ({
    visaType: t.visaType,
    country: t.country,
    stepCount: t.steps.length,
    steps: t.steps.map((s) => s.name),
  }));

  res.json({ templates });
});

// GET /api/immigration/processes — list user's immigration processes
router.get("/processes", authenticate, async (req: Request, res: Response) => {
  try {
    const processes = await prisma.immigrationProcess.findMany({
      where: { userId: req.user!.userId },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ processes });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch immigration processes" });
  }
});

// GET /api/immigration/processes/:id — single process with steps
router.get("/processes/:id", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const process = await prisma.immigrationProcess.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!process || process.userId !== req.user!.userId) {
      res.status(404).json({ error: "Immigration process not found" });
      return;
    }

    res.json({ process });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch immigration process" });
  }
});

// POST /api/immigration/processes — create immigration process with auto-generated steps
router.post("/processes", authenticate, async (req: Request, res: Response) => {
  const parsed = CreateProcessSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const templateSteps = getTemplateSteps(parsed.data.visaType);

    const process = await prisma.immigrationProcess.create({
      data: {
        userId: req.user!.userId,
        visaType: parsed.data.visaType,
        targetCountry: parsed.data.targetCountry,
        notes: parsed.data.notes,
        startDate: parsed.data.startDate,
        expectedEndDate: parsed.data.expectedEndDate,
        steps: {
          create: templateSteps.map((step, index) => ({
            name: step.name,
            description: step.description,
            sortOrder: index,
            documents: [],
          })),
        },
      },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    res.status(201).json({ process });
  } catch (error) {
    res.status(500).json({ error: "Failed to create immigration process" });
  }
});

// PUT /api/immigration/processes/:id — update process status/notes
router.put("/processes/:id", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = UpdateProcessSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const existing = await prisma.immigrationProcess.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== req.user!.userId) {
      res.status(404).json({ error: "Immigration process not found" });
      return;
    }

    const process = await prisma.immigrationProcess.update({
      where: { id },
      data: parsed.data,
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    res.json({ process });
  } catch (error) {
    res.status(500).json({ error: "Failed to update immigration process" });
  }
});

// DELETE /api/immigration/processes/:id — delete process
router.delete("/processes/:id", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.immigrationProcess.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== req.user!.userId) {
      res.status(404).json({ error: "Immigration process not found" });
      return;
    }

    await prisma.immigrationProcess.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete immigration process" });
  }
});

// POST /api/immigration/processes/:id/steps — add custom step
router.post("/processes/:id/steps", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = CreateStepSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const process = await prisma.immigrationProcess.findUnique({
      where: { id },
    });

    if (!process || process.userId !== req.user!.userId) {
      res.status(404).json({ error: "Immigration process not found" });
      return;
    }

    const step = await prisma.immigrationStep.create({
      data: {
        processId: id,
        name: parsed.data.name,
        description: parsed.data.description,
        dueDate: parsed.data.dueDate,
        documents: parsed.data.documents,
        sortOrder: parsed.data.sortOrder,
      },
    });

    res.status(201).json({ step });
  } catch (error) {
    res.status(500).json({ error: "Failed to add step" });
  }
});

// PUT /api/immigration/processes/:id/steps/:stepId — update step status/completedAt
router.put("/processes/:id/steps/:stepId", authenticate, async (req: Request, res: Response) => {
  const { id, stepId } = req.params;
  const parsed = UpdateStepSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const process = await prisma.immigrationProcess.findUnique({
      where: { id },
    });

    if (!process || process.userId !== req.user!.userId) {
      res.status(404).json({ error: "Immigration process not found" });
      return;
    }

    const existingStep = await prisma.immigrationStep.findUnique({
      where: { id: stepId },
    });

    if (!existingStep || existingStep.processId !== id) {
      res.status(404).json({ error: "Step not found" });
      return;
    }

    const step = await prisma.immigrationStep.update({
      where: { id: stepId },
      data: parsed.data,
    });

    res.json({ step });
  } catch (error) {
    res.status(500).json({ error: "Failed to update step" });
  }
});

export default router;
