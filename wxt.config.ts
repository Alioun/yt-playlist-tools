import type {} from "@wxt-dev/module-svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "wxt"
import { perchlingManifest } from "./build/manifest"
import packageJson from "./package.json"

export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  imports: false,
  zip: {
    excludeSources: ["store/**", "site/**", "tools/**"]
  },
  // REQUIRED: WXT defaults Firefox to MV2. We ship MV3 on both browsers.
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte"],
  svelte: {
    vite: {
      dynamicCompileOptions({ filename }) {
        return filename.includes("/node_modules/") ? {} : { runes: true }
      }
    }
  },
  vite: ({ mode }) => ({
    plugins: [tailwindcss()],
    define: { "import.meta.env.PP_BUILD": JSON.stringify(`${packageJson.version}-${mode}`) },
    // An inline PostCSS config stops Vite from walking up into a parent checkout's config.
    css: { postcss: {} }
  }),
  manifest: ({ browser, mode }) => perchlingManifest({ browser, mode })
})
