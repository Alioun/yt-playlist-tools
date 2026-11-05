<script lang="ts">
  import type { PageFeatureId } from "../onboarding/features"
  import type { PageState } from "../lib/page-state.svelte"
  import AutoAddDetails from "./AutoAddDetails.svelte"
  import DestinationChooser from "./DestinationChooser.svelte"
  import GatherOptions from "./GatherOptions.svelte"
  import ShortcutsDetails from "./ShortcutsDetails.svelte"

  // A feature's unfolded options, the popup's lazy part and the body of its Settings card (UI-POP-20, UI-SET-07).
  let { pageState, feature, variant }: { pageState: PageState; feature: PageFeatureId; variant: "popup" | "settings" } = $props()
  const i18n = $derived(pageState.page.i18n)
</script>

{#if feature === "auto-add"}
  {#if pageState.acct}
    {#key pageState.acct}<AutoAddDetails {pageState} acct={pageState.acct} {variant} />{/key}
  {:else}
    <p class="text-muted-foreground text-[12.5px]">{i18n.message(pageState.agreed ? "summary_autoAdd_signedOut" : "autoAddList_consent")}</p>
  {/if}
{:else if feature === "shortcuts"}
  <ShortcutsDetails {pageState} {variant} />
{:else if feature === "quick-save"}
  <DestinationChooser {pageState} destination={{ kind: "quick-save" }} label={i18n.message("chooser_quickSave")} purpose={{ kind: "quickSave" }} />
{:else if feature === "music-actions" || feature === "music-keys"}
  <DestinationChooser {pageState} site="music" destination={{ kind: "music-save" }} label={i18n.message("music_saveName")}
    purpose={{ kind: "named", title: i18n.message("music_saveName"), subtitle: i18n.message("music_saveSubtitle") }} />
{:else if feature === "gather"}
  <GatherOptions {pageState} />
{/if}
