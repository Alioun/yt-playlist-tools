import type * as root from "svelte"
import type * as client from "svelte/internal/client"
import type * as lib from "./site/kit"

declare global {
  interface Window { __svelte?: { v: Set<string> } }
  var __pp: {
    core: { marker: string; trace: string[]; mainAtCore: string | undefined; readyStateAtCore: DocumentReadyState }
    svelte: { root: typeof root; client: typeof client }
    kit: { lib: typeof lib; layer: HTMLElement; mounted: number; events: number }
    popovers?: { mounted: boolean }
  }
}
