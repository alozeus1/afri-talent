// Guards against localized dead links: localizePath() always prefixes
// /{locale}, so every path passed to it (and to the header's href() helper)
// must have a matching page under src/app/[locale]/. A missing re-export
// renders as a 404 even though the un-localized page exists.
import fs from "fs";
import path from "path";
import { isSupportedLocale } from "../config";

const SRC_DIR = path.resolve(__dirname, "../../..");
const LOCALE_APP_DIR = path.join(SRC_DIR, "app", "[locale]");
const DYNAMIC = ":dynamic";

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const LITERAL = String.raw`(["'\`])((?:(?!\1).)*)\1`;
const CALL_PATTERNS = [
  new RegExp(String.raw`localizePath\(\s*${LITERAL}`, "g"),
  // header.tsx: const href = (path: string) => localizePath(path, locale)
  new RegExp(String.raw`\bhref\(\s*${LITERAL}`, "g"),
];
// Files that render `localizePath(item.href, ...)` over config arrays.
const OBJECT_HREF_PATTERN = new RegExp(String.raw`\bhref:\s*${LITERAL}`, "g");
const LOCALIZES_OBJECT_HREF = /localizePath\(\s*[A-Za-z_$][\w$]*\.href\b/;

function collectLocalizedPaths(): Array<{ file: string; raw: string }> {
  const found: Array<{ file: string; raw: string }> = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const source = fs.readFileSync(file, "utf8");
    const patterns = [...CALL_PATTERNS];
    if (LOCALIZES_OBJECT_HREF.test(source)) patterns.push(OBJECT_HREF_PATTERN);
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const raw = match[2];
        if (raw.startsWith("/")) found.push({ file: path.relative(SRC_DIR, file), raw });
      }
    }
  }
  return found;
}

function toSegments(raw: string): string[] {
  const withoutQuery = raw.replace(/\$\{[^}]*\}/g, DYNAMIC).split(/[?#]/)[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  if (segments.length > 0 && isSupportedLocale(segments[0])) segments.shift();
  return segments.map((segment) => (segment.includes(DYNAMIC) ? DYNAMIC : segment));
}

function resolvePage(segments: string[]): string | null {
  let dir = LOCALE_APP_DIR;
  for (const segment of segments) {
    const literal = path.join(dir, segment);
    if (segment !== DYNAMIC && fs.existsSync(literal) && fs.statSync(literal).isDirectory()) {
      dir = literal;
      continue;
    }
    const dynamicDir = fs
      .readdirSync(dir, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && /^\[[^.\]][^\]]*\]$/.test(entry.name));
    if (!dynamicDir) return null;
    dir = path.join(dir, dynamicDir.name);
  }
  const page = path.join(dir, "page.tsx");
  return fs.existsSync(page) ? page : null;
}

describe("localized route coverage", () => {
  const paths = collectLocalizedPaths();

  it("finds localized links to check", () => {
    expect(paths.length).toBeGreaterThan(20);
  });

  it("every localizePath()/href() target has a src/app/[locale] page", () => {
    const missing = paths
      .filter(({ raw }) => resolvePage(toSegments(raw)) === null)
      .map(({ file, raw }) => `${raw}  (from ${file})`);
    expect(missing).toEqual([]);
  });

  it("resolves dynamic segments to [param] directories", () => {
    expect(resolvePage(toSegments("/employer/jobs/${job.id}/applications"))).not.toBeNull();
    expect(resolvePage(toSegments("/employer/talent/${candidate.user.id}"))).not.toBeNull();
    expect(resolvePage(toSegments("/definitely-not-a-route"))).toBeNull();
  });
});
