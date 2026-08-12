import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// In dev mode the React app talks to whatever baseUrl the user typed in
// (stored in localStorage). For the *empty* fallback that fires before the
// user has configured a baseUrl (so the input page itself doesn't throw
// during initial paint), we point at a benign no-op.
export default defineConfig({
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
