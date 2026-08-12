import { useCallback, useEffect, useState } from "react"

const BASE_URL_KEY = "perf-dashboard.baseUrl"
const TOKEN_KEY = "perf-dashboard.apiToken"

// Module-level cache so multiple useBaseUrl() callers in different
// components share the same value. (React's useState is per component
// instance, which made App and Dashboard disagree on first render when the
// URL query was consumed by the first reader and stripped before the
// second one ran.)
let cachedBaseUrl: string | null = readInitialBaseUrl()
let cachedToken: string | null = readInitialToken()
const listeners = new Set<() => void>()
function notify() {
  for (const fn of listeners) fn()
}

function readInitialBaseUrl(): string | null {
  if (typeof window === "undefined") return null
  // ?baseUrl=... on the URL wins. We persist it and strip the query so
  // subsequent reloads don't re-trigger.
  try {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get("baseUrl")
    if (fromQuery) {
      const trimmed = fromQuery.trim().replace(/\/+$/, "")
      if (trimmed) {
        window.localStorage.setItem(BASE_URL_KEY, trimmed)
        const fromQueryToken = params.get("apiToken")
        if (fromQueryToken && fromQueryToken.trim()) {
          window.localStorage.setItem(TOKEN_KEY, fromQueryToken.trim())
        }
        params.delete("baseUrl")
        params.delete("apiToken")
        const leftover = params.toString()
        const cleaned =
          window.location.pathname +
          (leftover ? "?" + leftover : "") +
          window.location.hash
        window.history.replaceState({}, "", cleaned)
        return trimmed
      }
    }
  } catch {
    // fall through
  }
  const raw = window.localStorage.getItem(BASE_URL_KEY)
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, "")
}

function readInitialToken(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(TOKEN_KEY)
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed === "" ? null : trimmed
}

export function useBaseUrl() {
  // Subscribe to module-level cache. We intentionally don't store the
  // value in useState per component, because App and Dashboard each
  // called useBaseUrl and disagreed on first render.
  const [, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1)
    listeners.add(onChange)
    const onStorage = (e: StorageEvent) => {
      if (e.key === BASE_URL_KEY) {
        cachedBaseUrl = readInitialBaseUrl()
        notify()
      } else if (e.key === TOKEN_KEY) {
        cachedToken = readInitialToken()
        notify()
      }
    }
    window.addEventListener("storage", onStorage)
    return () => {
      listeners.delete(onChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const setBaseUrl = useCallback((next: string | null) => {
    if (next === null) {
      window.localStorage.removeItem(BASE_URL_KEY)
      cachedBaseUrl = null
    } else {
      const trimmed = next.trim().replace(/\/+$/, "")
      window.localStorage.setItem(BASE_URL_KEY, trimmed)
      cachedBaseUrl = trimmed
    }
    notify()
  }, [])

  const setApiToken = useCallback((next: string | null) => {
    if (next === null || next.trim() === "") {
      window.localStorage.removeItem(TOKEN_KEY)
      cachedToken = null
    } else {
      const trimmed = next.trim()
      window.localStorage.setItem(TOKEN_KEY, trimmed)
      cachedToken = trimmed
    }
    notify()
  }, [])

  const clear = useCallback(() => {
    window.localStorage.removeItem(BASE_URL_KEY)
    window.localStorage.removeItem(TOKEN_KEY)
    cachedBaseUrl = null
    cachedToken = null
    notify()
  }, [])

  return { baseUrl: cachedBaseUrl, apiToken: cachedToken, setBaseUrl, setApiToken, clear }
}
