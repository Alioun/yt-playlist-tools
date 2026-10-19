<script lang="ts">
  // What you agreed to (review, withdraw), clear data, and 1.x leftovers.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { features } from "$lib/ia";
  import { app, acceptConsent } from "$lib/state.svelte";
  import ConsentDialog from "./ConsentDialog.svelte";

  let readOpen = $state(false);
  let agreeOpen = $state(false);
  let clearOpen = $state(false);
  let scope = $state<"here" | "everywhere">("here");

  function clearAll() {
    app.setups = { alioun: null, studio: null };
    for (const f of features) app.features[f.id].on = false;
    app.consent = "pending";
    clearOpen = false;
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
      <p class="text-muted-foreground text-sm">Account setups, feature choices and saved lists. Your playlists on YouTube aren't touched.</p>
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
        Every account setup, channel filter and feature choice is deleted, and every feature switches off. Your playlists on
        YouTube aren't touched.
      </Dialog.Description>
    </Dialog.Header>
    {#if app.features.sync.on}
      <RadioGroup.Root bind:value={scope}>
        <label class="flex items-center gap-2 text-sm"><RadioGroup.Item value="here" /> This browser only</label>
        <label class="flex items-center gap-2 text-sm"
          ><RadioGroup.Item value="everywhere" /> This browser and every browser that syncs</label
        >
      </RadioGroup.Root>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (clearOpen = false)}>Cancel</Button>
      <Button variant="destructive" onclick={clearAll}>Clear</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
