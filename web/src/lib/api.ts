// All requests go through the Go server's /api/proxy/* endpoint, which
// forwards to whichever baseUrl the user typed in. We never make cross-origin
// requests directly because new-api's /api/* paths don't ship CORS headers.

import type {
  BucketPoint,
  GroupResult,
  ModelSummaryComputed,
  PerformanceMetricsData,
  SummaryAllData,
} from "./api-types"

const TOKEN_KEY = "perf-dashboard.apiToken"

function readBaseUrl(): string {
  const raw = window.localStorage.getItem("perf-dashboard.baseUrl")
  if (!raw) {
    throw new Error("baseUrl not configured")
  }
  return raw.replace(/\/+$/, "")
}

function readToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

async function get<T>(proxyPath: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const baseUrl = readBaseUrl()
  const search = new URLSearchParams({ baseUrl, ...stringifyParams(params) })
  const token = readToken()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (token) headers["X-Upstream-Auth"] = `Bearer ${token}`
  const res = await fetch(`/api/proxy/${proxyPath}?${search.toString()}`, {
    method: "GET",
    credentials: "include",
    signal,
    headers,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as { success: boolean; message: string; data: T }
  if (!json.success) {
    throw new Error(json.message || "request failed")
  }
  return json.data
}

async function ping(baseUrl: string, signal?: AbortSignal): Promise<{ status: number; ok: boolean }> {
  const search = new URLSearchParams({ baseUrl })
  const token = readToken()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (token) headers["X-Upstream-Auth"] = `Bearer ${token}`
  const res = await fetch(`/api/proxy/user/self?${search.toString()}`, {
    method: "GET",
    credentials: "include",
    signal,
    headers,
  })
  return { status: res.status, ok: res.ok || res.status === 401 }
}

function stringifyParams(p: Record<string, string | number>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(p)) out[k] = String(v)
  return out
}

export function getSummary(hours = 24, signal?: AbortSignal) {
  return get<SummaryAllData>("perf-metrics/summary", { hours }, signal)
}

export function getModelMetrics(
  model: string,
  hours = 24,
  signal?: AbortSignal
) {
  return get<PerformanceMetricsData>("perf-metrics", { model, hours }, signal)
}

export { ping }
export type {
  BucketPoint,
  GroupResult,
  ModelSummaryComputed,
  PerformanceMetricsData,
  SummaryAllData,
}
