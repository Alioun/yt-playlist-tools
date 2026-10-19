<script lang="ts">
  // An account's auto-add playlists. Listing them reads the account's playlists from YouTube, so before consent
  // (first run's or the upgrade note's Agree, ticket 19 §2.4) it says so instead, and lists nothing.
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import AutoAddListBody from "./AutoAddListBody.svelte";
  import type { AccountId } from "$shared/model/types";
  import { beforeConsent, setupOf, ui } from "$lib/view.svelte";
  import { navigate } from "$lib/nav";

  let props: { acct: AccountId; density?: "popup" | "page"; readOnly?: boolean; initialOpen?: string | null } = $props();
  const kept = $derived(setupOf(props.acct)?.autoAdd.length ?? ui.s.unclaimed?.autoAdd.length ?? 0);
</script>

{#if beforeConsent()}
  <div class="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-5">
    <Hourglass class="mt-0.5 size-3.5 shrink-0" />
    <p>
      {#if kept}{kept} playlists are waiting.{/if}
      Agree first, then choose playlists here. Until then nothing is read from YouTube.
      <button type="button" class="text-primary font-medium hover:underline" onclick={() => navigate("onboarding")}>Review</button>
    </p>
  </div>
{:else}
  <AutoAddListBody {...props} />
{/if}
