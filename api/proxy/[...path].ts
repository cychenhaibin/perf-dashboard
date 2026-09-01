// Vercel serverless function that mirrors the Go binary's proxyHandler in
// proxy.go: forwards `GET /api/proxy/{path}?baseUrl=...` to
// `{baseUrl}/api/{path}`. We run on Vercel because GitHub Pages is static-only
// and can't execute a proxy, while Vercel gives us a serverless runtime for free.
//
// Behaviour parity with the Go proxy:
//   - baseUrl must be http(s)://host[:port] (400 otherwise)
//   - strips `baseUrl` from outgoing query, forwards the rest
//   - copies non-hop-by-hop request headers
//   - rewrites `X-Upstream-Auth: Bearer <token>` into `Authorization: Bearer <token>`
//   - copies upstream response headers + body, status verbatim
//   - 8s timeout, returns 502 on timeout / network error
//
// CORS: this is server-to-server, so the browser sees us as same-origin. We
// still echo `Access-Control-Allow-Origin` so dev tools are happy.

import type { VercelRequest, VercelResponse } from "@vercel/node"

const PROXY_TIMEOUT_MS = 8000

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
])

function badRequest(res: VercelResponse, message: string) {
  return res.status(400).json({ success: false, message })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Preflight (harmless; same-origin callers won't trigger this).
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, x-upstream-auth, authorization"
    )
    res.setHeader("Access-Control-Max-Age", "86400")
    return res.status(204).end()
  }

  // Vercel parses dynamic-segment params into an array under `path`.
  const pathParam = req.query.path
  const rest = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam ?? "")

  const rawBase = req.query.baseUrl
  const baseUrl =
    typeof rawBase === "string"
      ? rawBase.trim().replace(/\/+$/, "")
      : ""

  if (!baseUrl) return badRequest(res, "baseUrl is required")
  if (!rest) return badRequest(res, "missing upstream path")

  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return badRequest(res, "invalid baseUrl: must be http(s)://host[:port]")
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return badRequest(res, "baseUrl must be http(s)")
  }

  // Build target URL = baseUrl + "/api/" + rest
  const target = new URL(`api/${rest}`, base)

  // Forward remaining query params (excluding `baseUrl` and `path`).
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "baseUrl" || k === "path") continue
    if (Array.isArray(v)) {
      for (const item of v) target.searchParams.append(k, String(item))
    } else if (v !== undefined) {
      target.searchParams.set(k, String(v))
    }
  }

  // Build upstream headers — copy non-hop-by-hop, rewrite X-Upstream-Auth.
  const upstreamHeaders: Record<string, string> = {}
  for (const [rawKey, rawVal] of Object.entries(req.headers)) {
    if (rawVal === undefined) continue
    const key = rawKey.toLowerCase()
    if (HOP_BY_HOP.has(key)) continue
    const value = Array.isArray(rawVal) ? rawVal.join(", ") : String(rawVal)
    if (key === "x-upstream-auth") {
      upstreamHeaders["Authorization"] = value.startsWith("Bearer ")
        ? value
        : `Bearer ${value}`
      continue
    }
    upstreamHeaders[rawKey] = value
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

  try {
    const init: RequestInit = {
      method: req.method,
      headers: upstreamHeaders,
      signal: controller.signal,
      redirect: "manual",
    }
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.body !== undefined &&
      req.body !== null
    ) {
      init.body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body)
    }

    const upstreamRes = await fetch(target.toString(), init)
    clearTimeout(timer)

    upstreamRes.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) return
      // Don't let upstream clobber our CORS header
      if (key.toLowerCase() === "access-control-allow-origin") return
      res.setHeader(key, value)
    })
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.status(upstreamRes.status)

    const buf = Buffer.from(await upstreamRes.arrayBuffer())
    return res.send(buf)
  } catch (err) {
    clearTimeout(timer)
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return res
      .status(502)
      .json({ success: false, message: `upstream fetch failed: ${message}` })
  }
}
