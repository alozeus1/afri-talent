import mammoth from "mammoth";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (fileBuffer: Buffer) => Promise<{ text: string }>;

export interface ParsedResumeWorkItem {
  company?: string;
  title?: string;
  period?: string;
  description?: string;
}

export interface ParsedResumeEducationItem {
  institution?: string;
  degree?: string;
  period?: string;
}

export interface ParsedResumeData {
  name?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills: string[];
  workHistory: ParsedResumeWorkItem[];
  education: ParsedResumeEducationItem[];
  certifications: string[];
  rawText: string;
}

export interface CandidateProfileDraft {
  headline?: string;
  bio?: string;
  skills?: string[];
  targetRoles?: string[];
  yearsExperience?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

const KNOWN_SKILLS = [
  "javascript",
  "typescript",
  "python",
  "java",
  "go",
  "rust",
  "ruby",
  "php",
  "react",
  "next.js",
  "node.js",
  "express",
  "nestjs",
  "django",
  "flask",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "terraform",
  "figma",
  "product management",
  "ui/ux",
  "data analysis",
];

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function extractSection(text: string, headings: string[]): string {
  const escapedHeadings = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const headingPattern = `(?:^|\\n)\\s*(?:${escapedHeadings.join("|")})\\s*:?\\s*(?:\\n|$)`;
  const nextHeadingPattern = "(?:\\n\\s*[A-Z][A-Z\\s&/]{2,25}:?\\s*(?:\\n|$))";
  const regex = new RegExp(`${headingPattern}([\\s\\S]*?)(?=${nextHeadingPattern}|$)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractName(text: string): string | undefined {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return undefined;
  if (firstLine.length > 80) return undefined;
  if (/resume|curriculum|cv/i.test(firstLine)) return undefined;
  if (/\d|@/.test(firstLine)) return undefined;
  return firstLine;
}

function uniqueStrings(values: string[]): string[] {
  const normalized = new Map<string, string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!normalized.has(key)) normalized.set(key, value);
  }
  return Array.from(normalized.values());
}

function extractSkills(text: string, skillsSection: string): string[] {
  const values: string[] = [];
  const candidateText = `${skillsSection}\n${text}`.toLowerCase();

  for (const skill of KNOWN_SKILLS) {
    if (candidateText.includes(skill.toLowerCase())) {
      values.push(skill);
    }
  }

  const sectionSplit = skillsSection
    .split(/[,\n|•·]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && item.length <= 50);

  return uniqueStrings([...values, ...sectionSplit]).slice(0, 40);
}

function extractWorkHistory(workSection: string): ParsedResumeWorkItem[] {
  if (!workSection) return [];

  const lines = workSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedResumeWorkItem[] = [];
  for (let i = 0; i < lines.length; i += 3) {
    const titleCompany = lines[i] ?? "";
    const period = lines[i + 1] ?? "";
    const description = lines[i + 2] ?? "";

    if (!titleCompany) continue;

    const [title, company] = titleCompany.split(/ at | @ | - /i).map((part) => part.trim());
    items.push({
      title: title || titleCompany,
      company: company || undefined,
      period: /\d{4}|present|current/i.test(period) ? period : undefined,
      description: description.length > 8 ? description : undefined,
    });

    if (items.length >= 12) break;
  }

  return items;
}

function extractEducation(educationSection: string): ParsedResumeEducationItem[] {
  if (!educationSection) return [];

  return educationSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => {
      const [degree, institution] = line.split(/ - |, /).map((item) => item.trim());
      return {
        degree: degree || undefined,
        institution: institution || undefined,
        period: /\d{4}/.test(line)
          ? line.match(/(19|20)\d{2}(\s*-\s*(19|20)\d{2}|\s*-\s*present)?/i)?.[0]
          : undefined,
      };
    });
}

function extractCertifications(certSection: string): string[] {
  if (!certSection) return [];
  return certSection
    .split(/\n|,|•|·/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function inferYearsExperience(workHistory: ParsedResumeWorkItem[]): number | undefined {
  const years = new Set<number>();
  for (const item of workHistory) {
    if (!item.period) continue;
    const matches = item.period.match(/(19|20)\d{2}/g) ?? [];
    for (const match of matches) years.add(Number(match));
  }

  if (years.size < 2) return undefined;

  const sorted = Array.from(years).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const inferred = Math.max(0, Math.min(45, max - min));
  return inferred || undefined;
}

function inferTargetRoles(workHistory: ParsedResumeWorkItem[], summary?: string): string[] {
  const bag = `${summary || ""}\n${workHistory
    .map((item) => `${item.title || ""} ${item.description || ""}`)
    .join("\n")}`.toLowerCase();

  const roles = [
    "Software Engineer",
    "Frontend Engineer",
    "Backend Engineer",
    "Full-stack Engineer",
    "DevOps Engineer",
    "Product Manager",
    "Data Analyst",
    "UI/UX Designer",
  ].filter((role) => bag.includes(role.toLowerCase().split(" ")[0]));

  return roles.slice(0, 5);
}

export async function extractResumeText(fileBuffer: Buffer, mimetype: string, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (mimetype.includes("pdf") || lowerName.endsWith(".pdf")) {
    const result = await pdfParse(fileBuffer);
    return normalizeWhitespace(result.text || "");
  }

  if (
    mimetype.includes("officedocument.wordprocessingml.document") ||
    mimetype.includes("msword") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc")
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return normalizeWhitespace(result.value || "");
  }

  throw new Error("Unsupported file format. Please upload PDF or DOCX.");
}

export function parseResumeText(rawText: string): ParsedResumeData {
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = rawText.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0];
  const linkedinUrl = rawText.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const githubUrl = rawText.match(/https?:\/\/(www\.)?github\.com\/[^\s)]+/i)?.[0];
  const portfolioUrl = rawText.match(/https?:\/\/(?!www\.)[^\s)]+\.[^\s)]+/i)?.[0];

  const summary = extractSection(rawText, ["Summary", "Professional Summary", "Profile", "About"]);
  const skillsSection = extractSection(rawText, ["Skills", "Core Skills", "Technical Skills", "Competencies"]);
  const workSection = extractSection(rawText, ["Experience", "Work Experience", "Professional Experience", "Employment"]);
  const educationSection = extractSection(rawText, ["Education", "Academic Background"]);
  const certSection = extractSection(rawText, ["Certifications", "Certificates", "Licenses"]);

  const skills = extractSkills(rawText, skillsSection);
  const workHistory = extractWorkHistory(workSection);
  const education = extractEducation(educationSection);
  const certifications = extractCertifications(certSection);

  return {
    name: extractName(rawText),
    email,
    phone,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
    summary: summary || undefined,
    skills,
    workHistory,
    education,
    certifications,
    rawText,
  };
}

export function toCandidateProfileDraft(parsed: ParsedResumeData): CandidateProfileDraft {
  const yearsExperience = inferYearsExperience(parsed.workHistory);
  const targetRoles = inferTargetRoles(parsed.workHistory, parsed.summary);

  return {
    headline: parsed.workHistory[0]?.title || parsed.summary?.split(".")[0] || undefined,
    bio: parsed.summary || undefined,
    skills: parsed.skills,
    targetRoles,
    yearsExperience,
    linkedinUrl: parsed.linkedinUrl,
    githubUrl: parsed.githubUrl,
    portfolioUrl: parsed.portfolioUrl,
  };
}
