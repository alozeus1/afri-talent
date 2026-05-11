// §2.7 — `ALLOWED_ORIGIN_REGEX` validator.
//
// Backend refuses to start if the regex is too permissive (matches the empty
// string, or is one of the canonical "match-everything" shortcuts). A
// production deploy with `.*` would otherwise silently allow any origin —
// treated here as a misconfiguration, not a runtime warning.

const PERMISSIVE_PATTERNS: ReadonlySet<string> = new Set([
  ".*",
  ".+",
  "^.*$",
  "^.+$",
  "^.*?$",
  "^.+?$",
]);

export function validateAllowedOriginRegex(pattern: string): RegExp {
  if (PERMISSIVE_PATTERNS.has(pattern.trim())) {
    throw new Error(
      `ALLOWED_ORIGIN_REGEX is too permissive (got "${pattern}"). Anchor it to known hosts (e.g. ^https://.*\\.afritalent\\.com$).`,
    );
  }

  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern);
  } catch (err) {
    throw new Error(
      `ALLOWED_ORIGIN_REGEX is not a valid regular expression: ${(err as Error).message}`,
    );
  }

  if (compiled.test("")) {
    throw new Error(
      `ALLOWED_ORIGIN_REGEX matches the empty string (got "${pattern}"). Anchor with ^ and $ to require specific origins.`,
    );
  }

  return compiled;
}
