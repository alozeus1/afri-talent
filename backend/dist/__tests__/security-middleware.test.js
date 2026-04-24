import { describe, expect, it, vi } from "vitest";
import { sanitizeRequest } from "../middleware/security.js";
describe("sanitizeRequest", () => {
    it("removes control characters from nested strings and arrays", () => {
        const req = {
            body: {
                name: "Jane\u0000 Doe",
                nested: {
                    note: "hello\u0007world",
                },
                items: [
                    { label: "one\u001Ftwo" },
                    "leave-array-primitives-alone",
                ],
            },
            query: {
                search: "devops\u000Brole",
            },
        };
        const next = vi.fn();
        sanitizeRequest(req, {}, next);
        expect(req.body).toEqual({
            name: "Jane Doe",
            nested: {
                note: "helloworld",
            },
            items: [
                { label: "onetwo" },
                "leave-array-primitives-alone",
            ],
        });
        expect(req.query).toEqual({
            search: "devopsrole",
        });
        expect(next).toHaveBeenCalledOnce();
    });
    it("removes prototype pollution keys before they can be consumed downstream", () => {
        const req = {
            body: JSON.parse("{\"safe\":\"value\",\"__proto__\":{\"polluted\":\"yes\"},\"constructor\":{\"prototype\":{\"admin\":true}}}"),
            query: {},
        };
        sanitizeRequest(req, {}, vi.fn());
        expect(req.body).toEqual({ safe: "value" });
        expect({}.polluted).toBeUndefined();
        expect({}.admin).toBeUndefined();
    });
});
//# sourceMappingURL=security-middleware.test.js.map