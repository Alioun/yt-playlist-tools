<script lang="ts">
  import type { Snippet } from "svelte"

  let { label, labelledby, class: layout, onclose, children }: {
    label?: string
    labelledby?: string
    class: string
    onclose: () => void
    children: Snippet
  } = $props()
  const opener = document.activeElement
  function activate(node: HTMLDialogElement) {
    node.showModal()
    node.focus({ preventScroll: true })
    return { destroy() { node.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() } }
  }

  // Keep Tab in the dialog's controls, including at its boundaries, while the browser makes the rest inert.
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onclose(); return }
    if (event.key !== "Tab" || !(event.currentTarget instanceof HTMLDialogElement)) return
    const node = event.currentTarget
    const candidates = [...node.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")]
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[hidden], [inert]")
        && (typeof element.checkVisibility !== "function" || element.checkVisibility({ visibilityProperty: true })))
    const controls = candidates.filter(element => {
      if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) return true
      const group = candidates.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.type === "radio" && other.name === element.name && other.form === element.form)
      return element === (group.find(radio => radio.checked) ?? group[0])
    })
    const first = controls[0], last = controls[controls.length - 1]
    if (!first || !last) { event.preventDefault(); node.focus() }
    else if (event.shiftKey && (node.ownerDocument.activeElement === first || node.ownerDocument.activeElement === node)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && node.ownerDocument.activeElement === last) { event.preventDefault(); first.focus() }
  }
</script>

<dialog use:activate class={layout} aria-modal="true" aria-label={label} aria-labelledby={labelledby} tabindex="-1"
  onkeydowncapture={keyboard} oncancel={event => { event.preventDefault(); onclose() }}>
  {@render children()}
</dialog>

<style>
  @layer base {
    dialog { max-width: none; max-height: none; margin: 0; padding: 0; border: 0; color: inherit; }
    dialog::backdrop { background: transparent; }
  }
</style>
