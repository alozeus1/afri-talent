export function humanizeTrustValue(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
