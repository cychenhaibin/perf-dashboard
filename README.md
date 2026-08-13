# perf-dashboard

A standalone data dashboard for [new-api](https://github.com/QuantumNous/new-api)
model performance metrics. Solves the "click into every model card to check its
health" pain point by putting every model's TPS / latency / success rate on a
single screen with sparklines — no clicking required.

```
┌──────────────────────────────────────────────────────────────┐
│  [总请求]   [总Token]   [平均TPS]   [平均成功率]               │
│                                                              │
│  模型大表（一屏看完所有）：                                    │
│  claude-sonnet-4-6  ▁▃▅▆▇  65.9 t/s  4.57s  100%  1.2k    │
│  gpt-4o             ▂▄▅▄▅  42.1     2.3s   99%   980      │
│  ...                                                       │
│                                                              │
│  Top 5 趋势对比图 · 健康度仪表盘                                │
└──────────────────────────────────────────────────────────────┘
```

## What this is

- **Static shell + React SPA.** Go binary embeds the built frontend; total
  result is a single self-contained ~20 MB Docker image.
- **Zero business logic in the backend.** The shell does not proxy, forward,
  authenticate, or store any data. The React app talks directly to whichever
  new-api instance the user points it at.
- **Multi-instance by baseUrl.** A glassmorphism landing page asks for the
  new-api base URL on first visit, stores it in `localStorage`, and every
  request from then on is `{baseUrl}/api/...`. Switch instances by clicking
  the gear in the header.
- **Offline snapshot.** Each successful poll is written to IndexedDB; if the
  upstream goes away the dashboard keeps showing the last good snapshot with
  a "last updated" banner.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ perf-dashboard                                          │
│ ├── web/                  React + Vite + shadcn new-york-v4 │
│ ├── main.go               embed.FS static server        │
│ ├── Dockerfile            multi-stage: bun → go → distroless │
│ ├── .github/workflows/    build & push to Docker Hub    │
│ └── docker-compose.yml    one-liner deploy              │
└─────────────────────────────────────────────────────────┘
            │  axios (credentials: include)
            ▼
   {baseUrl from localStorage}  ──→  new-api /api/...
```

## Local development

Prereqs: Bun 1.3+, Go 1.22+.

```bash
# 1. Install frontend deps
make web-install

# 2. Run the Vite dev server (talks to the Go server on :5000)
make dev-web

# 3. In another terminal, run the Go server (it will use the placeholder
#    web_dist/index.html until you do a full `make build`)
make run
```

The dev server proxies `/api/*` to the base URL you typed in at runtime; the
Go server is only useful for production builds.

## Production build

```bash
make build           # builds web/, copies into web_dist/, compiles Go binary
./perf-dashboard     # listens on :5000 by default (override with PORT)
```

## Docker deploy

```bash
# 1. The CI workflow builds and pushes haibinchen/perf-dashboard:latest
#    on every push to main. You just pull and run:

mkdir -p /opt/perf-dashboard && cd /opt/perf-dashboard
curl -fsSL https://raw.githubusercontent.com/cychenhaibin/perf-dashboard/main/docker-compose.yml -o docker-compose.yml
docker compose pull
docker compose up -d

# 2. Browse to http://your-host:5000
```

### Updating

```bash
cd /opt/perf-dashboard
docker compose pull
docker compose up -d
docker image prune -f
```

## GitHub repo secrets

The deploy workflow needs exactly one secret (set under
`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `DOCKER` | A Docker Hub access token (Account Settings → Security → New Access Token) |

The Docker Hub username is hardcoded to `haibinchen` in the workflow's
`env:` block. The access token is read from `secrets.DOCKER`.

No SSH / server secrets are required — you deploy manually on the server
with `docker compose pull && docker compose up -d`.

## Configuration

The dashboard itself is configured entirely from the browser. The
"Configure" page is a glass card on a glass background; you give it a base
URL like `https://newapi.example.com` and from then on every
`/api/perf-metrics/...` request is sent to that origin. Clear localStorage
to reconfigure.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, shadcn/ui
  (new-york-v4, copied verbatim from the official registry, zero style
  tweaks), ECharts, Dexie.
- **Backend:** Go 1.22+ with `//go:embed` and the new `net/http` pattern
  routing for SPA fallback. Single static file, no DB, no proxy, no auth.

## License

MIT, same as new-api.
