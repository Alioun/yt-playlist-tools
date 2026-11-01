import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"

export default defineConfig(({ command, mode }) => {
  if (command === "build" && !["kit-www", "kit-music", "core-www"].includes(mode)) throw Error("Choose an explicit dormant site bundle")
  const file = (name: string) => fileURLToPath(new URL(name, import.meta.url))
  return {
    plugins: [svelte({ compilerOptions: { css: "injected" }, dynamicCompileOptions({ filename }) {
      return filename.includes("/node_modules/") ? {} : { runes: true }
    } })],
    build: { outDir: file(`.output/${mode}`), emptyOutDir: false, sourcemap: true, minify: true,
      lib: { entry: file(mode === "core-www" ? "bundle-core.ts" : "bundle-kit.ts"), formats: ["es"], fileName: () => `${mode}.js` } }
  }
})
