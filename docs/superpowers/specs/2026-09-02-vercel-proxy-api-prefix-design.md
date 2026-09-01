# Vercel Proxy API Prefix Design

## Goal

Ensure Vercel's Edge middleware forwards dashboard proxy requests to the upstream `new-api` endpoint under `/api/`, so dashboard data requests receive JSON rather than the upstream SPA HTML page.

## Scope

The request path accepted by the dashboard remains `/api/proxy/<resource>`. The middleware removes that local prefix and must construct the upstream URL as `<baseUrl>/api/<resource>`, preserving non-`baseUrl` query parameters and existing header forwarding behavior.

## Design

Modify only `middleware.ts`: after extracting the resource path from `/api/proxy/`, prepend `api/` when constructing the upstream URL. No frontend request shape, Vercel rewrite, authentication header, or response-handling behavior changes.

Add a Bun request-level regression test at `middleware.test.ts`. It replaces the global `fetch` for the duration of the test, invokes the exported middleware with the same request shape used by the dashboard, and asserts that the captured upstream URL is `https://upstream.example/api/perf-metrics/summary?hours=24`.

## Error Handling

The existing 400 validation for missing or invalid `baseUrl`, 502 network error mapping, and response passthrough remain unchanged. An upstream HTML response caused by the missing API prefix is eliminated by targeting the API endpoint.

## Verification

Run the new test once before the implementation to demonstrate the existing URL is missing `/api/`, run it again after the one-line middleware change, then run frontend type checking and production deployment inspection.
