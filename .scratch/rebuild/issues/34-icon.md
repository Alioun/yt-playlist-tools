# What does the icon look like?

Type: prototype
Status: open
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: [ticket 22](22-name.md)

## Question

2.0 needs a good icon (the user, 2026-10-20), and **no AI-generated pictures**. Design it for the chosen name, as vector work. It must:
- read at 16 px in the toolbar;
- meet the Chrome Web Store and AMO icon rules;
- work on light and dark toolbars;
- avoid YouTube's red play-button look (ticket 03);
- carry ticket 09's toolbar states (auto-added tick, paused).

## Answer

**PROVISIONAL: the user picks.** Five concepts on the pigeonhole theme, after the user's direction (2026-10-20): "general pigeonhole thing so we're not limited by playlists, so to say not to be pigeonholed". Every shape is hand-placed SVG geometry. Nothing is generated, traced or copied. Prototype: [`prototypes/icon/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/icon/prototypes/icon) on branch `prototype/icon`:
- `sheet.html` is self-contained. It shows every size, light and dark toolbars, the three badges, ×8 zooms, and captions.
- `renders/` holds `sheet-light.png`, `sheet-dark.png` and each concept at 16, 32, 48 and 128 px.

- **The concepts** (16 and 32 px are separate pixel-grid drawings; 48 px and up use the full artwork):
  1. **Cabinet bird:** a pigeon whose body is a little cabinet of pigeonholes.
  2. **Perch:** a pigeon sits on top of the pigeonholes, not in one.
  3. **Odd one out:** a 2×2 of cubby tiles; one of them is a pigeon's head.
  4. **Peek:** a pigeon looks out of the big arched cubby of a dovecote cabinet.
  5. **Escapee:** a cabinet of filed cards; one card has jumped out of its slot.
- **Tried and dropped** (shown at the end of the sheet):
  - **A plain grid:** it read as a calendar or a lit building at 16 px.
  - **A pigeon whose wing is the grid:** it was too close to PigeonPod's logo, a slate pigeon with a striped white wing. It was reworked as Cabinet bird.
  - **A P monogram:**
    - the name is pending;
    - P marks are crowded (Pinterest, PayPal, Patreon);
    - AMO's listing guide says no letters in the icon.
- **Recommended: Cabinet bird.**
  - It joins the two things the user liked into one shape: a pigeon that carries the pigeonholes rather than sitting in one.
  - It has the most character while staying tidy: flat fills, no outlines, one grey bird on one violet box.
  - Its silhouette (round head, box body, tail, feet) is unlike any neighbouring toolbar icon. It reads as a bird at 16 px on all four test toolbars, and under both browsers' badges.
  - It keeps ticket 15's grey bird and gradient neck, so the popup, settings and brand tokens change least.
  - It's clear of the pigeon logos found:
    - Pigeonhole Live: an orange pigeon in a white circle;
    - PigeonPod: a slate pigeon with a striped white wing and a microphone;
    - the "PigeonHole" Chrome extension: a white bird in a blue envelope.
- **Runner-up: Odd one out.**
  - It's the grid-first option and the cleanest, most logo-like mark; the wink is the pigeon that doesn't fit the grid.
  - Its cost: a 2×2 of coloured tiles echoes Microsoft's four squares and app-launcher grids.
  - **Perch** is the pick if a plain, obvious bird matters most. At 16 px its grid shrinks to a shelf.
- **Toolbar states: browser badges, not icon variants.**
  - Spec 06's `badgeFor()` already applies them through `browser.action`: `setBadgeText`, `setBadgeBackgroundColor` and `setBadgeTextColor`, per tab.
  - The browser draws them crisp at any DPI, and no extra PNG sets ship. Icon variants would mean four states × two sizes, doubled on Firefox for dark toolbars.
  - The marks:
    - teal "✓" `#0B7A70`;
    - slate "II" `#5E6875`;
    - violet "!" `#6949D2` for "needs you";
    - amber "!" `#E8A33A` with black text for "not working".
  - **The geometry decides the layout:**
    - Chrome draws a 14 px badge bottom-right, hides the icon's bottom-right quarter, and cuts a 1 px gap (Chromium's `icon_with_badge_image_source.cc`).
    - Firefox draws an 11 px badge top-right, covering roughly x ≥ 6, y ≤ 5 (`toolbarbutton.css`).
    - So every concept keeps its head or card in the left half. The sheet checks each concept under every badge, on all four toolbars.
- **Store and size notes:**
  - **Chrome:**
    - PNG only; no SVG anywhere in the manifest.
    - Icons at 16, 32, 48 and 128. The 128 is 96 px artwork plus 16 px of transparent padding, with no edge and no large shadow, and it must work on light and dark backgrounds.
    - The action icon is 16 dip, so ship 16 and 32 (24 optional). 19 and 38 are legacy and aren't needed.
  - **No light/dark switch on Chrome:**
    - `icon_variants` is behind a flag, and the offscreen `matchMedia` workaround isn't worth it.
    - So one icon must read on both. The concepts use mid-tone fills: pigeon grey `#8B95A4` is 3.0:1 on white and 3.6:1 on Chrome's dark toolbar.
    - Violet is the weakest colour there, at 2.3:1. The grey head and the teal carry it.
  - **Firefox:**
    - Can use one SVG at every size.
    - `theme_icons` (in `action` since 109) could swap in a lighter violet for dark toolbars. Its keys name the icon's colour, so `"light"` is the icon for dark toolbars.
    - `context-fill` is reserved for Mozilla's own extensions.
    - No concept needs a dark pair; a Firefox-only lighter body is optional polish.
  - **AMO:** the listing icon is a separate Developer Hub upload (32 and 64 px), not the manifest's.
  - **Palette:** ticket 15's teal and violet. The 16 px files use solid fills only; the gradient appears only on the neck from 32 px up.
- **Finding for ticket 15:** its provisional mark (a slate side-view pigeon whose wing is light list lines) is close to PigeonPod's logo. Whichever concept is picked should replace it. UI-BRAND-03's description of the mark changes with it.

### What's left

- **The user picks a concept,** or asks for a mix.
- **Final polish of the pick:**
  - optical tweaks and a hand-checked 48 px;
  - a 24 px file if wanted;
  - PNG exports into `src/assets/brand/`;
  - the Firefox SVG and `theme_icons` decision;
  - the `PigeonMark` component and the brand sheet (UI-BRAND-03).
- **The name:** no wordmark or lock-up until [ticket 22](22-name.md) settles.
- **Store images and screenshots:** the 440×280 promo tile, the optional marquee, and the 1280×800 screenshots, after the name.
- **A real-browser badge check:** "✓" and "II" come from system fonts, so check them in Chrome and Firefox on Windows, macOS and Linux.
