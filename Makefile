SHELL := /bin/bash
.SHELLFLAGS := -ec

# Override on the command line, e.g. `make build WEB=...` if you ever need to.
WEB_DIR      := web
WEB_DIST_SRC := $(WEB_DIR)/dist
EMBED_DIR    := web_dist

# Embed dir must exist (and contain at least an index.html) for `go build` to
# succeed, because main.go uses //go:embed. CI builds the frontend first;
# this rule keeps local dev usable without that step.
.PHONY: ensure-embed-dir
ensure-embed-dir:
	@mkdir -p $(EMBED_DIR)
	@if [ ! -f $(EMBED_DIR)/index.html ]; then \
		cp $(EMBED_DIR)/index.html $(EMBED_DIR)/index.html.bak 2>/dev/null || true; \
	fi
	@test -f $(EMBED_DIR)/index.html || (echo "missing $(EMBED_DIR)/index.html" && exit 1)

.PHONY: web-install
web-install:
	cd $(WEB_DIR) && bun install --frozen-lockfile

.PHONY: web-build
web-build:
	cd $(WEB_DIR) && bun run build

.PHONY: copy-embed
copy-embed: web-build ensure-embed-dir
	rm -rf $(EMBED_DIR) && mkdir -p $(EMBED_DIR)
	cp -R $(WEB_DIST_SRC)/. $(EMBED_DIR)/

.PHONY: go-build
go-build: ensure-embed-dir
	go build -ldflags "-s -w" -o perf-dashboard .

.PHONY: build
build: copy-embed go-build

.PHONY: run
run: build
	./perf-dashboard

.PHONY: dev-web
dev-web:
	cd $(WEB_DIR) && bun run dev

.PHONY: clean
clean:
	rm -rf $(EMBED_DIR)/* perf-dashboard
	cd $(WEB_DIR) && rm -rf dist .vite

.PHONY: test
test:
	go vet ./...
	go build ./...
