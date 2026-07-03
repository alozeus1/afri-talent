export interface ParsedProfilePeriod {
  start: string;
  end: string;
  isPresent: boolean;
}

function toMonth(value: string): string {
  const match = value.match(/(\d{4})(?:-(\d{2}))?/);
  return match ? (match[2] ? `${match[1]}-${match[2]}` : `${match[1]}-01`) : "";
}

export function parseProfilePeriod(value: string): ParsedProfilePeriod {
  const raw = value || "";
  const separator = raw.match(/\s+[–-]\s+|–/);
  const separatorIndex = separator?.index ?? -1;
  const startSide = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  const endSide =
    separatorIndex >= 0
      ? raw.slice(separatorIndex + (separator?.[0].length ?? 0))
      : "";
  const isPresent = /present|current/i.test(raw);

  return {
    start: toMonth(startSide),
    end: isPresent ? "" : toMonth(endSide),
    isPresent,
  };
}
