import { cases, initial } from "./specimens"
import { ui, world, type Route } from "./harness"

export async function consume(emit: (record: unknown) => void) {
  const routes: readonly Route[] = ["owner", "native"]
  for (const route of routes) for (const specimen of cases) {
    const w = world(route, structuredClone(initial))
    try {
      await w.owner.ready()
      const first = await w.owner.changeSharedSetting(ui, specimen.change)
      const repeated = await w.owner.changeSharedSetting(ui, specimen.change)
      emit({ route, field: specimen.name, first, repeat: repeated, records: w.h.records(), batches: w.batches,
        events: w.events, remote: { get: w.h.counts.syncGet, set: w.h.counts.syncSet } })
    } finally { await w.dispose() }
  }
}
