import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import { EChart } from "@/components/echart"

// Donut breakdown of how many models fall into ok / warn / danger
// (success-rate ≥ 99% / ≥ 95% / < 95%). The center label shows the total
// model count; the legend doubles as a quick status summary.
export function StatusDonut({
  healthy,
  warn,
  danger,
  degraded,
}: {
  healthy: number
  warn: number
  danger: number
  degraded: string[]
}) {
  const option = useMemo<EChartsCoreOption | null>(() => {
    const total = healthy + warn + danger
    if (total === 0) return null
    return {
      animation: true,
      animationDuration: 600,
      tooltip: {
        trigger: "item",
        backgroundColor: "oklch(0.205 0 0 / 0.9)",
        borderColor: "oklch(1 0 0 / 0.1)",
        textStyle: { color: "oklch(0.985 0 0)" },
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: "oklch(0.708 0 0)", fontSize: 11 },
      },
      series: [
        {
          name: "状态分布",
          type: "pie",
          radius: ["55%", "78%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: "oklch(0.205 0 0)",
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          data: [
            { value: healthy, name: "健康", itemStyle: { color: "#10b981" } },
            { value: warn, name: "告警", itemStyle: { color: "#f59e0b" } },
            { value: danger, name: "异常", itemStyle: { color: "#ef4444" } },
          ],
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "42%",
          style: {
            text: String(total),
            fill: "oklch(0.985 0 0)",
            fontSize: 28,
            fontWeight: 700,
            textAlign: "center",
          },
        },
        {
          type: "text",
          left: "center",
          top: "54%",
          style: {
            text: "模型总数",
            fill: "oklch(0.708 0 0)",
            fontSize: 11,
            textAlign: "center",
          },
        },
      ],
    }
  }, [healthy, warn, danger])

  return (
    <div className="flex flex-col">
      <div className="h-56">
        <EChart option={option} height="h-full" />
      </div>
      {degraded.length > 0 && (
        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-xs">
          <div className="mb-1 font-medium text-rose-600 dark:text-rose-400">
            异常模型 ({degraded.length})
          </div>
          <div className="line-clamp-2 text-rose-700/80 dark:text-rose-300/80">
            {degraded.slice(0, 4).join("、")}
            {degraded.length > 4 ? ` 等 ${degraded.length} 个` : ""}
          </div>
        </div>
      )}
    </div>
  )
}
