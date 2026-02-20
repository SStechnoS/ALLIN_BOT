export declare const aiGuard: {
    readonly PRICE_RESPONSE: string;
    readonly INDIVIDUAL_RESPONSE: string;
    INJECT_RESPONSE: string;
    readonly RATE_LIMIT_RESPONSE: string;
    preFilter(text: string): "price" | "inject" | "individual" | "ok";
    postFilter(response: string): string;
    isAITrigger(text: string, sceneId: string): boolean;
};
//# sourceMappingURL=ai.guard.d.ts.map