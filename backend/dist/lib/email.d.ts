export declare function newMessageEmail(opts: {
    to: string;
    recipientName: string;
    senderName: string;
    threadUrl: string;
}): Promise<void>;
export declare function applicationStatusEmail(opts: {
    to: string;
    candidateName: string;
    jobTitle: string;
    companyName: string;
    status: string;
    jobUrl: string;
}): Promise<void>;
export declare function jobMatchEmail(opts: {
    to: string;
    candidateName: string;
    jobTitle: string;
    companyName: string;
    visaSponsored: boolean;
    jobUrl: string;
}): Promise<void>;
export declare function candidateWeeklyDigestEmail(opts: {
    to: string;
    candidateName: string;
    digestUrl: string;
    jobs: Array<{
        title: string;
        companyName: string;
        location: string;
        summary: string;
        url: string;
    }>;
}): Promise<void>;
export declare function passwordResetEmail(opts: {
    to: string;
    userName: string;
    resetUrl: string;
    expiresInHours: number;
}): Promise<void>;
export declare function verificationEmail(opts: {
    to: string;
    companyName: string;
    status: "VERIFIED" | "PENDING" | "UNVERIFIED";
    portalUrl: string;
}): Promise<void>;
export declare function accountEmailVerificationEmail(opts: {
    to: string;
    candidateName: string;
    verifyUrl: string;
    expiresInHours: number;
}): Promise<void>;
//# sourceMappingURL=email.d.ts.map