import { useEffect, useRef } from "react"
import type { EChartsCoreOption } from "echarts/core"

import "@/lib/echarts"
import { echarts } from "@/lib/echarts"

// Shared wrapper that owns the ECharts instance lifecycle so individual
// chart components don't have to repeat init / setOption / dispose /
// resize boilerplate. Pass `option` to update the chart; pass `height`
// (e.g. "h-72") to control the container size.
export function EChart({
  option,
  height = "h-72",
  className,
  loading,
}: {
  option: EChartsCoreOption | null
  height?: string
  className?: string
  loading?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, {
        renderer: "canvas",
      })
    }
    const onResize = () => chartRef.current?.resize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    if (option) {
      chartRef.current.setOption(option, { notMerge: true })
    }
  }, [option])

  useEffect(() => {
    if (!chartRef.current) return
    if (loading) {
      chartRef.current.showLoading("default", {
        text: "",
        color: "oklch(0.708 0 0)",
        maskColor: "oklch(0.205 0 0 / 0.3)",
      })
    } else {
      chartRef.current.hideLoading()
    }
  }, [loading])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return <div ref={containerRef} className={"w-full " + height + (className ? " " + className : "")} />
}
