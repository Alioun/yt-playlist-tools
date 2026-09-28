import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
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
  manifest: ({ browser }) => ({
    name: "YouTube Playlist Tools",
    description: "Add current YouTube video to specified playlists.",
    permissions: ["activeTab", "storage", "identity", "scripting"],
    // The MAIN-world queue bridge is injected as a page script, so it has to
    // be fetchable from youtube.com. See src/entrypoints/yt-queue-bridge.ts.
    web_accessible_resources: [
      {
        resources: ["yt-queue-bridge.js"],
        matches: ["*://*.youtube.com/*"]
      }
    ],
    host_permissions: [
      "https://www.googleapis.com/*",
      "https://oauth2.googleapis.com/*",
      "https://accounts.google.com/*"
    ],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          // Must be preserved so AMO updates keep working.
          id: "{cc70cd21-2cc6-444b-bd89-496909346091}",
          strict_min_version: "125.0",
          // Required by AMO for new extensions since 2025-11-03.
          // "none" is accurate on the assumption the token broker stays
          // stateless: it relays the OAuth code to Google and returns the
          // tokens without persisting anything. If the broker ever starts
          // storing user data, this declaration must be revisited.
          data_collection_permissions: { required: ["none"] }
        }
      }
    })
  })
})
