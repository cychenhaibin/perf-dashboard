# Vercel Proxy API Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward Vercel dashboard proxy requests to upstream `/api/` resources and prevent HTML-to-JSON parsing failures.

**Architecture:** `middleware.ts` remains the Vercel Edge entry point for `/api/proxy/*`. A request-level Bun test captures the middleware's outbound fetch URL, making the upstream URL contract explicit before changing one URL construction expression.

**Tech Stack:** TypeScript, Vercel Edge Middleware APIs, Bun test runner.

## Global Constraints

- Preserve the public dashboard request shape: `/api/proxy/<resource>?baseUrl=<upstream>`.
- Preserve query parameters, auth forwarding, status passthrough, and existing error responses.
- Do not alter frontend calls or Vercel deployment configuration.

---

### Task 1: Correct the upstream API path

**Files:**
- Create: `middleware.test.ts`
- Modify: `middleware.ts:78`

**Interfaces:**
- Consumes: `middleware(req: Request): Promise<Response>` exported by `middleware.ts`.
- Produces: an outbound request to `<baseUrl>/api/<resource>`.

- [ ] **Step 1: Write the failing test**

```ts
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
    return new Response('{"success":true}', { headers: { "Content-Type": "application/json" } })
  }

  await middleware(new Request("https://dashboard.example/api/proxy/perf-metrics/summary?baseUrl=https%3A%2F%2Fupstream.example&hours=24"))

  expect(capturedUrl).toBe("https://upstream.example/api/perf-metrics/summary?hours=24")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test middleware.test.ts`

Expected: FAIL because current middleware fetches `https://upstream.example/perf-metrics/summary?hours=24` without the `/api/` prefix.

- [ ] **Step 3: Write minimal implementation**

```ts
const target = new URL(`api/${rest}`, base)
```

- [ ] **Step 4: Run test and type check to verify the fix**

Run: `bun test middleware.test.ts && (cd web && bun run typecheck)`

Expected: test passes and TypeScript exits with status 0.

- [ ] **Step 5: Deploy and inspect**

Run: `vercel --prod --yes` followed by `vercel inspect <deployment-url>`.

Expected: production deployment is Ready and lists `middleware` in its build output.
