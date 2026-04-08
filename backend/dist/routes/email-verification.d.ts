declare const router: import("express-serve-static-core").Router;
declare function sendVerificationEmail(email: string, token: string, name: string): Promise<void>;
export declare function issueEmailVerification(opts: {
    userId: string;
    email: string;
    name: string;
    invalidateExisting?: boolean;
}): Promise<{
    token: string;
    expiresAt: Date;
}>;
export { sendVerificationEmail };
export default router;
//# sourceMappingURL=email-verification.d.ts.map