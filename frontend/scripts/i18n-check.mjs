#!/usr/bin/env node
/**
 * i18n health check (npm run i18n:check).
 *
 * 1. Parity (fails the run): every key in messages/<namespace>/en.ts exists,
 *    non-empty and with the same arguments ({name} and ICU
 *    {count, plural, ...} / {kind, select, ...}), in every other locale file.
 * 2. Plurals (fails the run): every {x, plural, ...} message lists each plural
 *    category its locale uses (Arabic: zero, one, two, few, many, other), and
 *    count-like messages ("{count} jobs") must use ICU plural syntax.
 * 3. Hard-coded copy (fails the run when above the budget, default 0): counts
 *    user-facing string literals in JSX (text nodes and placeholder/title/alt/
 *    aria-label/label attributes) per area.
 *
 * Flags:
 *   --verbose          list every hard-coded literal with file:line
 *   --area=<name>      only report that area (e.g. --area=employer)
 *   --max-literals=N   hard-coded literal budget (default 0)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = path.join(root, "src/lib/i18n/messages");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const areaFilter = args.find((a) => a.startsWith("--area="))?.split("=")[1];
const maxLiterals = Number(args.find((a) => a.startsWith("--max-literals="))?.split("=")[1] ?? 0);

const configSrc = readFileSync(path.join(root, "src/lib/i18n/config.ts"), "utf8");
const LOCALES = JSON.parse(configSrc.match(/SUPPORTED_LOCALES = (\[[^\]]+\])/)[1]);

// ---------------------------------------------------------------- parity ---
function loadModule(file) {
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, () => ({}));
  return mod.exports;
}
const loadDict = (file) => loadModule(file).default;

// Same parser the runtime uses (src/lib/i18n/format.ts).
const { argumentSignature, pluralProblems, messageArguments } = loadModule(path.join(root, "src/lib/i18n/format.ts"));
const placeholders = (s) => argumentSignature(s).join(",");
// A bare {count}/{n} next to a counted noun ("{count} jobs") must be an ICU plural.
const COUNT_NOUN = /\{(count|days|hours)\}(\s+|-)[A-Za-z]{3,}/;
const problems = [];
const namespaces = readdirSync(messagesDir).filter((n) => statSync(path.join(messagesDir, n)).isDirectory());
let keyTotal = 0;
for (const ns of namespaces) {
  const en = loadDict(path.join(messagesDir, ns, "en.ts"));
  const keys = Object.keys(en);
  keyTotal += keys.length;
  for (const key of keys) {
    if (COUNT_NOUN.test(en[key]) && !messageArguments(en[key]).some((a) => a.kind === "plural")) {
      problems.push(`${ns}/en.ts: "${key}" counts something; use {count, plural, one {...} other {...}}`);
    }
    for (const p of pluralProblems(en[key], "en")) problems.push(`${ns}/en.ts: plural in "${key}" ${p}`);
  }
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    const file = path.join(messagesDir, ns, `${locale}.ts`);
    let dict;
    try {
      dict = loadDict(file);
    } catch {
      problems.push(`${ns}/${locale}.ts: missing file`);
      continue;
    }
    for (const key of keys) {
      const value = dict[key];
      if (typeof value !== "string" || !value.trim()) problems.push(`${ns}/${locale}.ts: missing "${key}"`);
      else if (placeholders(value) !== placeholders(en[key])) problems.push(`${ns}/${locale}.ts: placeholder mismatch in "${key}"`);
      else for (const p of pluralProblems(value, locale)) problems.push(`${ns}/${locale}.ts: plural in "${key}" ${p}`);
    }
    for (const key of Object.keys(dict)) if (!(key in en)) problems.push(`${ns}/${locale}.ts: extra key "${key}" not in en`);
  }
}

// ------------------------------------------------------ hard-coded copy ---
const ATTRS = new Set(["placeholder", "title", "alt", "aria-label", "label"]);
const literals = [];

function areaOf(rel) {
  const parts = rel.split(path.sep).filter((p) => p !== "[locale]");
  // src/app/<area>/... or src/components/<area>/...
  if (parts[1] === "app") return parts.length > 3 ? parts[2] : "(root)";
  if (parts[1] === "components") return `components/${parts[2]}`;
  return parts[1];
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(root, file);
  const add = (node, value) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2,}/.test(v)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    literals.push({ area: areaOf(rel), file: rel, line: line + 1, text: v });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node, node.text);
    else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) add(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) add(init, init.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") walk(full);
    } else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) {
      scan(full);
    }
  }
}
walk(path.join(root, "src/app"));
walk(path.join(root, "src/components"));

const shown = areaFilter ? literals.filter((l) => l.area === areaFilter) : literals;
const byArea = {};
for (const l of shown) byArea[l.area] = (byArea[l.area] ?? 0) + 1;

console.log(`i18n:check - ${namespaces.length} namespaces, ${keyTotal} keys, locales: ${LOCALES.join(", ")}`);
console.log("\nHard-coded user-facing JSX strings by area (lower is better):");
for (const [area, n] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${area}`);
}
console.log(`  ${String(shown.length).padStart(5)}  TOTAL`);
if (verbose) for (const l of shown) console.log(`${l.file}:${l.line}  ${JSON.stringify(l.text)}`);

if (problems.length) {
  console.error(`\nTranslation parity problems (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
}
const overBudget = literals.length > maxLiterals;
if (overBudget) console.error(`\nHard-coded literal count ${literals.length} exceeds --max-literals=${maxLiterals}`);
process.exit(problems.length || overBudget ? 1 : 0);
