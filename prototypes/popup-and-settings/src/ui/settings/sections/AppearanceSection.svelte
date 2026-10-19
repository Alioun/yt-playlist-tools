<script lang="ts">
  import "../settings-more.css";
  // Settings › Appearance: the theme for the extension's own pages. Pages inside YouTube follow YouTube's look.
  import Monitor from "@lucide/svelte/icons/monitor";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Check from "@lucide/svelte/icons/check";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import { act, ui } from "$lib/view.svelte";

  const choices = [
    { id: "system", label: "System", hint: "Follows your device", icon: Monitor },
    { id: "light", label: "Light", hint: "Always light", icon: Sun },
    { id: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  ] as const;
</script>

{#snippet mini(dark: boolean)}
  <!-- A small popup: header, tabs, three switch rows. -->
  <div class="h-full w-full p-2.5 {dark ? 'bg-[oklch(0.175_0.012_262)]' : 'bg-[oklch(0.985_0.003_255)]'}">
    <div class="flex items-center gap-1.5">
      <span class="size-3 rounded-full bg-[#5e6875]"></span>
      <span class="h-1.5 w-10 rounded-full {dark ? 'bg-white/70' : 'bg-[oklch(0.3_0.02_262)]'}"></span>
      <span class="ml-auto size-3 rounded-full bg-[oklch(0.66_0.11_182)]"></span>
    </div>
    <div class="mt-1.5 h-[1.5px] w-full bg-[linear-gradient(90deg,#14a39a,#7b5cd6)]"></div>
    <div class="mt-2 grid h-3.5 grid-cols-2 gap-0.5 rounded p-0.5 {dark ? 'bg-white/10' : 'bg-black/5'}">
      <span class="rounded-[3px] {dark ? 'bg-white/15' : 'bg-white'}"></span><span></span>
    </div>
    <div class="mt-2 space-y-1 rounded-md border p-1.5 {dark ? 'border-white/10 bg-white/[0.04]' : 'border-black/10 bg-white'}">
      {#each [true, true, false] as on, i (i)}
        <div class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-[3px] {dark ? 'bg-white/15' : 'bg-black/8'}"></span>
          <span class="h-1 flex-1 rounded-full {dark ? 'bg-white/30' : 'bg-black/20'}"></span>
          <span class="h-2 w-3.5 rounded-full {on ? 'bg-[linear-gradient(90deg,#14a39a,#7b5cd6)]' : dark ? 'bg-white/20' : 'bg-black/15'}"></span>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<SectionHeader title="Appearance" description="Covers the popup, settings and first run. On YouTube, our buttons follow YouTube's own look." />

<div class="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
  {#each choices as c (c.id)}
    {@const active = ui.s.theme === c.id}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      class="bg-card shadow-soft group rounded-2xl border p-2 text-left transition-[box-shadow,border-color] outline-none focus-visible:ring-3 focus-visible:ring-ring/40
        {active ? 'border-primary ring-primary/25 ring-2' : 'hover:border-foreground/20'}"
      onclick={() => act({ kind: "theme", theme: c.id })}
    >
      <div class="relative h-[112px] overflow-hidden rounded-xl border">
        {#if c.id === "system"}
          <div class="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">{@render mini(false)}</div>
          <div class="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{@render mini(true)}</div>
        {:else}
          {@render mini(c.id === "dark")}
        {/if}
      </div>
      <div class="flex items-center gap-2.5 px-1.5 pt-2.5 pb-1">
        <c.icon class="size-4 {active ? 'text-primary' : 'text-muted-foreground'}" />
        <span class="flex-1">
          <span class="block text-sm font-medium">{c.label}</span>
          <span class="text-muted-foreground block text-xs">{c.hint}</span>
        </span>
        {#if active}<span class="bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full"><Check class="size-3" strokeWidth={3} /></span>{/if}
      </div>
    </button>
  {/each}
</div>
