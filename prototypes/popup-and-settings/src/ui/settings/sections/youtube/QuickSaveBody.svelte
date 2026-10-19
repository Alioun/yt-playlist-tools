<script lang="ts">
  import "../../settings-more.css";
  // Quick-save on thumbnails: the account in view's quick-save playlist (ticket 12: per account), or "ask the first
  // time" (choose mode: the first pick becomes it), then the shared options.
  import { Button } from "$ui/components/ui/button/index.js";
  import PlaylistChooser from "$ui/components/picker/PlaylistChooser.svelte";
  import OptionRow from "../../parts/OptionRow.svelte";
  import Subhead from "../../parts/Subhead.svelte";
  import { accountInView, act, labelOf, setupOf, setupsReadOnly, ui } from "$lib/view.svelte";

  const f = $derived(ui.s.features.quickSave);
  const acct = $derived(accountInView());
  const target = $derived(setupOf(acct)?.quickSave ?? null);
  const opt = (option: string) => (v: boolean) => act({ kind: "featureOption", id: "quickSave", option, value: v });
</script>

<Subhead title={acct ? `Quick-save playlist for ${labelOf(acct).name}` : "Quick-save playlist"} />
<div class="flex flex-wrap items-center gap-3 px-5 pb-4">
  {#if acct}
    <div class="max-w-[320px] min-w-0">
      <PlaylistChooser
        {acct}
        purpose="quickSave"
        selected={target}
        title="Quick-save playlist"
        subtitle="One click on a thumbnail saves here. ▾ still picks any playlist."
        placeholder="Ask the first time"
        onchoose={(playlist) => act({ kind: "quickSave", acct, site: "youtube", playlist })}
      />
    </div>
    {#if target}
      <Button size="sm" variant="ghost" disabled={setupsReadOnly()} onclick={() => act({ kind: "quickSave", acct, site: "youtube", playlist: null })}
        >Ask the first time instead</Button
      >
    {:else}
      <p class="text-muted-foreground text-[13px]">Your first pick becomes the one-click playlist.</p>
    {/if}
  {:else}
    <p class="text-muted-foreground text-[13px]">Sign in to YouTube to choose it.</p>
  {/if}
</div>
<div class="divide-y border-t">
  <OptionRow label="On Shorts shelves too" description="The same button on Shorts thumbnails in the home and search feeds." checked={f.onShorts} onchange={opt("onShorts")} />
  <OptionRow label="Show a confirmation when a video is saved" description="Failures, and “already in it”, always show." checked={f.feedback} onchange={opt("feedback")} />
</div>
