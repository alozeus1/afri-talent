import { describe, expect, it, vi } from "vitest";
import { blockAnonymousJobsAutomation, validateHumanAuthSubmission, } from "../middleware/bot-protection.js";
function createResponse() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
}
describe("validateHumanAuthSubmission", () => {
    it("rejects filled honeypot submissions", () => {
        const req = {
            body: {
                botShield: {
                    website: "https://spam.example",
                    startedAt: Date.now() - 5000,
                },
            },
            header: vi.fn().mockReturnValue("Mozilla/5.0"),
        };
        const res = createResponse();
        const next = vi.fn();
        validateHumanAuthSubmission(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
    it("rejects suspiciously fast submissions", () => {
        const req = {
            body: {
                botShield: {
                    website: "",
                    startedAt: Date.now() - 100,
                },
            },
            header: vi.fn().mockReturnValue("Mozilla/5.0"),
        };
        const res = createResponse();
        validateHumanAuthSubmission(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
describe("blockAnonymousJobsAutomation", () => {
    it("blocks obvious automation user agents for anonymous job scraping", () => {
        const req = {
            user: undefined,
            header: vi.fn().mockImplementation((name) => {
                if (name === "x-afritalent-internal-fetch")
                    return undefined;
                if (name === "user-agent")
                    return "python-requests/2.31.0";
                return undefined;
            }),
        };
        const res = createResponse();
        blockAnonymousJobsAutomation(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });
    it("allows internal and browser-originated traffic through", () => {
        const req = {
            user: undefined,
            header: vi.fn().mockImplementation((name) => {
                if (name === "x-afritalent-internal-fetch")
                    return "server-public-api";
                if (name === "user-agent")
                    return "node";
                return undefined;
            }),
        };
        const next = vi.fn();
        blockAnonymousJobsAutomation(req, createResponse(), next);
        expect(next).toHaveBeenCalledOnce();
    });
});
//# sourceMappingURL=bot-protection.test.js.map