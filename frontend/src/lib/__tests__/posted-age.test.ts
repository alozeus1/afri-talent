import { formatPostedLong, formatPostedShort, postedAgeDays } from "@/lib/posted-age";

const now = new Date("2026-03-15T12:00:00.000Z");

describe("posted-age helpers", () => {
  it("returns null for missing or invalid dates", () => {
    expect(postedAgeDays(null, now)).toBeNull();
    expect(postedAgeDays("not-a-date", now)).toBeNull();
    expect(formatPostedShort(undefined, now)).toBeNull();
    expect(formatPostedLong("", now)).toBeNull();
  });

  it("formats compact card labels", () => {
    expect(formatPostedShort("2026-03-15T08:00:00.000Z", now)).toBe("Posted today");
    expect(formatPostedShort("2026-03-12T12:00:00.000Z", now)).toBe("Posted 3d ago");
    expect(formatPostedShort("2026-02-15T12:00:00.000Z", now)).toBe("Posted 4w ago");
    expect(formatPostedShort("2025-11-15T12:00:00.000Z", now)).toBe("Posted 4mo ago");
  });

  it("formats long detail labels and clamps future dates to today", () => {
    expect(formatPostedLong("2026-03-14T12:00:00.000Z", now)).toBe("Posted 1 day ago");
    expect(formatPostedLong("2026-03-03T12:00:00.000Z", now)).toBe("Posted 12 days ago");
    expect(formatPostedLong("2026-03-20T12:00:00.000Z", now)).toBe("Posted today");
  });
});
