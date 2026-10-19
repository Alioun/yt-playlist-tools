<script lang="ts">
  // Ticket 12's Missing / Full mark on a chosen playlist (shortcut or quick-save target), with Remove.
  import { app, removeChosenPlaylist } from "$lib/state.svelte";
  import type { AccountId } from "$lib/data";

  let { account, playlistId, readonly = false }: { account: AccountId; playlistId: string | null | undefined; readonly?: boolean } =
    $props();
  const mark = $derived(playlistId ? app.marks[playlistId] : undefined);
</script>

{#if mark && playlistId}
  <p class="text-destructive mt-0.5 flex items-center gap-2 text-[11px] font-medium">
    <span class="flex-1">{mark === "full" ? "Full: it holds 5,000 videos" : "Missing: it doesn't exist anymore"}</span>
    {#if !readonly}
      <button type="button" class="text-foreground underline-offset-2 hover:underline" onclick={() => removeChosenPlaylist(account, playlistId)}
        >Remove</button
      >
    {/if}
  </p>
{/if}
