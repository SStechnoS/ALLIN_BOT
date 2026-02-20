type JobType = 'email1' | 'email2' | 'callAlert' | 'remind24h' | 'remind5h' | 'abandonedFlow';
declare class SimpleQueue {
    add(_name: JobType, data: any, options?: {
        delay?: number;
        [key: string]: any;
    }): Promise<void>;
}
export declare const emailChainQueue: SimpleQueue;
export declare const remindersQueue: SimpleQueue;
export declare const flowQueue: SimpleQueue;
export declare function injectBot(bot: any): void;
export declare function startWorkers(): void;
export {};
//# sourceMappingURL=index.d.ts.map