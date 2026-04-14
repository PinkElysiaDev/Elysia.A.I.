export class ElysiaAIError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ElysiaAIError';
    }
}
