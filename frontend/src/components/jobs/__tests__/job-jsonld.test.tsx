import { render } from "@testing-library/react";
import {
  JobJsonLd,
  JSONLD_VALID_THROUGH_DAYS,
  computeJsonLdValidThrough,
} from "../job-jsonld";
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

  it("does not render schema when the backend signals emitNoJsonLd (200_WITH_NO_JSONLD mode)", () => {
    const { container } = render(
      <JobJsonLd job={{ ...baseJob, emitNoJsonLd: true } as Job & { emitNoJsonLd?: boolean }} />,
    );
    const script = container.querySelector("script[type='application/ld+json']");
    expect(script).toBeNull();
  });

  it("escapes HTML-significant characters so job fields cannot break out of the <script> tag (stored XSS)", () => {
    const payload = '</script><script>alert(document.cookie)</script>';
    const { container } = render(
      <JobJsonLd
        job={{
          ...baseJob,
          title: payload,
          description: '<img src=x onerror=alert(1)> & "quoted"',
          employer: { ...baseJob.employer, companyName: '</script><b>x</b>' },
        }}
      />,
    );

    const script = container.querySelector("script[type='application/ld+json']");
    const raw = script?.textContent || "";

    // The serialized JSON-LD must not contain a raw closing tag or raw '<'
    // that could terminate the script element and inject live markup.
    expect(raw.toLowerCase()).not.toContain("</script>");
    expect(raw).not.toContain("<script");
    expect(raw).not.toContain("<");
    expect(raw).not.toContain(">");

    // Escaping is lossless: parsing recovers the original title verbatim (the
    // payload is inert data, not executable markup). `description` additionally
    // passes through normalizeJobDescription, so it is HTML-stripped defense-in-depth.
    const parsed = JSON.parse(raw) as { title: string; description: string };
    expect(parsed.title).toBe(payload);
    expect(typeof parsed.description).toBe("string");
  });

  describe("§4.4 — validThrough = min(expiresAt, datePosted + 60 days)", () => {
    const POSTED = new Date("2026-03-01T00:00:00.000Z");
    const SIXTY_DAY_CAP = new Date(POSTED.getTime() + JSONLD_VALID_THROUGH_DAYS * 86_400_000);

    it("falls back to datePosted + 60 days when expiresAt is missing", () => {
      const out = computeJsonLdValidThrough(null, POSTED);
      expect(out).toBe(SIXTY_DAY_CAP.toISOString());
    });

    it("uses expiresAt when it lands before the 60-day cap", () => {
      const earlier = new Date(POSTED.getTime() + 10 * 86_400_000);
      expect(computeJsonLdValidThrough(earlier, POSTED)).toBe(earlier.toISOString());
    });

    it("caps at datePosted + 60 days when expiresAt is later", () => {
      const farFuture = new Date(POSTED.getTime() + 365 * 86_400_000);
      expect(computeJsonLdValidThrough(farFuture, POSTED)).toBe(SIXTY_DAY_CAP.toISOString());
    });

    it("emits the capped value as the JSON-LD validThrough", () => {
      const farFuture = new Date(POSTED.getTime() + 365 * 86_400_000);
      const { container } = render(
        <JobJsonLd
          job={{
            ...baseJob,
            publishedAt: POSTED.toISOString(),
            createdAt: POSTED.toISOString(),
            expiresAt: farFuture.toISOString(),
          }}
        />,
      );
      const parsed = JSON.parse(container.querySelector("script[type='application/ld+json']")?.textContent || "{}") as { validThrough?: string };
      expect(parsed.validThrough).toBe(SIXTY_DAY_CAP.toISOString());
    });
  });
});
