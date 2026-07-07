import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibility linting (Workstream E) — enable the full jsx-a11y
  // recommended rule set. eslint-config-next already registers the
  // "jsx-a11y" plugin (with a subset of rules), so we only add rules here;
  // redefining the plugin would throw "Cannot redefine plugin".
  //
  // Severity is downgraded to "warn" for now: the initial rollout surfaced
  // 61 pre-existing violations (44 label-has-associated-control,
  // 8 click-events-have-key-events, 7 no-static-element-interactions,
  // 1 no-redundant-roles, 1 no-noninteractive-element-interactions) across
  // unrelated files. Follow-up: burn these down, then flip to "error".
  {
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, entry]) => {
        const severity = Array.isArray(entry) ? entry[0] : entry;
        if (severity === "off" || severity === 0) return [rule, entry];
        return [rule, Array.isArray(entry) ? ["warn", ...entry.slice(1)] : "warn"];
      }),
    ),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
