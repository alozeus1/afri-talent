import { render } from "@testing-library/react";
import { JobJsonLd } from "../job-jsonld";
import { Job } from "@/lib/api";

const baseJob: Job = {
  id: "job-1",
  title: "Senior Backend Engineer",
  slug: "senior-backend-engineer",
  description: "Build resilient APIs for global talent products.",
  location: "Remote",
  type: "full-time",
  seniority: "Senior",
  salaryMin: 80000,
  salaryMax: 120000,
  currency: "USD",
  salaryPeriod: "monthly",
  tags: ["Node.js", "PostgreSQL"],
  visaSponsorship: "YES",
  relocationAssistance: true,
  eligibleCountries: ["NG", "KE"],
  status: "PUBLISHED",
  publishedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  employer: {
    companyName: "AfriTalent Labs",
    location: "Remote",
    website: "https://afritalent.example.com",
  },
};

describe("JobJsonLd", () => {
  it("renders JobPosting JSON-LD with required fields", () => {
    const { container } = render(<JobJsonLd job={baseJob} />);
    const script = container.querySelector("script[type='application/ld+json']");
    expect(script).not.toBeNull();

    const parsed = JSON.parse(script?.textContent || "{}") as Record<string, unknown>;
    expect(parsed["@type"]).toBe("JobPosting");
    expect(parsed.title).toBe(baseJob.title);
    expect(parsed.employmentType).toBe("FULL_TIME");
    expect(parsed.hiringOrganization).toBeDefined();
    expect(parsed.applicantLocationRequirements).toBeDefined();
    expect(parsed.baseSalary).toBeDefined();
    expect((parsed.baseSalary as { value: { unitText: string } }).value.unitText).toBe("MONTH");
  });

  it("does not render schema for expired jobs", () => {
    const { container } = render(
      <JobJsonLd
        job={{
          ...baseJob,
          isExpired: true,
          expiresAt: "2020-01-01T00:00:00.000Z",
        }}
      />,
    );

    const script = container.querySelector("script[type='application/ld+json']");
    expect(script).toBeNull();
  });
});
