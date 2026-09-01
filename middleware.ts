// Vercel Edge middleware that runs BEFORE the auto-injected Vite SPA middleware.
// We use it because Vercel unconditionally injects a SPA fallback middleware when
// `vite` is in any package.json, which intercepts /api/* and returns 404 even
// for serverless functions in `api/`. User-defined middleware runs first and
// can short-circuit by returning a Response, so we do the /api/proxy/* pass-
// through here instead of relying on a serverless function.
//
// Behaviour parity with api/proxy/[...path].ts (which this replaces for the
// Vercel host):
//   - only /api/proxy/* is matched, everything else falls through to Vite
//   - baseUrl must be http(s)://host[:port] (400 otherwise)
//   - strips `baseUrl` from outgoing query, forwards the rest
//   - copies non-hop-by-hop request headers
//   - rewrites `X-Upstream-Auth: Bearer <token>` into `Authorization: Bearer <token>`
//   - copies upstream response headers + body, status verbatim
//   - 8s timeout, returns 502 on timeout / network error

// Web Standard fetch/Request/Response (Edge runtime). Vercel middleware always
// runs in the Edge runtime regardless of framework, so we don't need Node APIs.

export const config = {
  // Only run middleware on /api/proxy/* — everything else (including the
  // Vite SPA routes and any future /api/* from other paths) falls through to
  // the platform's normal handling.
  matcher: ["/api/proxy/:path*"],
}

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

function jsonResponse(status: number, body: unknown, extra?: HeadersInit): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  })
  if (extra) {
    const e = new Headers(extra)
    e.forEach((v, k) => headers.set(k, v))
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-upstream-auth, authorization",
      "Access-Control-Max-Age": "86400",
    },
  })
}

export default async function middleware(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return corsPreflight()

  const url = new URL(req.url)

  // The matcher filters requests to /api/proxy/*, but `url.pathname` is still
  // the full request path. Strip the /api/proxy/ prefix so the rest mirrors
  // what the Vercel serverless function at api/proxy/[...path].ts used to
  // see in `req.query.path` (the upstream's path, which always starts with
  // "api/" because the new-api serverless exposes /api/...).
  const rest = url.pathname.replace(/^\/api\/proxy\//, "")

  const baseUrl = (url.searchParams.get("baseUrl") ?? "").trim().replace(/\/+$/, "")
  if (!baseUrl) return jsonResponse(400, { success: false, message: "baseUrl is required" })
  if (!rest) return jsonResponse(400, { success: false, message: "missing upstream path" })

  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return jsonResponse(400, { success: false, message: "invalid baseUrl: must be http(s)://host[:port]" })
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return jsonResponse(400, { success: false, message: "baseUrl must be http(s)" })
  }

  // Build target URL = baseUrl + "/api/" + rest.
  const target = new URL(`api/${rest}`, base)

  // Forward remaining query params (excluding `baseUrl`).
  url.searchParams.forEach((value, key) => {
    if (key === "baseUrl") return
    target.searchParams.append(key, value)
  })

  // Build upstream headers — copy non-hop-by-hop, rewrite X-Upstream-Auth.
  const upstreamHeaders = new Headers()
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower === "x-upstream-auth") {
      const v = value.startsWith("Bearer ") ? value : `Bearer ${value}`
      upstreamHeaders.set("Authorization", v)
      return
    }
    upstreamHeaders.set(key, value)
  })

  // Fetch with timeout. AbortController is the only way to enforce a deadline
  // in the Edge runtime.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS)

  // Read body once so we can pass it to fetch (Web standard requires a
  // body to be present for non-GET/HEAD; passing undefined for those is fine).
  let bodyBytes: ArrayBuffer | undefined
  if (req.method !== "GET" && req.method !== "HEAD") {
    bodyBytes = await req.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders,
      body: bodyBytes,
      signal: ctrl.signal,
      redirect: "follow",
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return jsonResponse(502, { success: false, message: `upstream fetch failed: ${reason}` })
  } finally {
    clearTimeout(timer)
  }

  // Stream upstream body back.
  const outBody = await upstream.arrayBuffer()
  const outHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower === "content-length") return
    outHeaders.set(key, value)
  })
  if (!outHeaders.has("Access-Control-Allow-Origin")) {
    outHeaders.set("Access-Control-Allow-Origin", "*")
  }

  return new Response(outBody, { status: upstream.status, headers: outHeaders })
}
