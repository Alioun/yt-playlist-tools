import type {} from "@wxt-dev/module-svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "wxt"

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
  vite: () => ({
    plugins: [tailwindcss()],
    // An inline PostCSS config stops Vite from walking up into a parent checkout's config.
    css: { postcss: {} }
  }),
  manifest: ({ browser, mode }) => ({
    name: "YouTube Playlist Tools",
    description: "Add current YouTube video to specified playlists.",
    permissions: ["storage", "scripting"],
    ...(browser === "chrome" && { minimum_chrome_version: "121" }),
    host_permissions: [
      "https://www.youtube.com/*"
    ],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          // Must be preserved so AMO updates keep working.
          id: "{cc70cd21-2cc6-444b-bd89-496909346091}",
          strict_min_version: "140.0",
          // Required by AMO for new extensions since 2025-11-03.
          data_collection_permissions: { required: ["none"] },
          // Betas (`--mode beta`) are signed unlisted and update from this
          // repo's Pages. AMO rejects update_url in listed versions, so the
          // store build never has it (REL-CI-10, ADR-0011).
          ...(mode === "beta" && {
            update_url: "https://alioun.github.io/yt-playlist-tools/beta/updates.json"
          })
        }
      }
    })
  })
})
