// ─────────────────────────────────────────────────────────────────────────────
// robots.txt parsing + matching (RFC 9309).
//
//  - The group whose user-agent token matches our product token wins; else `*`.
//  - Longest matching rule wins; on a tie, Allow wins.
//  - `*` matches any sequence, `$` anchors the end of the path.
//  - 4xx robots.txt → everything allowed. 5xx / unreachable → everything
//    disallowed (RFC 9309 §2.3.1.4) — the caller treats that as a source skip.
// ─────────────────────────────────────────────────────────────────────────────

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
  /** Set when robots.txt was unreachable — everything is disallowed. */
  disallowAll?: boolean;
}

export const ALLOW_ALL: RobotsPolicy = { rules: [], crawlDelaySeconds: null };
export const DISALLOW_ALL: RobotsPolicy = { rules: [], crawlDelaySeconds: null, disallowAll: true };

interface Group {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

export function parseRobots(text: string, productToken: string): RobotsPolicy {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;

    if (key === "allow" || key === "disallow") {
      // An empty Disallow means "allow everything" — it contributes no rule.
      if (!value) continue;
      current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const delay = Number.parseFloat(value);
      if (Number.isFinite(delay) && delay >= 0) current.crawlDelaySeconds = delay;
    }
  }

  const token = productToken.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent !== "*" && agent === token));
  const chosen = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));

  if (chosen.length === 0) return ALLOW_ALL;

  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelaySeconds: chosen.reduce<number | null>(
      (acc, group) => (group.crawlDelaySeconds === null ? acc : Math.max(acc ?? 0, group.crawlDelaySeconds)),
      null,
    ),
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

/** `pathWithQuery` is the URL path plus `?query` (robots rules match both). */
export function isAllowed(policy: RobotsPolicy, pathWithQuery: string): boolean {
  if (policy.disallowAll) return false;
  let best: RobotsRule | null = null;
  for (const rule of policy.rules) {
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
