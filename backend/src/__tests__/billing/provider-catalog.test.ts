import { describe, it, expect, afterEach } from "vitest";
import { SubscriptionPlan, BillingRegion, BillingInterval } from "@prisma/client";
import {
    buildCatalogKey,
    parseCatalogStrict,
    validatePriceCatalogEnv,
    resolveStripeCatalogPriceId,
} from "../../lib/billing/provider-catalog.js";

const VALID_KEY = buildCatalogKey(
    SubscriptionPlan.PROFESSIONAL,
    BillingRegion.AFRICA,
    BillingInterval.MONTHLY,
    "usd",
);

describe("parseCatalogStrict (M5)", () => {
    it("accepts a well-formed catalog", () => {
        const catalog = parseCatalogStrict(
            JSON.stringify({ [VALID_KEY]: "price_123" }),
            "TEST_CATALOG",
        );
        expect(catalog[VALID_KEY]).toBe("price_123");
    });

    it("returns an empty catalog for unset/blank env", () => {
        expect(parseCatalogStrict(undefined, "TEST_CATALOG")).toEqual({});
        expect(parseCatalogStrict("   ", "TEST_CATALOG")).toEqual({});
    });

    it("throws on malformed JSON", () => {
        expect(() => parseCatalogStrict("{not json", "TEST_CATALOG")).toThrow(/TEST_CATALOG is not valid JSON/);
    });

    it("throws on non-object payloads", () => {
        expect(() => parseCatalogStrict("[1,2]", "TEST_CATALOG")).toThrow(/TEST_CATALOG failed validation/);
        expect(() => parseCatalogStrict("\"str\"", "TEST_CATALOG")).toThrow(/TEST_CATALOG failed validation/);
    });

    it("throws on unknown plan/region/interval keys (names the offending key)", () => {
        expect(() =>
            parseCatalogStrict(JSON.stringify({ "GOLD:AFRICA:MONTHLY:USD": "price_1" }), "TEST_CATALOG"),
        ).toThrow(/GOLD:AFRICA:MONTHLY:USD/);
        expect(() =>
            parseCatalogStrict(JSON.stringify({ "PROFESSIONAL:MARS:MONTHLY:USD": "price_1" }), "TEST_CATALOG"),
        ).toThrow(/PROFESSIONAL:MARS:MONTHLY:USD/);
    });

    it("throws on empty provider id values", () => {
        expect(() =>
            parseCatalogStrict(JSON.stringify({ [VALID_KEY]: "" }), "TEST_CATALOG"),
        ).toThrow(/TEST_CATALOG failed validation/);
    });
});

describe("validatePriceCatalogEnv (startup gate)", () => {
    const original = {
        stripe: process.env.STRIPE_PRICE_CATALOG_JSON,
        flutterwave: process.env.FLUTTERWAVE_PLAN_CATALOG_JSON,
    };

    afterEach(() => {
        if (original.stripe === undefined) delete process.env.STRIPE_PRICE_CATALOG_JSON;
        else process.env.STRIPE_PRICE_CATALOG_JSON = original.stripe;
        if (original.flutterwave === undefined) delete process.env.FLUTTERWAVE_PLAN_CATALOG_JSON;
        else process.env.FLUTTERWAVE_PLAN_CATALOG_JSON = original.flutterwave;
    });

    it("passes when both catalogs are unset", () => {
        delete process.env.STRIPE_PRICE_CATALOG_JSON;
        delete process.env.FLUTTERWAVE_PLAN_CATALOG_JSON;
        expect(() => validatePriceCatalogEnv()).not.toThrow();
    });

    it("passes with valid catalogs", () => {
        process.env.STRIPE_PRICE_CATALOG_JSON = JSON.stringify({ [VALID_KEY]: "price_abc" });
        process.env.FLUTTERWAVE_PLAN_CATALOG_JSON = JSON.stringify({ [VALID_KEY]: "12345" });
        expect(() => validatePriceCatalogEnv()).not.toThrow();
    });

    it("names the offending variable on failure", () => {
        process.env.STRIPE_PRICE_CATALOG_JSON = JSON.stringify({ [VALID_KEY]: "price_abc" });
        process.env.FLUTTERWAVE_PLAN_CATALOG_JSON = "{broken";
        expect(() => validatePriceCatalogEnv()).toThrow(/FLUTTERWAVE_PLAN_CATALOG_JSON/);
    });
});

describe("runtime resolution still works after validation", () => {
    const original = process.env.STRIPE_PRICE_CATALOG_JSON;

    afterEach(() => {
        if (original === undefined) delete process.env.STRIPE_PRICE_CATALOG_JSON;
        else process.env.STRIPE_PRICE_CATALOG_JSON = original;
    });

    it("resolves a price id for a validated catalog", () => {
        process.env.STRIPE_PRICE_CATALOG_JSON = JSON.stringify({ [VALID_KEY]: "price_xyz" });
        expect(
            resolveStripeCatalogPriceId(
                SubscriptionPlan.PROFESSIONAL,
                BillingRegion.AFRICA,
                BillingInterval.MONTHLY,
                "USD",
            ),
        ).toBe("price_xyz");
    });
});
