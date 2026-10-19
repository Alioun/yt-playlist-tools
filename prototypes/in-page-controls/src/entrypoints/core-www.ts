// THROWAWAY PROTOTYPE (ticket 14). Isolated world, first in pp-www's ordered list. popovers.js is injected by the
// background on first use (ticket 17: ctx.popovers() → tab.need → executeScript).
import { createCore } from "../site/core/core";

const t0 = performance.now();
const core = createCore();
core.setPopoversLoader(async () => {
  const t = performance.now();
  await chrome.runtime.sendMessage({ type: "tab.need", popovers: true });
  const p = (globalThis as any).__pp.popovers;
  (globalThis as any).__pp.timing.popoversMs = Math.round(performance.now() - t);
  return p;
});
(globalThis as any).__pp.timing = { coreStart: t0 };
