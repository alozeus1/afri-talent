interface UserContext {
    systemPrompt: string;
    tokenEstimate: number;
}
export declare function buildChatContext(userId: string): Promise<UserContext>;
export {};
//# sourceMappingURL=chat-context.d.ts.map