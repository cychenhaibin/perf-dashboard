package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const proxyTimeout = 8 * time.Second

// proxyHandler forwards GET /api/proxy/{path}?baseUrl=... to
// {baseUrl}/api/{path}. It exists because new-api's /api/* endpoints don't
// have CORS middleware attached, so a browser can't talk to them directly.
//
// The browser calls us same-origin (no CORS needed), we strip the baseUrl
// query param, copy through most headers + body, and pass the upstream's
// response (including Set-Cookie) back untouched.
//
// Auth: clients may attach an X-Upstream-Auth: Bearer <token> header (the
// React app reads it from localStorage). We rewrite that into a proper
// Authorization: Bearer header before sending upstream.
func proxyHandler(w http.ResponseWriter, r *http.Request) {
	rawBase := r.URL.Query().Get("baseUrl")
	if rawBase == "" {
		writeJSONError(w, http.StatusBadRequest, "baseUrl is required")
		return
	}
	baseUrl := strings.TrimSpace(strings.TrimRight(rawBase, "/"))
	u, err := url.Parse(baseUrl)
	if err != nil || u.Scheme == "" || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		writeJSONError(w, http.StatusBadRequest, "invalid baseUrl: must be http(s)://host[:port]")
		return
	}

	rest := r.PathValue("path")
	if rest == "" {
		writeJSONError(w, http.StatusBadRequest, "missing upstream path")
		return
	}
	target, err := url.JoinPath(baseUrl, "api", rest)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "could not build target: "+err.Error())
		return
	}

	q := r.URL.Query()
	q.Del("baseUrl")
	targetURL, err := url.Parse(target)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "could not parse target: "+err.Error())
		return
	}
	targetURL.RawQuery = q.Encode()

	ctx, cancel := context.WithTimeout(r.Context(), proxyTimeout)
	defer cancel()

	var body io.Reader
	if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
		body = r.Body
	}
	req, err := http.NewRequestWithContext(ctx, r.Method, targetURL.String(), body)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "could not build upstream request: "+err.Error())
		return
	}

	// Copy most headers, skipping hop-by-hop ones.
	hopByHop := map[string]bool{
		"Connection":          true,
		"Keep-Alive":          true,
		"Proxy-Authenticate":  true,
		"Proxy-Authorization": true,
		"Te":                  true,
		"Trailer":             true,
		"Transfer-Encoding":   true,
		"Upgrade":             true,
	}
	for k, vs := range r.Header {
		if hopByHop[k] {
			continue
		}
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	// Rewrite X-Upstream-Auth: Bearer <token> → Authorization: Bearer <token>.
	if h := r.Header.Get("X-Upstream-Auth"); h != "" {
		req.Header.Set("Authorization", h)
		req.Header.Del("X-Upstream-Auth")
	}
	// Always tell upstream we want JSON.
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json")
	}
	req.Header.Set("User-Agent", "perf-dashboard/0.1")
	req.Host = u.Host

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("proxy upstream error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "upstream unreachable: "+err.Error())
		return
	}
	defer resp.Body.Close()
	log.Printf("proxy %s %s%s → upstream %d", r.Method, baseUrl, targetURL.RequestURI(), resp.StatusCode)

	// Copy response headers except Set-Cookie (which we forward individually
	// below, since net/http collapses multiple Set-Cookie values otherwise).
	for k, vs := range resp.Header {
		if strings.EqualFold(k, "Set-Cookie") {
			continue
		}
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	for _, c := range resp.Cookies() {
		// Pin cookies to this origin so the browser actually stores them.
		c.Domain = ""
		c.SameSite = http.SameSiteLaxMode
		http.SetCookie(w, c)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, fmt.Sprintf(`{"success":false,"message":%q}`, msg))
}
