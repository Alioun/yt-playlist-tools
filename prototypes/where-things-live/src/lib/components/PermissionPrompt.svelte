<script lang="ts">
  // A mock of the BROWSER's own site-access prompt (not extension UI). Ticket 10: permissions.request runs in
  // the click handler; on Chrome, music.youtube.com is optional and asked for from the click that first switches
  // on a YouTube Music feature (first run included). On Firefox one grant covers both sites.
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import { app, answerPermissionPrompt } from "$lib/state.svelte";

  const p = $derived(app.permissionPrompt);
  const host = $derived(
    p?.site === "music" && app.env.browser === "chrome" ? "music.youtube.com" : app.env.browser === "chrome" ? "www.youtube.com" : "youtube.com",
  );
</script>

{#if p}
  <div class="fixed inset-0 z-[200] flex items-start justify-center bg-black/20 pt-24">
    <div class="w-[26rem] rounded-lg border border-neutral-300 bg-white p-4 text-sm text-neutral-900 shadow-2xl" role="dialog" aria-label="Browser permission prompt">
      <p class="mb-1 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">
        {app.env.browser === "chrome" ? "Chrome" : "Firefox"} asks (the browser's prompt, not ours)
      </p>
      <p class="flex items-center gap-2 font-medium"><Puzzle class="size-4" /> Playlist Tools wants access</p>
      <p class="mt-2">Read and change your data on {host}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-md border px-3 py-1.5 hover:bg-neutral-100" onclick={() => answerPermissionPrompt(false)}>
          {app.env.browser === "chrome" ? "Deny" : "Don't allow"}
        </button>
        <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700" onclick={() => answerPermissionPrompt(true)}>
          Allow
        </button>
      </div>
    </div>
  </div>
{/if}
