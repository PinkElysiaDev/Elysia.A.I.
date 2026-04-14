
export interface ModelRouteResult {
  provider: string
}

export interface ModelRouter {
  resolve(): ModelRouteResult
}
