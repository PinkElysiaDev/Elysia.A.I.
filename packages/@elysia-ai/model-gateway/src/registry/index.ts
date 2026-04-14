
export interface ModelProviderInfo {
  name: string
  enabled: boolean
}

export interface ModelProviderRegistry {
  register(provider: ModelProviderInfo): void
  getAll(): ModelProviderInfo[]
}
