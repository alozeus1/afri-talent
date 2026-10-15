#!/usr/bin/env node
/**
 * One-shot codemod: rewrite raw neutral palette utilities to semantic tokens.
 *   text-gray-900 -> text-fg, bg-white -> bg-surface, border-gray-200 -> border-line ...
 * Skips `dark:`-prefixed utilities and lines that paint text on a solid light
 * fill (bg-yellow/amber/lime-300/400), where dark text must stay dark.
 *
 *   node scripts/codemod-semantic-colors.mjs [--dry]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const dry = process.argv.includes("--dry");
const N = "(?:gray|slate|zinc|neutral)";
const MAP = [
  [`text-${N}-(?:950|900|800)`, "text-fg"],
  [`text-${N}-(?:700|600)`, "text-fg-secondary"],
  [`text-${N}-500`, "text-fg-muted"],
  ["text-black", "text-fg"],
  ["bg-white", "bg-surface"],
  [`bg-${N}-50`, "bg-surface-sunken"],
  [`bg-${N}-100`, "bg-surface-muted"],
  [`border-${N}-(?:100|200)`, "border-line"],
  [`border-${N}-300`, "border-line-strong"],
  [`divide-${N}-(?:100|200)`, "divide-line"],
  // emerald-600 text is 3.7:1 on white (fails AA); primary-text is 5.5:1.
  ["text-emerald-600", "text-primary-text"],
];
const SOLID = /\bbg-(?:yellow|amber|lime)-[34]00\b/;
const counts = {};
let files = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") walk(full);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      transform(full);
    }
  }
}

function transform(file) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n").map((line) => {
    if (SOLID.test(line)) return line;
    let out = line;
    for (const [pattern, token] of MAP) {
      const re = new RegExp(`(?<=[\\s"'\`])((?:[a-z0-9\\[\\]=-]+:)*)(${pattern})(?=[\\s"'\`])`, "g");
      out = out.replace(re, (m, prefix) => {
        if (prefix.includes("dark:")) return m;
        counts[token] = (counts[token] ?? 0) + 1;
        return `${prefix}${token}`;
      });
    }
    return out;
  });
  const next = lines.join("\n");
  if (next !== src) {
    files += 1;
    if (!dry) writeFileSync(file, next);
  }
}

walk(root);
console.log(JSON.stringify({ files, counts }, null, 2));
