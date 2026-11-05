<script lang="ts">
  import { untrack } from "svelte"
  import type { SimpleMessageKey } from "../../shared/i18n"
  import { isThumbnailCorner, thumbnailCorners, type ThumbnailCorner } from "../../shared/model/validation"
  import type { PageState } from "../lib/page-state.svelte"

  // Where the queue button sits on thumbnails, saved as it's picked.
  let { pageState, value }: { pageState: PageState; value: ThumbnailCorner } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const labels = {
    "top-left": "set_corner_topLeft",
    "top-right": "set_corner_topRight",
    "bottom-left": "set_corner_bottomLeft",
    "bottom-right": "set_corner_bottomRight"
  } as const satisfies Record<ThumbnailCorner, SimpleMessageKey>
  const uid = $props.id()
  let failed = $state(false)
  async function change(event: Event & { currentTarget: HTMLSelectElement }) {
    const picked = event.currentTarget.value
    if (!isThumbnailCorner(picked)) return
    failed = false
    const answer = await backend.change({ kind: "option", field: "queueButton.corner", value: picked })
    failed = answer.kind !== "confirmed"
  }
</script>

<div class="flex items-start justify-between gap-4 py-1.5 text-[13.5px]">
  <label for="{uid}-corner">{i18n.message("set_qbCorner")}
    {#if failed}<span role="status" class="text-destructive block text-[12.5px]">{i18n.message("option_failed")}</span>{/if}</label>
  <select id="{uid}-corner" class="border-input bg-background h-8 rounded-md border px-2" disabled={!pageState.editable} {value} onchange={change}>
    {#each thumbnailCorners as corner (corner)}<option value={corner}>{i18n.message(labels[corner])}</option>{/each}
  </select>
</div>
