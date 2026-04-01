export type PasswordStrengthLevel = "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";

export interface PasswordStrengthResult {
  score: number;
  level: PasswordStrengthLevel;
  percentage: number;
  feedback: string[];
}

const LEVELS: PasswordStrengthLevel[] = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { score: 0, level: "Very weak", percentage: 0, feedback: ["Use at least 12 characters for better security."] };
  }

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Normalize 0-6 points into 0-4 buckets
  const normalizedScore = Math.max(0, Math.min(4, Math.floor((score / 6) * 5)));

  if (password.length < 12) {
    feedback.push("Use at least 12 characters.");
  }
  if (!/[A-Z]/.test(password)) {
    feedback.push("Add an uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    feedback.push("Add a lowercase letter.");
  }
  if (!/\d/.test(password)) {
    feedback.push("Add a number.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    feedback.push("Add a symbol (e.g. !@#$%).");
  }

  return {
    score: normalizedScore,
    level: LEVELS[normalizedScore],
    percentage: normalizedScore * 25,
    feedback,
  };
}
