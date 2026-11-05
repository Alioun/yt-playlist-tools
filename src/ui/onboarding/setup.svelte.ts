import type { PageFeatureId } from "./features"
import type { AccessSite, ChoiceFailure, FirstRunOwner, PlaylistSelection, SetupRow, SetupView } from "./owner"

export type SetupState = { readonly kind: "loading" } | { readonly kind: "unavailable" } | Extract<SetupView, { kind: "ready" }>

export type RowChoice = { readonly kind: "idle" } | { readonly kind: "pending" } | { readonly kind: "failed"; readonly reason: ChoiceFailure }

export function createSetup(owner: FirstRunOwner) {
  let view = $state<SetupState>({ kind: "loading" })
  let choices = $state<Partial<Record<PageFeatureId, RowChoice>>>({})
  let accessDenied = $state<AccessSite | undefined>()
  let generation = 0
  let disposed = false

  async function load() {
    if (disposed) return
    const current = ++generation
    let next: SetupState
    try {
      next = await owner.readSetup()
    } catch {
      next = { kind: "unavailable" }
    }
    if (current === generation) view = next
  }

  function replaceSelection(feature: PageFeatureId, selection: PlaylistSelection) {
    if (view.kind !== "ready") return
    const rows = view.rows.map((row): SetupRow => (row.feature === feature && row.target ? { ...row, target: { ...row.target, selection } } : row))
    view = { ...view, rows }
  }

  return {
    get view() {
      return view
    },
    get accessDenied() {
      return accessDenied
    },
    choice(feature: PageFeatureId): RowChoice {
      return choices[feature] ?? { kind: "idle" }
    },
    load,
    // Runs from the Give access click, so the browser's prompt opens before anything is awaited (FT-50).
    giveAccess(site: AccessSite) {
      if (disposed) return undefined
      const granted = owner.requestSiteAccess(site)
      accessDenied = undefined
      return (async () => {
        let ok = false
        try {
          ok = await granted
        } catch {
          ok = false
        }
        if (disposed) return
        if (!ok) accessDenied = site
        await load()
      })()
    },
    choose(row: SetupRow) {
      const target = row.target
      if (disposed || !target || choices[row.feature]?.kind === "pending") return undefined
      choices[row.feature] = { kind: "pending" }
      return (async () => {
        let next: RowChoice = { kind: "idle" }
        try {
          const outcome = await owner.choosePlaylist({ feature: row.feature, purpose: target.purpose })
          if (disposed) return
          if (outcome.kind === "confirmed") replaceSelection(row.feature, outcome.selection)
          else if (outcome.kind === "failed") next = { kind: "failed", reason: outcome.reason }
        } catch {
          next = { kind: "failed", reason: "unavailable" }
        }
        if (!disposed) choices[row.feature] = next
      })()
    },
    dispose() {
      disposed = true
      generation++
    }
  }
}

export type Setup = ReturnType<typeof createSetup>
