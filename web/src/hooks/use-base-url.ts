import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "perf-dashboard.baseUrl"

function readStoredBaseUrl(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, "")
}

export function useBaseUrl() {
  const [baseUrl, setBaseUrlState] = useState<string | null>(() => readStoredBaseUrl())

  useEffect(() => {
    // Keep state in sync if a second tab updates localStorage.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setBaseUrlState(readStoredBaseUrl())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setBaseUrl = useCallback((next: string | null) => {
    if (next === null) {
      window.localStorage.removeItem(STORAGE_KEY)
      setBaseUrlState(null)
      return
    }
    const trimmed = next.trim().replace(/\/+$/, "")
    window.localStorage.setItem(STORAGE_KEY, trimmed)
    setBaseUrlState(trimmed)
  }, [])

  return { baseUrl, setBaseUrl }
}
