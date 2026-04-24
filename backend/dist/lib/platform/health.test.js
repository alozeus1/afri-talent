import { describe, expect, it } from "vitest";
import { billingIsRequiredForHealth, buildDegradedState } from "./health.js";
describe("billing health behavior", () => {
    it("does not require billing for staging by default", () => {
        expect(billingIsRequiredForHealth({ APP_ENV: "staging" })).toBe(false);
        expect(buildDegradedState({
            redis: "ok",
            billing: "not_configured",
            env: { APP_ENV: "staging" },
        })).toBe(false);
    });
    it("still treats billing as required in production unless explicitly disabled", () => {
        expect(billingIsRequiredForHealth({ APP_ENV: "production" })).toBe(true);
        expect(buildDegradedState({
            redis: "ok",
            billing: "not_configured",
            env: { APP_ENV: "production" },
        })).toBe(true);
    });
});
//# sourceMappingURL=health.test.js.map