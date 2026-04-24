function isEnabled(value) {
    if (!value)
        return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
export function featureFlagEnabled(flagName) {
    return isEnabled(process.env[flagName]);
}
export function requireFeatureFlag(flagName) {
    return (_req, res, next) => {
        if (!featureFlagEnabled(flagName)) {
            res.status(503).json({
                error: "Feature not enabled",
                code: "FEATURE_DISABLED",
                feature: flagName,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=feature-flags.js.map