import type {} from "@wxt-dev/module-svelte"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import { defineConfig } from "wxt"
import { perchlingManifest } from "./build/manifest"
import { createPageLink } from "./build/page-link"
import packageJson from "./package.json"
import { pageLinkEntries } from "./src/shared/features/registration"
import { features } from "./src/shared/features/registry"

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const kitIndex = path("./src/site/kit/index.ts")
// Page scripts share one Svelte copy: the kit carries it, features link to it (06 §6.7.2).
const link = createPageLink({ siteRoot: path("./src/site"), kitIndex, evidenceDir: path("./.output/page-link"), entries: pageLinkEntries(features) })

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
      // Our components use runes; node_modules keep their own setting, since forcing runes breaks Bits UI.
      dynamicCompileOptions(options) {
        const page = link.pageCompileOptions(options)
        return options.filename.includes("/node_modules/") ? page : { ...page, runes: true }
      }
    }
  },
  hooks: link.hooks,
  vite: ({ mode }) => ({
    plugins: [tailwindcss()],
    define: { "import.meta.env.PP_BUILD": JSON.stringify(`${packageJson.version}-${mode}`) },
    // An inline PostCSS config stops Vite from walking up into a parent checkout's config.
    css: { postcss: {} },
    resolve: { alias: { $kit: kitIndex } }
  }),
  manifest: ({ browser, mode }) => perchlingManifest({ browser, mode })
})
