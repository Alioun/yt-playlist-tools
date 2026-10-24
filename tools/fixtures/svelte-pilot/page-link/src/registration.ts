import { defaultSettings } from "../../../../../src/shared/model/defaults.ts"
import { desired, pageLinkEntries, type RegistrationFeature } from "../../../../../src/shared/features/registration.ts"

export const fixtureRegistry: readonly RegistrationFeature[] = [
  { id: "shortcuts", setting: "shortcuts", pages: {
    www: { file: "consumer-www", needs: ["kit"] },
    music: { file: "consumer-music", needs: ["kit"], when: (settings) => settings.shortcuts.music }
  } },
  { id: "auto-add", setting: "autoAdd", pages: { www: { file: "feature-auto-add", needs: ["kit"] } } },
  { id: "gather", setting: "gather", pages: { www: {
    matches: ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"], needs: [],
    when: (settings) => settings.gather.auto.background || settings.gather.auto.count
  } } }
]
export const fixtureEntries = {
  ...pageLinkEntries(fixtureRegistry),
  "late-www": { kind: "feature", site: "www" },
  "late-music": { kind: "feature", site: "music" }
} satisfies ReturnType<typeof pageLinkEntries>

export type Selection = "consumers" | "unsuffixed" | "gather" | "off"
export function fixturePlan(selection: Selection = "consumers") {
  const settings = defaultSettings()
  settings.shortcuts.on = selection === "consumers"
  settings.autoAdd.on = selection === "unsuffixed"
  settings.gather.on = selection === "gather"
  settings.gather.auto.background = selection === "gather"
  const access = { www: true, music: true }
  return { selection, registry: fixtureRegistry, settings, consent: true, access, schemaOk: true,
    expected: desired(fixtureRegistry, settings, true, access, true) }
}
