import { checked, nullable } from "./codec"
import { isAccountKey, type AccountKey } from "./validation"

export const LAST_ACCOUNT_KEY = "lastAccount"

const decode = nullable(checked(isAccountKey, "a 16-character account key"))

export function decodeLastAccount(records: Readonly<Record<string, unknown>>): AccountKey | null {
  return Object.hasOwn(records, LAST_ACCOUNT_KEY) ? decode(records[LAST_ACCOUNT_KEY], LAST_ACCOUNT_KEY) : null
}
