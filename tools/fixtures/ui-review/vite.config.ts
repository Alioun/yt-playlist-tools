import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  css: { postcss: {} },
  server: { host: "0.0.0.0", port: 5173, strictPort: true, fs: { allow: [process.cwd()] } }
})
