import { getPasswordStrength } from "../password-strength";

describe("getPasswordStrength", () => {
  it("returns very weak for empty passwords", () => {
    const result = getPasswordStrength("");
    expect(result.level).toBe("Very weak");
    expect(result.percentage).toBe(0);
  });

  it("returns strong score for complex passwords", () => {
    const result = getPasswordStrength("S3curePass!2026");
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(["Strong", "Very strong"]).toContain(result.level);
  });

  it("returns actionable feedback for weak passwords", () => {
    const result = getPasswordStrength("password");
    expect(result.feedback.some((item) => item.includes("uppercase"))).toBe(true);
    expect(result.feedback.some((item) => item.includes("number"))).toBe(true);
    expect(result.feedback.some((item) => item.includes("symbol"))).toBe(true);
  });
});
