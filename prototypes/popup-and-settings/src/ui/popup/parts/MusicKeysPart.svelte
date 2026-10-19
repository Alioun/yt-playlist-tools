<script lang="ts">
  import "./parts.css";
  // Quick-action shortcuts, unfolded in the popup: a read-only list (ticket 09); keys are changed in Settings.
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import { musicKeyNames } from "$shared/features/registry";
  import { ui } from "$lib/view.svelte";
  import { navigate } from "$lib/nav";

  const keys = $derived(Object.entries(ui.s.features.musicShortcuts.keys) as [keyof typeof musicKeyNames, string][]);
</script>

<div class="space-y-2">
  <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
    {#each keys as [action, key] (action)}
      <dt class="text-foreground/85">{musicKeyNames[action]}</dt>
      <dd class="justify-self-end">
        {#if key}<KeyCombo {key} os={ui.s.env.os} size="xs" />{:else}<span class="text-muted-foreground">No key</span>{/if}
      </dd>
    {/each}
    <dt class="text-foreground/85">Undo</dt>
    <dd class="justify-self-end"><KeyCombo key={ui.s.undoKey} os={ui.s.env.os} size="xs" /></dd>
  </dl>
  <p class="text-muted-foreground text-[11.5px] leading-4">
    A key acts on the song you're pointing at, else the one playing.
    <button type="button" class="text-primary font-medium hover:underline" onclick={() => navigate("settings", "feature-musicShortcuts")}>Change keys</button>
  </p>
</div>
