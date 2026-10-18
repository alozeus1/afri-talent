#!/usr/bin/env node
/**
 * Generates src/styles/dark-compat.css: a dark-mode safety net for legacy
 * raw-palette utilities (text-gray-900, bg-white, bg-amber-50, border-gray-200,
 * text-emerald-700 ...) that were written for light mode only.
 *
 * Each rule applies only under `.dark` AND only when the element does not
 * already declare its own `dark:` variant for that property, so explicit dark
 * styling always wins. New code should use the semantic token utilities
 * (bg-surface, text-fg, border-line ...) and never needs this layer.
 *
 *   node scripts/gen-dark-compat.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/styles/dark-compat.css");

// Only emit rules for utilities that actually appear in src/ (keeps the CSS
// small). Re-run after adding legacy palette classes - or better, use tokens.
function collectTokens(dir, acc = new Set()) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") collectTokens(full, acc);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      for (const tok of readFileSync(full, "utf8").split(/[\s"'`{}()]+/)) if (tok) acc.add(tok);
    }
  }
  return acc;
}
const used = collectTokens(path.join(root, "src"));

const esc = (cls) => cls.replace(/[/:.[\]]/g, (c) => `\\${c}`);
const NEUTRALS = ["gray", "slate", "zinc", "neutral", "stone"];
// Tailwind v3-equivalent hex for the shades we remap to (literal values so the
// layer does not depend on Tailwind emitting unused theme variables).
const HUES = {
  emerald: { 300: "#6ee7b7", 400: "#34d399", 500: "#10b981" },
  green: { 300: "#86efac", 400: "#4ade80", 500: "#22c55e" },
  teal: { 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6" },
  cyan: { 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4" },
  sky: { 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9" },
  blue: { 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6" },
  indigo: { 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1" },
  violet: { 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6" },
  purple: { 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7" },
  fuchsia: { 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef" },
  pink: { 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899" },
  rose: { 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e" },
  red: { 300: "#fca5a5", 400: "#f87171", 500: "#ef4444" },
  orange: { 300: "#fdba74", 400: "#fb923c", 500: "#f97316" },
  amber: { 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b" },
  yellow: { 300: "#fde047", 400: "#facc15", 500: "#eab308" },
  lime: { 300: "#bef264", 400: "#a3e635", 500: "#84cc16" },
};
const tint = (color, pct) => `color-mix(in oklab, ${color} ${pct}%, transparent)`;
// Text on a solid light-colored fill (e.g. a yellow CTA) must stay dark.
const SOLID_LIGHT_FILLS = ["bg-yellow-3", "bg-yellow-4", "bg-amber-3", "bg-amber-4", "bg-lime-3", "bg-lime-4"];
const notSolid = SOLID_LIGHT_FILLS.map((f) => `:not([class*="${f}"])`).join("");

const rules = [];
/** @param {string} cls utility as written, e.g. "hover:bg-gray-50" */
function rule(cls, prop, value, guard, extra = "") {
  if (!used.has(cls)) return;
  const pseudo = cls.startsWith("hover:") ? ":hover" : "";
  rules.push(`.dark .${esc(cls)}${pseudo}:not([class*="${guard}"])${extra} { ${prop}: ${value}; }`);
}

const OPACITIES = [50, 60, 70, 80, 90, 95];

// --- Neutral text ---------------------------------------------------------
for (const n of NEUTRALS) {
  for (const s of [950, 900, 800]) rule(`text-${n}-${s}`, "color", "var(--fg)", "dark:text-", notSolid);
  for (const s of [700, 600]) rule(`text-${n}-${s}`, "color", "var(--fg-secondary)", "dark:text-", notSolid);
  for (const s of [500, 400]) rule(`text-${n}-${s}`, "color", "var(--fg-muted)", "dark:text-", notSolid);
  for (const s of [900, 800, 700, 600]) rule(`hover:text-${n}-${s}`, "color", "var(--fg)", "dark:hover:text-");
}
rule("text-black", "color", "var(--fg)", "dark:text-", notSolid);

// --- Neutral surfaces -----------------------------------------------------
const surfaces = { white: "var(--surface)" };
for (const n of NEUTRALS) {
  surfaces[`${n}-50`] = "var(--surface-sunken)";
  surfaces[`${n}-100`] = "var(--surface-muted)";
  surfaces[`${n}-200`] = "var(--line-strong)";
}
for (const [k, v] of Object.entries(surfaces)) {
  rule(`bg-${k}`, "background-color", v, "dark:bg-");
  for (const o of OPACITIES) rule(`bg-${k}/${o}`, "background-color", tint(v, o), "dark:bg-");
  rule(`hover:bg-${k}`, "background-color", "var(--surface-muted)", "dark:hover:bg-");
}
for (const n of NEUTRALS) {
  for (const s of [100, 200]) {
    rule(`border-${n}-${s}`, "border-color", "var(--line)", "dark:border-");
    rule(`divide-${n}-${s}`, "border-color", "var(--line)", "dark:divide-", " > :not(:last-child)");
  }
  rule(`border-${n}-300`, "border-color", "var(--line-strong)", "dark:border-");
  rule(`hover:border-${n}-300`, "border-color", "var(--line-strong)", "dark:hover:border-");
}
for (const o of [50, 60, 70, 80]) rule(`border-white/${o}`, "border-color", "var(--line)", "dark:border-");

// --- Gradients that end in light colors ------------------------------------
for (const pos of ["from", "via", "to"]) {
  rule(`${pos}-white`, `--tw-gradient-${pos}`, "var(--surface)", `dark:${pos}-`);
  for (const n of NEUTRALS) rule(`${pos}-${n}-50`, `--tw-gradient-${pos}`, "var(--surface-sunken)", `dark:${pos}-`);
  for (const n of NEUTRALS) rule(`${pos}-${n}-100`, `--tw-gradient-${pos}`, "var(--surface-muted)", `dark:${pos}-`);
}

// --- Hued tints, borders and text -----------------------------------------
for (const [hue, sh] of Object.entries(HUES)) {
  for (const [s, pct] of [[50, 10], [100, 16]]) {
    rule(`bg-${hue}-${s}`, "background-color", tint(sh[500], pct), "dark:bg-");
    for (const o of [30, 40, 50, 60, 70, 80]) rule(`bg-${hue}-${s}/${o}`, "background-color", tint(sh[500], pct), "dark:bg-");
    rule(`hover:bg-${hue}-${s}`, "background-color", tint(sh[500], pct + 8), "dark:hover:bg-");
    for (const pos of ["from", "via", "to"]) rule(`${pos}-${hue}-${s}`, `--tw-gradient-${pos}`, tint(sh[500], pct), `dark:${pos}-`);
  }
  for (const s of [100, 200, 300]) rule(`border-${hue}-${s}`, "border-color", tint(sh[400], s === 300 ? 45 : 30), "dark:border-");
  rule(`hover:border-${hue}-300`, "border-color", tint(sh[400], 55), "dark:hover:border-");
  for (const s of [950, 900, 800, 700]) rule(`text-${hue}-${s}`, "color", sh[300], "dark:text-", notSolid);
  rule(`text-${hue}-600`, "color", sh[400], "dark:text-", notSolid);
  for (const s of [900, 800, 700, 600]) rule(`hover:text-${hue}-${s}`, "color", sh[300], "dark:hover:text-");
}

const header = `/* GENERATED by scripts/gen-dark-compat.mjs - do not edit by hand.
 * Dark-mode safety net for legacy light-only palette utilities. Rules apply
 * only under .dark and only when the element has no explicit dark: variant
 * for the same property. Prefer semantic tokens (bg-surface, text-fg ...). */
`;
writeFileSync(out, `${header}@layer utilities {\n${rules.map((r) => `  ${r}`).join("\n")}\n}\n`);
console.log(`wrote ${rules.length} rules to ${path.relative(process.cwd(), out)}`);
