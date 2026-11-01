import { isFeatureSettingChange, type FeatureSettingChange } from "../../../src/shared/contracts/shared-settings"
import data from "./cases.json"
export const cases: readonly { readonly name: string; readonly field: string; readonly change: FeatureSettingChange }[] = data.map(row => {
  if (!isFeatureSettingChange(row.change)) throw Error("Invalid independent switch specimen")
  return { name: row.name, field: row.field, change: row.change }
})
