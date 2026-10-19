<script lang="ts">
  import "../../settings-more.css";
  // Auto-add's settings: the account in view's playlists (ticket 11: mirrored from the popup), then what every
  // account shares: the default required percentage (ticket 07), feedback (ticket 12) and the toolbar tick.
  // Pause lives in the popup and the watch-page menu; settings only shows how to resume (ticket 09).
  import Pause from "@lucide/svelte/icons/pause";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { Button } from "$ui/components/ui/button/index.js";
  import AutoAddList from "$ui/components/picker/AutoAddList.svelte";
  import PercentField from "$ui/components/PercentField.svelte";
  import OptionRow from "../../parts/OptionRow.svelte";
  import Subhead from "../../parts/Subhead.svelte";
  import Callout from "../../parts/Callout.svelte";
  import { accountInView, act, labelOf, setupOf, setupsReadOnly, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";

  const f = $derived(ui.s.features.autoAdd);
  const acct = $derived(accountInView());
  const setup = $derived(setupOf(acct));
  const name = $derived(acct ? labelOf(acct).name : "");
  const opt = (option: string) => (v: boolean | number) => act({ kind: "featureOption", id: "autoAdd", option, value: v });
</script>

{#if f.paused}
  <div class="bg-muted/50 flex items-center gap-3 border-b px-5 py-3 text-sm">
    <Pause class="text-muted-foreground size-4 shrink-0" />
    <span class="min-w-0 flex-1">Paused until you resume or restart the browser.</span>
    <Button size="sm" variant="outline" onclick={() => act({ kind: "pause", paused: false })}>Resume</Button>
  </div>
{/if}

<div class="px-5 pt-4 pb-4">
  {#if !acct}
    <Callout title="Sign in to YouTube to choose playlists.">
      Auto-add playlists belong to each YouTube account, so they show once a YouTube tab is signed in.
      {#snippet actions()}<Button size="sm" variant="outline" onclick={() => openExternal("sign-in")}>Sign in <ExternalLink /></Button>{/snippet}
    </Callout>
  {:else if setup?.notLoadedHere}
    <Callout title="{setup.autoAdd.length} auto-add playlists · Open YouTube as {name} to see them">
      This setup came from your other browsers through Settings sync. Its playlists show once {name} is opened on YouTube in this browser.
      {#snippet actions()}<Button size="sm" variant="outline" onclick={() => openExternal("youtube")}>Open YouTube <ExternalLink /></Button>{/snippet}
    </Callout>
  {:else}
    <AutoAddList {acct} density="page" readOnly={setupsReadOnly()} />
  {/if}
</div>

<div class="border-t">
  <Subhead title="For every account" />
  <div class="px-5 pb-3">
    <PercentField label="Default required percentage" value={f.percent} onchange={(v) => act({ kind: "featureOption", id: "autoAdd", option: "percent", value: v })} />
    <p class="text-muted-foreground mt-2 text-[13px] leading-5">
      Counts only what you actually watch: skipping ahead and ads don't count. Each playlist can set its own percentage and take videos, Shorts or both.
    </p>
  </div>
  <div class="divide-y border-t">
    <OptionRow
      label="Show a confirmation when a video is auto-added"
      description="Failures always show, even with this off."
      checked={f.feedback}
      onchange={opt("feedback")}
    />
    <OptionRow
      label="Tick the toolbar icon when this tab's video is auto-added"
      description="A quiet check on Playlist Pigeon's icon in that tab. A ! for something that needs you always comes first."
      checked={f.toolbarTick}
      onchange={opt("toolbarTick")}
    />
  </div>
</div>
