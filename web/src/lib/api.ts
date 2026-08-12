// Thin wrapper around the new-api performance metrics endpoints.
// All requests are sent to whatever baseUrl is currently stored in
// localStorage; the dashboard never proxies through its own server.

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

export type ApiEnvelope<T> = {
  success: boolean
  message: string
  data: T
}

async function get<T>(baseUrl: string, path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as ApiEnvelope<T>
  if (!json.success) {
    throw new Error(json.message || "request failed")
  }
  return json.data
}

export function getSummary(baseUrl: string, hours = 24, signal?: AbortSignal) {
  return get<SummaryAllData>(baseUrl, `/api/perf-metrics/summary?hours=${hours}`, signal)
}

export function getModelMetrics(
  baseUrl: string,
  model: string,
  hours = 24,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ model, hours: String(hours) })
  return get<PerformanceMetricsData>(baseUrl, `/api/perf-metrics?${params.toString()}`, signal)
}
