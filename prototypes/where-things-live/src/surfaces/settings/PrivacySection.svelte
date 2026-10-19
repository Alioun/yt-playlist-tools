<script lang="ts">
  // What you agreed to (review, withdraw), clear data (ticket 16), and 1.x leftovers.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { app, acceptConsent, clearAllData, go } from "$lib/state.svelte";
  import ConsentDialog from "./ConsentDialog.svelte";

  let readOpen = $state(false);
  let agreeOpen = $state(false);
  let clearOpen = $state(false);
  let alsoSynced = $state(false);

  const showSyncedChoice = $derived(app.features.sync.on || app.sync.joinedBefore);

  function clear() {
    clearAllData(showSyncedChoice && alsoSynced);
    clearOpen = false;
    alsoSynced = false;
    go("first-run");
  }
</script>

<div class="bg-card divide-y rounded-xl border">
  <div class="flex flex-wrap items-center gap-3 p-4">
    <div class="min-w-0 flex-1">
      <h4 class="text-sm font-medium">Your consent</h4>
      <p class="text-muted-foreground text-sm">
        {app.consent === "accepted" ? "You agreed to how Playlist Tools handles your data." : "You haven't agreed yet, so nothing runs."}
      </p>
    </div>
    <Button variant="outline" size="sm" onclick={() => (readOpen = true)}>Read it again</Button>
    {#if app.consent === "accepted"}
      <Button variant="ghost" size="sm" onclick={() => (app.consent = "declined")}>Withdraw and pause everything</Button>
    {:else}
      <Button size="sm" onclick={() => (agreeOpen = true)}>Agree</Button>
    {/if}
  </div>
  <div class="flex flex-wrap items-center gap-3 p-4">
    <div class="min-w-0 flex-1">
      <h4 class="text-sm font-medium">Clear all data</h4>
      <p class="text-muted-foreground text-sm">Start again as if just installed. Your playlists on YouTube aren't touched.</p>
    </div>
    <Button variant="destructive" size="sm" onclick={() => (clearOpen = true)}>Clear all data…</Button>
  </div>
  <div class="p-4 text-sm">
    Upgraded from 1.x? Remove its old Google access at
    <a href="#google-permissions" class="text-primary inline-flex items-center gap-1 hover:underline"
      >myaccount.google.com/permissions <ExternalLink class="size-3" /></a
    >
  </div>
</div>

<ConsentDialog bind:open={readOpen} title="What you agreed to" readOnly />
<ConsentDialog bind:open={agreeOpen} title="Before anything runs" onagree={acceptConsent} />

<Dialog.Root bind:open={clearOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Clear all data?</Dialog.Title>
      <Dialog.Description>
        Playlist Tools forgets everything it keeps in this browser: features, shortcuts, account setups, channel filters, cached
        playlists and watch progress. It starts again as if just installed. Your playlists on YouTube aren't touched.
      </Dialog.Description>
    </Dialog.Header>
    {#if showSyncedChoice}
      <label class="flex items-center gap-2 text-sm">
        <Checkbox bind:checked={alsoSynced} />
        Also delete synced settings from all your browsers
      </label>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (clearOpen = false)}>Cancel</Button>
      <Button variant="destructive" onclick={clear}>Clear</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
