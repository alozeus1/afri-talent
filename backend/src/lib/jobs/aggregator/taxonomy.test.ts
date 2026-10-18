import { describe, expect, it } from "vitest";
import {
  classifyJobField,
  classifyJobFieldFromTitle,
  jobFieldFromTaxonomyField,
  resolveJobField,
} from "./taxonomy.js";

// Benefits boilerplate that used to drag engineering titles into
// Healthcare/Finance/Marketing under first-match-wins classification.
const BOILERPLATE =
  "We offer medical insurance, financial wellbeing support, healthcare benefits, " +
  "clinical-grade wellness, growth opportunities and great content. Investment in you.";

describe("classifyJobField", () => {
  it.each([
    "Research Engineer, GPU Performance",
    "Member of Technical Staff (Robotics)",
    "Salesforce Developer",
    "Senior Machine Learning Engineer",
    "Software engineer, AI model supply chain",
    "Cloud Platform Engineer",
    "Senior Full Stack Developer",
    "Site Reliability Engineer (SRE)",
    "DevOps Engineer",
    "Senior Django Developer",
    "IT Support Specialist",
  ])("classifies %s as Technology despite description boilerplate", (title) => {
    expect(classifyJobField({ title, description: BOILERPLATE, tags: [] })).toBe("Technology");
  });

  it.each([
    ["Staff DataOps Engineer", ["Technology", "Data"]],
    ["Data Scientist", ["Data"]],
    ["Senior Data Engineer", ["Data"]],
    ["Senior Product Designer - Design System", ["Design"]],
    ["Staff Product Designer (Contract)", ["Design"]],
    ["Security Engineer", ["Cybersecurity"]],
    ["Lead Product Manager", ["Product"]],
  ] as const)("classifies %s into a tech-family field", (title, expected) => {
    const field = classifyJobField({ title, description: BOILERPLATE });
    expect(expected as readonly string[]).toContain(field);
  });

  it("never puts an engineering title in Healthcare, Finance or Marketing", () => {
    const titles = [
      "Research Engineer, GPU Performance",
      "Member of Technical Staff (Robotics)",
      "Salesforce Developer",
      "Staff DataOps Engineer",
      "Senior Machine Learning Engineer",
      "Software engineer, AI model supply chain",
      "Cloud Platform Engineer",
      "Senior Full Stack Developer",
    ];
    for (const title of titles) {
      expect(["Healthcare", "Finance", "Marketing"]).not.toContain(
        classifyJobField({ title, description: BOILERPLATE }),
      );
    }
  });

  it("still classifies non-tech titles correctly", () => {
    expect(classifyJobField({ title: "Registered Nurse", description: "Clinical patient care" })).toBe("Healthcare");
    expect(classifyJobField({ title: "Senior Accountant", description: "Audit and payroll" })).toBe("Accounting");
    expect(classifyJobField({ title: "Financial Analyst" })).toBe("Finance");
    expect(classifyJobField({ title: "Head of Growth Marketing" })).toBe("Marketing");
    expect(classifyJobField({ title: "Product Marketing Manager" })).toBe("Marketing");
    expect(classifyJobField({ title: "Account Executive, SLED" })).toBe("Sales");
    expect(classifyJobField({ title: "Business Development Manager" })).toBe("Sales");
    expect(classifyJobField({ title: "Talent Acquisition Specialist" })).toBe("Human Resources");
    expect(classifyJobField({ title: "Mechanical Engineer" })).toBe("Engineering Non-Software");
    expect(
      classifyJobField({ title: "CAD Expert, Remote", description: "Support our customer success team." }),
    ).toBe("Engineering Non-Software");
    expect(classifyJobField({ title: "Supply Chain Manager", description: "Procurement and logistics" })).toBe("Logistics");
    expect(classifyJobField({ title: "Sr. Instructional Designer, Learning Operations" })).toBe("Education");
  });

  it("does not treat the pronoun 'it' as IT", () => {
    expect(classifyJobField({ title: "Travel Coordinator", description: "You will own it end to end and love it." })).toBe("Operations");
  });

  it("falls back to department before the description", () => {
    expect(
      classifyJobField({ title: "Associate", department: "Engineering", description: "medical insurance and financial perks" }),
    ).toBe("Technology");
  });

  it("uses taxonomyField when the title is uninformative", () => {
    expect(classifyJobField({ title: "Associate", taxonomyField: "HR", description: BOILERPLATE })).toBe("Human Resources");
    expect(classifyJobField({ title: "Associate", taxonomyField: "OTHER", department: "Sales" })).toBe("Sales");
  });

  it("only reads the description as the last resort", () => {
    expect(classifyJobField({ title: "Associate", description: "Build backend software services in the cloud" })).toBe("Technology");
    expect(classifyJobField({ title: "Associate" })).toBe("Operations");
  });
});

describe("taxonomy helpers", () => {
  it("maps the controlled taxonomy onto jobField", () => {
    expect(jobFieldFromTaxonomyField("AI_ML")).toBe("Technology");
    expect(jobFieldFromTaxonomyField("SOFTWARE_ENGINEERING")).toBe("Technology");
    expect(jobFieldFromTaxonomyField("CLOUD_DEVOPS")).toBe("Technology");
    expect(jobFieldFromTaxonomyField("DATA")).toBe("Data");
    expect(jobFieldFromTaxonomyField("SECURITY")).toBe("Cybersecurity");
    expect(jobFieldFromTaxonomyField("OTHER")).toBeNull();
    expect(jobFieldFromTaxonomyField(null)).toBeNull();
    expect(jobFieldFromTaxonomyField("NOT_A_FIELD")).toBeNull();
  });

  it("returns null from the title tier for uninformative titles", () => {
    expect(classifyJobFieldFromTitle("Associate")).toBeNull();
    expect(classifyJobFieldFromTitle("")).toBeNull();
  });

  it("resolveJobField prefers title, then taxonomy, then the stored value", () => {
    expect(resolveJobField({ title: "Cloud Platform Engineer", taxonomyField: "MARKETING", existing: "Healthcare" })).toBe("Technology");
    expect(resolveJobField({ title: "Associate", taxonomyField: "AI_ML", existing: "Healthcare" })).toBe("Technology");
    expect(resolveJobField({ title: "Associate", taxonomyField: "OTHER", existing: "Legal" })).toBe("Legal");
    expect(resolveJobField({ title: "Associate", taxonomyField: null, existing: null })).toBe("Operations");
  });
});
