<script lang="ts">
  // The states sheet: every in-page control in every state, side by side, drawn by the kit's own components inside a
  // kit shadow host (so the skin and theme are the real ones). The live pages show one state at a time.
  import { IconButton, SplitButton, StatusPill, Ring, Icon, type IconName } from "$kit";
  import ToastView from "../site/kit/toaster/ToastView.svelte";
  import { statusOf, type Kind } from "../shared/auto-add-status";
  import { view } from "$kit";

  const thumbBg = (h: number) => `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 28%) 60%, hsl(${(h + 80) % 360} 45% 18%))`;

  const queueStates = [
    ["idle", "Add to queue"],
    ["busy", "Adding…"],
    ["done", "Added to queue (stays)"],
    ["unconfirmed", "Sent, not confirmed"],
    ["failed", "Couldn't add (1.5 s)"],
  ] as const;
  const saveStates = [
    ["idle", true, "bookmark", "Save to Music videos · ▾ picker"],
    ["idle", false, "bookmark", "No quick-save playlist yet (choose mode)"],
    ["busy", true, "bookmark", "Saving…"],
    ["done", true, "bookmark", "Saved ✓ (1.5 s)"],
    ["idle", true, "bookmarkFilled", "Saved on this page"],
    ["failed", true, "bookmark", "Couldn't save (1.5 s)"],
  ] as const;

  const kinds: Kind[] = ["counting", "partly", "added", "already", "failed", "skipped", "paused", "live", "cantMeasure"];
  const snap = (k: Kind) => statusOf({ features: { autoAdd: true }, autoAdd: { kind: k, progress: k === "partly" ? 63 : 32 }, playlists: view.playlists });
  const leadName = (l: string): IconName =>
    (({ check: "check", error: "error", block: "block", pause: "pause", live: "live", warning: "warning", mark: "mark" }) as Record<string, IconName>)[l] ?? "mark";

  const toastsList = [
    { label: "Explicit save, with Undo", t: { id: 1, text: 'Saved "How a compiler turns components into DOM…" to Music videos', undo: async () => true } },
    { label: "Unprompted (auto-add): the mark, Undo", t: { id: 2, text: 'Auto-added "How a compiler turns components into DOM…" to Music videos', unprompted: true, undo: async () => true } },
    { label: "Queue (ticket 29), with Undo", t: { id: 3, text: 'Added "The 20-minute weeknight ramen, from scratch" to the queue', undo: async () => true } },
    { label: "A key with no answer after 1 s", t: { id: 4, text: 'Saving "Neon highways — 3 hour synthwave mix for…" to Watch later…', pending: true } },
    { label: "Did nothing: neutral, not a failure", t: { id: 5, text: '"The last glaciers of the Alps" is already in Watch later' } },
    { label: "Failure: icon + wording, its fix", t: { id: 6, text: 'Couldn\'t save "Hand-cut dovetails without a jig": Woodworking ideas doesn\'t exist anymore.', failure: true, action: { label: "Choose", run: () => {} } } },
    { label: "Queue not confirmed", t: { id: 7, text: 'Couldn\'t confirm "Building a working LEGO clock" was added to the queue. Check the miniplayer.', failure: true } },
    { label: "Sticky notice (ticket 18), several features", t: { id: 8, text: "Quick-save and the Add to queue button aren't working right now because YouTube changed something. Use YouTube's own buttons for now.", failure: true, sticky: true, unprompted: true, action: { label: "Details", run: () => {} } } },
    { label: "Signed out", t: { id: 9, text: "Sign in to YouTube to save videos.", action: { label: "Sign in", run: () => {} } } },
  ];
</script>

<div class="sheet">
  <h2>Thumbnail buttons (one overlay, top left; YouTube's own toggles keep the top right)</h2>
  <div class="tiles">
    {#each queueStates as [st, label], i (label)}
      <figure>
        <div class="thumb" style:background={thumbBg(20 + i * 40)}>
          <div class="stack">
            <IconButton icon="queue" label={label} state={st} showTip={i === 0} />
            <SplitButton icon="bookmark" label="Save to Music videos" moreLabel="Save to…" onmain={() => {}} onmore={() => {}} />
          </div>
        </div>
        <figcaption>Queue: {label}</figcaption>
      </figure>
    {/each}
    {#each saveStates as [st, more, icon, label], i (label)}
      <figure>
        <div class="thumb" style:background={thumbBg(200 + i * 30)}>
          <div class="stack">
            <IconButton icon="queue" label="Add to queue" />
            <SplitButton icon={icon} {label} state={st} {more} moreLabel="Save to…" onmain={() => {}} onmore={() => {}} />
          </div>
        </div>
        <figcaption>Quick-save: {label}</figcaption>
      </figure>
    {/each}
  </div>

  <h2>Watch-page button (after Share; 40 px like YouTube's row)</h2>
  <div class="pills">
    {#each kinds as k (k)}
      {@const s = snap(k)}
      <figure>
        <StatusPill label={s.pill} tip={s.line} onclick={() => {}}>
          {#snippet lead()}{#if s.lead === "ring"}<Ring value={s.ring} />{:else}<span class:err={s.lead === "error"} style="display:flex"><Icon name={leadName(s.lead)} /></span>{/if}{/snippet}
        </StatusPill>
        <figcaption>{k}: {s.line}</figcaption>
      </figure>
    {/each}
    <figure>
      <StatusPill label="" tip="Playlist Pigeon: save this video" variant="compact" onclick={() => {}}>
        {#snippet lead()}<Icon name="mark" size={22} />{/snippet}
      </StatusPill>
      <figcaption>No auto-add state: icon only, the mark</figcaption>
    </figure>
    <figure>
      <StatusPill label="" tip="Auto-adds at 50 % · 32 % watched" variant="compact" onclick={() => {}}>
        {#snippet lead()}<Ring value={0.64} />{/snippet}
      </StatusPill>
      <figcaption>Folded (narrow row): icon only, state in the tooltip</figcaption>
    </figure>
  </div>

  <h2>Shorts action column (before the sound button)</h2>
  <div class="cols">
    {#each [["Save", "bookmark", null], ["32 %", null, 0.64], ["Added", "check", null], ["Paused", "pause", null], ["Skipped", "block", null]] as [label, icon, ring] (label)}
      <StatusPill label={label as string} tip={label as string} variant="column" onclick={() => {}}>
        {#snippet lead()}{#if ring !== null}<Ring value={ring as number} />{:else}<Icon name={icon as IconName} />{/if}{/snippet}
      </StatusPill>
    {/each}
  </div>

  <h2>Toasts (bottom left, one at a time, 6 s)</h2>
  <div class="toasts">
    {#each toastsList as x (x.t.id)}
      <figure>
        <ToastView t={x.t} fixed={false} mark={view.look !== "B"} />
        <figcaption>{x.label}</figcaption>
      </figure>
    {/each}
  </div>
</div>

<style>
  .sheet {
    padding: 8px 0 120px;
    color: var(--pt-text);
    font: 400 1.4rem/2rem var(--pt-font);
  }
  h2 {
    margin: 24px 0 12px;
    font: 500 1.6rem/2.2rem var(--pt-font);
  }
  figure {
    margin: 0;
  }
  figcaption {
    margin-top: 6px;
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.6rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
  }
  .stack {
    position: absolute;
    top: 4px;
    left: 4px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .pills {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px 24px;
    align-items: start;
  }
  .err {
    color: var(--pt-error);
  }
  .cols {
    display: flex;
    gap: 32px;
  }
  .toasts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 16px 24px;
  }
</style>
