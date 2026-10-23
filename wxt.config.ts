import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  imports: false,
  zip: {
    excludeSources: ["tools/fixtures/svelte-pilot/**"]
  },
  // REQUIRED: WXT defaults Firefox to MV2. We ship MV3 on both browsers.
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  vite: () => ({
    // NOTE: swapping React for preact/compat was tried and does not work here.
    // Base UI's useRender passes element types as React element descriptors,
    // which Preact renders literally as <[object Object]>, so every primitive
    // (Button, Checkbox, Switch, Slider) fails to render. See the README.
    plugins: [tailwindcss()],
    css: {
      // Tailwind v4 runs as a Vite plugin, not through PostCSS. Pin an inline
      // (empty) PostCSS config so Vite does NOT walk up the directory tree
      // looking for one -- the parent git worktree still has a Tailwind v3
      // postcss.config.js that would otherwise be picked up and break the build.
      postcss: {}
    }
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
