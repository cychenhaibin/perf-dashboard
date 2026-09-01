import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import { EChart } from "@/components/echart"
import type { ModelSummaryComputed } from "@/lib/api-types"

// Horizontal bar chart ranking models by average latency (slowest at the
// top). Each bar is colored by success-rate tone so a slow model with a
// low success rate pops out visually.
export function PerformanceBarChart({ models }: { models: ModelSummaryComputed[] }) {
  const option = useMemo<EChartsCoreOption | null>(() => {
    if (models.length === 0) return null
    const sorted = [...models].sort((a, b) => b.avg_latency_ms - a.avg_latency_ms)
    const data = sorted.map((m) => ({
      name: m.model_name,
      value: Math.round(m.avg_latency_ms),
      tone: m.success_rate >= 80 ? 0 : m.success_rate >= 70 ? 1 : 2,
    }))
    return {
      animation: true,
      animationDuration: 600,
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "oklch(0.205 0 0 / 0.9)",
        borderColor: "oklch(1 0 0 / 0.1)",
        textStyle: { color: "oklch(0.985 0 0)" },
        formatter: (params: { value: number; name: string } | { value: number; name: string }[]) => {
          const p = Array.isArray(params) ? params[0] : params
          const m = sorted.find((x) => x.model_name === p.name)
          if (!m) return ""
          return [
            `<div style="font-weight:600;margin-bottom:4px">${m.model_name}</div>`,
            `延迟: ${m.avg_latency_ms.toFixed(0)} ms`,
            `TPS: ${m.avg_tps.toFixed(1)}`,
            `成功率: ${m.success_rate.toFixed(1)}%`,
          ].join("<br/>")
        },
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "oklch(0.708 0 0)", fontSize: 10, formatter: (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + "s" : v + "ms") },
        splitLine: { lineStyle: { color: "oklch(1 0 0 / 0.06)" } },
      },
      yAxis: {
        type: "category",
        data: data.map((d) => d.name),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "oklch(0.85 0 0)",
          fontSize: 11,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
      },
      series: [
        {
          name: "平均延迟",
          type: "bar",
          data: data.map((d) => ({
            value: d.value,
            itemStyle: {
              color: d.tone === 0 ? "#10b981" : d.tone === 1 ? "#f59e0b" : "#ef4444",
              borderRadius: [0, 3, 3, 0],
            },
          })),
          barWidth: 12,
          label: {
            show: true,
            position: "right",
            color: "oklch(0.85 0 0)",
            fontSize: 10,
            formatter: (p: { value: number }) => (p.value >= 1000 ? (p.value / 1000).toFixed(2) + "s" : p.value + "ms"),
          },
        },
      ],
    }
  }, [models])

  return <EChart option={option} height="h-72" />
}
