# Perchling: wordmark and store images

The wordmark, the lockup with the Perch icon, the Chrome Web Store promo images, and the GitHub social preview. The icon itself is in [`../icon/`](../icon/README.md). `sheet.html` shows everything here, and `sheet.png` is its render.

## Files

| File | What it is |
|---|---|
| `wordmark.svg`, `wordmark-on-light.svg` | "Perchling" as outlines: ink `#262B36`, with the i's dot in brand teal. `wordmark.svg` is the source the build reads. |
| `wordmark-on-dark.svg` | The same in paper `#F1F3F6`, for dark backgrounds. |
| `lockup-on-light.svg`, `lockup-on-dark.svg` | The icon and the wordmark side by side. |
| `*-800.png`, `*-480.png`, `*-960.png` | Transparent PNG exports of the wordmark (800 px wide) and the lockups (480 and 960 px wide). |
| `promo-small-440x280.png` (+ `.svg`) | Chrome Web Store small promo tile. Required. |
| `marquee-1400x560.png` (+ `.svg`) | Chrome Web Store marquee. Optional. |
| `social-preview-1280x640.png` (+ `.svg`) | The GitHub repository's social preview. |
| `tools/` | The scripts that make all of the above (see [Rebuilding](#rebuilding)). |

## The typeface

**Nunito ExtraBold (weight 800), version 3.602.**
- **Copyright:** 2014 The Nunito Project Authors (Vernon Adams, Cyreal, Jacques Le Bailly).
- **Licence:** the [SIL Open Font License 1.1](https://openfontlicense.org/).
- **Source:** google/fonts, `ofl/nunito/Nunito[wght].ttf`, at commit `47d54ca1ebb14fd864695f1d39dc734f39017c33` (2026-10-20). The variable font is instanced at `wght` 800.
- **What ships:** only glyph outlines, inside the SVGs and PNGs. The font file isn't redistributed. The OFL allows artwork made with the font, outlines in a logo included, under any terms.

**Why Nunito:** the spec names no brand typeface; the extension's UI uses the system font stack and bundles none. Nunito's rounded stroke ends echo Perch's round head and soft corners, which gives the warmth. Its even, open letterforms keep it tidy, and legible down to the promo tile at half size. ExtraBold matches the mark's solid, flat fills. Rubik was the runner-up: sturdier, but less warm.

**The wordmark's details:**
- the font's own kerning, as Chrome sets it, which tightens "Pe" and "rc";
- light hand kerning on every pair (`TWEAK` in `tools/wordmark.py`), and −6 units of tracking for display sizes;
- the i's dot in brand teal `#14A39A`, the one small tie to the bird's ledge.

## Using it

- **Lockup:**
  - The icon is 96 units and the wordmark's cap height 40, with 14 units between them.
  - The name's baseline sits half a cap height below the icon's middle, level with the ledge.
  - Don't rebuild it at other proportions.
- **Clear space:** at least the icon's ledge height (about a tenth of the icon's height) on every side.
- **Smallest sizes:** the wordmark 80 px wide, the lockup 140 px wide. Below that, use the icon alone.
- **Backgrounds:** the `on-dark` files go on dark backgrounds; the icon is the same drawing on both.
- **Never:**
  - set the name in another typeface in an image;
  - stretch, outline or recolour the wordmark, beyond ink, paper or one colour;
  - add YouTube's logo, red or play button;
  - put the wordmark on a busy photo.
- **The extension's own pages** still write the name as text, in the system font stack (spec 05 §5.10). The wordmark is for images, the README and the stores.

## The store images

**Chrome Web Store** (Developer Dashboard › Store listing › Graphic assets): upload `promo-small-440x280.png` and `marquee-1400x560.png`. They follow Google's image guidelines (developer.chrome.com/docs/webstore/images):
- **Colour and fill:** a saturated violet (`#2B2170`) fills the whole region, with well-defined edges on the store's light grey.
- **Content:** the brand, and no other text. No screenshot, and no claims such as "featured" or "number one".
- **Size:** it still reads at half size.

**The wall:** behind the mark is a faint wall of pigeonholes (`#251C63`), with a few faint cards on a fixed pattern. No card sits behind the mark or the text.

**No YouTube on the store images:**
- They show no YouTube name, logo or red, so Google's branding guidelines don't come into play.
- The listing's name beside the tile already reads "Perchling for YouTube™".

**AMO** takes only the icon (`../icon/amo-128.png`) and screenshots. Extension Workshop's listing guide names no promotional or header images, so nothing from here goes to AMO.

**Screenshots** aren't here. They're taken from the release candidate at release (spec 08 §9.4).

**When the 2.0 tree exists,** the promo images are copied into `store/listing/` with the screenshots (spec 08, REL-STORE-01).

## The GitHub social preview

The user sets it once, in the repository's Settings › General › Social preview, by uploading `social-preview-1280x640.png`. GitHub recommends 1280 × 640, PNG, under 1 MB, on a solid background.

It's the one image that writes the full name, "Perchling **for YouTube™**", as plain text, with one line: "Save to any playlist in one click." It shows no YouTube logo or red.

## Colours

| Colour | Hex | Where |
|---|---|---|
| Ink | `#262B36` | the wordmark on light |
| Paper | `#F1F3F6` | the wordmark on dark and on the store images |
| Brand teal | `#14A39A` | the i's dot |
| Night | `#2B2170` | the store images' background |
| Hole | `#251C63` | the faint pigeonhole wall |
| Hole card | `#30267A` | a faint card in the wall |
| Lavender | `#BDB2F2` | "for YouTube™" on the social preview |
| Mist | `#E4E1F7` | the social preview's line |

The icon's own colours are in [`../icon/README.md`](../icon/README.md).

## Rebuilding

The build needs Nunito's variable font from google/fonts (above), and fontTools (`pip install --target <dir> fonttools`). It also needs headless Chrome driven by `playwright-core`; the `PLAYWRIGHT_CORE`, `CHROME` and `CHROME_LIBS` variables point at them.

1. `python3 -I assets/brand/tools/wordmark.py <Nunito[wght].ttf> [fontTools dir]` writes `wordmark.svg`. The kerned offsets in it were measured with step 2's tool.
2. `node assets/brand/tools/measure.mjs <Nunito[wght].ttf> assets/brand/tools/lines-in.json <positions.json>` measures the social preview's lines.
3. `python3 -I assets/brand/tools/textpath.py <Nunito[wght].ttf> <positions.json> assets/brand/tools/lines.json [fontTools dir]` turns them into outlines.
4. `node assets/brand/tools/build.mjs` writes the variants, lockups, store images and social preview, exports the PNGs, and renders the sheet.
