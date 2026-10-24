import type {} from "@wxt-dev/module-svelte"
import { fileURLToPath } from "node:url"
import { defineConfig } from "wxt"
import { createPageLink } from "../../../../build/page-link"

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const link = createPageLink({ siteRoot: path("./src/site"), kitIndex: path("./src/site/kit/index.ts"), evidenceDir: path("./.output/evidence") })

export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  outDir: ".output",
  imports: false,
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte"],
  svelte: { vite: { dynamicCompileOptions: link.pageCompileOptions } },
  hooks: link.hooks,
  webExt: { disabled: true },
  manifest: ({ browser }) => ({
    name: "Page linker fixture",
    version: "0.0.0",
    permissions: ["scripting", "tabs"],
    host_permissions: ["https://www.youtube.com/*", "https://music.youtube.com/*"],
    ...(browser === "firefox" && { browser_specific_settings: { gecko: { id: "page-link@example.invalid", data_collection_permissions: { required: ["none"] } } } })
  }),
  vite: () => ({
    css: { postcss: {} },
    resolve: { alias: { $kit: path("./src/site/kit/index.ts") } }
  })
})
