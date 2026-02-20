export declare const redis: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ..._args: any[]) => Promise<string>;
    del: (key: string) => Promise<number>;
    incr: (key: string) => Promise<number>;
    expire: (key: string, seconds: number) => Promise<number>;
    quit: () => Promise<void>;
};
//# sourceMappingURL=redis.d.ts.map