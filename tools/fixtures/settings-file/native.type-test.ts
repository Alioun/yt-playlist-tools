import type { AccountKey, ChannelId, PlaylistId } from "../../../src/shared/model"
import type { SetupDestinationResult } from "../../../src/background/store/setup-edit-execution"
import { createImportPlanner, exportFile, type FileFilter, type FileHeader, type FileSetup, type ImportAccount, type ImportPlan, type ImportPlanner } from "../../../src/shared/settings-file"

export function settingsFileTypeChecks(plan: ImportPlan, channel: ChannelId, playlist: PlaylistId, account: AccountKey, rawStorage: Readonly<Record<string, unknown>>, rawPayload: unknown) {
  // @ts-expect-error negative: raw-storage-export
  exportFile({ source: rawStorage, version: "2.0.0", date: "2026-10-29" })
  // @ts-expect-error negative: invented-plan-variant
  const invented: ImportPlan = { ...plan, kind: "committed" }
  // @ts-expect-error negative: channel-as-account
  const wrongAccount: ImportAccount["account"] = channel
  // @ts-expect-error negative: account-as-playlist
  const wrongPlaylist: FileSetup["quickSave"] = account
  // @ts-expect-error negative: playlist-as-channel
  const wrongChannel: FileFilter["channels"][number][0] = playlist
  // @ts-expect-error negative: newer-format-type
  const newer: FileHeader = { ...plan.header, format: 2 }
  // @ts-expect-error negative: plan-is-not-owner-confirmation
  const confirmed: Extract<SetupDestinationResult, { kind: "committed" }> = plan
  // @ts-expect-error negative: payload-is-not-bound-parser
  const parser: ImportPlanner = rawPayload
  // @ts-expect-error negative: payload-cannot-select-native-privacy
  createImportPlanner({ incognito: false })
  return { invented, wrongAccount, wrongPlaylist, wrongChannel, newer, confirmed, parser }
}
