# Gotchas

[← Development](README.md)

- **`manifestVersion: 3` in `wxt.config.ts` is required.** WXT defaults Firefox to MV2, whose `injectScript` inlines scripts that YouTube's CSP blocks.
- **`open_in_tab` is set in [`options/index.html`](../../src/entrypoints/options/index.html)** via `<meta name="manifest.open_in_tab">`. WXT overwrites `options_ui` from config.
- **Preact does not work.** Base UI passes element types that Preact renders as `<[object Object]>`.
- **`SettingsPanel` is lazy-loaded from both popup and options.** A static import in either puts it in the shared chunk the popup preloads.
- **Tests for flat entrypoints live in `src/tests/`.** WXT treats any flat file in `src/entrypoints/` as an entrypoint.
