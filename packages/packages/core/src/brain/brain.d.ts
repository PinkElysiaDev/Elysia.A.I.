export interface BrainRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    metadata?: Record<string, unknown>;
}
export interface BrainResponse {
    output: string;
    metadata?: Record<string, unknown>;
}
export interface BrainService {
    chat(request: BrainRequest): Promise<BrainResponse>;
}
//# sourceMappingURL=brain.d.ts.map