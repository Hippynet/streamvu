export interface StreamVUConfig {
  version: 1
  exportedAt: string
  streams: Array<{
    id: string
    name: string
    url: string
    mountPoint: string | null
    displayOrder: number
    isVisible: boolean
  }>
}
