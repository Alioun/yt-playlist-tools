<script lang="ts">
  // svelte-check only: the whole-project compiler sees .svelte imports as untyped, so these API cases live here.
  import type { ComponentProps } from "svelte"
  import type Button from "../../../src/ui/components/Button.svelte"
  import type Disclosure from "../../../src/ui/components/Disclosure.svelte"
  import type FeatureChoice from "../../../src/ui/components/FeatureChoice.svelte"
  import type Switch from "../../../src/ui/components/Switch.svelte"
  import type FirstRun from "../../../src/ui/onboarding/FirstRun.svelte"
  import { englishFirstRunText } from "../localization/scripted"
  import { syntheticOwner } from "./synthetic-owner"

  const text = englishFirstRunText()
  const firstRun: ComponentProps<typeof FirstRun> = { text, owner: syntheticOwner("fresh", "chrome"), markSrc: "icon.svg" }
  const disclosure: ComponentProps<typeof Disclosure> = { text: text.disclosure, context: "feature", browser: "firefox", size: "sm", level: 2 }
  const choice: ComponentProps<typeof FeatureChoice> = { name: "Auto-add", description: "Synthetic.", footprint: "none", footprintLabel: text.features.footprintText.none, checked: false, onchange: () => {} }
  const toggle: ComponentProps<typeof Switch> = { checked: true, label: "Settings sync", onchange: () => {} }
  const brand: Partial<ComponentProps<typeof Button>> = { variant: "brand", size: "lg", pending: true }

  // @ts-expect-error The page needs its owner; components never reach the browser themselves.
  const ownerless: ComponentProps<typeof FirstRun> = { text, markSrc: "icon.svg" }
  // @ts-expect-error The disclosure has exactly three headings.
  const unknownContext: ComponentProps<typeof Disclosure> = { text: text.disclosure, context: "settings", browser: "chrome" }
  // @ts-expect-error Footprint tags are the four of FT-01, as their registry type.
  const unknownFootprint: ComponentProps<typeof FeatureChoice> = { name: "Auto-add", description: "Synthetic.", footprint: "small", footprintLabel: text.features.footprintText.none, checked: false, onchange: () => {} }
  // @ts-expect-error A switch is controlled: it needs the caller's state and listener.
  const uncontrolled: ComponentProps<typeof Switch> = { label: "Settings sync" }
  // @ts-expect-error Button has no tailwind-merge override: only the listed variants exist.
  const unknownVariant: Partial<ComponentProps<typeof Button>> = { variant: "primary" }

  void [firstRun, disclosure, choice, toggle, brand, ownerless, unknownContext, unknownFootprint, uncontrolled, unknownVariant]
</script>
