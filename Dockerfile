# syntax=docker/dockerfile:1.7

# Stage 1 — build the React frontend with Bun.
# node:22-bookworm-slim 跟 model-probe 一致, 自带 npm 装 bun, 避开
# oven/bun:1 镜像在 ubuntu-latest runner 上的潜在拉取/兼容问题.
FROM node:22-bookworm-slim AS web-builder
WORKDIR /build/web
RUN npm install -g bun
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
COPY go.mod ./
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
