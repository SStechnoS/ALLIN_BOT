export declare function kvGet(key: string): string | null;
export declare function kvSet(key: string, value: string, ttlSeconds?: number): void;
export declare function kvDel(key: string): void;
export declare function kvIncr(key: string): number;
export declare function kvExpire(key: string, seconds: number): void;
//# sourceMappingURL=kv.d.ts.map