import type { SettingsFileRead, SettingsFileCheck } from "./settings-file-read"
import type { SettingsFileSource, ImportPlan } from "../../shared/settings-file"
import type { Device, ChannelId } from "../../shared/model"

export function readTypeChecks(read: SettingsFileRead, checked: SettingsFileCheck, device: Device, channel: ChannelId,
  raw: Readonly<Record<string, unknown>>, source: SettingsFileSource) {
  // @ts-expect-error negative: raw-snapshot-is-not-a-public-source
  const rawSource: SettingsFileSource = raw
  // @ts-expect-error negative: device-is-not-export-data
  const deviceSource: SettingsFileSource = device
  // @ts-expect-error negative: channel-is-not-an-account
  const account: SettingsFileSource["accounts"][number]["account"] = channel
  // @ts-expect-error negative: unchecked-read-is-not-a-source
  const unchecked: SettingsFileSource = read.source
  // @ts-expect-error negative: unchecked-check-is-not-a-plan
  const plan: ImportPlan = checked
  // @ts-expect-error negative: public-source-has-no-device
  const leaked: SettingsFileSource = { ...source, device }
  return { rawSource, deviceSource, account, unchecked, plan, leaked }
}

export function boundaryTypeChecks(source: SettingsFileSource) {
  const entry = source.accounts[0]
  if (!entry) return
  // @ts-expect-error negative: omitted-filter-inventory
  const omitted: SettingsFileSource["accounts"][number] = { account: entry.account, setup: entry.setup }
  // @ts-expect-error negative: stale-result-cannot-expose-source
  const stale: SettingsFileRead = { kind: "unavailable", reason: "stale", source }
  return { omitted, stale }
}
