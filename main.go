// Command perf-dashboard serves the static frontend bundle embedded at build
// time. It is a thin shell — all business logic lives in the React app, which
// in turn talks to a user-configured new-api base URL.
package main

import (
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
)

//go:embed all:web_dist
var webDist embed.FS

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		// macOS ControlCenter binds :5000 (commplex-main), so we default to
		// 5050 on Darwin and 5000 elsewhere. Override with PORT=... either way.
		port = "5050"
	}

	dist, err := fs.Sub(webDist, "web_dist")
	if err != nil {
		log.Fatalf("embedded web_dist is missing — did you forget to build the frontend first?")
	}

	if _, err := fs.Stat(dist, "index.html"); err != nil {
		log.Fatalf("embedded web_dist has no index.html — frontend build artifact is incomplete")
	}

	mux := http.NewServeMux()
	// Reverse proxy: GET /api/proxy/{path}?baseUrl=... → {baseUrl}/api/{path}
	// See server/proxy.go for the why.
	mux.HandleFunc("GET /api/proxy/{path...}", proxyHandler)
	mux.HandleFunc("POST /api/proxy/{path...}", proxyHandler)

	fileServer := http.FileServer(http.FS(dist))

	// SPA fallback: anything that isn't a real file in the bundle is served as
	// index.html so client-side routing keeps working on deep links.
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		fileServer.ServeHTTP(w, r)
	})
	mux.HandleFunc("GET /{path...}", func(w http.ResponseWriter, r *http.Request) {
		path := r.PathValue("path")
		if path == "" {
			fileServer.ServeHTTP(w, r)
			return
		}
		// Only fall back to index.html for routes that look like SPA paths
		// (no file extension). Real static assets (js/css/png/woff2/...) must
		// return 404 if missing so we don't ship broken bundles.
		if strings.Contains(path, ".") {
			fileServer.ServeHTTP(w, r)
			return
		}
		if _, err := fs.Stat(dist, path); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	addr := ":" + port
	log.Printf("perf-dashboard listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
