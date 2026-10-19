<script lang="ts">
  // Step 2, "Before you start": the store disclosure (ticket 19 §4.1) after the user knows what they picked, with
  // Agree and turn on {N} features / Not now. On Chrome, a ticked YouTube Music feature makes this same click ask for
  // music.youtube.com first, before anything else is awaited (ticket 10).
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Moon from "@lucide/svelte/icons/moon";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { Button } from "$ui/components/ui/button/index.js";
  import Disclosure from "$ui/components/Disclosure.svelte";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import { feature } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";
  import { access, act, isMusic, ui } from "$lib/view.svelte";

  let {
    picked,
    notNow,
    onback,
    onagreed,
    onnotnow,
    onreturn,
  }: { picked: FeatureId[]; notNow: boolean; onback: () => void; onagreed: () => void; onnotnow: () => void; onreturn: () => void } = $props();

  const n = $derived(picked.length);
  const agreeLabel = $derived(n ? `Agree and turn on ${n} feature${n === 1 ? "" : "s"}` : "Agree");
  let busy = $state(false);

  async function agree() {
    // The permission request must be the first thing this click does (ticket 10).
    if (ui.s.env.browser === "chrome" && !ui.s.env.access.music && picked.some(isMusic)) await access.request("music");
    busy = true;
    await act({ kind: "consent", accepted: true, turnOn: picked });
    busy = false;
    onagreed();
  }
</script>

{#if notNow}
  <section class="bg-card rounded-2xl border p-8 text-center">
    <span class="bg-muted text-muted-foreground mx-auto inline-flex size-12 items-center justify-center rounded-full" aria-hidden="true">
      <Moon class="size-6" />
    </span>
    <h1 class="mt-4 text-[22px] font-semibold tracking-[-0.015em]">Nothing is running.</h1>
    <p class="text-muted-foreground mx-auto mt-2 max-w-[440px] text-[14.5px] leading-relaxed">
      Agree later from the toolbar icon or Settings. Until then, Playlist Pigeon does nothing on YouTube.
    </p>
    <Button class="mt-6" variant="outline" size="lg" onclick={onreturn}><ArrowLeft />Back</Button>
  </section>
{:else}
  <section>
    <h1 class="text-[30px] leading-tight font-semibold tracking-[-0.022em]">Before you start</h1>
    <p class="text-muted-foreground mt-2 text-[15px]">
      {#if n}What Playlist Pigeon does for the {n === 1 ? "feature" : `${n} features`} you picked, and what it never does.
      {:else}You picked no features. Agreeing now means you can switch them on later without being asked again.{/if}
    </p>

    {#if n}
      <ul class="mt-5 flex flex-wrap gap-2" aria-label="You picked">
        {#each picked as id (id)}
          <li class="bg-card inline-flex h-8 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[13px] font-medium">
            <FeatureIcon {id} size={24} />{feature[id].name}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="bg-card shadow-soft mt-6 rounded-2xl border p-6">
      <Disclosure browser={ui.s.env.browser} />
    </div>

    <div class="mt-7 flex flex-wrap items-center gap-3">
      <Button variant="brand" size="lg" disabled={busy} onclick={agree}>
        {#if busy}<LoaderCircle class="animate-spin" />{/if}{agreeLabel}
      </Button>
      <Button variant="outline" size="lg" disabled={busy} onclick={onnotnow}>Not now</Button>
      <Button variant="ghost" size="lg" class="sm:ml-auto" onclick={onback}><ArrowLeft />Change features</Button>
    </div>
  </section>
{/if}
