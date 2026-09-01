import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, AlertTriangle, Activity, Gauge, Sparkles, Zap } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getSummary, type ModelSummaryComputed } from "@/lib/api"
import { useBaseUrl } from "@/hooks/use-base-url"
import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { readSnapshot, writeSnapshot } from "@/lib/snapshot-store"
import { HeaderBanner } from "@/components/header-banner"
import { FooterBar } from "@/components/footer-bar"
import { HealthGauge } from "@/components/health-gauge"
import { StatusDonut } from "@/components/status-donut"
import { PerformanceBarChart } from "@/components/performance-bar-chart"
import { ModelCard } from "@/components/model-card"
import { MultiModelChart } from "@/components/multi-model-chart"

const STALE_MS = 60 * 1000
const HOURS_OPTIONS = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "24h" },
  { value: 168, label: "7d" },
]
const DEFAULT_HOURS = 24

// /api/perf-metrics/summary returns per-model avg_latency_ms /
// success_rate / avg_tps; it does NOT include per-model request_count,
// output_tokens, etc. So the KPIs are simple averages across the model
// set — same approach new-api's own PerformanceOverview uses.
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
    const names = degraded.slice(0, 3).map((m) => m.model_name).join("、")
    const more = degraded.length > 3 ? ` 等 ${degraded.length} 个` : ""
    out.push({
      severity: "danger",
      message: `${degraded.length} 个模型成功率 < 95%：${names}${more}`,
    })
  }
  const slow = models.filter((m) => m.avg_latency_ms > 10_000)
  if (slow.length > 0) {
    const names = slow.slice(0, 3).map((m) => m.model_name).join("、")
    const more = slow.length > 3 ? ` 等 ${slow.length} 个` : ""
    out.push({
      severity: "warn",
      message: `${slow.length} 个模型平均延迟 > 10s：${names}${more}`,
    })
  }
  return out
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
  return Math.round(n).toString()
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms)) return "—"
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s"
  return Math.round(ms) + "ms"
}

export function DashboardPage() {
  const { baseUrl } = useBaseUrl()
  const queryClient = useQueryClient()
  const [hours, setHours] = useState<number>(DEFAULT_HOURS)
  const [snapshot, setSnapshot] = useState<{
    models: ModelSummaryComputed[]
    updatedAt: number
  } | null>(null)

  // Mirror new-api's own PerformanceOverview: useQuery with the same
  // 60s staleTime. No active polling. Pulling more often trips new-api's
  // 429. queryKey includes hours so changing the time-range tab
  // re-fetches on demand.
  const summaryQuery = useQuery({
    queryKey: ["perf-metrics-summary", hours, baseUrl ?? ""],
    queryFn: ({ signal }) => getSummary(hours, signal),
    enabled: Boolean(baseUrl),
    staleTime: STALE_MS,
    retry: false,
  })

  // Persist a Dexie snapshot on every fresh payload so a future outage
  // still has data to fall back to.
  useEffect(() => {
    if (!baseUrl || !summaryQuery.data) return
    void writeSnapshot(baseUrl, summaryQuery.data.models ?? [], Date.now())
  }, [baseUrl, summaryQuery.data])

  // On error, prefer the cached snapshot.
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
          summaryQuery.error instanceof Error ? summaryQuery.error.message : "unknown"
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

  const liveModels = summaryQuery.data?.models ?? []
  const models = snapshot ? snapshot.models : liveModels
  const summary = useMemo(() => summarize(models), [models])
  const alerts = useMemo(() => buildAlerts(models, summary), [models, summary])
  const usingSnapshot = Boolean(snapshot) && Boolean(summaryQuery.error)
  const updatedAt = usingSnapshot ? snapshot!.updatedAt : summaryQuery.dataUpdatedAt

  const { healthy, warn, danger, degraded } = useMemo(() => {
    const healthyArr: ModelSummaryComputed[] = []
    const warnArr: ModelSummaryComputed[] = []
    const dangerArr: ModelSummaryComputed[] = []
    const degradedNames: string[] = []
    for (const m of models) {
      if (m.success_rate >= 99) healthyArr.push(m)
      else if (m.success_rate >= 95) warnArr.push(m)
      else {
        dangerArr.push(m)
        degradedNames.push(m.model_name)
      }
    }
    return { healthy: healthyArr.length, warn: warnArr.length, danger: dangerArr.length, degraded: degradedNames }
  }, [models])

  const lastSyncLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"
  const connectionStatus: "online" | "stale" | "offline" = usingSnapshot
    ? "offline"
    : summaryQuery.isFetching
      ? "online"
      : "online"
  const isLoading = summaryQuery.isLoading || (Boolean(baseUrl) && !summaryQuery.data && !summaryQuery.error && !snapshot)

  return (
    <div className="min-h-svh bg-background">
      <HeaderBanner
        status={connectionStatus}
        onRefresh={() => void summaryQuery.refetch()}
        refreshing={summaryQuery.isFetching}
        lastSyncLabel={lastSyncLabel}
      />

      <main className="container mx-auto space-y-4 px-4 py-4">
        {/* 异常告警 */}
        {alerts.length > 0 && (
          <section className="space-y-1.5">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={
                  "flex items-start gap-2 rounded-md border px-3 py-1.5 text-xs backdrop-blur " +
                  (a.severity === "danger"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400")
                }
                role="alert"
              >
                {a.severity === "danger" ? (
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span>{a.message}</span>
              </div>
            ))}
          </section>
        )}

        {/* KPI 大字 — 5 张, 数字带 count-up 动画. 强制 grid-cols-5 保证指挥中心感,
            窄屏会自然换行, 不依赖断点. */}
        <section className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          <BigKpi
            label="总模型数"
            value={summary.totalModels}
            format={formatNumber}
            icon={<Sparkles className="size-4" />}
            tone="default"
            loading={isLoading}
          />
          <BigKpi
            label="平均 TPS"
            value={summary.avgTps}
            format={(n) => (Number.isFinite(n) ? n.toFixed(1) : "—")}
            icon={<Zap className="size-4" />}
            tone="default"
            loading={isLoading}
          />
          <BigKpi
            label="平均延迟"
            value={summary.avgLatency}
            format={(n) => formatLatency(n)}
            icon={<Gauge className="size-4" />}
            tone="default"
            loading={isLoading}
          />
          <BigKpi
            label="平均成功率"
            value={summary.successRate}
            format={(n) => (Number.isFinite(n) ? n.toFixed(1) + "%" : "—")}
            icon={<Activity className="size-4" />}
            tone={
              !Number.isFinite(summary.successRate)
                ? "default"
                : summary.successRate >= 99
                  ? "ok"
                  : summary.successRate >= 95
                    ? "warn"
                    : "danger"
            }
            loading={isLoading}
          />
          <BigKpi
            label="健康 / 异常"
            value={healthy}
            secondary={`${warn} 告警 / ${danger} 异常`}
            format={formatNumber}
            icon={<Activity className="size-4" />}
            tone={danger > 0 ? "danger" : warn > 0 ? "warn" : "ok"}
            loading={isLoading}
          />
        </section>

        {/* 趋势 + 健康度 (2:1) */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border/40 lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">TOP 5 模型性能趋势</CardTitle>
                  <CardDescription className="text-xs">
                    实线 = 平均延迟（左轴），虚线 = 成功率（右轴）
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  最近 {hours}h
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : summaryQuery.error && !usingSnapshot ? (
                <div className="text-sm text-rose-500">
                  加载失败：{summaryQuery.error instanceof Error
                    ? summaryQuery.error.message
                    : "unknown"}
                </div>
              ) : (
                <MultiModelChart
                  baseUrl={baseUrl!}
                  modelNames={models.slice(0, 5).map((m) => m.model_name)}
                  hours={hours}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">系统健康度</CardTitle>
              <CardDescription className="text-xs">实时仪表盘</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
                <HealthGauge
                  successRate={summary.successRate}
                  avgTps={summary.avgTps}
                  avgLatencyMs={summary.avgLatency}
                  healthy={healthy}
                  warn={warn}
                  danger={danger}
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* 排行 + 状态分布 (2:1) */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border/40 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">性能排行</CardTitle>
              <CardDescription className="text-xs">
                按平均延迟降序，绿色 ≥ 99% 成功率，黄色 ≥ 95%，红色 &lt; 95%
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : models.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <PerformanceBarChart models={models} />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">状态分布</CardTitle>
              <CardDescription className="text-xs">健康 / 告警 / 异常</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
                <StatusDonut
                  healthy={healthy}
                  warn={warn}
                  danger={danger}
                  degraded={degraded}
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* 模型详细卡片 */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">模型详细</h2>
            <span className="text-xs text-muted-foreground">共 {models.length} 个模型</span>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="text-sm text-muted-foreground">暂无数据</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {models.map((m) => (
                <ModelCard key={m.model_name} model={m} />
              ))}
            </div>
          )}
        </section>
      </main>

      <FooterBar
        hours={hours}
        onHoursChange={setHours}
        options={HOURS_OPTIONS}
        lastSyncMs={updatedAt}
        staleTimeMs={STALE_MS}
      />
    </div>
  )
}

// 大号 KPI 卡片 — 数字用 useAnimatedNumber 做 count-up 动效。
function BigKpi({
  label,
  value,
  secondary,
  format,
  icon,
  tone,
  loading,
}: {
  label: string
  value: number
  secondary?: string
  format: (n: number) => string
  icon: React.ReactNode
  tone: "default" | "ok" | "warn" | "danger"
  loading?: boolean
}) {
  const animated = useAnimatedNumber(value)
  const toneClass =
    tone === "ok"
      ? "text-emerald-500"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "danger"
          ? "text-rose-500"
          : "text-foreground"
  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur">
      <CardContent className="flex flex-col gap-1 p-2.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{label}</span>
          <span className="opacity-70">{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div className={"font-mono text-2xl font-bold tabular-nums leading-none " + toneClass}>
            {format(animated)}
          </div>
        )}
        {secondary && !loading && (
          <div className="text-[10px] text-muted-foreground">{secondary}</div>
        )}
      </CardContent>
    </Card>
  )
}
