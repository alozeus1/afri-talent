import { z } from "zod/v4";
export declare const ResumeSchemaValidator: z.ZodObject<{
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    headline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    summary: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    years_of_experience: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    experience: z.ZodDefault<z.ZodArray<z.ZodObject<{
        company: z.ZodString;
        title: z.ZodString;
        start_date: z.ZodOptional<z.ZodString>;
        end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodOptional<z.ZodString>;
        metrics: z.ZodDefault<z.ZodArray<z.ZodString>>;
        technologies: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    education: z.ZodDefault<z.ZodArray<z.ZodObject<{
        institution: z.ZodString;
        degree: z.ZodOptional<z.ZodString>;
        field: z.ZodOptional<z.ZodString>;
        graduation_year: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    languages: z.ZodDefault<z.ZodArray<z.ZodString>>;
    certifications: z.ZodDefault<z.ZodArray<z.ZodString>>;
    work_auth_status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const JobSchemaValidator: z.ZodObject<{
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    company: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    seniority: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    salary_min: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    salary_max: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    must_have_skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    nice_to_have_skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    visa_sponsorship: z.ZodDefault<z.ZodEnum<{
        YES: "YES";
        NO: "NO";
        UNKNOWN: "UNKNOWN";
    }>>;
    relocation_assistance: z.ZodDefault<z.ZodBoolean>;
    eligible_countries: z.ZodDefault<z.ZodArray<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    requirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    responsibilities: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const MatchSchemaValidator: z.ZodObject<{
    score: z.ZodNumber;
    must_have_coverage_pct: z.ZodNumber;
    nice_to_have_coverage_pct: z.ZodNumber;
    matched_skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    missing_must_haves: z.ZodDefault<z.ZodArray<z.ZodString>>;
    missing_nice_to_haves: z.ZodDefault<z.ZodArray<z.ZodString>>;
    location_match: z.ZodBoolean;
    work_auth_ok: z.ZodBoolean;
    visa_ok: z.ZodBoolean;
    seniority_match: z.ZodEnum<{
        match: "match";
        unknown: "unknown";
        over: "over";
        under: "under";
    }>;
    recommendation: z.ZodEnum<{
        skip: "skip";
        apply: "apply";
        stretch: "stretch";
    }>;
    explanation: z.ZodString;
}, z.core.$strip>;
export declare const TailoredResumeSchemaValidator: z.ZodObject<{
    summary: z.ZodString;
    skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    experience: z.ZodDefault<z.ZodArray<z.ZodObject<{
        company: z.ZodString;
        title: z.ZodString;
        period: z.ZodString;
        bullets: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    ats_keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    warnings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    change_log: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const CoverLetterPackSchemaValidator: z.ZodObject<{
    subject_line: z.ZodString;
    salutation: z.ZodString;
    body: z.ZodString;
    closing: z.ZodString;
    tone: z.ZodEnum<{
        professional: "professional";
        warm: "warm";
        direct: "direct";
    }>;
    word_count: z.ZodNumber;
}, z.core.$strip>;
export declare const GuardReportSchemaValidator: z.ZodObject<{
    verdict: z.ZodEnum<{
        PASS: "PASS";
        FAIL: "FAIL";
    }>;
    issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<{
            fabrication: "fabrication";
            inconsistency: "inconsistency";
            exaggeration: "exaggeration";
        }>;
        field: z.ZodString;
        original_value: z.ZodString;
        fabricated_value: z.ZodString;
        severity: z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>;
    }, z.core.$strip>>>;
    requires_user_confirmation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    confidence: z.ZodNumber;
}, z.core.$strip>;
export declare function validateAgentOutput<T>(schema: z.ZodType<T>, raw: unknown, agentName: string): T;
//# sourceMappingURL=validators.d.ts.map