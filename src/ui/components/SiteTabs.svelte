<script lang="ts">
  import clsx from "clsx"
  import type { Site } from "../../shared/contracts/vocabulary"

  // Hand-written ARIA tabs (UI-POP-11, UI-RULE-05). The dot marks the site the popup opened on.
  let { selected, opened, labels, panel, onselect }: {
    selected: Site
    opened: Site | null
    labels: Readonly<Record<Site, string>>
    panel: string
    onselect: (site: Site) => void
  } = $props()
  const sites: readonly Site[] = ["www", "music"]
  const uid = $props.id()
  let list: HTMLElement | null = $state(null)

  function key(event: KeyboardEvent) {
    const index = sites.indexOf(selected)
    const next = event.key === "ArrowRight" ? sites[(index + 1) % sites.length]
      : event.key === "ArrowLeft" ? sites[(index + sites.length - 1) % sites.length]
      : event.key === "Home" ? sites[0] : event.key === "End" ? sites[sites.length - 1] : undefined
    if (!next) return
    event.preventDefault()
    onselect(next)
    queueMicrotask(() => list?.querySelector<HTMLButtonElement>(`#${uid}-${next}`)?.focus())
  }
</script>

<div bind:this={list} role="tablist" tabindex="-1" class="bg-muted grid grid-cols-2 gap-0.5 rounded-[10px] p-0.5" onkeydown={key}>
  {#each sites as site (site)}
    <button
      id="{uid}-{site}"
      type="button"
      role="tab"
      aria-selected={site === selected}
      aria-controls={panel}
      tabindex={site === selected ? 0 : -1}
      class={clsx(
        "focus-visible:ring-ring/40 relative inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none focus-visible:ring-3",
        site === selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      onclick={() => onselect(site)}
    >
      {labels[site]}
      {#if opened === site}<span data-opened aria-hidden="true" class="bg-brand-gradient size-1.5 rounded-full"></span>{/if}
    </button>
  {/each}
</div>
