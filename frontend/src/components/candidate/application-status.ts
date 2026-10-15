/** Badge tone for each application status (labels live under status.* in candidateHome). */
export const applicationStatusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  INTERVIEW: "info",
  OFFERED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
  HIRED: "success",
  WITHDRAWN: "default",
};
