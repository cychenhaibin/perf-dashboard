import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, AlertTriangle } from "lucide-react"
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
import { MultiModelChart } from "@/components/multi-model-chart"

const HOURS = 24
const SUMMARY_KEY = ["perf-metrics-summary", HOURS] as const

// The /api/perf-metrics/summary endpoint returns per-model avg_latency_ms /
// success_rate / avg_tps; it does NOT include per-model request_count,
// output_tokens, generation_ms, etc. So the KPIs are simple averages across
// the model set, same approach new-api's own PerformanceOverview uses
// (buildPerformanceSummary in performance-overview.tsx). The "总模型数"
// count replaces what would have been a request-count aggregate.
function summarize(models: ModelSummaryComputed[]) {
  let latencySum = 0
  let latencyN = 0
  let tpsSum = 0
  let tpsN = 0
  let successSum = 0
  let successN = 0
  for (const m of models) {
    if (Number.isFinite(m.avg_latency_ms) && m.avg_latency_ms > 0) {
      latencySum += m.avg_latency_ms
      latencyN += 1
    }
    if (Number.isFinite(m.avg_tps) && m.avg_tps > 0) {
      tpsSum += m.avg_tps
      tpsN += 1
    }
    if (Number.isFinite(m.success_rate)) {
      successSum += m.success_rate
      successN += 1
    }
  }
  return {
    totalModels: models.length,
    avgLatency: latencyN > 0 ? latencySum / latencyN : NaN,
    avgTps: tpsN > 0 ? tpsSum / tpsN : NaN,
    successRate: successN > 0 ? successSum / successN : NaN,
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—"
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
  const queryClient = useQueryClient()
  // Tick for the "更新于" label so it auto-refreshes every second without
  // re-running any query. (Mirrors new-api's relative-time widgets; cheap
  // because it only re-renders this component.)
  const [now, setNow] = useState<number>(() => Date.now())

  // Mirror new-api's own PerformanceOverview: useQuery with the same
  // queryKey + staleTime: 60s. No active polling — React Query's built-in
  // cache prevents the upstream /api/perf-metrics from being hit more
  // than once per minute per key. Pulling more often trips new-api's 429.
  const summaryQuery = useQuery({
    queryKey: [...SUMMARY_KEY, baseUrl ?? ""],
    queryFn: ({ signal }) => getSummary(HOURS, signal),
    enabled: Boolean(baseUrl),
    staleTime: 60 * 1000,
    retry: false,
  })

  // Best-effort: write a Dexie snapshot whenever fresh data lands, so a
  // future outage still has data to fall back to.
  useEffect(() => {
    if (!baseUrl || !summaryQuery.data) return
    void writeSnapshot(baseUrl, summaryQuery.data.models ?? [], Date.now())
  }, [baseUrl, summaryQuery.data])

  // If the query errors and we have a snapshot, prefer that — and toast.
  const [snapshot, setSnapshot] = useState<{
    models: ModelSummaryComputed[]
    updatedAt: number
  } | null>(null)
  useEffect(() => {
    if (!baseUrl || !summaryQuery.error) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    void readSnapshot(baseUrl).then((cached) => {
      if (cancelled) return
      if (cached) {
        setSnapshot({ models: cached.models, updatedAt: cached.updatedAt })
        const message =
          summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : "unknown"
        toast.warning("已切换到离线快照", {
          description: `上次更新 ${new Date(cached.updatedAt).toLocaleTimeString()} · ${message}`,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [baseUrl, summaryQuery.error])

  // Returning to the foreground: ask React Query to refetch. The 60s
  // staleTime still throttles us, so this only does work if the cache
  // has actually gone stale.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        void queryClient.invalidateQueries({ queryKey: ["perf-metrics-summary"] })
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [queryClient])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const liveModels = summaryQuery.data?.models ?? []
  const models = snapshot ? snapshot.models : liveModels
  const summary = useMemo(() => summarize(models), [models])
  const alerts = useMemo(() => buildAlerts(models, summary), [models, summary])
  const usingSnapshot = Boolean(snapshot) && Boolean(summaryQuery.error)
  const updatedAt = usingSnapshot
    ? snapshot!.updatedAt
    : summaryQuery.dataUpdatedAt
  const lastUpdatedLabel = useMemo(() => {
    if (!updatedAt) return "—"
    return new Date(updatedAt).toLocaleTimeString()
  }, [updatedAt, now])

  const isLoading = summaryQuery.isLoading || (Boolean(baseUrl) && !summaryQuery.data && !summaryQuery.error && !snapshot)

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
            {usingSnapshot && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <WifiOff className="mr-1 size-3" />
                离线快照
              </Badge>
            )}
            <span className="hidden sm:inline">
              {isLoading ? "加载中…" : `更新于 ${lastUpdatedLabel}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void summaryQuery.refetch()}
              disabled={isLoading}
              aria-label="刷新"
            >
              <RefreshCw
                className={
                  isLoading ? "size-4 animate-spin" : "size-4"
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
        {/* 异常告警 */}
        {alerts.length > 0 && (
          <section className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm backdrop-blur " +
                  (a.severity === "danger"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400")
                }
                role="alert"
              >
                {a.severity === "danger" ? (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>{a.message}</span>
              </div>
            ))}
          </section>
        )}

        {/* KPI 顶栏 */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="总模型数"
            value={isLoading ? null : formatNumber(summary.totalModels)}
            icon={<Activity className="size-4" />}
            loading={isLoading}
          />
          <KpiCard
            label="平均 TPS"
            value={isLoading ? null : summary.avgTps.toFixed(1)}
            icon={<Zap className="size-4" />}
            loading={isLoading}
          />
          <KpiCard
            label="平均延迟"
            value={
              isLoading || !Number.isFinite(summary.avgLatency)
                ? null
                : formatLatency(summary.avgLatency)
            }
            icon={<Gauge className="size-4" />}
            loading={isLoading}
          />
          <KpiCard
            label="平均成功率"
            value={
              isLoading || !Number.isFinite(summary.successRate)
                ? null
                : summary.successRate.toFixed(1) + "%"
            }
            icon={<Activity className="size-4" />}
            tone={
              isLoading || !Number.isFinite(summary.successRate)
                ? "default"
                : summary.successRate >= 99
                  ? "default"
                  : summary.successRate >= 95
                    ? "warn"
                    : "danger"
            }
            loading={isLoading}
          />
        </section>

        {/* Top 5 趋势对比 */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle>Top 5 趋势</CardTitle>
            <CardDescription>
              实线 = 平均延迟（左轴 ms），虚线 = 成功率（右轴 %）；按请求量取前 5
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : summaryQuery.error && !usingSnapshot ? (
              <div className="text-sm text-destructive">
                加载失败：{summaryQuery.error instanceof Error
                  ? summaryQuery.error.message
                  : "unknown"}
              </div>
            ) : (
              <MultiModelChart
                baseUrl={baseUrl!}
                modelNames={models.slice(0, 5).map((m) => m.model_name)}
                hours={HOURS}
              />
            )}
          </CardContent>
        </Card>

        {/* 模型大表 */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle>模型性能</CardTitle>
            <CardDescription>
              所有模型的 24h TPS、延迟、成功率（按请求量排序）
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : summaryQuery.error && !usingSnapshot ? (
              <div className="text-sm text-destructive">
                加载失败：{summaryQuery.error instanceof Error
                  ? summaryQuery.error.message
                  : "unknown"}
              </div>
            ) : models.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>趋势</TableHead>
                    <TableHead className="text-right">TPS</TableHead>
                    <TableHead className="text-right">平均延迟</TableHead>
                    <TableHead className="text-right">成功率</TableHead>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

type Tone = "default" | "warn" | "danger"

type Alert = { severity: "warn" | "danger"; message: string }

function buildAlerts(
  models: ModelSummaryComputed[],
  summary: ReturnType<typeof summarize>
): Alert[] {
  const out: Alert[] = []
  if (models.length === 0) return out
  if (Number.isFinite(summary.successRate) && summary.successRate < 95) {
    out.push({
      severity: "danger",
      message: `整体成功率 ${summary.successRate.toFixed(1)}% 低于 95%`,
    })
  } else if (Number.isFinite(summary.successRate) && summary.successRate < 99) {
    out.push({
      severity: "warn",
      message: `整体成功率 ${summary.successRate.toFixed(1)}%（目标 ≥ 99%）`,
    })
  }
  const degraded = models.filter((m) => m.success_rate < 95)
  if (degraded.length > 0) {
    const names = degraded
      .slice(0, 3)
      .map((m) => m.model_name)
      .join("、")
    const more = degraded.length > 3 ? ` 等 ${degraded.length} 个` : ""
    out.push({
      severity: "danger",
      message: `${degraded.length} 个模型成功率 < 95%：${names}${more}`,
    })
  }
  const slow = models.filter((m) => m.avg_latency_ms > 10_000)
  if (slow.length > 0) {
    const names = slow
      .slice(0, 3)
      .map((m) => m.model_name)
      .join("、")
    const more = slow.length > 3 ? ` 等 ${slow.length} 个` : ""
    out.push({
      severity: "warn",
      message: `${slow.length} 个模型平均延迟 > 10s：${names}${more}`,
    })
  }
  return out
}

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
