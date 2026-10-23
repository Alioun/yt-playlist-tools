import type {} from "@wxt-dev/module-svelte"
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
      compilerOptions: { css: "injected" },
      dynamicCompileOptions({ filename }) {
        return filename.includes("/node_modules/") ? {} : { runes: true }
      }
    }
  },
  manifest: ({ browser }) => ({
    name: "Svelte build pilot",
    version: "0.0.0",
    description: "Build-only Svelte and Bits UI fixture",
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "svelte-build-pilot@example.invalid",
          data_collection_permissions: { required: ["none"] }
        }
      }
    })
  }),
  vite: () => ({ css: { postcss: {} } })
})
