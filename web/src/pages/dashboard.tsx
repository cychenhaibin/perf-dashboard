import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Activity, Gauge, RefreshCw, Settings2, WifiOff, Zap } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSummary, type ModelSummaryComputed } from "@/lib/api"
import { useBaseUrl } from "@/hooks/use-base-url"
import { readSnapshot, writeSnapshot } from "@/lib/snapshot-store"
import { Sparkline } from "@/components/sparkline"

const POLL_INTERVAL_MS = 10_000

type LoadState =
  | { kind: "loading" }
  | { kind: "live"; models: ModelSummaryComputed[]; updatedAt: number }
  | { kind: "snapshot"; models: ModelSummaryComputed[]; updatedAt: number }
  | { kind: "error"; message: string }

function summarize(models: ModelSummaryComputed[]) {
  let totalRequests = 0
  let totalSuccess = 0
  let totalOutputTokens = 0
  let totalGenerationMs = 0
  let totalLatencyMs = 0
  for (const m of models) {
    totalRequests += m.request_count
    totalSuccess += m.success_count
    totalOutputTokens += m.output_tokens
    totalGenerationMs += m.generation_ms
    totalLatencyMs += m.total_latency_ms
  }
  const avgTps =
    totalGenerationMs > 0 ? (totalOutputTokens / (totalGenerationMs / 1000)) : 0
  const successRate =
    totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0
  const avgLatency = totalRequests > 0 ? totalLatencyMs / totalRequests : 0
  return { totalRequests, successRate, avgTps, avgLatency }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
  return Math.round(n).toString()
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s"
  return Math.round(ms) + "ms"
}

export function DashboardPage() {
  const { baseUrl, setBaseUrl } = useBaseUrl()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [now, setNow] = useState<number>(() => Date.now())
  const abortRef = useRef<AbortController | null>(null)

  const fetchNow = useCallback(async () => {
    if (!baseUrl) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const data = await getSummary(baseUrl, 24, ctrl.signal)
      const models = data.models ?? []
      const updatedAt = Date.now()
      // Best-effort: write to IndexedDB so a future outage still has data.
      void writeSnapshot(baseUrl, models, updatedAt)
      setState({ kind: "live", models, updatedAt })
    } catch (err) {
      if (ctrl.signal.aborted) return
      const message = err instanceof Error ? err.message : "unknown"
      const cached = await readSnapshot(baseUrl)
      if (cached) {
        setState({
          kind: "snapshot",
          models: cached.models,
          updatedAt: cached.updatedAt,
        })
        toast.warning("已切换到离线快照", {
          description: `上次更新 ${new Date(cached.updatedAt).toLocaleTimeString()} · ${message}`,
        })
      } else {
        setState({ kind: "error", message })
        toast.error("拉取失败", { description: message })
      }
    }
  }, [baseUrl])

  useEffect(() => {
    if (!baseUrl) return
    void fetchNow()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => void fetchNow(), POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVis = () => {
      if (document.hidden) {
        stop()
      } else {
        void fetchNow()
        start()
      }
    }
    start()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVis)
      abortRef.current?.abort()
    }
  }, [baseUrl, fetchNow])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const models = state.kind === "live" || state.kind === "snapshot"
    ? state.models
    : []
  const summary = useMemo(() => summarize(models), [models])
  const lastUpdatedLabel = useMemo(() => {
    if (state.kind !== "live" && state.kind !== "snapshot") return "—"
    return new Date(state.updatedAt).toLocaleTimeString()
  }, [state, now])

  const onReconfigure = () => {
    setBaseUrl(null)
    navigate("/configure")
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Gauge className="size-4" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              perf-dashboard
            </h1>
          </div>
          <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden truncate rounded-md bg-muted/40 px-2 py-0.5 sm:inline">
              {baseUrl}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {state.kind === "snapshot" && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <WifiOff className="mr-1 size-3" />
                离线快照
              </Badge>
            )}
            <span className="hidden sm:inline">
              {state.kind === "loading" ? "加载中…" : `更新于 ${lastUpdatedLabel}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void fetchNow()}
              disabled={state.kind === "loading"}
              aria-label="刷新"
            >
              <RefreshCw
                className={
                  state.kind === "loading" ? "size-4 animate-spin" : "size-4"
                }
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onReconfigure}
              aria-label="重新配置"
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        {/* KPI 顶栏 */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="总请求"
            value={state.kind === "loading" ? null : formatNumber(summary.totalRequests)}
            icon={<Activity className="size-4" />}
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="平均 TPS"
            value={state.kind === "loading" ? null : summary.avgTps.toFixed(1)}
            icon={<Zap className="size-4" />}
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="平均延迟"
            value={
              state.kind === "loading" ? null : formatLatency(summary.avgLatency)
            }
            icon={<Gauge className="size-4" />}
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="平均成功率"
            value={
              state.kind === "loading" ? null : summary.successRate.toFixed(1) + "%"
            }
            icon={<Activity className="size-4" />}
            tone={
              state.kind === "loading" || summary.successRate >= 99
                ? "default"
                : summary.successRate >= 95
                  ? "warn"
                  : "danger"
            }
            loading={state.kind === "loading"}
          />
        </section>

        {/* 模型大表 */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle>模型性能</CardTitle>
            <CardDescription>
              所有模型的 24h TPS、延迟、成功率（按请求量排序）
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.kind === "loading" ? (
              <Skeleton className="h-72 w-full" />
            ) : state.kind === "error" ? (
              <div className="text-sm text-destructive">
                加载失败：{state.message}
              </div>
            ) : models.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>趋势</TableHead>
                    <TableHead className="text-right">TPS</TableHead>
                    <TableHead className="text-right">平均延迟</TableHead>
                    <TableHead className="text-right">成功率</TableHead>
                    <TableHead className="text-right">请求数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.model_name}>
                      <TableCell className="font-medium">
                        {m.model_name}
                      </TableCell>
                      <TableCell>
                        <Sparkline
                          values={m.recent_success_rates ?? []}
                          tone={
                            m.success_rate >= 99
                              ? "ok"
                              : m.success_rate >= 95
                                ? "warn"
                                : "danger"
                          }
                          className="h-7 w-28"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.avg_tps.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatLatency(m.avg_latency_ms)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            m.success_rate >= 99
                              ? "default"
                              : m.success_rate >= 95
                                ? "secondary"
                                : "destructive"
                          }
                          className="tabular-nums"
                        >
                          {m.success_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(m.request_count)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

type Tone = "default" | "warn" | "danger"
function KpiCard({
  label,
  value,
  icon,
  tone = "default",
  loading,
}: {
  label: string
  value: string | null
  icon: React.ReactNode
  tone?: Tone
  loading?: boolean
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground"
  return (
    <Card className="border-border/40">
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        {loading || value === null ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className={"text-2xl font-semibold tabular-nums " + toneClass}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
