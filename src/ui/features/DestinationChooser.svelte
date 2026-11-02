<script lang="ts">
  import { untrack } from "svelte"
  import { pickerSource } from "./source"
  import { PlaylistChooser, createPickerText, type ChooserContext, type PickerEvent } from "../picker"
  import type { SetupDestination } from "../../shared/contracts/first-run"
  import type { Site } from "../../shared/contracts/vocabulary"
  import { destinationValue } from "../backend/page-source"
  import type { PageState } from "../lib/page-state.svelte"

  // One setup destination's chooser (UI-PICK-19): the quick-save, YouTube Music save, gather or a shortcut's playlist.
  let { pageState, destination, site = "www", label, purpose, everyAccount = false, opened = false, onchosen }: {
    pageState: PageState
    destination: SetupDestination
    site?: Site
    label: string
    purpose: ChooserContext["purpose"]
    everyAccount?: boolean
    /** Opens the picker at once, as a gather with no gather playlist does (YT-GT-16). */
    opened?: boolean
    /** A playlist was chosen or made here. */
    onchosen?: () => void
  } = $props()
  const { i18n } = pageState.page
  const text = createPickerText(i18n)
  let open = $state(untrack(() => opened))
  const acct = $derived(pageState.acct)
  const setup = $derived(pageState.setup?.setup ?? null)
  const current = $derived.by(() => {
    const id = destinationValue(setup, destination)
    return id === null ? { kind: "none" } as const : { kind: "playlist", id, title: pageState.title(id) } as const
  })
  const availability = $derived(!acct || !pageState.signedIn ? { kind: "disabled", explanation: i18n.message("chooser_signInFirst") } as const
    : pageState.private ? { kind: "disabled", explanation: i18n.message(destination.kind === "gather" ? "picker_privateGather" : "picker_privatePin") } as const
    : { kind: "available" } as const)
  const source = (context: ChooserContext) => pickerSource(pageState, context.account, context.site, { kind: "destination", destination })
  function outcome(event: PickerEvent) {
    if (event.kind === "tick" && event.outcome.kind === "changed" || event.kind === "create" && event.outcome.kind === "created") {
      open = false
      onchosen?.()
    }
  }
</script>

{#if acct}
  <PlaylistChooser {open} {current} {label} {availability} {text} platform={pageState.page.platform.os} watchLaterEveryAccount={everyAccount}
    context={{ account: acct, site, private: pageState.private, purpose }} createSource={source}
    onrequest={request => { open = request.kind === "open" }} onoutcome={outcome}
    onrelease={release => { release.picker.close() }} />
{/if}
