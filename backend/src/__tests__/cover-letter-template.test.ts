import { describe, it, expect } from "vitest";
import {
  generateQuickCoverLetter,
  generateTemplateCoverLetter,
  trimBioAtSentence,
  type CoverLetterInput,
} from "../lib/ai/cover-letter.js";

const base: CoverLetterInput = {
  candidateName: "Ada",
  headline: null,
  skills: [],
  bio: null,
  yearsExperience: null,
  jobTitle: "Backend Engineer",
  companyName: "Acme",
  jobDescription: "Build APIs",
};

function assertClean(letter: string) {
  expect(letter).not.toMatch(/ {2,}/);
  expect(letter).not.toMatch(/\bin ,/);
  expect(letter).not.toMatch(/\bin\s*\./);
  expect(letter).not.toMatch(/ ,/);
  expect(letter).not.toContain("undefined");
  expect(letter).not.toContain("null");
}

describe("generateTemplateCoverLetter", () => {
  it("omits the skills clause and produces clean text when skills and bio are empty", () => {
    const letter = generateTemplateCoverLetter(base);
    assertClean(letter);
    expect(letter).toContain("With my background and experience, I am well-positioned to contribute to the Backend Engineer role at Acme.");
    expect(letter.split("\n\n")).toHaveLength(4);
  });

  it("omits the skills clause but keeps years of experience", () => {
    const letter = generateTemplateCoverLetter({ ...base, yearsExperience: 5 });
    assertClean(letter);
    expect(letter.startsWith("With 5 years of experience, I am well-positioned")).toBe(true);
  });

  it("includes skills when present", () => {
    const letter = generateTemplateCoverLetter({ ...base, skills: ["TypeScript", " ", "Postgres"], yearsExperience: 3 });
    assertClean(letter);
    expect(letter).toContain("With 3 years of experience in TypeScript, Postgres,");
  });

  it("trims a long bio at a sentence boundary", () => {
    const bio = `${"I build reliable systems. ".repeat(14)}This final sentence goes well beyond the limit and must be dropped entirely`;
    const letter = generateTemplateCoverLetter({ ...base, bio });
    assertClean(letter);
    const bioParagraph = letter.split("\n\n")[2];
    expect(bioParagraph.length).toBeLessThanOrEqual(300);
    expect(bioParagraph.endsWith(".")).toBe(true);
    expect(bioParagraph).not.toContain("final sentence");
  });
});

describe("trimBioAtSentence", () => {
  it("returns short bios unchanged (whitespace-normalised)", () => {
    expect(trimBioAtSentence("Hello  world.")).toBe("Hello world.");
  });

  it("falls back to a word boundary with an ellipsis when no sentence ends in range", () => {
    const out = trimBioAtSentence("word ".repeat(100), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe("generateQuickCoverLetter under MOCK_AI", () => {
  it("uses the template", async () => {
    const result = await generateQuickCoverLetter(base);
    expect(result.source).toBe("template");
    assertClean(result.coverLetter);
  });
});
