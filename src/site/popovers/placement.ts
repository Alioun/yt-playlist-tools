export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export type Placement = { readonly left: number; readonly top: number; readonly maxHeight: number }
export type PlacementAnchor =
  | { readonly kind: "below" | "on" | "beside" | "player"; readonly box: Box }
  | { readonly kind: "window" }

const gap = 8
const margin = 8
const maxHeight = 560

/**
 * YT-PK-12 and UI-PICK-15 in viewport pixels: below the split, flipping above with no room; on the watch-page
 * pill; beside the card's thumbnail on its right, else its left; over the player at its top centre; else the
 * window's top centre. The panel never leaves the viewport.
 */
export function placePicker(anchor: PlacementAnchor, panel: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number }): Placement {
  const clampLeft = (left: number) => Math.min(Math.max(left, margin), Math.max(margin, viewport.width - panel.width - margin))
  const room = (top: number) => Math.max(120, Math.min(maxHeight, viewport.height - top - margin))
  if (anchor.kind === "window") return { left: clampLeft((viewport.width - panel.width) / 2), top: margin, maxHeight: room(margin) }
  const { box } = anchor
  switch (anchor.kind) {
    case "below": {
      const below = box.top + box.height + gap
      const fitsBelow = below + Math.min(panel.height, maxHeight) <= viewport.height - margin
      const above = box.top - gap - Math.min(panel.height, maxHeight)
      const top = fitsBelow || above < margin ? below : above
      return { left: clampLeft(box.left), top: Math.max(margin, top), maxHeight: fitsBelow || above < margin ? room(below) : box.top - gap - margin }
    }
    case "on": {
      const top = Math.max(margin, Math.min(box.top, viewport.height - margin - Math.min(panel.height, maxHeight)))
      return { left: clampLeft(box.left), top, maxHeight: room(top) }
    }
    case "beside": {
      const right = box.left + box.width + gap
      const left = right + panel.width <= viewport.width - margin ? right : box.left - gap - panel.width
      const top = Math.max(margin, Math.min(box.top, viewport.height - margin - Math.min(panel.height, maxHeight)))
      return { left: clampLeft(left), top, maxHeight: room(top) }
    }
    case "player": {
      const top = Math.max(margin, box.top + gap)
      return { left: clampLeft(box.left + (box.width - panel.width) / 2), top, maxHeight: room(top) }
    }
  }
}
