import { useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts/core"
import { LineChart } from "echarts/charts"
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { EChartsCoreOption } from "echarts/core"

import { getModelMetrics, type GroupResult } from "@/lib/api"

echarts.use([
  LineChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

type Series = {
  modelName: string
  successSeries: Array<[number, number]> // [ts, successRate]
  latencySeries: Array<[number, number]> // [ts, avgLatencyMs]
}

const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
]

export function MultiModelChart({
  baseUrl,
  modelNames,
  hours = 24,
}: {
  baseUrl: string
  modelNames: string[]
  hours?: number
}) {
  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // Fetch per-model series. Done with Promise.all + AbortController so we
  // don't leak when the user changes baseUrl or unmounts mid-flight.
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all(
      modelNames.map(async (m): Promise<Series | null> => {
        try {
          const data = await getModelMetrics(baseUrl, m, hours, ctrl.signal)
          // Flatten every group into one series so we get a single
          // per-model trend. Groups are typically "default" + maybe "auto".
          const buckets = flattenBuckets(data.groups ?? [])
          if (buckets.length === 0) return null
          return {
            modelName: m,
            successSeries: buckets.map((b) => [b.ts, b.successRate] as [number, number]),
            latencySeries: buckets.map((b) => [b.ts, b.avgLatencyMs] as [number, number]),
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return null
          throw err
        }
      })
    )
      .then((rows) => {
        if (ctrl.signal.aborted) return
        setSeries(rows.filter((r): r is Series => r !== null))
        setLoading(false)
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : "unknown")
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [baseUrl, modelNames, hours])

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (series.length === 0) return null
    return {
      animation: false,
      grid: { left: 56, right: 56, top: 28, bottom: 36, containLabel: true },
      legend: {
        type: "scroll",
        bottom: 0,
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: "oklch(0.708 0 0)", fontSize: 11 },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "oklch(0.205 0 0 / 0.9)",
        borderColor: "oklch(1 0 0 / 0.1)",
        textStyle: { color: "oklch(0.985 0 0)" },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "oklch(1 0 0 / 0.1)" } },
        axisLabel: { color: "oklch(0.708 0 0)", fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: "value",
          name: "延迟 (ms)",
          nameTextStyle: { color: "oklch(0.708 0 0)", fontSize: 11 },
          axisLabel: { color: "oklch(0.708 0 0)", fontSize: 11 },
          splitLine: { lineStyle: { color: "oklch(1 0 0 / 0.06)" } },
        },
        {
          type: "value",
          name: "成功率 (%)",
          min: 0,
          max: 100,
          nameTextStyle: { color: "oklch(0.708 0 0)", fontSize: 11 },
          axisLabel: { color: "oklch(0.708 0 0)", fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: series.flatMap((s, i) => [
        {
          name: `${s.modelName} 延迟`,
          type: "line" as const,
          showSymbol: false,
          smooth: true,
          yAxisIndex: 0,
          data: s.latencySeries,
          lineStyle: { color: PALETTE[i % PALETTE.length], width: 1.5 },
          itemStyle: { color: PALETTE[i % PALETTE.length] },
        },
        {
          name: `${s.modelName} 成功率`,
          type: "line" as const,
          showSymbol: false,
          smooth: true,
          yAxisIndex: 1,
          data: s.successSeries,
          lineStyle: {
            color: PALETTE[i % PALETTE.length],
            width: 1.5,
            type: "dashed",
          },
          itemStyle: { color: PALETTE[i % PALETTE.length] },
        },
      ]),
    }
  }, [series])

  // Mount/update ECharts instance
  useEffect(() => {
    if (!containerRef.current || !option) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, {
        renderer: "canvas",
      })
    }
    chartRef.current.setOption(option, { notMerge: true })
    const onResize = () => chartRef.current?.resize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
    }
  }, [option])

  // Dispose on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        加载趋势中…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-destructive">
        加载失败：{error}
      </div>
    )
  }
  if (series.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    )
  }
  return <div ref={containerRef} className="h-72 w-full" />
}

function flattenBuckets(groups: GroupResult[]) {
  const buckets = new Map<
    number,
    { ts: number; latencySum: number; successSum: number; n: number }
  >()
  for (const g of groups) {
    for (const b of g.series) {
      const cur = buckets.get(b.ts) ?? {
        ts: b.ts,
        latencySum: 0,
        successSum: 0,
        n: 0,
      }
      cur.latencySum += b.avg_latency_ms
      cur.successSum += b.success_rate
      cur.n += 1
      buckets.set(b.ts, cur)
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({
      ts: b.ts * 1000,
      avgLatencyMs: b.n > 0 ? b.latencySum / b.n : 0,
      successRate: b.n > 0 ? b.successSum / b.n : 0,
    }))
}
