import { resolveSenderOrigin, type SenderOriginPorts, type NativeSender } from "../../../src/background/adapters/sender-origin"
import { exportFile } from "../../../src/shared/settings-file"
import type { SettingsFileOwner } from "../../../src/background/store/settings-file-read"

export async function settingsPageConsumer(owner: SettingsFileOwner, ports: SenderOriginPorts, sender: NativeSender) {
  const authenticated = await resolveSenderOrigin(ports, { sender, popupWindowId: undefined })
  if (authenticated.kind !== "ui" || authenticated.page !== "settings") return { kind: "unavailable" } as const
  const read = await owner.exportSettings(authenticated.origin)
  if (read.kind !== "source") return read
  const file = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (file.kind !== "exported") return file
  const checked = await owner.importCheck(authenticated.origin, file.file.text)
  return { kind: "checked", file: file.file, checked } as const
}
