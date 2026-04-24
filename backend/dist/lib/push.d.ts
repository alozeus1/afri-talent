export interface WebPushSubscriptionPayload {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}
export declare function isWebPushConfigured(): boolean;
export declare function getWebPushPublicKey(): string | null;
export declare function sendWebPushNotification(subscription: WebPushSubscriptionPayload, payload: Record<string, unknown>): Promise<void>;
//# sourceMappingURL=push.d.ts.map