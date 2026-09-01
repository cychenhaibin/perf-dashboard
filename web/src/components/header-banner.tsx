import { useEffect, useState } from "react"
import { Gauge, Moon, RefreshCw, Settings2, Sun } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useBaseUrl } from "@/hooks/use-base-url"
import { useTheme } from "@/hooks/use-theme"

// Sticky top banner. Shows the project title, a live wall-clock, the
// upstream instance (baseUrl), the connection status (driven by the
// consumer — pass `status="online" | "offline" | "stale"`), and the
// reconfigure button. Kept short so it doesn't compete with the panels
// below for vertical space.
export function HeaderBanner({
  status,
  onRefresh,
  refreshing,
  lastSyncLabel,
}: {
  status: "online" | "offline" | "stale"
  onRefresh: () => void
  refreshing: boolean
  lastSyncLabel: string
}) {
  const { baseUrl, setBaseUrl } = useBaseUrl()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const dateLabel = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const timeLabel = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="relative flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="size-5" />
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background"
              aria-hidden
            />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">perf-dashboard</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              实时监控大屏
            </div>
          </div>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Status */}
        <div className="hidden items-center gap-2 sm:flex">
          <StatusDot status={status} />
          <span className="text-xs text-muted-foreground">
            {status === "online" ? "在线" : status === "stale" ? "缓存" : "离线"}
          </span>
        </div>

        {/* baseUrl */}
        <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
            实例
          </span>
          <code className="truncate rounded-md bg-muted/40 px-2 py-0.5 font-mono text-xs">
            {baseUrl ?? "未配置"}
          </code>
        </div>

        <div className="flex-1 md:hidden" />

        {/* Last sync */}
        <div className="hidden text-right text-xs text-muted-foreground lg:block">
          <div>最后同步 {lastSyncLabel}</div>
        </div>

        {/* Live clock */}
        <div className="text-right">
          <div className="font-mono text-lg font-semibold tabular-nums leading-none">
            {timeLabel}
          </div>
          <div className="text-[10px] text-muted-foreground">{dateLabel}</div>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="刷新"
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setBaseUrl(null)
              navigate("/configure")
            }}
            aria-label="重新配置"
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}

function StatusDot({ status }: { status: "online" | "offline" | "stale" }) {
  const color =
    status === "online" ? "bg-emerald-500" : status === "stale" ? "bg-amber-500" : "bg-rose-500"
  return (
    <span className="relative flex size-2.5">
      <span
        className={
          "absolute inline-flex size-full animate-ping rounded-full opacity-75 " + color
        }
      />
      <span className={"relative inline-flex size-2.5 rounded-full " + color} />
    </span>
  )
}

// Sun/Moon toggle. Shows the icon of the mode you'll switch TO when
// clicked — the same convention the shadcn new-york-v4 dashboard demo
// uses, so existing muscle memory still works.
function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "切换到浅色模式" : "切换到深色模式"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n)
}
