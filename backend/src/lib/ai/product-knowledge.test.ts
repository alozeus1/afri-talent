import { describe, expect, it } from "vitest";
import { AFRITALENT_PRODUCT_KNOWLEDGE, MARA_SAFETY_RULES } from "./product-knowledge.js";

describe("Mara AfriTalent product knowledge", () => {
  it("covers launch-critical candidate workflows", () => {
    const knowledge = AFRITALENT_PRODUCT_KNOWLEDGE.toLowerCase();
    const requiredTopics = [
      "ai job matching",
      "apply pack",
      "fabrication",
      "visa tracker",
      "interview prep",
      "learning hub",
      "trust center",
      "saved searches",
      "alert preferences",
      "profile completeness",
      "resume builder",
      "cover letter",
      "applications tracker",
      "early access",
    ];

    for (const topic of requiredTopics) {
      expect(knowledge).toContain(topic);
    }
  });

  it("forbids fabricated proof and unrealistic guarantees", () => {
    const rules = MARA_SAFETY_RULES.toLowerCase();

    expect(rules).toContain("never claim real employer partnerships");
    expect(rules).toContain("testimonials");
    expect(rules).toContain("guarantee a job");
    expect(rules).toContain("guarantee visa sponsorship");
    expect(rules).toContain("verified data");
  });
});
