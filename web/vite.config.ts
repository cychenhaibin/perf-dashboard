import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// In dev mode the React app talks to whatever baseUrl the user typed in
// (stored in localStorage). For the *empty* fallback that fires before the
// user has configured a baseUrl (so the input page itself doesn't throw
// during initial paint), we point at a benign no-op.
export default defineConfig({
  // GitHub Pages serves the app under /perf-dashboard/ (project page). Set the
  // base so the built index.html references the right absolute asset paths.
  base: process.env.GITHUB_PAGES ? "/perf-dashboard/" : "/",
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
