<script lang="ts">
  import type { PickerModel } from "../../../src/shared/picker/model.svelte"

  let { picker }: { picker: PickerModel } = $props()
</script>

<input aria-label="Search playlists" bind:value={picker.query} />
<button aria-pressed={picker.sortAZ} onclick={() => picker.setSortAZ(!picker.sortAZ)}>Sort A–Z</button>
<button disabled={!picker.list.refreshable} onclick={() => picker.refresh()}>Refresh playlists</button>
<p data-testid="membership">
  {picker.membership.kind === "known" ? `in ${picker.membership.count}` : picker.membership.kind}
</p>
<ul>
  {#each picker.rows as row (row.id)}
    <li data-check={row.check} data-status={row.status.kind}>
      <button
        aria-pressed={row.check === "on"}
        aria-busy={row.busy}
        onclick={() => (row.check === "on" ? picker.untick(row.id) : picker.tick(row.id))}
      >{row.title ?? row.id}</button>
    </li>
  {/each}
</ul>
