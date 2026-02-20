declare class OpenAIService {
    chat(tgId: number, userMessage: string): Promise<string>;
    transcribeVoice(audioBuffer: Buffer, mimeType?: string): Promise<string>;
    private getHistory;
    private saveHistory;
    private checkRateLimit;
}
export declare const openaiService: OpenAIService;
export {};
//# sourceMappingURL=openai.service.d.ts.map