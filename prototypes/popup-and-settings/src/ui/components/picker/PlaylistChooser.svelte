<script lang="ts">
  // A chooser for one playlist (a shortcut's, a quick-save playlist), for settings and onboarding: a button that
  // shows the choice and opens the one picker in a popover. Watch later chosen for a shortcut reads "Watch later
  // (every account)" (ticket 08). Missing / Full marks show on the button too (ticket 12).
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Clock from "@lucide/svelte/icons/clock";
  import ListIcon from "@lucide/svelte/icons/list";
  import * as Popover from "$ui/components/ui/popover/index.js";
  import PlaylistPicker from "./PlaylistPicker.svelte";
  import type { AccountId, Site } from "$shared/model/types";
  import { beforeConsent, setupsReadOnly, titleOf, ui } from "$lib/view.svelte";

  let {
    acct,
    site = "youtube",
    purpose,
    selected,
    title,
    subtitle,
    onchoose,
    placeholder = "Choose a playlist",
    disabled = false,
  }: {
    acct: AccountId;
    site?: Site;
    purpose: "shortcut" | "quickSave" | "musicQuickSave";
    selected: string | null;
    title: string;
    subtitle?: string;
    onchoose: (playlist: string) => void;
    placeholder?: string;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  const mark = $derived(selected ? ui.s.marks[selected] : undefined);
  const label = $derived(
    !selected ? placeholder : selected === "WL" && purpose === "shortcut" ? "Watch later (every account)" : titleOf(selected),
  );
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    disabled={disabled || setupsReadOnly() || beforeConsent()}
    class="border-input bg-card hover:bg-muted/60 aria-expanded:border-ring aria-expanded:ring-ring/30 inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-lg border pr-2 pl-2 text-left text-[13px] outline-none aria-expanded:ring-3 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {#if selected === "WL"}
      <span class="bg-accent inline-flex h-[18px] w-8 shrink-0 items-center justify-center rounded-[4px]"><Clock class="text-primary size-3" /></span>
    {:else if selected}
      <span class="bg-muted inline-flex h-[18px] w-8 shrink-0 items-center justify-center rounded-[4px]" aria-hidden="true"
        ><ListIcon class="text-muted-foreground size-3" /></span
      >
    {/if}
    <span class="min-w-0 flex-1 truncate {selected ? 'font-medium' : 'text-muted-foreground'}">{label}</span>
    {#if mark}<span class="bg-destructive-soft text-destructive shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold">{mark === "full" ? "Full" : "Missing"}</span>{/if}
    <ChevronDown class="text-muted-foreground size-3.5 shrink-0" />
  </Popover.Trigger>
  <Popover.Content flush align="start" class="h-[min(460px,70vh)] w-[360px]">
    <PlaylistPicker
      density="popover"
      req={{
        mode: "choose",
        site,
        acct,
        title,
        subtitle,
        selected,
        purpose,
        onchoose: (p) => {
          onchoose(p);
          open = false;
        },
      }}
      onclose={() => (open = false)}
    />
  </Popover.Content>
</Popover.Root>
