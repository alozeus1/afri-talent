/**
 * Grandfather all active subscribers at the current pricing version.
 * Call this BEFORE updating prices to a new version.
 */
export declare function grandfatherActiveSubscribers(pricingVersion: number): Promise<number>;
/**
 * Check if a user is grandfathered at a specific pricing version.
 */
export declare function isGrandfathered(userId: string): Promise<boolean>;
/**
 * Remove grandfathered status (e.g., when user cancels and re-subscribes).
 */
export declare function removeGrandfathering(userId: string): Promise<void>;
//# sourceMappingURL=grandfathering.d.ts.map