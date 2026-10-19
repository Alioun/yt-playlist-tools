<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  // This video (ticket 09): one status line from ticket 07's states, with a progress meter that marks each goal.
  // Its height is reserved until the serving tab answers. Details (outcomes, Don't auto-add this video, this
  // channel's filter, Save to…) load on demand.
  import { act, thisVideoStatus, ui } from "$lib/view.svelte";
  import { param } from "$lib/params";

  let { open = $bindable(param("open") === "video") }: { open?: boolean } = $props();
  const v = $derived(ui.tab.state === "ready" ? ui.tab.video : null);
  const st = $derived(v ? thisVideoStatus(v) : null);
  const waiting = $derived(
    ui.s.consent === "accepted" && ui.tab.state === "waiting" && ui.s.env.activeSite === "youtube" && ui.s.env.ytPage !== "home",
  );
</script>

{#if waiting}
  <div class="bg-card h-[66px] rounded-xl border px-3 py-2.5" aria-busy="true" aria-label="Asking the tab about this video">
    <div class="bg-muted h-2.5 w-20 animate-pulse rounded-full"></div>
    <div class="bg-muted mt-2.5 h-3 w-52 animate-pulse rounded-full"></div>
  </div>
{:else if v && st}
  <div class="bg-card rounded-xl border">
    <div class="flex items-start gap-2 px-3 pt-2.5 {st.tone === 'progress' ? 'pb-2' : 'pb-2.5'}">
      <div class="min-w-0 flex-1">
        <div class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span class="shrink-0 font-semibold tracking-wide uppercase">{v.kind === "short" ? "This Short" : "This video"}</span>
          <span class="text-muted-foreground/60">·</span>
          <span class="min-w-0 truncate">{v.title}</span>
        </div>
        <div
          class="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium
            {st.tone === 'done' ? 'text-success' : st.tone === 'warn' ? 'text-warning' : st.tone === 'muted' ? 'text-muted-foreground' : ''}"
        >
          {#if st.tone === "done"}<Glyph name="check" class="size-3.5 shrink-0" strokeWidth={2.5} />{/if}
          {#if st.tone === "paused"}<Glyph name="pause" class="text-muted-foreground size-3.5 shrink-0" />{/if}
          <span class="min-w-0">{st.text}</span>
          {#if st.action}
            <button
              type="button"
              class="text-primary ml-0.5 shrink-0 font-medium hover:underline"
              onclick={() => act(st.action === "Resume" ? { kind: "pause", paused: false } : { kind: "skipVideo", skip: false })}
              >{st.action}</button
            >
          {/if}
        </div>
      </div>
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium"
        aria-expanded={open}
        onclick={() => (open = !open)}
      >
        Details <Glyph name="chevron-down" class="size-3.5 transition-transform {open ? 'rotate-180' : ''}" />
      </button>
    </div>
    {#if st.tone === "progress" || st.tone === "done"}
      <div class="px-3 pb-2.5">
        <div
          class="bg-muted relative h-1.5 rounded-full"
          role="meter"
          aria-label="Watched"
          aria-valuenow={v.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="bg-brand-gradient absolute inset-y-0 left-0 rounded-full" style="width:{v.progress}%"></div>
          {#each st.goals as g (g)}
            <span
              class="absolute -top-[3px] h-3 w-[2px] rounded-full {g <= v.progress ? 'bg-success' : 'bg-foreground/45'}"
              style="left:calc({g}% - 1px)"
              title="Goal: {g} %"
            ></span>
          {/each}
        </div>
      </div>
    {/if}
    {#if open}
      <Lazy load={() => import("./parts/ThisVideoDetails.svelte")} props={{ video: v }} />
    {/if}
  </div>
{/if}
