import type {} from "@wxt-dev/module-svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: ".",
  publicDir: "public",
  outDir: ".output",
  imports: false,
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte"],
  svelte: {
    vite: {
      dynamicCompileOptions({ filename }) {
        return filename.includes("/node_modules/") ? {} : { runes: true }
      }
    }
  },
  manifest: ({ browser }) => ({
    name: "Perchling UI foundation fixture",
    version: "0.0.0",
    description: "Build-only first-run fixture over a synthetic owner",
    ...(browser === "chrome" && { minimum_chrome_version: "121" }),
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "ui-foundation-fixture@example.invalid",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["none"] }
        }
      }
    })
  }),
  vite: () => ({ plugins: [tailwindcss()], css: { postcss: {} }, build: { assetsInlineLimit: 0 } })
})
