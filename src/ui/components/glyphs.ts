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
  "eye-off": [path("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"), path("M14.084 14.158a3 3 0 0 1-4.242-4.242"), path("M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"), path("m2 2 20 20")],
  clock: [ring, path("M12 6v6l4 2")],
  gear: [path("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"), { kind: "circle", cx: 12, cy: 12, r: 3 }],
  "chevron-down": [path("m6 9 6 6 6-6")],
  "chevron-right": [path("m9 18 6-6-6-6")],
  x: [path("M18 6 6 18"), path("m6 6 12 12")],
  plus: [path("M5 12h14"), path("M12 5v14")],
  trash: [path("M3 6h18"), path("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"), path("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2")],
  user: [path("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"), { kind: "circle", cx: 12, cy: 7, r: 4 }],
  copy: [path("M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"), path("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2")],
  download: [path("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), path("m7 10 5 5 5-5"), path("M12 15V3")],
  upload: [path("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), path("m17 8-5-5-5 5"), path("M12 3v12")],
  "list-plus": [path("M11 12H3"), path("M16 6H3"), path("M16 18H3"), path("M18 9v6"), path("M21 12h-6")],
  keyboard: [path("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"), path("M6 8h.01"), path("M10 8h.01"), path("M14 8h.01"), path("M18 8h.01"), path("M8 12h.01"), path("M12 12h.01"), path("M16 12h.01"), path("M7 16h10")],
  bookmark: [path("m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z")],
  "list-end": [path("M16 12H3"), path("M16 6H3"), path("M10 18H3"), path("M21 6v10a2 2 0 0 1-2 2h-5"), path("m16 16-2 2 2 2")],
  "circle-play": [ring, path("m10 8 6 4-6 4V8z")],
  pointer: [path("M14 4.1 12 6"), path("m5.1 8-2.9-.8"), path("m6 12-1.9 2"), path("M7.2 2.2 8 5.1"), path("M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z")],
  menu: [path("M4 6h16"), path("M4 12h16"), path("M4 18h10")],
  layers: [path("m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"), path("m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"), path("m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65")],
  music: [path("M9 18V5l12-2v13"), { kind: "circle", cx: 6, cy: 18, r: 3 }, { kind: "circle", cx: 18, cy: 16, r: 3 }],
  command: [path("M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3")],
  pause: [path("M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"), path("M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z")],
  play: [path("M6 3v18l15-9L6 3z")]
} as const satisfies Record<string, readonly GlyphShape[]>

export type GlyphName = keyof typeof glyphs

/** Each feature's tile glyph in the popup and settings (UI-POP-19, UI-SET-07). */
export const featureGlyph = {
  "auto-add": "list-plus", shortcuts: "keyboard", "quick-save": "bookmark", "queue-button": "list-end",
  "watch-button": "circle-play", "card-menu": "pointer", "browser-menu": "menu", gather: "layers",
  "music-actions": "music", "music-keys": "keyboard", "any-tab-keys": "command", sync: "refresh"
} as const satisfies Record<import("../../shared/contracts/vocabulary").FeatureId, GlyphName>
