<script lang="ts">
  import { untrack } from "svelte"
  import type { PageState } from "../lib/page-state.svelte"
  import type { FirstRunOwner } from "./owner"
  import type { FirstRunText } from "./text"
  import FirstRun from "./FirstRun.svelte"

  // onboarding.html shows first run, the upgrade note, or after a withdrawal the disclosure alone, decided when the page
  // opens; Agree never switches it (UI-ONB-01, REL-CON-03, FT-35). A withdrawal keeps a pending note, and the note's
  // Agree needs consent that isn't held, so held consent comes first.
  let { pageState, owner, text, markSrc }: { pageState: PageState; owner: FirstRunOwner; text: FirstRunText; markSrc: string } = $props()
  const { backend } = untrack(() => pageState.page)
  const decided = backend.call("ui.heldAgree", { action: "read" }).then(async held => {
    if (held.kind === "answered" && held.result.kind === "held") return held.result
    const view = await backend.loadPage()
    const note = view.kind === "view" && view.device.kind === "current" ? view.device.device.upgradeNote : null
    return note?.state === "pending" ? ({ kind: "note", details: note.details } as const) : null
  })
</script>

{#await decided then view}
  {#if view?.kind === "note"}
    {#await import("./UpgradeNote.svelte") then { default: Note }}
      <Note {pageState} {text} {markSrc} details={view.details} />
    {/await}
  {:else if view?.kind === "held"}
    {#await import("./HeldAgree.svelte") then { default: Held }}
      <Held {pageState} {text} {markSrc} paused={view.paused} />
    {/await}
  {:else}
    <FirstRun {owner} {text} {markSrc} />
  {/if}
{/await}
