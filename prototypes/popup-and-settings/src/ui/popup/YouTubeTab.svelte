<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  import type { FeatureId } from "$shared/model/types";
  import Lazy from "$ui/components/Lazy.svelte";
  // The popup's YouTube tab: This video's status line, then one row per YouTube feature. Rows with per-account
  // choices (auto-add's playlists, each shortcut's playlist, the quick-save playlist) unfold on demand; their content
  // loads only then (ticket 24).
  import FeatureRow from "./FeatureRow.svelte";
  import ThisVideo from "./ThisVideo.svelte";
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import { featuresOf } from "$shared/features/registry";
  import { accountInView, act, labelOf, setupOf, shortcutName, titleOf, ui } from "$lib/view.svelte";
  import { param } from "$lib/params";

  let { onopen }: { onopen?: (id: FeatureId) => void } = $props();
  let open = $state<Record<string, boolean>>({ autoAdd: false, shortcuts: false, quickSave: false, [param("open") ?? ""]: true });
  const acct = $derived(accountInView());
  const setup = $derived(setupOf(acct));
  const f = $derived(ui.s.features);
  const paused = $derived(f.autoAdd.paused);
  const keyed = $derived(f.shortcuts.list.filter((s) => s.key));
</script>

<div class="space-y-3 p-3">
  <ThisVideo />

  <div class="bg-card divide-y rounded-xl border">
    {#each featuresOf("youtube") as def (def.id)}
      {#if def.id === "autoAdd"}
        <FeatureRow id="autoAdd" expandable bind:expanded={open.autoAdd} onopen={onopen && (() => onopen("autoAdd"))}>
          {#snippet summary()}
            {#if paused}
              Paused until you resume or restart the browser
            {:else if setup?.notLoadedHere}
              {setup.autoAdd.length} auto-add playlists · Open YouTube as {labelOf(acct!).name} to see them
            {:else if !acct}
              Sign in to YouTube to choose playlists
            {:else if !setup?.autoAdd.length}
              No playlists for {labelOf(acct).name} yet
            {:else}
              {setup.autoAdd.length} playlist{setup.autoAdd.length === 1 ? "" : "s"} · adds at {f.autoAdd.percent} %
            {/if}
          {/snippet}
          {#snippet extra()}
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors
                {paused ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
              title={paused ? "Resume auto-add" : "Pause auto-add in every tab until you resume or restart the browser"}
              onclick={() => act({ kind: "pause", paused: !paused })}
            >
              {#if paused}Resume{:else}<Glyph name="pause" class="size-3" />Pause{/if}
            </button>
          {/snippet}
          <Lazy load={() => import("./parts/AutoAddPart.svelte")} />
        </FeatureRow>
      {:else if def.id === "shortcuts"}
        <FeatureRow id="shortcuts" expandable bind:expanded={open.shortcuts} onopen={onopen && (() => onopen("shortcuts"))}>
          {#snippet summary()}
            {#if keyed.length}
              <span class="inline-flex items-center gap-1.5 align-middle">
                {#each keyed.slice(0, 2) as s (s.id)}
                  <span class="inline-flex min-w-0 items-center gap-1">
                    <KeyCombo key={s.key} os={ui.s.env.os} size="xs" /><span class="truncate">{shortcutName(s, acct)}</span>
                  </span>
                {/each}
                {#if keyed.length > 2}<span>+{keyed.length - 2}</span>{/if}
              </span>
            {:else}
              No keys set yet
            {/if}
          {/snippet}
          <Lazy load={() => import("./parts/ShortcutsPart.svelte")} />
        </FeatureRow>
      {:else if def.id === "quickSave"}
        <FeatureRow id="quickSave" expandable bind:expanded={open.quickSave} onopen={onopen && (() => onopen("quickSave"))}>
          {#snippet summary()}
            {#if !acct}Sign in to choose its playlist
            {:else if setup?.quickSave}One click saves to {titleOf(setup.quickSave)}
            {:else}Asks where to save the first time{/if}
          {/snippet}
          <Lazy load={() => import("./parts/QuickSavePart.svelte")} props={{ site: "youtube" }} />
        </FeatureRow>
      {:else if def.id === "queueButton"}
        <FeatureRow id="queueButton">
          {#snippet summary()}Adds to the end of the queue{/snippet}
        </FeatureRow>
      {:else if def.id === "watchButton"}
        <FeatureRow id="watchButton">
          {#snippet summary()}Under the video, before YouTube's Save{/snippet}
        </FeatureRow>
      {:else}
        <FeatureRow id="cardMenu">
          {#snippet summary()}Right-click a video for YouTube's ⋮ menu{/snippet}
        </FeatureRow>
      {/if}
    {/each}
  </div>
</div>
