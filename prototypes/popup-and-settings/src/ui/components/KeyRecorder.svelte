<script lang="ts">
  // The one key recorder (ticket 08), for every shortcut in the popup, settings and onboarding.
  //   idle       the key in the platform's style, with Change and Clear (×); unset: "No key" with Set key
  //   recording  "Press a key combination…" with Esc to cancel; held modifiers show live; Tab, a click elsewhere or
  //              closing the popup cancel too
  //   refused    Enter or Space alone, Ctrl+Alt, a key the browser keeps: a hint, still recording
  //   clash      "{Key} is already used by {Other}." Use it here / Cancel: one key never fires two shortcuts
  //   note       a key YouTube, YouTube Music or the browser use: kept, with a note under the row
  // `ownerId` matches keyOwners()'s ids ("shortcut:<id>", "picker", "undo", "music:<action>").
  import type { Snippet } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import Info from "@lucide/svelte/icons/info";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import KeyCombo from "./KeyCombo.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import { recorder, reserved } from "$shared/keys/recorder";
  import { clashNote, keyText } from "$shared/keys/display";
  import { act, ui } from "$lib/view.svelte";
  import { keyOwners, type KeyOwner } from "$lib/keyowners";

  let {
    value,
    ownerId,
    site,
    onchange,
    size = "sm",
    autostart = false,
    trailing,
  }: {
    value: string;
    ownerId: string;
    site: "youtube" | "music" | "both";
    onchange: (key: string) => void;
    size?: "sm" | "md";
    /** Start recording at once (Add shortcut, ticket 08). */
    autostart?: boolean;
    /** Shares the key's row (e.g. a shortcut's label); hidden while recording. */
    trailing?: Snippet;
  } = $props();

  let mode = $state<"idle" | "recording" | "clash">("idle");
  let held = $state("");
  let hint = $state("");
  let pending = $state<{ key: string; owner: KeyOwner } | null>(null);
  let root: HTMLElement | undefined = $state();
  let field: HTMLButtonElement | undefined = $state();
  const os = $derived(ui.s.env.os);
  const note = $derived(value ? clashNote(value, ui.s.env.browser) : null);

  const overlaps = (a: KeyOwner["site"], b: KeyOwner["site"]) => a === "both" || b === "both" || a === b;

  function start() {
    mode = "recording";
    held = "";
    hint = "";
    field?.focus();
  }
  function stop() {
    mode = "idle";
    held = "";
    hint = "";
  }
  $effect(() => {
    if (autostart) start();
  });

  function onkey(e: KeyboardEvent) {
    if (mode !== "recording") return;
    const step = recorder(e);
    if (step.kind === "cancel") {
      if (!step.moveFocus) e.preventDefault();
      stop();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (step.kind === "wait") {
      held = step.held;
      return;
    }
    if (step.kind === "refuse") {
      hint = step.hint;
      return;
    }
    if (reserved(step.key, ui.s.env.browser)) {
      hint = `${keyText(step.key, os)} is the browser's own key and never reaches the page.`;
      return;
    }
    if (step.key === value) return stop();
    const other = keyOwners().find((o) => o.id !== ownerId && o.key === step.key && overlaps(o.site, site));
    if (other) {
      pending = { key: step.key, owner: other };
      mode = "clash";
      return;
    }
    onchange(step.key);
    stop();
  }
  function onkeyup(e: KeyboardEvent) {
    if (mode === "recording") held = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean).join("+");
  }
  function outside(e: PointerEvent) {
    if (mode === "recording" && root && !root.contains(e.target as Node)) stop();
  }
  async function useHere() {
    if (!pending) return;
    await act(pending.owner.clear);
    onchange(pending.key);
    pending = null;
    stop();
  }
</script>

<svelte:window onkeydowncapture={onkey} onkeyupcapture={onkeyup} onpointerdowncapture={outside} />

<div bind:this={root} class="min-w-0">
  <div class="flex items-center gap-1.5">
    <div
      class="relative inline-flex shrink-0 items-center rounded-lg border transition-[box-shadow,border-color]
        {size === 'md' ? 'h-9 min-w-[132px]' : 'h-8 min-w-[100px]'}
        {mode === 'recording'
        ? 'border-primary ring-primary/25 bg-accent/60 ring-3'
        : 'border-input bg-card hover:border-foreground/25 focus-within:border-ring focus-within:ring-ring/40 focus-within:ring-3'}"
    >
      <button
        bind:this={field}
        type="button"
        class="flex h-full min-w-0 flex-1 items-center rounded-lg pl-1.5 outline-none {value && mode === 'idle' ? 'pr-0.5' : 'pr-2'}"
        aria-label={mode === "recording" ? "Recording a key. Press Escape to cancel." : value ? `Shortcut key ${keyText(value, os)}. Change` : "No key. Set key"}
        title={mode === "recording" ? "" : value ? "Change key" : "Set key"}
        onclick={() => (mode === "recording" ? stop() : start())}
      >
        {#if mode === "recording"}
          <span class="bg-primary mr-1.5 size-1.5 shrink-0 animate-pulse rounded-full"></span>
          {#if held}
            <span class="text-foreground text-xs font-medium whitespace-nowrap">{keyText(held, os)}{os === "mac" ? "" : "+"}…</span>
          {:else}
            <span class="text-foreground/80 text-xs whitespace-nowrap">Press keys…</span>
          {/if}
        {:else if value}
          <KeyCombo key={value} {os} size={size === "md" ? "md" : "sm"} />
        {:else if size === "md"}
          <span class="text-muted-foreground px-0.5 text-xs">No key</span>
        {:else}
          <span class="text-primary px-0.5 text-xs font-medium">Set key</span>
        {/if}
      </button>
      {#if mode === "idle" && value}
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground mr-1 ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full"
          title="Clear key"
          aria-label="Clear key"
          onclick={() => onchange("")}><X class="size-3" /></button
        >
      {/if}
    </div>
    {#if mode === "recording"}
      <span class="text-muted-foreground text-[11.5px] whitespace-nowrap">Esc to cancel</span>
    {:else if size === "md"}
      <Button size="sm" variant="ghost" onclick={start}>{value ? "Change" : "Set key"}</Button>
    {/if}
    {#if trailing && mode !== "recording"}{@render trailing()}{/if}
  </div>

  {#if mode === "recording" && hint}
    <p class="text-warning mt-1.5 flex items-start gap-1 text-[11.5px] leading-4" role="status">
      <TriangleAlert class="mt-px size-3 shrink-0" />{hint}
    </p>
  {:else if mode === "clash" && pending}
    <div class="border-warning-border bg-warning-soft mt-1.5 rounded-lg border px-2.5 py-2 text-[12px]" role="alert">
      <p class="text-foreground">
        <KeyCombo key={pending.key} {os} size="xs" /> is already used by <strong class="font-semibold">{pending.owner.name}</strong>.
      </p>
      <div class="mt-1.5 flex gap-1.5">
        <Button size="xs" onclick={useHere}>Use it here</Button>
        <Button
          size="xs"
          variant="outline"
          onclick={() => {
            pending = null;
            stop();
          }}>Cancel</Button
        >
      </div>
    </div>
  {:else if note && mode === "idle"}
    <p class="text-muted-foreground mt-1.5 flex items-start gap-1 text-[11.5px] leading-4">
      <Info class="mt-px size-3 shrink-0" />{note}
    </p>
  {/if}
</div>
