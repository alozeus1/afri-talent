/**
 * Free launch switch. NEXT_PUBLIC_FREE_MODE is inlined at build time (pass it
 * as a Docker build arg), so changing it requires a rebuild. When "true", the
 * UI hides paywalls, upgrade CTAs, plan pickers and Premium badges. Pair with
 * the backend FREE_MODE flag, which actually grants the entitlements.
 */
export const FREE_MODE = process.env.NEXT_PUBLIC_FREE_MODE === "true";
