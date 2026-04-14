export interface ModelGatewayRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    metadata?: Record<string, unknown>;
}
export interface ModelGatewayResponse {
    output: string;
    metadata?: Record<string, unknown>;
}
export interface ModelGatewayService {
    chat(request: ModelGatewayRequest): Promise<ModelGatewayResponse>;
}
//# sourceMappingURL=model-gateway.d.ts.map