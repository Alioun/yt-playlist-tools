export type GlyphShape =
  | { readonly kind: "path"; readonly d: string }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }

const path = (d: string): GlyphShape => ({ kind: "path", d })
const ring: GlyphShape = { kind: "circle", cx: 12, cy: 12, r: 10 }

// Lucide's path data (ISC), inlined so first views need no icon package (UI-RULE-19).
export const glyphs = {
  check: [path("M20 6 9 17l-5-5")],
  "arrow-right": [path("M5 12h14"), path("m12 5 7 7-7 7")],
  "arrow-left": [path("m12 19-7-7 7-7"), path("M19 12H5")],
  refresh: [path("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"), path("M21 3v5h-5"), path("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"), path("M8 16H3v5")],
  loader: [path("M21 12a9 9 0 1 1-6.219-8.56")],
  "circle-check": [ring, path("m9 12 2 2 4-4")],
  "circle-alert": [ring, path("M12 8v4"), path("M12 16h.01")],
  info: [ring, path("M12 16v-4"), path("M12 8h.01")],
  "triangle-alert": [path("m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"), path("M12 9v4"), path("M12 17h.01")],
  "external-link": [path("M15 3h6v6"), path("M10 14 21 3"), path("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")],
  "log-in": [path("m10 17 5-5-5-5"), path("M15 12H3"), path("M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4")],
  settings: [path("M14 17H5"), path("M19 7h-9"), { kind: "circle", cx: 17, cy: 17, r: 3 }, { kind: "circle", cx: 7, cy: 7, r: 3 }],
  moon: [path("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z")],
  "eye-off": [path("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"), path("M14.084 14.158a3 3 0 0 1-4.242-4.242"), path("M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"), path("m2 2 20 20")]
} as const satisfies Record<string, readonly GlyphShape[]>

export type GlyphName = keyof typeof glyphs
