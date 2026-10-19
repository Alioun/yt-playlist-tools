// THROWAWAY PROTOTYPE (ticket 27). One tooltip for every control, drawn in the kit's top-level layer so a row's
// overflow (YouTube Music's carousels clip and translate their rows) never cuts it off.
export const tip = $state({ text: "", x: 0, y: 0, below: false, visible: false });

let timer: ReturnType<typeof setTimeout> | undefined;

/** Shows after 0.5 s, like YouTube's own tooltips (ticket 14). */
export function showTip(el: Element, text: string, delay = 500) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const r = el.getBoundingClientRect();
    tip.text = text;
    tip.x = r.left + r.width / 2;
    tip.below = r.top < 64;
    tip.y = tip.below ? r.bottom + 8 : r.top - 8;
    tip.visible = true;
  }, delay);
}

export function hideTip() {
  clearTimeout(timer);
  tip.visible = false;
}
