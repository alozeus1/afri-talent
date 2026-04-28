import {
  EARLY_LEARNING_CATEGORIES,
  EARLY_LEARNING_LESSONS,
  INTERVIEW_ROLE_TRACKS,
  evaluateInterviewAnswerLocally,
  buildFallbackCoverLetter,
  getInterviewQuestionsForRole,
  reviewResumeInput,
} from "../early-tester-content";

describe("early tester content", () => {
  it("includes enough practical starter learning content", () => {
    expect(EARLY_LEARNING_LESSONS.length).toBeGreaterThanOrEqual(20);
    for (const category of EARLY_LEARNING_CATEGORIES) {
      expect(EARLY_LEARNING_LESSONS.some((lesson) => lesson.category === category)).toBe(true);
    }
  });

  it("includes the required interview role tracks", () => {
    const roles = INTERVIEW_ROLE_TRACKS.map((track) => track.role);
    expect(roles).toEqual(
      expect.arrayContaining([
        "Cloud Engineer",
        "DevOps Engineer",
        "DevSecOps Engineer",
        "AWS Solutions Architect",
        "SOC Analyst",
        "Cybersecurity Analyst",
        "Frontend Developer",
        "Backend Developer",
        "Product Manager",
        "Data Analyst",
        "AI Engineer",
        "Technical Support Engineer",
      ]),
    );
  });

  it("expands role-specific interview questions with the requested difficulty", () => {
    const questions = getInterviewQuestionsForRole("DevOps Engineer", "hard");
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((question) => question.difficulty === "hard")).toBe(true);
    expect(questions.some((question) => question.question.toLowerCase().includes("pipeline"))).toBe(true);
  });

  it("provides local interview feedback when AI feedback is unavailable", () => {
    const [question] = getInterviewQuestionsForRole("Cloud Engineer", "medium");
    const feedback = evaluateInterviewAnswerLocally(
      question,
      "Situation: an EC2 instance was unreachable. Task: restore access. Action: I checked security groups, route tables, public IP assignment, NACLs, and instance logs. Result: I found a missing inbound rule, restored SSH safely, and documented the fix.",
    );
    expect(feedback.source).toBe("heuristic");
    expect(feedback.score).toBeGreaterThan(50);
    expect(feedback.improvements.length).toBeGreaterThan(0);
  });

  it("flags weak resume inputs without blocking safe local guidance", () => {
    const result = reviewResumeInput({
      fullName: "Alozeus",
      email: "alozeus1@gmail.com",
      targetRole: "Cloud Engineer",
      skills: "AWS, Terraform",
      summary: "",
      workHistory: [{ company: "", title: "", period: "", description: "" }],
      educationHistory: [{ institution: "", degree: "", period: "" }],
    });

    expect(result.ready).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("honestly"))).toBe(true);
  });

  it("builds a safe cover letter fallback template", () => {
    const fallback = buildFallbackCoverLetter({
      toneLabel: "Warm and human",
      jobId: "job-123",
      candidateName: "Alozeus",
    });

    expect(fallback).toContain("Alozeus");
    expect(fallback).toContain("could not generate");
    expect(fallback).toContain("cannot verify");
  });
});
