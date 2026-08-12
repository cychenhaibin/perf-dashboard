# syntax=docker/dockerfile:1.7

# Stage 1 — build the React frontend with Bun.
FROM oven/bun:1 AS web-builder
WORKDIR /build/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web ./
ENV CI=""
ENV DISABLE_ESLINT_PLUGIN="true"
RUN bun run build

# Stage 2 — build the Go binary, embedding the frontend bundle.
FROM golang:1.22-alpine AS go-builder
WORKDIR /build
ENV CGO_ENABLED=0
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
COPY --from=web-builder /build/web/dist ./web_dist
RUN go build -ldflags "-s -w" -o /perf-dashboard .

# Stage 3 — minimal runtime image. distroless/static has no shell, no package
# manager, ~2 MB; we just need to serve static files and that's it.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-builder /perf-dashboard /perf-dashboard
EXPOSE 5000
ENV PORT=5000
USER nonroot:nonroot
ENTRYPOINT ["/perf-dashboard"]
