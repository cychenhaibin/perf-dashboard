import { useMemo } from "react"
import { cn } from "@/lib/utils"

type Tone = "ok" | "warn" | "danger"

const TONE_STROKE: Record<Tone, string> = {
  ok: "stroke-emerald-500",
  warn: "stroke-amber-500",
  danger: "stroke-rose-500",
}

const TONE_FILL: Record<Tone, string> = {
  ok: "fill-emerald-500/15",
  warn: "fill-amber-500/15",
  danger: "fill-rose-500/15",
}

export function Sparkline({
  values,
  tone = "ok",
  className,
}: {
  values: number[]
  tone?: Tone
  className?: string
}) {
  const path = useMemo(() => buildPath(values), [values])
  if (values.length < 2) {
    return (
      <div
        className={cn(
          "text-xs text-muted-foreground/60",
          className
        )}
        aria-label="no trend data"
      >
        —
      </div>
    )
  }
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn("block", className)}
      aria-label="trend"
    >
      <path d={path.fill} className={TONE_FILL[tone]} />
      <path
        d={path.stroke}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={TONE_STROKE[tone]}
      />
    </svg>
  )
}

function buildPath(values: number[]): { stroke: string; fill: string } {
  const w = 100
  const h = 30
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 100)
  const span = max - min || 1
  const stepX = w / (values.length - 1)
  let stroke = ""
  let fill = ""
  values.forEach((v, i) => {
    const x = i * stepX
    const y = h - ((v - min) / span) * h
    stroke += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  })
  fill = `${stroke} L ${w} ${h} L 0 ${h} Z`
  return { stroke, fill }
}
