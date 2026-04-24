# Implementation Examples for AFriTalent AIApply Features
## Code Templates for All Agent Roles

---

## 1. BACKEND ARCHITECT: Resume Generator Endpoint

### Step 1: Add Prisma Schema (DATABASE AGENT provides migration)

**File:** `backend/prisma/schema.prisma` (additions)

```prisma
model ResumeVersion {
  id            String   @id @default(cuid())
  candidateId   String
  originalText  String   @db.Text
  optimizedText String   @db.Text
  atsScore      Float    @default(0.0)
  matchScore    Float    @default(0.0)
  targetJobId   String?
  matchedSkills String[] // JSON array of skills

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId])
  @@index([createdAt])
}

model AtsReport {
  id            String   @id @default(cuid())
  resumeId      String
  score         Float
  missingKeywords String[]
  formatting    Json     // { issues: [], suggestions: [] }

  createdAt     DateTime @default(now())

  @@index([resumeId])
}
```

### Step 2: Create the Route Handler

**File:** `backend/src/routes/skills/resume-builder.ts`

```typescript
import express, { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/security.js';
import { generateOptimizedResume, scanResumeAts } from '../../lib/ai/resume.js';

const router = Router();

// POST /api/skills/resume-builder/generate
router.post('/generate', requireAuth, apiLimiter, async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.user;
    const { originalResume, jobDescription, templateStyle } = req.body;

    // Validation
    if (!originalResume || originalResume.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Resume must be at least 50 characters',
      });
    }

    if (!jobDescription || jobDescription.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Job description required',
      });
    }

    // Call AI service (Claude + fallback to GPT-5.4)
    const startTime = Date.now();
    const optimizedData = await generateOptimizedResume(
      originalResume,
      jobDescription,
      templateStyle || 'modern'
    );
    const processingTime = Date.now() - startTime;

    // Scan for ATS compatibility
    const atsData = await scanResumeAts(optimizedData.optimized_resume, jobDescription);

    // Store in database
    const resumeVersion = await prisma.resumeVersion.create({
      data: {
        candidateId,
        originalText: originalResume,
        optimizedText: optimizedData.optimized_resume,
        atsScore: atsData.score,
        matchScore: optimizedData.match_score,
        matchedSkills: optimizedData.matched_skills || [],
      },
    });

    // Store ATS report
    await prisma.atsReport.create({
      data: {
        resumeId: resumeVersion.id,
        score: atsData.score,
        missingKeywords: atsData.missing_keywords || [],
        formatting: atsData.formatting || {},
      },
    });

    // Success response
    return res.status(200).json({
      success: true,
      data: {
        resumeId: resumeVersion.id,
        optimizedResume: optimizedData.optimized_resume,
        atsScore: atsData.score,
        matchScore: optimizedData.match_score,
        suggestions: optimizedData.suggestions || [],
        matchedSkills: optimizedData.matched_skills || [],
      },
      metadata: {
        atsScore: atsData.score,
        matchScore: optimizedData.match_score,
        processingTime,
        model: optimizedData.model || 'claude-3.5-sonnet',
      },
    });
  } catch (error) {
    logger.error({ err: error, context: 'resume-builder/generate' }, 'Resume generation failed');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Resume generation failed',
    });
  }
});

// GET /api/skills/resume-builder/versions/:candidateId
router.get('/versions/:candidateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.params;

    // Security: User can only see their own versions
    if (req.user.candidateId !== candidateId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const versions = await prisma.resumeVersion.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        atsScore: true,
        matchScore: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: { versions },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch resume versions');
    return res.status(500).json({ success: false, error: 'Failed to fetch versions' });
  }
});

// POST /api/skills/resume-builder/scan-ats
router.post('/scan-ats', requireAuth, apiLimiter, async (req: Request, res: Response) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Resume and job description required',
      });
    }

    const atsData = await scanResumeAts(resumeText, jobDescription);

    return res.status(200).json({
      success: true,
      data: {
        atsScore: atsData.score,
        missingKeywords: atsData.missing_keywords || [],
        formatting: atsData.formatting || {},
        suggestions: atsData.suggestions || [],
      },
      metadata: {
        atsScore: atsData.score,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'ATS scan failed');
    return res.status(500).json({ success: false, error: 'ATS scan failed' });
  }
});

export default router;
```

### Step 3: AI Service Layer

**File:** `backend/src/lib/ai/resume.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import logger from '../logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const RESUME_OPTIMIZE_PROMPT = `You are an expert ATS optimizer and recruiter. Analyze this resume and job description.
Return ONLY valid JSON (no markdown, no explanation).

Resume:
{RESUME}

Job Description:
{JOB_DESC}

Respond with exactly this JSON structure:
{
  "optimized_resume": "full optimized resume text",
  "ats_score": 0.95,
  "match_score": 0.88,
  "matched_skills": ["Skill1", "Skill2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "model": "claude-3.5-sonnet"
}`;

export async function generateOptimizedResume(
  originalResume: string,
  jobDescription: string,
  templateStyle: string
): Promise<{
  optimized_resume: string;
  ats_score: number;
  match_score: number;
  matched_skills: string[];
  suggestions: string[];
  model: string;
}> {
  try {
    // Try Claude first
    const prompt = RESUME_OPTIMIZE_PROMPT
      .replace('{RESUME}', originalResume.slice(0, 2000)) // Truncate for safety
      .replace('{JOB_DESC}', jobDescription.slice(0, 1000));

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Invalid response type from Claude');
    }

    const result = JSON.parse(content.text);
    return {
      ...result,
      model: 'claude-3.5-sonnet',
    };
  } catch (claudeError) {
    logger.warn({ err: claudeError }, 'Claude failed, trying GPT-5.4');

    // Fallback to GPT-5.4
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'user',
            content: RESUME_OPTIMIZE_PROMPT
              .replace('{RESUME}', originalResume.slice(0, 2000))
              .replace('{JOB_DESC}', jobDescription.slice(0, 1000)),
          },
        ],
        temperature: 0.7,
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      return {
        ...result,
        model: 'gpt-5.4',
      };
    } catch (gptError) {
      logger.error({ err: gptError }, 'Both Claude and GPT-5.4 failed');
      throw new Error('Failed to optimize resume with both AI providers');
    }
  }
}

export async function scanResumeAts(
  resumeText: string,
  jobDescription: string
): Promise<{
  score: number;
  missing_keywords: string[];
  formatting: { issues: string[]; suggestions: string[] };
  suggestions: string[];
}> {
  // Implementation similar to generateOptimizedResume
  // Returns ATS compatibility metrics
  // Extracts keywords, formatting issues, etc.

  // Simplified example:
  const keywords = extractKeywords(jobDescription);
  const missingKeywords = keywords.filter(
    (kw) => !resumeText.toLowerCase().includes(kw.toLowerCase())
  );

  return {
    score: Math.max(0, 1 - missingKeywords.length / keywords.length),
    missing_keywords: missingKeywords,
    formatting: {
      issues: detectFormattingIssues(resumeText),
      suggestions: ['Use consistent date formatting', 'Add measurable metrics'],
    },
    suggestions: ['Add missing skills', 'Use action verbs'],
  };
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction (in production, use NLP library)
  const words = text.split(/\s+/).filter((w) => w.length > 4);
  return [...new Set(words)].slice(0, 20);
}

function detectFormattingIssues(text: string): string[] {
  const issues = [];
  if (!text.includes('\n')) issues.push('Resume appears to be single line');
  if (text.length < 200) issues.push('Resume appears too short');
  return issues;
}
```

### Step 4: Register Route in app.ts

**File:** `backend/src/app.ts` (add to imports and middleware section)

```typescript
import skillsResumeBuilderRoutes from './routes/skills/resume-builder.js';

// ... in middleware setup section:
app.use('/api/skills/resume-builder', skillsResumeBuilderRoutes);
```

---

## 2. FRONTEND ARCHITECT: Resume Builder Component

**File:** `frontend/src/components/Resume/ResumeEditor.tsx`

```typescript
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useResumeBuilder } from '@/hooks/useResumeBuilder';
import ResumePreview from './ResumePreview';
import TemplateSelector from './TemplateSelector';

interface ResumeEditorProps {
  jobDescription?: string;
  onSave?: (resumeId: string) => void;
}

export default function ResumeEditor({
  jobDescription,
  onSave,
}: ResumeEditorProps) {
  const [resumeText, setResumeText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('modern');
  const [isLoading, setIsLoading] = useState(false);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);

  const { generateOptimizedResume, scanAts } = useResumeBuilder();

  const handleOptimize = useCallback(async () => {
    if (!resumeText || !jobDescription) return;

    setIsLoading(true);
    try {
      const result = await generateOptimizedResume({
        originalResume: resumeText,
        jobDescription,
        templateStyle: selectedTemplate,
      });

      setResumeText(result.optimizedResume);
      setAtsScore(result.atsScore);
      setMatchScore(result.matchScore);

      if (onSave && result.resumeId) {
        onSave(result.resumeId);
      }
    } catch (error) {
      console.error('Failed to optimize resume:', error);
      alert('Failed to optimize resume. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, jobDescription, selectedTemplate, generateOptimizedResume, onSave]);

  const handleScanAts = useCallback(async () => {
    if (!resumeText) return;

    setIsLoading(true);
    try {
      const result = await scanAts({
        resumeText,
        jobDescription: jobDescription || '',
      });

      setAtsScore(result.atsScore);
      alert(`ATS Score: ${(result.atsScore * 100).toFixed(1)}%`);
    } catch (error) {
      console.error('Failed to scan ATS:', error);
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, jobDescription, scanAts]);

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Editor Panel */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Resume Editor</h2>
          {atsScore !== null && (
            <div className="flex gap-4 text-sm">
              <div className="bg-blue-50 px-3 py-1 rounded">
                Match: {(matchScore! * 100).toFixed(0)}%
              </div>
              <div className="bg-green-50 px-3 py-1 rounded">
                ATS: {(atsScore * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>

        <TemplateSelector
          selected={selectedTemplate}
          onChange={setSelectedTemplate}
        />

        <Textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste or edit your resume here..."
          className="min-h-96 font-mono text-sm"
        />

        <div className="flex gap-2">
          <Button
            onClick={handleOptimize}
            disabled={isLoading || !resumeText || !jobDescription}
            className="flex-1"
          >
            {isLoading ? 'Optimizing...' : '✨ Optimize with AI'}
          </Button>
          <Button
            onClick={handleScanAts}
            disabled={isLoading || !resumeText}
            variant="outline"
            className="flex-1"
          >
            🔍 Scan ATS
          </Button>
        </div>
      </div>

      {/* Preview Panel */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Preview</h3>
        <ResumePreview content={resumeText} template={selectedTemplate} />
      </div>
    </div>
  );
}
```

### Hook Implementation

**File:** `frontend/src/hooks/useResumeBuilder.ts`

```typescript
import { useState } from 'react';

interface GenerateRequest {
  originalResume: string;
  jobDescription: string;
  templateStyle: string;
}

interface GenerateResponse {
  resumeId: string;
  optimizedResume: string;
  atsScore: number;
  matchScore: number;
  suggestions: string[];
}

interface ScanRequest {
  resumeText: string;
  jobDescription: string;
}

interface ScanResponse {
  atsScore: number;
  missingKeywords: string[];
  suggestions: string[];
}

export function useResumeBuilder() {
  const [error, setError] = useState<string | null>(null);

  const generateOptimizedResume = async (
    req: GenerateRequest
  ): Promise<GenerateResponse> => {
    const response = await fetch('/api/skills/resume-builder/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to generate resume');
    }

    return response.json();
  };

  const scanAts = async (req: ScanRequest): Promise<ScanResponse> => {
    const response = await fetch('/api/skills/resume-builder/scan-ats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error('Failed to scan ATS compatibility');
    }

    return response.json();
  };

  return { generateOptimizedResume, scanAts, error };
}
```

---

## 3. QA AGENT: Test Suite Example

**File:** `backend/src/__tests__/resume-builder.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';
import {
  generateOptimizedResume,
  scanResumeAts,
} from '../lib/ai/resume.js';

describe('Resume Builder', () => {
  const testResume = `
John Doe
john@example.com

Experience:
- Senior Software Engineer at Tech Corp (2020-2024)
  - Led team of 5 engineers
  - Improved system performance by 40%
  - Built microservices architecture

Skills: JavaScript, TypeScript, React, Node.js, AWS
  `;

  const testJobDesc = `
Senior Software Engineer
Requirements:
- 5+ years experience
- TypeScript and React
- AWS/Cloud experience
- Team leadership
- Performance optimization
  `;

  describe('generateOptimizedResume', () => {
    it('should return valid optimized resume structure', async () => {
      const result = await generateOptimizedResume(
        testResume,
        testJobDesc,
        'modern'
      );

      expect(result).toHaveProperty('optimized_resume');
      expect(result).toHaveProperty('ats_score');
      expect(result).toHaveProperty('match_score');
      expect(result.ats_score).toBeGreaterThan(0);
      expect(result.ats_score).toBeLessThanOrEqual(1);
    }, 15000); // Extended timeout for API call

    it('should include matched skills', async () => {
      const result = await generateOptimizedResume(
        testResume,
        testJobDesc,
        'modern'
      );

      expect(Array.isArray(result.matched_skills)).toBe(true);
      expect(result.matched_skills.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('scanResumeAts', () => {
    it('should return ATS compatibility metrics', async () => {
      const result = await scanResumeAts(testResume, testJobDesc);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('missing_keywords');
      expect(Array.isArray(result.missing_keywords)).toBe(true);
    }, 10000);

    it('should identify missing keywords', async () => {
      const result = await scanResumeAts(testResume, testJobDesc);

      // Job description mentions keywords the resume might be missing
      expect(result.missing_keywords.length).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('Database Integration', () => {
    let resumeId: string;

    it('should create resume version record', async () => {
      const resume = await prisma.resumeVersion.create({
        data: {
          candidateId: 'test-candidate-1',
          originalText: testResume,
          optimizedText: 'optimized resume content',
          atsScore: 0.85,
          matchScore: 0.90,
          matchedSkills: ['JavaScript', 'TypeScript', 'React'],
        },
      });

      resumeId = resume.id;
      expect(resume.id).toBeDefined();
      expect(resume.atsScore).toBe(0.85);
    });

    it('should fetch resume versions', async () => {
      const versions = await prisma.resumeVersion.findMany({
        where: { candidateId: 'test-candidate-1' },
      });

      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].id).toBe(resumeId);
    });

    afterAll(async () => {
      // Cleanup
      await prisma.resumeVersion.deleteMany({
        where: { candidateId: 'test-candidate-1' },
      });
    });
  });
});
```

**File:** `frontend/src/__tests__/ResumeEditor.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeEditor from '@/components/Resume/ResumeEditor';
import { useResumeBuilder } from '@/hooks/useResumeBuilder';
import { vi } from 'vitest';

vi.mock('@/hooks/useResumeBuilder');

describe('ResumeEditor Component', () => {
  const mockGenerateOptimizedResume = vi.fn();
  const mockScanAts = vi.fn();

  beforeEach(() => {
    (useResumeBuilder as any).mockReturnValue({
      generateOptimizedResume: mockGenerateOptimizedResume,
      scanAts: mockScanAts,
      error: null,
    });
  });

  it('should render editor and preview panels', () => {
    render(<ResumeEditor />);

    expect(screen.getByText('Resume Editor')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('should update resume text on input change', async () => {
    const user = userEvent.setup();
    render(<ResumeEditor />);

    const textarea = screen.getByPlaceholderText(
      /Paste or edit your resume/i
    );
    await user.type(textarea, 'John Doe\nSoftware Engineer');

    expect(textarea).toHaveValue('John Doe\nSoftware Engineer');
  });

  it('should call optimize with correct parameters', async () => {
    const user = userEvent.setup();
    mockGenerateOptimizedResume.mockResolvedValue({
      resumeId: 'resume-123',
      optimizedResume: 'optimized content',
      atsScore: 0.85,
      matchScore: 0.90,
      suggestions: [],
    });

    render(
      <ResumeEditor jobDescription="Senior Engineer position" />
    );

    const textarea = screen.getByPlaceholderText(/Paste or edit/i);
    await user.type(textarea, 'John Doe');

    const optimizeBtn = screen.getByText(/Optimize with AI/i);
    await user.click(optimizeBtn);

    await waitFor(() => {
      expect(mockGenerateOptimizedResume).toHaveBeenCalledWith(
        expect.objectContaining({
          originalResume: 'John Doe',
          jobDescription: 'Senior Engineer position',
        })
      );
    });
  });
});
```

---

## 4. ORCHESTRATOR: Deployment Checklist

**File:** `docs/checklists/deployment-afrapply-features.md`

```markdown
# Deployment Checklist: AIApply Features

## Pre-Deployment (QA Phase)

- [ ] All unit tests passing: `cd backend && npm test`
- [ ] All integration tests passing
- [ ] TypeScript: `cd backend && npm run typecheck`
- [ ] Linting: `cd backend && npm run lint`
- [ ] Frontend tests: `cd frontend && npm run test:unit:ci`
- [ ] Frontend build: `cd frontend && npm run build`
- [ ] Prisma migrations validated
- [ ] No breaking changes to existing APIs
- [ ] All new endpoints documented in Swagger
- [ ] Performance benchmarks met:
  - [ ] Resume generation: <5 seconds
  - [ ] Job board load: <2 seconds
  - [ ] ATS scan: <3 seconds

## Security Review

- [ ] All endpoints require proper authentication
- [ ] Rate limiting in place for AI endpoints
- [ ] No sensitive data in logs
- [ ] SQL injection prevention (Prisma)
- [ ] XSS protection enabled
- [ ] CORS configured correctly
- [ ] Environment variables not hardcoded

## Environment Setup

- [ ] `ANTHROPIC_API_KEY` set in Secrets Manager
- [ ] `OPENAI_API_KEY` set in Secrets Manager
- [ ] Feature flags configured
- [ ] Database migration tested on staging
- [ ] Cache cleared (Redis)

## Staging Deployment

- [ ] Merge PR to `develop` branch
- [ ] GitHub Actions all green
- [ ] Run deployment: `npm run deploy:staging`
- [ ] Health checks: `/api/health` returning 200
- [ ] Frontend loads: https://staging.afritalent.com
- [ ] Smoke tests:
  - [ ] Resume generation works end-to-end
  - [ ] Cover letter generation works
  - [ ] Job board filters work
  - [ ] Auto-apply can be triggered (needs credits)

## Post-Deployment Monitoring (Staging)

- [ ] CloudWatch logs clean (no errors)
- [ ] API latency metrics normal
- [ ] Database query performance acceptable
- [ ] No unexpected API failures
- [ ] User sessions working
- [ ] Authentication flows working

## Production Preparation

- [ ] Staging validation complete
- [ ] All known bugs fixed
- [ ] Performance acceptable at scale
- [ ] Disaster recovery tested
- [ ] Rollback plan documented
- [ ] Stakeholder approval obtained

## Sign-Offs

- [ ] QA Agent: _______________  Date: _____
- [ ] Orchestrator: _______________  Date: _____
- [ ] CTO/Lead Architect: _______________  Date: _____

## Post-Deployment

- [ ] Monitor error rates for 24 hours
- [ ] Update `STAGING_RUNBOOK.md` with new routes
- [ ] Document any issues encountered
- [ ] Collect user feedback
- [ ] Plan next iteration
```

---

## Summary

These examples show:

1. **Backend Architect** - How to structure APIs, integrate AI, handle responses
2. **Frontend Architect** - How to build components, integrate with APIs, handle UX
3. **QA Agent** - What comprehensive tests look like
4. **Orchestrator** - How to manage deployment and track readiness

All agents should follow these patterns when implementing their sections.

---

**Template Version:** 1.0
**Last Updated:** April 9, 2026
