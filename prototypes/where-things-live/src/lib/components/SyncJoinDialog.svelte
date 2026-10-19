<script lang="ts">
  // Ticket 16's join question: switching Settings sync on when both this browser and the synced copy have settings.
  // Asked once, wherever the switch was flipped (Settings or first run). Cancel leaves sync off.
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import { app, answerJoin, extThemeClass } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
</script>

{#if app.sync.askJoin}
  <div class={cn("fixed inset-0 z-[200] flex items-start justify-center bg-black/30 pt-24", extThemeClass())}>
    <div class="bg-background text-foreground w-[30rem] rounded-xl border p-5 text-sm shadow-2xl" role="dialog" aria-labelledby="join-title">
      <h2 id="join-title" class="flex items-center gap-2 text-base font-semibold"><RefreshCw class="size-4" /> Which settings should sync?</h2>
      <p class="text-muted-foreground mt-2">
        Your other browsers already sync Playlist Tools settings, and this browser has its own. Pick the ones to keep. Accounts
        that only one side has are kept either way.
      </p>
      <div class="mt-4 grid gap-2">
        <button type="button" class="border-primary bg-primary/5 hover:bg-primary/10 rounded-lg border p-3 text-left" onclick={() => answerJoin("synced")}>
          <span class="block font-medium">Use synced settings</span>
          <span class="text-muted-foreground block text-xs">Your other browsers' features, keys and account setups replace this browser's.</span>
        </button>
        <button type="button" class="hover:bg-accent rounded-lg border p-3 text-left" onclick={() => answerJoin("local")}>
          <span class="block font-medium">Use this browser's settings</span>
          <span class="text-muted-foreground block text-xs">This browser's replace the synced ones, in every browser that syncs.</span>
        </button>
      </div>
      <div class="mt-3 flex justify-end">
        <button type="button" class="hover:bg-accent rounded-md px-3 py-1.5" onclick={() => answerJoin("cancel")}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
