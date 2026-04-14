
export interface TraceRepository<TTrace = Record<string, unknown>> {
  save(trace: TTrace): Promise<void>
}
