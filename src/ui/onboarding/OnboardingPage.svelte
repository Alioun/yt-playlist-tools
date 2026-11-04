<script lang="ts">
  import { untrack } from "svelte"
  import type { PageState } from "../lib/page-state.svelte"
  import type { FirstRunOwner } from "./owner"
  import type { FirstRunText } from "./text"
  import FirstRun from "./FirstRun.svelte"

  // onboarding.html shows first run, the upgrade note, or after a withdrawal the disclosure alone, decided when the page
  // opens; Agree never switches it (UI-ONB-01, REL-CON-03, FT-35).
  let { pageState, owner, text, markSrc }: { pageState: PageState; owner: FirstRunOwner; text: FirstRunText; markSrc: string } = $props()
  const decided = untrack(() => pageState.page.backend.loadPage()).then(async view => {
    const note = view.kind === "view" && view.device.kind === "current" ? view.device.device.upgradeNote : null
    if (note?.state === "pending") return { kind: "note", details: note.details } as const
    const held = await pageState.page.backend.call("ui.heldAgree", { action: "read" })
    return held.kind === "answered" && held.result.kind === "held" ? { kind: "held", paused: held.result.paused } as const : { kind: "first-run" } as const
  })
</script>

{#await decided then view}
  {#if view.kind === "note"}
    {#await import("./UpgradeNote.svelte") then { default: Note }}
      <Note {pageState} {text} {markSrc} details={view.details} />
    {/await}
  {:else if view.kind === "held"}
    {#await import("./HeldAgree.svelte") then { default: Held }}
      <Held {pageState} {text} {markSrc} paused={view.paused} />
    {/await}
  {:else}
    <FirstRun {owner} {text} {markSrc} />
  {/if}
{/await}
