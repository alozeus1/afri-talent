// AI provider abstraction types

export type AIModel = "fast" | "quality";

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education: Array<{
    institution: string;
    degree?: string;
    field?: string;
    graduationYear?: string;
  }>;
  languages?: string[];
  certifications?: string[];
}

export interface TailoredResume {
  summary: string;
  skills: string[];
  experienceHighlights: string[];
  coverLetter: string;
}

export interface ExtractedJobData {
  title?: string;
  company?: string;
  location?: string;
  type?: string;
  seniority?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  skills: string[];
  visaSponsorship?: "YES" | "NO" | "UNKNOWN";
  relocationAssistance?: boolean;
  eligibleCountries?: string[];
  description?: string;
}

export interface AIProvider {
  parseResume(resumeText: string): Promise<ParsedResume>;
  tailorResume(resumeText: string, jobDescription: string): Promise<TailoredResume>;
  generateCoverLetter(resumeText: string, jobDescription: string, candidateName: string): Promise<string>;
  extractJobData(rawJobText: string): Promise<ExtractedJobData>;
}
