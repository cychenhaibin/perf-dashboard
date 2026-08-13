import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import { EChart } from "@/components/echart"
import { Badge } from "@/components/ui/badge"
import { Sparkline } from "@/components/sparkline"
import type { ModelSummaryComputed } from "@/lib/api-types"
import { useAnimatedNumber } from "@/hooks/use-animated-number"

type Tone = "ok" | "warn" | "danger"

function toneFor(successRate: number, latencyMs: number): Tone {
  if (successRate < 95) return "danger"
  if (successRate < 99) return "warn"
  if (latencyMs > 15_000) return "warn"
  return "ok"
}

function toneColor(t: Tone): string {
  return t === "ok" ? "#10b981" : t === "warn" ? "#f59e0b" : "#ef4444"
}

function toneBorderClass(t: Tone): string {
  return t === "ok"
    ? "border-emerald-500/30"
    : t === "warn"
      ? "border-amber-500/40"
      : "border-rose-500/40"
}

function toneTextClass(t: Tone): string {
  return t === "ok"
    ? "text-emerald-600 dark:text-emerald-400"
    : t === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400"
}

// Per-model mini dashboard. Shows the model name, a 3-stat strip
// (TPS / latency / success), a sparkline of recent success rates, and a
// compact gauge for success rate. The whole card lights up with a
// colored border matching the model's health.
export function ModelCard({ model }: { model: ModelSummaryComputed }) {
  const tone = toneFor(model.success_rate, model.avg_latency_ms)
  const animatedTps = useAnimatedNumber(model.avg_tps)
  const animatedLatency = useAnimatedNumber(model.avg_latency_ms)

  const successGaugeOption = useMemo<EChartsCoreOption | null>(() => {
    if (!Number.isFinite(model.success_rate)) return null
    return {
      animation: true,
      animationDuration: 500,
      series: [
        {
          type: "gauge",
          radius: "95%",
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          progress: {
            show: true,
            width: 4,
            itemStyle: { color: toneColor(tone) },
          },
          axisLine: {
            lineStyle: { width: 4, color: [[1, "oklch(0.3 0 0)"]] },
          },
          pointer: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "0%"],
            formatter: (v: number) => v.toFixed(1) + "%",
            color: toneColor(tone),
            fontSize: 12,
            fontWeight: 600,
          },
          data: [{ value: model.success_rate }],
        },
      ],
    }
  }, [model.success_rate, tone])

  return (
    <div
      className={
        "group relative overflow-hidden rounded-lg border bg-card/60 p-3 backdrop-blur transition-colors " +
        toneBorderClass(tone)
      }
    >
      {/* Top status bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm font-semibold" title={model.model_name}>
            {model.model_name}
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            "shrink-0 border-0 px-1.5 py-0 text-[10px] " +
            (tone === "ok"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : tone === "warn"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400")
          }
        >
          {tone === "ok" ? "健康" : tone === "warn" ? "告警" : "异常"}
        </Badge>
      </div>

      {/* Stats grid */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="TPS" value={Number.isFinite(animatedTps) ? animatedTps.toFixed(1) : "—"} />
        <Stat
          label="延迟"
          value={
            Number.isFinite(animatedLatency)
              ? animatedLatency >= 1000
                ? (animatedLatency / 1000).toFixed(2) + "s"
                : Math.round(animatedLatency) + "ms"
              : "—"
          }
        />
        <Stat
          label="成功率"
          value={Number.isFinite(model.success_rate) ? model.success_rate.toFixed(1) + "%" : "—"}
          className={toneTextClass(tone)}
        />
      </div>

      {/* Mini gauge + sparkline row */}
      <div className="mt-2 flex items-end gap-2">
        <div className="h-12 w-12 shrink-0">
          <EChart option={successGaugeOption} height="h-12" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">近期成功率</div>
          <Sparkline
            values={model.recent_success_rates ?? []}
            tone={tone}
            className="h-7 w-full"
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-1 py-1">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={"tabular-nums font-mono text-sm font-semibold " + (className ?? "")}>
        {value}
      </div>
    </div>
  )
}
