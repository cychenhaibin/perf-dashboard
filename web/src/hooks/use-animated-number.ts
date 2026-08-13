import { useEffect, useState } from "react"

// Animate a numeric value over `duration` ms with an ease-out cubic curve.
// Used by KPI cards so numbers count up from 0 on first render and
// smoothly retarget when fresh data arrives. The animation is purely
// visual — it does NOT touch the network, so React Query's staleTime
// still governs fetch cadence.
export function useAnimatedNumber(target: number, duration = 700): number {
  const [value, setValue] = useState<number>(Number.isFinite(target) ? 0 : NaN)

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(NaN)
      return
    }
    // If the previous value is NaN (initial load before data arrived, or
    // a previous NaN target), start the animation from 0 instead of
    // interpolating with NaN — which would produce NaN for the whole
    // curve and leave the KPI showing "—" forever.
    const from = Number.isFinite(value) ? value : 0
    const to = target
    if (from === to) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // We intentionally only react to `target` changes; using `value` here
    // would re-start the animation every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
