<script lang="ts">
  // YouTube | YouTube Music, preselected by the site you're on (ticket 09). Hand-written ARIA tabs with arrow keys,
  // styled like shadcn-svelte's Tabs: Bits UI's Tabs would add about 3 KB to the popup's first view (ticket 24).
  // A dot marks the site of the tab you opened the popup from.
  let { value = $bindable("youtube"), here }: { value?: "youtube" | "music"; here: string } = $props();
  const tabs = [
    { id: "youtube", label: "YouTube" },
    { id: "music", label: "YouTube Music" },
  ] as const;
  function key(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    value = value === "youtube" ? "music" : "youtube";
    document.getElementById(`tab-${value}`)?.focus();
  }
</script>

<div class="shrink-0 px-3 pt-3">
  <div class="bg-muted grid h-9 grid-cols-2 rounded-[10px] p-[3px]" role="tablist" aria-label="Site" tabindex="-1" onkeydown={key}>
    {#each tabs as t (t.id)}
      <button
        type="button"
        role="tab"
        id="tab-{t.id}"
        aria-selected={value === t.id}
        aria-controls="panel-{t.id}"
        tabindex={value === t.id ? 0 : -1}
        class="relative inline-flex items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium transition-colors
          {value === t.id ? 'bg-card text-foreground shadow-soft dark:bg-secondary' : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => (value = t.id)}
      >
        {t.label}
        {#if here === t.id}
          <span class="bg-brand-gradient size-1.5 rounded-full" title="You're on {t.label}"></span>
        {/if}
      </button>
    {/each}
  </div>
</div>
