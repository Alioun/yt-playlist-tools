<script lang="ts">
  import "./parts.css";
  // This video's details (ticket 09): each auto-add playlist's outcome so far, Don't auto-add this video (a session
  // skip, ticket 07), Save to… (the one picker), and this channel's filter per playlist (Allow / Deny).
  import Check from "@lucide/svelte/icons/check";
  import Ban from "@lucide/svelte/icons/ban";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import { Button } from "$ui/components/ui/button/index.js";
  import type { ChannelFilter, ThisVideo } from "$shared/model/types";
  import { tabAccount, act, autoAddFor, call, goalOf, optionsOf, setupOf, setupsReadOnly, titleOf, ui } from "$lib/view.svelte";
  import { openPicker } from "../sheet.svelte";

  let { video }: { video: ThisVideo } = $props();
  const acct = $derived(tabAccount());
  const lists = $derived(autoAddFor(acct));
  let channel = $state<{ title: string; handle?: string; hue: number } | null>(null);
  $effect(() => {
    call("channel", { id: video.channel }).then((c) => (channel = c));
  });

  const filterOf = (pid: string): ChannelFilter => setupOf(acct)?.filters[pid] ?? { on: false, mode: "deny", channels: [] };
  const blocks = (f: ChannelFilter) => f.on && (f.mode === "allow" ? !f.channels.includes(video.channel) : f.channels.includes(video.channel));
  const takes = (pid: string) => {
    const t = optionsOf(acct, pid).takes;
    return t === "both" || (video.kind === "short" ? t === "shorts" : t === "videos");
  };

  function status(pid: string): { text: string; tone: "done" | "muted" | "warn" | "wait" } {
    const o = video.outcomes[pid];
    if (!takes(pid)) return { text: video.kind === "short" ? "Doesn't take Shorts" : "Takes only Shorts", tone: "muted" };
    if (o === "added") return { text: "Added", tone: "done" };
    if (o === "already") return { text: "Already in it", tone: "done" };
    if (o === "failed") return { text: "Couldn't add", tone: "warn" };
    if (o === "filtered" || blocks(filterOf(pid))) return { text: "Filtered out by its channel filter", tone: "muted" };
    if (video.skipped) return { text: "Not auto-adding", tone: "muted" };
    return { text: `At ${goalOf(acct, pid)} %`, tone: "wait" };
  }

  function listChannel(pid: string, mode: "allow" | "deny") {
    if (!acct) return;
    const f = filterOf(pid);
    const listed = f.on && f.mode === mode && f.channels.includes(video.channel);
    const next: ChannelFilter = listed
      ? { ...f, channels: f.channels.filter((c) => c !== video.channel) }
      : f.mode === mode
        ? { on: true, mode, channels: [...f.channels, video.channel] }
        : { on: true, mode, channels: [video.channel] };
    act({ kind: "filter", acct, playlist: pid, filter: next });
  }
</script>

<div class="space-y-3 border-t px-3 pt-2.5 pb-3">
  {#if lists.length}
    <ul class="space-y-1">
      {#each lists as pid (pid)}
        {@const st = status(pid)}
        <li class="flex items-center gap-2 text-xs">
          <span class="min-w-0 flex-1 truncate font-medium">{titleOf(pid)}</span>
          <span
            class="inline-flex shrink-0 items-center gap-1 {st.tone === 'done' ? 'text-success' : st.tone === 'warn' ? 'text-destructive' : 'text-muted-foreground'}"
          >
            {#if st.tone === "done"}<Check class="size-3" strokeWidth={3} />{:else if st.tone === "warn"}<CircleAlert class="size-3" />{:else if st.text.startsWith("Filtered")}<Ban
                class="size-3"
              />{/if}
            {st.text}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-wrap gap-1.5">
    {#if ui.s.features.autoAdd.on && lists.length}
      {#if video.skipped}
        <Button size="sm" variant="outline" onclick={() => act({ kind: "skipVideo", skip: false })}><Undo2 />Auto-add it again</Button>
      {:else}
        <Button size="sm" variant="outline" onclick={() => act({ kind: "skipVideo", skip: true })}><EyeOff />Don't auto-add this video</Button>
      {/if}
    {/if}
    {#if acct}
      <Button
        size="sm"
        variant="outline"
        onclick={() => openPicker({ mode: "save", site: "youtube", acct: acct!, item: { id: video.id, title: video.title, kind: video.kind } })}
        ><Bookmark />Save to…</Button
      >
    {/if}
  </div>

  {#if lists.length && channel && ui.s.features.autoAdd.on}
    <div class="bg-muted/45 rounded-xl border p-2.5">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span
          class="size-5 shrink-0 rounded-full"
          style="background-image:linear-gradient(135deg, oklch(0.66 0.11 {channel.hue}), oklch(0.48 0.1 {channel.hue + 30}))"
          aria-hidden="true"
        ></span>
        <span class="min-w-0 truncate"
          ><span class="font-medium">{channel.title}</span>{#if channel.handle}<span class="text-muted-foreground">{` · ${channel.handle}`}</span>{/if}</span
        >
        <span class="text-muted-foreground ml-auto shrink-0">This channel</span>
      </div>
      <ul class="space-y-1.5">
        {#each lists as pid (pid)}
          {@const f = filterOf(pid)}
          <li class="flex items-center gap-2 text-xs">
            <span class="min-w-0 flex-1 truncate">{titleOf(pid)}</span>
            {#each (f.on ? [f.mode] : ["allow", "deny"]) as mode (mode)}
              {@const listed = f.on && f.mode === mode && f.channels.includes(video.channel)}
              <button
                type="button"
                aria-pressed={listed}
                disabled={setupsReadOnly()}
                class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors
                  {listed ? 'border-primary/40 bg-accent text-accent-foreground' : 'bg-card hover:bg-muted text-foreground'}"
                title={f.on ? "" : mode === "allow" ? "Turn on Allow only with this channel" : "Turn on Deny with this channel"}
                onclick={() => listChannel(pid, mode as "allow" | "deny")}
              >
                {#if listed}<Check class="size-3" strokeWidth={3} />{/if}
                {mode === "allow" ? (listed ? "Allowed" : f.on ? "Allow" : "Allow only") : listed ? "Denied" : "Deny"}
              </button>
            {/each}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
