const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    const normalizedToken = token.toLowerCase();
    if (normalizedToken.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedToken.slice(2), 16);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    if (normalizedToken.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedToken.slice(1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    return HTML_ENTITY_MAP[normalizedToken] ?? entity;
  });
}

function decodeHtmlEntitiesDeep(value: string, passes = 3): string {
  let decoded = value;
  for (let index = 0; index < passes; index += 1) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function normalizeJobDescription(value: string): string {
  const decoded = decodeHtmlEntitiesDeep(value);
  const withStructure = decoded
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|blockquote|table|tr)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  const lines = withStructure
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  const normalizedLines: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "") {
        normalizedLines.push("");
      }
      continue;
    }

    normalizedLines.push(line);
  }

  while (normalizedLines[normalizedLines.length - 1] === "") {
    normalizedLines.pop();
  }

  return normalizedLines.join("\n").trim();
}

export function splitJobDescriptionSections(value: string): string[] {
  const normalized = normalizeJobDescription(value);
  return normalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
}
