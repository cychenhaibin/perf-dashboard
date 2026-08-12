// Type definitions for the new-api performance metrics endpoints.

export type ModelSummary = {
  model_name: string
  request_count: number
  success_count: number
  total_latency_ms: number
  output_tokens: number
  generation_ms: number
}

export type AvgLatencySuccessTps = {
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
}

export type ModelSummaryComputed = ModelSummary & AvgLatencySuccessTps & {
  recent_success_rates: number[]
}

export type SummaryAllData = {
  models: ModelSummaryComputed[]
}

export type BucketPoint = {
  ts: number
  avg_ttft_ms: number
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
}

export type GroupResult = {
  group: string
  avg_ttft_ms: number
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  series: BucketPoint[]
}

export type PerformanceMetricsData = {
  model_name: string
  series_schema: string
  groups: GroupResult[]
}
