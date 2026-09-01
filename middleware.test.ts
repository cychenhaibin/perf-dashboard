import { afterEach, expect, test } from "bun:test"
import middleware from "./middleware"

let capturedUrl = ""
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("forwards dashboard resources to the upstream API prefix", async () => {
  globalThis.fetch = async (input) => {
    capturedUrl = String(input)
    return new Response('{"success":true}', {
      headers: { "Content-Type": "application/json" },
    })
  }

  await middleware(
    new Request(
      "https://dashboard.example/api/proxy/perf-metrics/summary?baseUrl=https%3A%2F%2Fupstream.example&hours=24"
    )
  )

  expect(capturedUrl).toBe(
    "https://upstream.example/api/perf-metrics/summary?hours=24"
  )
})
