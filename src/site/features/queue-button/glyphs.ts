import { errorPath } from "../../core/notice/skin"
import type { QueueGlyph } from "./model"

// UI-YT-04 requires YouTube's own queue glyph. No live capture exists, so these paths stay unmeasured against the site.
const paths = {
  queue: "M21 16h-7v-1h7v1zm0-5H9v1h12v-1zm0-4H3v1h18V7zm-11 8-7-4v8l7-4z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  pending: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16M7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z",
  error: errorPath
} as const satisfies Record<Exclude<QueueGlyph, "spinner">, string>

export function glyph(document: Document, kind: QueueGlyph): Element {
  if (kind === "spinner") {
    const spinner = document.createElement("span")
    spinner.className = "spinner"
    spinner.dataset.glyph = kind
    spinner.setAttribute("aria-hidden", "true")
    return spinner
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("class", "glyph")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "24")
  svg.setAttribute("height", "24")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.dataset.glyph = kind
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", paths[kind])
  svg.append(path)
  return svg
}
