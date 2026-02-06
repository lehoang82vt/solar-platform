export declare const version = "0.1.0";
export interface HealthResponse {
    status: 'ok';
    version: string;
    database: 'connected' | 'disconnected';
    redis?: 'connected' | 'disconnected';
}
//# sourceMappingURL=index.d.ts.map