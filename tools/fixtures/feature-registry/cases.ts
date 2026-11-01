import { defaultSettings } from "../../../src/shared/model/defaults"
import type { Settings } from "../../../src/shared/model/types"
import type { Site } from "../../../src/shared/contracts/vocabulary"

export type Scenario = {
  readonly name: string
  readonly settings: Settings
  readonly consent: boolean
  readonly schemaOk: boolean
  readonly access: Readonly<Record<Site, boolean>>
}

export function everything(): Settings {
  const s = defaultSettings()
  s.autoAdd.on = true
  s.shortcuts.on = true
  s.quickSave.on = true
  s.queueButton.on = true
  s.watchButton.on = true
  s.cardMenu.on = true
  s.browserMenu.on = true
  s.gather.on = true
  s.gather.auto.count = true
  s.musicActions.on = true
  s.musicKeys.on = true
  s.anyTabKeys.on = true
  return s
}

function scenario(name: string, edit: (s: Settings) => void, base = defaultSettings()): Scenario {
  edit(base)
  return { name, settings: base, consent: true, schemaOk: true, access: { www: true, music: true } }
}

export function scenarios(): readonly Scenario[] {
  return [
    scenario("all-off", () => {}),
    scenario("auto-add-alone", s => { s.autoAdd.on = true }),
    scenario("shortcuts-alone", s => { s.shortcuts.on = true }),
    scenario("quick-save-alone", s => { s.quickSave.on = true }),
    scenario("queue-button-alone", s => { s.queueButton.on = true }),
    scenario("watch-button-alone", s => { s.watchButton.on = true }),
    scenario("card-menu-alone", s => { s.cardMenu.on = true }),
    scenario("browser-menu-alone", s => { s.browserMenu.on = true }),
    scenario("gather-alone", s => { s.gather.on = true; s.gather.auto.count = true }),
    scenario("music-actions-alone", s => { s.musicActions.on = true }),
    scenario("music-keys-alone", s => { s.musicKeys.on = true }),
    scenario("any-tab-keys-alone", s => { s.anyTabKeys.on = true }),
    scenario("sync-alone", () => {}),
    scenario("everything", () => {}, everything()),
    scenario("music-section-off", s => { s.musicSection = false }, everything()),
    scenario("shortcuts-music-off", s => { s.shortcuts.music = false }, everything()),
    scenario("shortcuts-music-off-alone", s => { s.shortcuts.on = true; s.shortcuts.music = false }),
    scenario("shortcuts-off-other-music-on", s => { s.shortcuts.on = false }, everything()),
    scenario("gather-no-triggers", s => { s.gather.on = true }),
    scenario("gather-trigger-1-only", s => { s.gather.on = true; s.gather.auto.unvisited = true }),
    scenario("gather-trigger-2-only", s => { s.gather.on = true; s.gather.auto.background = true }),
    scenario("gather-trigger-3-only", s => { s.gather.on = true; s.gather.auto.count = true }),
    scenario("gather-triggers-2-and-3", s => { s.gather.on = true; s.gather.auto.background = true; s.gather.auto.count = true }),
    scenario("gather-off-with-triggers", s => { s.gather.auto.background = true; s.gather.auto.count = true }),
    scenario("gather-and-card-menu", s => { s.gather.on = true; s.gather.auto.count = true; s.cardMenu.on = true }),
    { ...scenario("consent-held", () => {}, everything()), consent: false },
    { ...scenario("schema-held", () => {}, everything()), schemaOk: false },
    { ...scenario("www-access-only", () => {}, everything()), access: { www: true, music: false } },
    { ...scenario("music-access-only", () => {}, everything()), access: { www: false, music: true } },
    { ...scenario("no-access", () => {}, everything()), access: { www: false, music: false } }
  ]
}
