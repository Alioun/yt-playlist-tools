<script lang="ts">
  // A compact one-playlist choice for an account (shortcut targets, YouTube Music's quick-save playlist).
  import * as Select from "$lib/components/ui/select/index.js";
  import { playlistsFor, playlistTitle } from "$lib/state.svelte";
  import type { AccountId } from "$lib/data";

  let {
    account,
    value,
    onchange,
    placeholder,
    noneLabel = "No playlist",
    disabled = false,
    labelFor,
  }: {
    account: AccountId;
    value: string | null;
    onchange: (v: string | null) => void;
    placeholder: string;
    noneLabel?: string;
    disabled?: boolean;
    /** Override a row's label, e.g. "Watch later (every account)". */
    labelFor?: (id: string, title: string) => string;
  } = $props();

  const NONE = "__none";
  const list = $derived(playlistsFor(account));
  const name = (id: string, title: string) => (labelFor ? labelFor(id, title) : title);
  const label = $derived(value ? name(value, playlistTitle(value, account)) : placeholder);
</script>

<Select.Root
  type="single"
  value={value ?? NONE}
  onValueChange={(v) => onchange(v === NONE ? null : v)}
  {disabled}
>
  <Select.Trigger size="sm" class="w-56 {value ? '' : 'text-muted-foreground'}">
    <span class="truncate">{label}</span>
  </Select.Trigger>
  <Select.Content>
    <Select.Item value={NONE} label={noneLabel}>{noneLabel}</Select.Item>
    {#each list as p (p.id)}
      <Select.Item value={p.id} label={name(p.id, p.title)}>{name(p.id, p.title)}</Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
