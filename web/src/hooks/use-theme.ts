import { useCallback, useEffect, useState } from "react"

const THEME_KEY = "perf-dashboard.theme"

export type Theme = "dark" | "light"

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light"
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  try {
    const raw = window.localStorage.getItem(THEME_KEY)
    if (isTheme(raw)) return raw
  } catch {
    // localStorage may be blocked (e.g. SSR / privacy mode); fall through.
  }
  return "dark"
}

// The initial value is captured once at module load. The pre-paint
// inline script in index.html applies the same class on <html> before
// React mounts, so the user never sees a wrong-theme flash on reload.
let cachedTheme: Theme = readInitialTheme()
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
  // shadcn v4 / Tailwind v4 pick up the class via @custom-variant dark,
  // so all `dark:*` utilities re-render immediately.
  root.style.colorScheme = theme
}

// Push the initial class once in case the pre-paint script in
// index.html was skipped (e.g. during dev hot-reload).
applyTheme(cachedTheme)

export function useTheme() {
  // Subscribe so every useTheme() caller re-renders when the toggle fires.
  const [, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1)
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    if (next === cachedTheme) return
    cachedTheme = next
    try {
      window.localStorage.setItem(THEME_KEY, next)
    } catch {
      // ignore
    }
    applyTheme(next)
    notify()
  }, [])

  const toggle = useCallback(() => {
    setTheme(cachedTheme === "dark" ? "light" : "dark")
  }, [setTheme])

  return { theme: cachedTheme, setTheme, toggle }
}
