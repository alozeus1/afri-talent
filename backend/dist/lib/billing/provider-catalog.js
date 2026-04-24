function parseCatalogEnv(value) {
    if (!value?.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === "string" && entry[1].length > 0));
    }
    catch {
        return {};
    }
}
export function buildCatalogKey(plan, region, interval, currency) {
    return [plan, region, interval, currency.toUpperCase()].join(":");
}
export function resolveStripeCatalogPriceId(plan, region, interval, currency) {
    const catalog = parseCatalogEnv(process.env.STRIPE_PRICE_CATALOG_JSON);
    return catalog[buildCatalogKey(plan, region, interval, currency)] ?? null;
}
export function resolveFlutterwaveCatalogPlanId(plan, region, interval, currency) {
    const catalog = parseCatalogEnv(process.env.FLUTTERWAVE_PLAN_CATALOG_JSON);
    return catalog[buildCatalogKey(plan, region, interval, currency)] ?? null;
}
//# sourceMappingURL=provider-catalog.js.map