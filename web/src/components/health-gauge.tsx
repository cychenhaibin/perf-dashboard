import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import { EChart } from "@/components/echart"
import { useAnimatedNumber } from "@/hooks/use-animated-number"

type Tone = "ok" | "warn" | "danger"

function toneColor(t: Tone): string {
  return t === "ok" ? "#10b981" : t === "warn" ? "#f59e0b" : "#ef4444"
}

function classify(value: number, ranges: { ok: [number, number]; warn: [number, number] }): Tone {
  if (value >= ranges.ok[0] && value <= ranges.ok[1]) return "ok"
  if (value >= ranges.warn[0] && value <= ranges.warn[1]) return "warn"
  return "danger"
}

// One big center gauge for the headline metric, plus three small gauges
// for TPS / latency / success-rate so the eye gets the whole story at a
// glance. Color shifts to amber / rose when the metric exits the "ok"
// band; thresholds mirror the dashboard's alert logic.
export function HealthGauge({
  successRate,
  avgTps,
  avgLatencyMs,
  healthy,
  warn,
  danger,
}: {
  successRate: number
  avgTps: number
  avgLatencyMs: number
  healthy: number
  warn: number
  danger: number
}) {
  const animatedRate = useAnimatedNumber(successRate)
  const rateTone = Number.isFinite(successRate)
    ? classify(successRate, { ok: [99, 100], warn: [95, 99] })
    : "warn"
  const rateColor = toneColor(rateTone)
  const tpsTone = Number.isFinite(avgTps) && avgTps >= 20 ? "ok" : avgTps >= 10 ? "warn" : "danger"
  const latencyTone = Number.isFinite(avgLatencyMs) && avgLatencyMs < 5_000 ? "ok" : avgLatencyMs < 15_000 ? "warn" : "danger"

  const centerOption = useMemo<EChartsCoreOption | null>(() => {
    if (!Number.isFinite(successRate)) return null
    return {
      animation: true,
      animationDuration: 700,
      series: [
        {
          type: "gauge",
          radius: "92%",
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          splitNumber: 10,
          progress: {
            show: true,
            width: 14,
            itemStyle: { color: rateColor },
          },
          axisLine: {
            lineStyle: {
              width: 14,
              color: [
                [0.95, "oklch(0.4 0.18 25)"],
                [0.99, "oklch(0.7 0.15 75)"],
                [1, "oklch(0.65 0.15 165)"],
              ],
            },
          },
          pointer: { show: false },
          axisTick: {
            distance: -22,
            length: 6,
            lineStyle: { color: "oklch(0.708 0 0)", width: 1 },
          },
          splitLine: {
            distance: -26,
            length: 10,
            lineStyle: { color: "oklch(0.708 0 0)", width: 1.5 },
          },
          axisLabel: {
            distance: -38,
            color: "oklch(0.708 0 0)",
            fontSize: 10,
          },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "5%"],
            formatter: (v: number) => v.toFixed(1) + "%",
            color: rateColor,
            fontSize: 36,
            fontWeight: 700,
          },
          data: [{ value: animatedRate }],
        },
      ],
    }
  }, [animatedRate, rateColor, successRate])

  const tpsOption = useMemo<EChartsCoreOption | null>(() => {
    if (!Number.isFinite(avgTps)) return null
    return miniGauge(avgTps, 80, toneColor(tpsTone as Tone))
  }, [avgTps, tpsTone])

  const latencyOption = useMemo<EChartsCoreOption | null>(() => {
    if (!Number.isFinite(avgLatencyMs)) return null
    return miniGauge(avgLatencyMs, 30_000, toneColor(latencyTone as Tone), (v) => formatMs(v))
  }, [avgLatencyMs, latencyTone])

  return (
    <div className="grid h-full grid-cols-1 gap-2">
      <div className="relative">
        <EChart option={centerOption} height="h-44" className="px-2" />
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          系统健康度
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-border/30 pt-2">
        <MiniGauge
          label="模型"
          value={`${healthy} / ${healthy + warn + danger}`}
          tone="ok"
        />
        <MiniGauge
          label="告警"
          value={String(warn)}
          tone={warn > 0 ? "warn" : "ok"}
        />
        <MiniGauge
          label="异常"
          value={String(danger)}
          tone={danger > 0 ? "danger" : "ok"}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">平均 TPS</div>
          <EChart option={tpsOption} height="h-20" />
        </div>
        <div>
          <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">平均延迟</div>
          <EChart option={latencyOption} height="h-20" />
        </div>
        <div>
          <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">在线</div>
          <div className="flex h-20 flex-col items-center justify-center">
            <div className={"text-3xl font-bold " + (danger > 0 ? "text-rose-400" : warn > 0 ? "text-amber-400" : "text-emerald-400")}>
              {healthy}
            </div>
            <div className="text-[10px] text-muted-foreground">/ {healthy + warn + danger} 模型</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function miniGauge(
  value: number,
  max: number,
  color: string,
  format: (v: number) => string = (v) => v.toFixed(1)
): EChartsCoreOption {
  return {
    animation: true,
    animationDuration: 600,
    series: [
      {
        type: "gauge",
        radius: "90%",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max,
        progress: {
          show: true,
          width: 6,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: {
            width: 6,
            color: [[1, "oklch(0.3 0 0)"]],
          },
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
          formatter: (v: number) => format(v),
          color,
          fontSize: 16,
          fontWeight: 600,
        },
        data: [{ value: Math.min(value, max) }],
      },
    ],
  }
}

function MiniGauge({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-rose-400"
  return (
    <div className="rounded-md border border-border/30 bg-card/40 px-2 py-1 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={"text-xl font-bold tabular-nums " + color}>{value}</div>
    </div>
  )
}

function formatMs(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(2) + "s"
  return Math.round(v) + "ms"
}
