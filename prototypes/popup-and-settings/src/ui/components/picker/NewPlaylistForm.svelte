<script lang="ts" module>
  /** Ticket 12: Private first, then the last visibility picked on this device (memory stands in for device storage). */
  let lastPrivacy: "private" | "unlisted" | "public" = "private";
</script>

<script lang="ts">
  // New playlist (ticket 12), the same in every chooser: title (required, trimmed, up to 150, no < or >), visibility
  // Private / Unlisted / Public, a non-blocking hint for a title the user already has, inline errors that keep the
  // typed title, and one click making exactly one playlist. When creating can't work, it says why instead.
  import Lock from "@lucide/svelte/icons/lock";
  import Link from "@lucide/svelte/icons/link";
  import Globe from "@lucide/svelte/icons/globe";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { Button } from "$ui/components/ui/button/index.js";
  import type { AccountId, Privacy } from "$shared/model/types";
  import { labelOf, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";

  let {
    acct,
    create,
    existing = [],
    initial = "",
    withItem = false,
    onclose,
    oncreated,
  }: {
    acct: AccountId;
    create: (title: string, privacy: Privacy) => Promise<string | { error: string }>;
    existing?: string[];
    initial?: string;
    withItem?: boolean;
    onclose: () => void;
    oncreated?: (id: string) => void;
  } = $props();

  let title = $state(initial);
  let privacy = $state<Privacy>(lastPrivacy);
  let pending = $state(false);
  let error = $state("");
  const trimmed = $derived(title.trim());
  const bad = $derived(/[<>]/.test(title));
  const dup = $derived(!!trimmed && existing.some((t) => t.toLowerCase() === trimmed.toLowerCase()));
  const blocked = $derived(
    !ui.s.env.signedIn && acct === ui.s.env.account
      ? "signed-out"
      : !ui.s.env.youtubeOpen
        ? "no-tab"
        : labelOf(acct).handle === null
          ? "no-channel"
          : null,
  );
  const options = [
    { id: "private", label: "Private", Icon: Lock },
    { id: "unlisted", label: "Unlisted", Icon: Link },
    { id: "public", label: "Public", Icon: Globe },
  ] as const;

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!trimmed || bad || pending) return;
    pending = true;
    error = "";
    lastPrivacy = privacy;
    const r = await create(trimmed, privacy);
    pending = false;
    if (typeof r === "string") oncreated?.(r);
    else error = r.error;
  }
</script>

{#if blocked}
  <div class="bg-muted/60 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px]">
    <CircleAlert class="text-muted-foreground mt-0.5 size-4 shrink-0" />
    <div class="min-w-0 flex-1">
      {#if blocked === "signed-out"}
        Sign in to YouTube to create playlists.
      {:else if blocked === "no-tab"}
        Open YouTube to create playlists.
        <button type="button" class="text-primary ml-1 font-medium hover:underline" onclick={() => openExternal("youtube")}>Open YouTube</button>
      {:else}
        This account needs a YouTube channel to create playlists.
        <button type="button" class="text-primary ml-1 inline-flex items-center gap-0.5 font-medium hover:underline" onclick={() => openExternal("youtube")}
          >Create channel <ExternalLink class="size-3" /></button
        >
      {/if}
    </div>
    <button type="button" class="text-muted-foreground hover:text-foreground text-xs font-medium" onclick={onclose}>Close</button>
  </div>
{:else}
  <form class="space-y-2.5" onsubmit={submit}>
    <div>
      <label class="text-muted-foreground mb-1 block text-xs font-medium" for="np-title">New playlist</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="np-title"
        class="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive h-8 w-full rounded-lg border px-2.5 text-[13px] outline-none focus-visible:ring-3"
        placeholder="Title"
        maxlength={150}
        autocomplete="off"
        autofocus
        aria-invalid={bad || undefined}
        bind:value={title}
      />
      <div class="mt-1 flex min-h-4 items-start gap-2 text-[11.5px] leading-4">
        {#if bad}<span class="text-destructive">Titles can't contain &lt; or &gt;</span>
        {:else if error}<span class="text-destructive">{error}</span>
        {:else if dup}<span class="text-muted-foreground">You already have a playlist called {trimmed}.</span>
        {:else if withItem}<span class="text-muted-foreground">It's created with this {ui.tab.state === "ready" && ui.tab.playing && !ui.tab.video ? "song" : "video"} already in it.</span>{/if}
        {#if title.length > 120}<span class="text-muted-foreground ml-auto tabular-nums">{title.length}/150</span>{/if}
      </div>
    </div>
    <div class="bg-muted grid grid-cols-3 gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="Visibility">
      {#each options as o (o.id)}
        <button
          type="button"
          role="radio"
          aria-checked={privacy === o.id}
          class="inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors
            {privacy === o.id ? 'bg-card text-foreground shadow-soft dark:bg-secondary' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (privacy = o.id)}><o.Icon class="size-3" />{o.label}</button
        >
      {/each}
    </div>
    <div class="flex justify-end gap-1.5">
      <Button size="sm" variant="ghost" onclick={onclose}>Cancel</Button>
      <Button size="sm" type="submit" disabled={!trimmed || bad || pending}>
        {#if pending}<LoaderCircle class="animate-spin" />Creating…{:else}Create{/if}
      </Button>
    </div>
  </form>
{/if}
