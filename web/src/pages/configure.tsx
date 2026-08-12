import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Gauge } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBaseUrl } from "@/hooks/use-base-url"

function normalizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname) return null
    return u.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

export function ConfigurePage() {
  const { setBaseUrl } = useBaseUrl()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const normalized = normalizeBaseUrl(draft)
    if (!normalized) {
      setError("请输入合法的 baseUrl，例如 https://newapi.example.com")
      return
    }
    setSubmitting(true)
    // Ping /api/user/self to confirm the baseUrl is reachable and the upstream
    // new-api answers JSON. We don't care about the response body — a 200
    // means the URL is live; any other status surfaces a friendly error.
    try {
      const res = await fetch(`${normalized}/api/user/self`, {
        method: "GET",
        credentials: "include",
        signal: AbortSignal.timeout(8000),
      })
      // 200 (logged in) or 401 (login required) both mean the URL is reachable.
      if (res.status !== 200 && res.status !== 401) {
        throw new Error(`HTTP ${res.status}`)
      }
      setBaseUrl(normalized)
      toast.success("已配置 baseUrl", { description: normalized })
      navigate("/", { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "无法访问"
      setError(`无法访问 ${normalized}：${msg}`)
      toast.error("无法访问该地址", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background p-4">
      {/* Glassmorphism background — three layered radial gradients + a soft
          grain via mix-blend. Pure CSS, no images. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-32 -left-32 size-[40rem] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.6_0.2_264_/_0.35),transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-32 -right-24 size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.7_0.18_184_/_0.3),transparent_60%)] blur-2xl" />
        <div className="absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,oklch(0.65_0.22_330_/_0.22),transparent_60%)] blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-border/40 bg-card/40 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/40 backdrop-blur">
            <Gauge className="size-6" />
          </div>
          <CardTitle className="text-2xl">perf-dashboard</CardTitle>
          <CardDescription>
            输入 new-api 实例的 baseUrl 以开始
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                name="baseUrl"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://newapi.example.com"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={submitting}
                className="bg-background/60 backdrop-blur"
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                所有 /api/* 请求都会发送到这个地址。可以在右上角齿轮里重新配置。
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !draft.trim()}
            >
              {submitting ? "连接中..." : "进入"}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
