import { useEffect, useState } from "react"

// Footer with the time-range tabs, a heartbeat indicator that pulses on
// every fresh data arrival, and a countdown showing how long until the
// next refetch is allowed (driven by React Query's 60s staleTime).
export function FooterBar({
  hours,
  onHoursChange,
  options,
  lastSyncMs,
  staleTimeMs,
}: {
  hours: number
  onHoursChange: (next: number) => void
  options: { value: number; label: string }[]
  lastSyncMs: number
  staleTimeMs: number
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const sinceSync = lastSyncMs > 0 ? Math.max(0, Math.floor((now - lastSyncMs) / 1000)) : null
  const untilRefresh = lastSyncMs > 0 ? Math.max(0, Math.ceil((staleTimeMs - (now - lastSyncMs)) / 1000)) : null

  return (
    <footer className="mt-6 border-t border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        {/* Time range tabs */}
        <div className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 p-0.5">
          {options.map((o) => {
            const active = hours === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onHoursChange(o.value)}
                className={
                  "rounded-sm px-2.5 py-1 font-mono text-[11px] transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {o.label}
              </button>
            )
          })}
        </div>

        {/* Heartbeat + countdown */}
        <div className="flex items-center gap-4">
          {sinceSync !== null && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>心跳 {sinceSync}s ago</span>
            </div>
          )}
          {untilRefresh !== null && untilRefresh > 0 && (
            <span className="font-mono">下次刷新 {untilRefresh}s</span>
          )}
        </div>
      </div>
    </footer>
  )
}
