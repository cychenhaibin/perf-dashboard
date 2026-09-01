import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// In dev mode the React app talks to whatever baseUrl the user typed in
// (stored in localStorage). For the *empty* fallback that fires before the
// user has configured a baseUrl (so the input page itself doesn't throw
// during initial paint), we point at a benign no-op.
export default defineConfig({
  // We deploy this same Vite build to two places:
  //   - GitHub Pages: project page at /perf-dashboard/ (assets must be referenced
  //     with that absolute prefix so the React Router still works under the
  //     subpath)
  //   - Vercel: served at the apex of a vercel.app subdomain, so the default
  //     base "/" is correct
  // We read a project-specific env var (NOT GITHUB_PAGES, which Vercel
  // auto-populates to "1" for GitHub-imported repos and would otherwise
  // override our intent on Vercel builds).
  base: process.env.PERF_DASHBOARD_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
})
