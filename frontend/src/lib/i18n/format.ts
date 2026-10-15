// Shared message formatter for every translation hook (useAdminT, useCandidateT,
// useEmployerI18n, usePublicT, useSupportT, useSiteT).
//
// Supports a small, dependency-free subset of ICU MessageFormat:
//   {name}                                    simple interpolation
//   {count, plural, =0 {..} one {..} other {..}}  plural, `#` = formatted count
//   {kind, select, a {..} b {..} other {..}}  select on a string value
//
// Plural categories come from Intl.PluralRules for the active locale, so each
// locale lists the forms its grammar needs (Arabic: zero/one/two/few/many/
// other; English, French, Spanish, Portuguese: one/other). `npm run i18n:check`
// verifies every plural message lists the categories its locale uses.
// This file must stay import-free: scripts/i18n-check.mjs evaluates it directly.

export type MessageVars = Record<string, string | number>;

interface Branch {
  selector: string;
  body: string;
}

interface ComplexArg {
  name: string;
  kind: "plural" | "select";
  branches: Branch[];
}

const COMPLEX_HEAD = /^\s*(\w+)\s*,\s*(plural|select)\s*,/;
const SIMPLE_ARG = /^\s*(\w+)\s*$/;

/** Index of the `}` matching the `{` at `open`, or -1 when unbalanced. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseComplex(inner: string): ComplexArg | null {
  const head = inner.match(COMPLEX_HEAD);
  if (!head) return null;
  const branches: Branch[] = [];
  let rest = inner.slice(head[0].length);
  for (;;) {
    rest = rest.replace(/^\s+/, "");
    if (!rest) break;
    const sel = rest.match(/^(=\d+|\w+)\s*\{/);
    if (!sel) return null;
    const open = sel[0].length - 1;
    const close = matchingBrace(rest, open);
    if (close < 0) return null;
    branches.push({ selector: sel[1], body: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return { name: head[1], kind: head[2] as ComplexArg["kind"], branches };
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: string, value: number): string {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules("en");
    }
    pluralRulesCache.set(locale, rules);
  }
  return rules.select(value);
}

function formatNumber(locale: string, value: number): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/** Whole-number value of a formatted count, accepting Arabic-Indic digits. */
function parseCount(value: string): number {
  const digits = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d-]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function render(template: string, vars: MessageVars, locale: string, pound: string | null): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "#" && pound !== null) {
      out += pound;
      i += 1;
      continue;
    }
    if (ch !== "{") {
      out += ch;
      i += 1;
      continue;
    }
    const close = matchingBrace(template, i);
    if (close < 0) {
      out += template.slice(i);
      break;
    }
    const raw = template.slice(i, close + 1);
    const inner = template.slice(i + 1, close);
    i = close + 1;

    const simple = inner.match(SIMPLE_ARG);
    if (simple) {
      const name = simple[1];
      out += Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : raw;
      continue;
    }
    const complex = parseComplex(inner);
    if (!complex || !Object.prototype.hasOwnProperty.call(vars, complex.name)) {
      out += raw;
      continue;
    }
    const value = vars[complex.name];
    let branch: Branch | undefined;
    if (complex.kind === "plural") {
      // Callers may pass an already formatted count ("1,234", "١٢"): select the
      // form from its digits and print it exactly as given.
      const n = typeof value === "number" ? value : parseCount(value);
      const shown = typeof value === "number" ? formatNumber(locale, value) : value;
      branch =
        complex.branches.find((b) => b.selector === `=${n}`) ??
        complex.branches.find((b) => b.selector === pluralCategory(locale, n)) ??
        complex.branches.find((b) => b.selector === "other");
      out += branch ? render(branch.body, vars, locale, shown) : raw;
    } else {
      branch =
        complex.branches.find((b) => b.selector === String(value)) ??
        complex.branches.find((b) => b.selector === "other");
      out += branch ? render(branch.body, vars, locale, pound) : raw;
    }
  }
  return out;
}

/**
 * Formats a translated template. Unknown variables are left as `{name}` so a
 * missing value is visible rather than silently blank.
 */
export function formatMessage(template: string, vars?: MessageVars, locale = "en"): string {
  if (!vars || !template.includes("{")) return template;
  return render(template, vars, locale, null);
}

export interface MessageArgument {
  name: string;
  kind: "simple" | "plural" | "select";
  selectors: string[];
}

/** Every argument a template references (used by the parity checks). */
export function messageArguments(template: string): MessageArgument[] {
  const found: MessageArgument[] = [];
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      if (text[i] !== "{") {
        i += 1;
        continue;
      }
      const close = matchingBrace(text, i);
      if (close < 0) return;
      const inner = text.slice(i + 1, close);
      i = close + 1;
      const simple = inner.match(SIMPLE_ARG);
      if (simple) {
        found.push({ name: simple[1], kind: "simple", selectors: [] });
        continue;
      }
      const complex = parseComplex(inner);
      if (!complex) continue;
      found.push({ name: complex.name, kind: complex.kind, selectors: complex.branches.map((b) => b.selector) });
      for (const b of complex.branches) walk(b.body);
    }
  };
  walk(template);
  return found;
}

/** Sorted, de-duplicated argument names: the placeholder signature of a template. */
export function argumentSignature(template: string): string[] {
  return [...new Set(messageArguments(template).map((a) => a.name))].sort();
}

/**
 * Plural categories a locale actually uses for whole numbers (0-1000), i.e.
 * the forms a translator must provide. Arabic: zero, one, two, few, many, other.
 */
export function requiredPluralCategories(locale: string): string[] {
  const seen = new Set<string>();
  for (let n = 0; n <= 1000; n += 1) seen.add(pluralCategory(locale, n));
  seen.add("other");
  return [...seen].sort();
}

/** Plural messages missing a category their locale needs, as `name: missing,...`. */
export function pluralProblems(template: string, locale: string): string[] {
  const needed = requiredPluralCategories(locale);
  return messageArguments(template)
    .filter((a) => a.kind === "plural")
    .flatMap((a) => {
      const missing = needed.filter((c) => !a.selectors.includes(c));
      return missing.length ? [`${a.name}: missing ${missing.join(",")}`] : [];
    });
}
