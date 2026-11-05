import type { RegistrarPorts } from "../../../src/background/registrar/ports"
import { desired, pageLinkEntries } from "../../../src/shared/features/registration"
import { features, filesFor, healthFor, libraries } from "../../../src/shared/features/registry"
import { scenarios } from "./cases"

export function registryRecord() {
  const registry: RegistrarPorts["registry"] = features
  return {
    libraries,
    ownership: pageLinkEntries(registry),
    catalogue: features.map(feature => ({ id: feature.id, setting: feature.setting, footprint: feature.footprint, health: healthFor(feature.id) })),
    scenarios: scenarios().map(input => ({
      name: input.name,
      registrations: desired(registry, input.settings, input.consent, input.access, input.schemaOk),
      files: { www: filesFor("www", input.settings), music: filesFor("music", input.settings) }
    }))
  }
}
