import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Gauge, KeyRound } from "lucide-react"
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
import { ping } from "@/lib/api"

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
  const { setBaseUrl, setApiToken } = useBaseUrl()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const [tokenDraft, setTokenDraft] = useState("")
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
    try {
      const result = await ping(normalized)
      if (!result.ok) {
        throw new Error(`HTTP ${result.status}`)
      }
      setBaseUrl(normalized)
      setApiToken(tokenDraft.trim() || null)
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
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/40 bg-card/60 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/40">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiToken" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                API Token <span className="text-muted-foreground">（可选）</span>
              </Label>
              <Input
                id="apiToken"
                name="apiToken"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-..."
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                disabled={submitting}
                className="bg-background/60 backdrop-blur"
              />
              <p className="text-xs text-muted-foreground">
                仅在 new-api 的 <code>/api/*</code> 路径未启用 CORS 时需要。
                可在 new-api 的"令牌管理"里创建。仅保存在本机浏览器。
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              所有 <code>/api/*</code> 请求都会经本机服务端转发到上面的地址。可以在右上角齿轮里重新配置。
            </p>
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
