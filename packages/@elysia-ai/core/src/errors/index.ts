
export class ElysiaAIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElysiaAIError'
  }
}
