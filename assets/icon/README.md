# Perch: the 2.0 icon

A grey pigeon perched on top of a small cabinet of pigeonholes, not in one. The user picked it on 2026-10-20 ([ticket 34](../../.scratch/rebuild/issues/34-icon.md); [R140](../../.scratch/rebuild/spec/resolutions.md#the-icon-perch-r140)). Every shape is hand-placed SVG geometry. The name is Perchling; the wordmark and lockups are in [`assets/brand/`](../brand/README.md).

`sheet.html` shows every size on light and dark toolbars, with the badges and pixel zooms. `sheet-light.png` and `sheet-dark.png` are its renders.

## Files

| File | What it is |
|---|---|
| `icon.svg` | The master artwork (96 × 96 viewBox). The source for 48 px and up. |
| `icon-32.svg`, `icon-16.svg` | Separate drawings on 32 and 16 px grids, for the toolbar at 2x and 1x. Never scale the master down for these sizes. |
| `icon-mono.svg` | The monochrome mark in `currentColor`, on a 24 px grid, for the places inside YouTube where the mark takes the site's colours ([UI-BRAND-08](../../.scratch/rebuild/spec/05-ui.md#59-the-brand)). |
| `icon-16.png` … `icon-128.png` | PNG exports at 16, 19, 24, 32, 38, 48, 64, 96 and 128 px. 16 and 19 come from `icon-16.svg`, 24 to 38 from `icon-32.svg`, and 48 and up from `icon.svg`. |
| `store-128.png` | Chrome's 128 px icon: the 96 px artwork with 16 px of transparent padding, as the Chrome Web Store asks. |
| `amo-128.png` | The AMO listing icon: full bleed, 128 px. |
| `tools/build.mjs` | Exports the PNGs, builds `sheet.html` from them, and renders the two sheet PNGs (headless Chrome through `playwright-core`). |

## Where each file goes

**In the 2.0 tree:**
- **PNGs:** copy `icon-16.png`, `icon-24.png`, `icon-32.png`, `icon-48.png`, `icon-96.png`, `icon-128.png` and `store-128.png` into `brand/` in WXT's public directory. Spec 06 §6.10 puts that directory at `src/public/`, which needs `publicDir: "src/public"`, because WXT's default is `public/` at the root.
  - The `brand/` folder keeps them out of WXT's icon auto-discovery, which looks for `icon-16.png` and `icon/16.png` at the top of the directory.
- **SVGs:** copy `icon.svg` and `icon-mono.svg` into `src/assets/brand/`.
  - The extension's pages draw `icon.svg` through one Svelte component.
  - In-page code inlines `icon-mono.svg`'s shapes as path data, because pages load no web-accessible resources (UI-YT-04).
- **Drop `@wxt-dev/auto-icons`.** It scales one image to every size, which would overwrite the hand-tuned 16 and 32 px.

**In the manifests** (`build/manifest.ts`), set the icons by hand per browser:

```ts
const icons = browser === "firefox"
  ? { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 96: "brand/icon-96.png", 128: "brand/icon-128.png" }
  : { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 128: "brand/store-128.png" };

manifest.icons = icons;
manifest.action = {
  ...manifest.action,
  default_icon: { 16: "brand/icon-16.png", 24: "brand/icon-24.png", 32: "brand/icon-32.png" },
};
```

- **Chrome:**
  - `icons` takes 16, 32, 48 and the padded `store-128.png`, which Chrome shows at install and in the store.
  - `action.default_icon` takes 16, 24 and 32. The action icon is 16 dip, so 1x, 1.5x and 2x screens each get their own file.
  - Chrome takes PNG only (no SVG), and has no light/dark icon switch.
  - The 19 and 38 px exports are Chrome's legacy toolbar sizes; they needn't ship.
- **Firefox:**
  - `icons` adds 96 for about:addons on 2x screens, and the full-bleed 128.
  - `action.default_icon` is the same as Chrome's.
  - Nothing icon-related goes in `browser_specific_settings`.
  - There's no `theme_icons`: see [Light and dark](#light-and-dark).

**In the stores:**
- **Chrome Web Store:** the item's icon comes from the manifest. If the dashboard asks for a store icon too, upload `store-128.png`.
- **AMO:** upload `amo-128.png` in the Developer Hub's listing editor. The listing doesn't take the manifest's icon; AMO resizes the upload to 32, 64 and 128 and shows the 64 on the listing.

## Colours

Flat fills. The teal-to-violet gradient appears only on the neck, from 32 px up (UI-BRAND-06). At 16 px the neck is a solid teal band over a solid violet one.

| Colour | Hex | Where |
|---|---|---|
| Pigeon grey | `#8B95A4` | head and body |
| Wing grey | `#78828F` | folded wing |
| Tail grey | `#6B7584` | tail; the wing line at 16 px (the 16 px tail is `#727C8B`) |
| Tail band | `#4A5360` | tail tip, feet |
| Primaries | `#5E6875` | the wing's tip |
| Beak | `#3D4552` | beak |
| Cere | `#E9EDF2` | the white patch at the beak's base |
| Eye and cards | `#F5F7FA` | eye ring, eye highlight, cards |
| Pupil | `#1A1E27` | eye |
| Brand teal | `#14A39A` | the ledge; the neck gradient's start |
| Ledge shade | `#0F8A82` | the ledge's underside |
| Brand violet | `#7B5CD6` | the neck gradient's end; lines on cards |
| Cabinet violet | `#8E74E2` | the cabinet: a light tint of brand violet |
| Cabinet shade | `#6E52CC` | under the ledge |
| Pigeonhole ink | `#26223C` | the holes |
| Back card | `#CDD3DC` | a card behind a card |

## Light and dark

One drawing serves both.
- **Contrast:** the shapes that carry the silhouette sit near 3:1 on Chrome's and Firefox's light and dark toolbars. Those are the grey bird (2.9 to 4.7:1), the teal ledge (3.0 to 4.6:1) and the light-violet cabinet (3.0 to 3.9:1).
- **Why the lighter violet:** the cabinet uses `#8E74E2` rather than brand violet, which falls to 2.3:1 on Chrome's dark toolbar.
- **No dark variant:**
  - Chrome can't switch icons by theme.
  - Firefox's `context-fill` is reserved for Mozilla's own extensions.
  - A Firefox-only `theme_icons` pair would gain little over these ratios, and would make the two browsers differ.

## Badges

The toolbar states are browser badges (`action.setBadgeText`), per spec UI-IA-08:
- a teal ✓ (`#0B7A70`);
- a slate II (`#5E6875`);
- a violet "!" (`#6949D2`);
- an amber "!" (`#E8A33A`, black text).

Chrome draws a badge bottom-right and hides the icon's bottom-right quarter. Firefox draws it top-right. The pigeon's head sits top-left, clear of both.
