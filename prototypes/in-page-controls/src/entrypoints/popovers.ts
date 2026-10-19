// THROWAWAY PROTOTYPE (ticket 14). Isolated world, injected on first use by scripting.executeScript. Own Svelte + Bits UI.
import { createPopovers } from "../site/popovers/popovers";
if (!(globalThis as any).__pp.popovers) createPopovers();
