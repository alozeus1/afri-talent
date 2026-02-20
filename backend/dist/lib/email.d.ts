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
export declare function verificationEmail(opts: {
    to: string;
    companyName: string;
    status: "VERIFIED" | "PENDING" | "UNVERIFIED";
    portalUrl: string;
}): Promise<void>;
//# sourceMappingURL=email.d.ts.map