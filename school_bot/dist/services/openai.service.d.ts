export type AiMessage = {
    role: "user" | "assistant";
    content: string;
};
export declare function askAi(history: AiMessage[]): Promise<string>;
//# sourceMappingURL=openai.service.d.ts.map