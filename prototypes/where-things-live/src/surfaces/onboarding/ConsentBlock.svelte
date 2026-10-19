<script lang="ts">
  // The store-required disclosure (ticket 03): shown before any data is handled, accepted explicitly.
  // The accept button comes from the parent, so its label can say what Agree turns on.
  import type { Snippet } from "svelte";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";

  let { heading, actions }: { heading: string; actions?: Snippet } = $props();

  const points = [
    "It works inside your YouTube and YouTube Music tabs, as you. It reads the video or song you're on, your playlists and which account you're signed in to.",
    "It adds videos and songs to your playlists and queue when you ask, and when auto-add is on.",
    "Everything stays in this browser. Nothing is sent to us or anyone else. YouTube only sees what it would see if you clicked yourself.",
    "If you turn on Settings sync, your settings travel through your browser's own sync.",
    "No tracking, no analytics, no ads.",
  ];
</script>

<section class="bg-card rounded-xl border p-5">
  <h2 class="mb-3 flex items-center gap-2 text-lg font-semibold">
    <ShieldCheck class="text-primary size-5" />
    {heading}
  </h2>
  <ul class="text-muted-foreground mb-3 list-disc space-y-1.5 pl-5 text-sm">
    {#each points as p (p)}<li class="text-foreground/90">{p}</li>{/each}
  </ul>
  <a href="#privacy" class="text-primary text-sm underline-offset-4 hover:underline" onclick={(e) => e.preventDefault()}
    >Privacy policy</a
  >
  {#if actions}
    <div class="mt-5 flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</section>
