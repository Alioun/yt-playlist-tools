<script lang="ts">
  import "./parts.css";
  // Auto-add, unfolded in the popup: this account's auto-add playlists, where the user is when they think of them
  // (ticket 09). Lasting, shared choices (the default percentage, feedback) stay in Settings.
  import AutoAddList from "$ui/components/picker/AutoAddList.svelte";
  import { accountInView } from "$lib/view.svelte";
  import { navigate, openExternal } from "$lib/nav";
  import { param } from "$lib/params";
  const acct = $derived(accountInView());
</script>

<div class="space-y-2.5">
  {#if acct}
    <AutoAddList {acct} density="popup" initialOpen={param("open") === "options" ? "PLkids" : null} />
  {:else}
    <p class="text-muted-foreground text-xs">
      Sign in to YouTube to choose playlists.
      <button type="button" class="text-primary font-medium hover:underline" onclick={() => openExternal("sign-in")}>Sign in</button>
    </p>
  {/if}
  <p class="text-muted-foreground text-[11.5px]">
    The default percentage and feedback are in
    <button type="button" class="text-primary font-medium hover:underline" onclick={() => navigate("settings", "feature-autoAdd")}>Settings</button>.
  </p>
</div>
